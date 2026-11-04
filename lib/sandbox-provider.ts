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
export const LocalProvider: SandboxProvider = {
  name: "local-trusted-fixtures (host process — NOT isolated)",
  run: (kind, spec, input) => {
    if (process.env.OPENOS_ENABLE_LOCAL_FIXTURES !== "1") {
      return Promise.reject(new ProviderNotConfiguredError("Local host runner is disabled. It may only run explicitly trusted fixtures with OPENOS_ENABLE_LOCAL_FIXTURES=1. Untrusted repositories are never downgraded to a host child process."));
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
export function providerStatus(): { configured: string; isolated: boolean; detail: string } {
  const p = activeProvider();
  if (p === ModalProvider) return { configured: "modal", isolated: true, detail: "Modal Sandboxes (credentials still validated per-run)" };
  if (p === LocalProvider) return { configured: "local-trusted-fixtures", isolated: false, detail: "Host runner enabled ONLY for trusted fixtures — never for arbitrary repositories" };
  return { configured: "none", isolated: false, detail: "Untrusted execution refused (fail closed)" };
}
