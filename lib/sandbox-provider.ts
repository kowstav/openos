import { spawn } from "child_process"; import path from "path";
import { runOperation } from "./runner";
// Provider seam (I2/S1): trusted control plane -> untrusted execution.
// FAIL CLOSED: untrusted repository code NEVER runs as a host child process.
// Only two explicit, exact configurations select a provider:
//   SANDBOX_PROVIDER=modal                 -> Modal Sandboxes (isolated)
//   SANDBOX_PROVIDER=local-trusted-fixtures AND OPENOS_ENABLE_LOCAL_FIXTURES=1
//                                          -> host runner, ONLY for explicitly
//                                             trusted fixtures in tests/CI.
// Absent, empty, misspelled or unavailable config refuses untrusted jobs.
// Trusted built-ins (pdf-lib, OCR, IMG.LY) do not use this seam at all.
export interface SandboxProvider { name: string; run(kind: string, spec: { packageName: string; module: string; exportName: string }, input: string): Promise<string> }
export class ProviderNotConfiguredError extends Error {
  constructor(message: string) { super(message); this.name = "ProviderNotConfiguredError"; }
}
// The host runner is sealed inside test-only fixtures: even with the flags
// enabled, ONLY these exact fixture packages may execute on the host. Any
// public submission (any other package) is refused — the flags can never
// turn the host into a general untrusted executor.
export const FIXTURE_PACKAGES = new Set(["marked", "python-slugify", "uuid"]);
export function isFixtureSpec(spec: { packageName: string }): boolean { return FIXTURE_PACKAGES.has(spec.packageName); }
export const LocalProvider: SandboxProvider = {
  name: "local-trusted-fixtures (host process — NOT isolated)",
  run: (kind, spec, input) => {
    if (process.env.OPENOS_ENABLE_LOCAL_FIXTURES !== "1") {
      return Promise.reject(new ProviderNotConfiguredError("Local host runner is disabled. It may only run explicitly trusted fixtures with OPENOS_ENABLE_LOCAL_FIXTURES=1. Untrusted repositories are never downgraded to a host child process."));
    }
    if (!isFixtureSpec(spec)) {
      return Promise.reject(new ProviderNotConfiguredError(`Host runner is sealed to trusted test fixtures (${[...FIXTURE_PACKAGES].join(", ")}). "${spec.packageName}" is public input and requires the isolated sandbox provider — it will not run on the host.`));
    }
    return runOperation(kind, spec, input);
  },
};
function modalRun(kind: string, spec: { packageName: string; module: string; exportName: string }, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) { reject(new ProviderNotConfiguredError("Modal Sandboxes are not configured: set MODAL_TOKEN_ID/MODAL_TOKEN_SECRET server-side and SANDBOX_PROVIDER=modal. See docs/modal-sandboxes.md.")); return; }
    const child = spawn("python3", [path.join(process.cwd(), "workers", "modal_runner.py")], { env: { PATH: process.env.PATH || "", NODE_ENV: "production", MODAL_TOKEN_ID: process.env.MODAL_TOKEN_ID, MODAL_TOKEN_SECRET: process.env.MODAL_TOKEN_SECRET }, stdio: ["pipe", "pipe", "pipe"] }) as unknown as { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream; kill: (s: string) => void; on: (e: string, f: (...a: never[]) => void) => void };
    let out = "", err = ""; const kill = setTimeout(() => child.kill("SIGKILL"), 180_000);
    child.stdout.on("data", (d) => { out = (out + String(d)).slice(0, 200_000); }); child.stderr.on("data", (d) => { err = (err + String(d)).slice(0, 20_000); });
    child.on("error", (e) => { clearTimeout(kill); reject(e); });
    child.on("close", (code) => { clearTimeout(kill); if (code === 0) { try { resolve(JSON.parse(out).output); } catch { reject(new Error("Modal worker returned invalid output")); } } else reject(new Error(`Modal execution failed: ${err.slice(-500)}`)); });
    child.stdin.end(JSON.stringify({ kind, spec, input }));
  });
}
export const ModalProvider: SandboxProvider = { name: "modal-sandboxes", run: modalRun };
const RefusingProvider: SandboxProvider = {
  name: "none (fail closed)",
  run: () => Promise.reject(new ProviderNotConfiguredError("No isolated sandbox provider is configured. Set SANDBOX_PROVIDER=modal with Modal credentials for untrusted execution. Host execution is never a fallback.")),
};
export function activeProvider(): SandboxProvider {
  const p = process.env.SANDBOX_PROVIDER;
  if (p === "modal") return ModalProvider;
  if (p === "local-trusted-fixtures" && process.env.OPENOS_ENABLE_LOCAL_FIXTURES === "1") return LocalProvider;
  return RefusingProvider;
}
// Split provider lifecycle: build, verify/publish, run-existing-artifact
// and destroy are separate operations. `run` above stays as the combined
// convenience path; new code should prefer the split so a runtime execution
// provably uses the exact digest-addressed artifact built earlier, with no
// reinstall at run time. Artifact refs are opaque and provider-owned.
export type ArtifactRef = { provider: string; jobId: string; digest: string; ref: string };
export interface SplitProvider {
  buildArtifact(kind: string, spec: { packageName: string; module: string; exportName: string }, jobId: string): Promise<ArtifactRef>;
  runArtifact(artifact: ArtifactRef, kind: string, spec: { packageName: string; module: string; exportName: string }, input: string): Promise<string>;
  destroyArtifact(artifact: ArtifactRef): Promise<void>;
}
function splitViaModal(): SplitProvider {
  return {
    async buildArtifact(kind, spec, jobId) {
      const out = await modalCall({ mode: "build", kind, spec, jobId, input: "" });
      const parsed = JSON.parse(out) as { digest?: string; ref?: string };
      if (!parsed.digest || !parsed.ref) throw new Error("Modal build returned no artifact digest");
      return { provider: "modal", jobId, digest: parsed.digest, ref: parsed.ref };
    },
    async runArtifact(artifact, kind, spec, input) {
      if (artifact.provider !== "modal") throw new Error("Artifact belongs to a different provider");
      const out = await modalCall({ mode: "run", kind, spec, jobId: artifact.jobId, artifactRef: artifact.ref, digest: artifact.digest, input });
      return (JSON.parse(out) as { output: string }).output;
    },
    async destroyArtifact(artifact) { await modalCall({ mode: "destroy", kind: "js", spec: { packageName: "x", module: "x", exportName: "x" }, jobId: artifact.jobId, artifactRef: artifact.ref, input: "" }).catch(() => {}); },
  };
}
export function activeSplitProvider(): SplitProvider {
  const p = process.env.SANDBOX_PROVIDER;
  if (p === "modal") return splitViaModal();
  // No isolated backend, no artifact lifecycle: every stage refuses.
  const refuse = () => Promise.reject(new ProviderNotConfiguredError("No isolated sandbox provider is configured, so no artifact can be built, published or run. Host execution is never a fallback."));
  return { buildArtifact: refuse, runArtifact: refuse, destroyArtifact: async () => {} };
}
function modalCall(payload: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) { reject(new ProviderNotConfiguredError("Modal Sandboxes are not configured: set MODAL_TOKEN_ID/MODAL_TOKEN_SECRET server-side and SANDBOX_PROVIDER=modal. See docs/modal-sandboxes.md.")); return; }
    const child = spawn("python3", [path.join(process.cwd(), "workers", "modal_runner.py")], { env: { PATH: process.env.PATH || "", NODE_ENV: "production", MODAL_TOKEN_ID: process.env.MODAL_TOKEN_ID, MODAL_TOKEN_SECRET: process.env.MODAL_TOKEN_SECRET }, stdio: ["pipe", "pipe", "pipe"] }) as unknown as { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream; kill: (s: string) => void; on: (e: string, f: (...a: never[]) => void) => void };
    let out = "", err = ""; const kill = setTimeout(() => child.kill("SIGKILL"), 180_000);
    child.stdout.on("data", (d) => { out = (out + String(d)).slice(0, 200_000); }); child.stderr.on("data", (d) => { err = (err + String(d)).slice(0, 20_000); });
    child.on("error", (e) => { clearTimeout(kill); reject(e); });
    child.on("close", (code) => { clearTimeout(kill); if (code === 0) resolve(out); else reject(new Error(`Modal execution failed: ${err.slice(-500)}`)); });
    child.stdin.end(JSON.stringify(payload));
  });
}
// faster-whisper transcription through the same isolated boundary (CPU
// tiny/int8 profile in the runner). Refuses without the Modal provider —
// transcription never falls back to the host.
export async function transcribeAudio(audioBase64: string): Promise<{ segments: { start: number; end: number; text: string }[]; language?: string }> {
  if (process.env.SANDBOX_PROVIDER !== "modal") throw new ProviderNotConfiguredError("Transcription needs the isolated sandbox (SANDBOX_PROVIDER=modal) with faster-whisper. It never runs on the host.");
  if (audioBase64.length > 14_000_000) throw new Error("Audio too large for the sandbox transcription profile (10 MB max)");
  const out = await modalCall({ mode: "combined", kind: "transcribe", spec: { packageName: "faster-whisper", module: "faster_whisper", exportName: "transcribe" }, jobId: `tr-${Date.now().toString(36)}`, input: JSON.stringify({ input: audioBase64, model: "tiny" }) });
  const parsed = JSON.parse(out) as { output?: string };
  const inner = JSON.parse(parsed.output || "{}") as { segments?: { start: number; end: number; text: string }[]; language?: string };
  return { segments: (inner.segments || []).slice(0, 500), language: inner.language };
}
export function providerStatus(): { configured: string; isolated: boolean; detail: string } {
  const p = activeProvider();
  if (p === ModalProvider) return { configured: "modal", isolated: true, detail: "Modal Sandboxes (credentials still validated per-run)" };
  if (p === LocalProvider) return { configured: "local-trusted-fixtures", isolated: false, detail: "Host runner enabled ONLY for trusted fixtures — never for arbitrary repositories" };
  return { configured: "none", isolated: false, detail: "Untrusted execution refused (fail closed)" };
}
