import { spawn } from "child_process"; import path from "path";
import { runOperation } from "./runner";
// Provider seam per docs/modal-sandboxes.md: trusted control plane (this app,
// holds keys) → untrusted execution. Local = scrubbed child process today.
// Modal = one ephemeral Sandbox per execution via workers/modal_runner.py;
// credentials are read server-side only and never enter the sandbox.
export interface SandboxProvider { name: string; run(kind: string, spec: { packageName: string; module: string; exportName: string }, input: string): Promise<string> }
export const LocalProvider: SandboxProvider = { name: "local-scrubbed-process", run: (kind, spec, input) => runOperation(kind, spec, input) };
function modalRun(kind: string, spec: { packageName: string; module: string; exportName: string }, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) { reject(new Error("Modal Sandboxes are not configured: set MODAL_TOKEN_ID/MODAL_TOKEN_SECRET server-side and SANDBOX_PROVIDER=modal. See docs/modal-sandboxes.md.")); return; }
    const child = spawn("python3", [path.join(process.cwd(), "workers", "modal_runner.py")], { env: { PATH: process.env.PATH || "", NODE_ENV: "production", MODAL_TOKEN_ID: process.env.MODAL_TOKEN_ID, MODAL_TOKEN_SECRET: process.env.MODAL_TOKEN_SECRET }, stdio: ["pipe", "pipe", "pipe"] }) as unknown as { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream; kill: (s: string) => void; on: (e: string, f: (...a: never[]) => void) => void };
    let out = "", err = ""; const kill = setTimeout(() => child.kill("SIGKILL"), 180_000);
    child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(kill); reject(e); });
    child.on("close", (code) => { clearTimeout(kill); if (code === 0) { try { resolve(JSON.parse(out).output); } catch { reject(new Error("Modal worker returned invalid output")); } } else reject(new Error(`Modal execution failed: ${err.slice(-500)}`)); });
    child.stdin.end(JSON.stringify({ kind, spec, input }));
  });
}
export const ModalProvider: SandboxProvider = { name: "modal-sandboxes", run: modalRun };
export function activeProvider(): SandboxProvider { return process.env.SANDBOX_PROVIDER === "modal" ? ModalProvider : LocalProvider; }
