import { runOperation } from "./runner";
// Provider seam: local today, Modal when credentials exist (docs/modal-sandboxes.md).
export interface SandboxProvider { name: string; run(kind: string, spec: { packageName: string; module: string; exportName: string }, input: string): Promise<string> }
export const LocalProvider: SandboxProvider = { name: "local-scrubbed-process", run: (kind, spec, input) => runOperation(kind, spec, input) };
export const ModalProvider: SandboxProvider = {
  name: "modal-sandboxes",
  run: async () => { throw new Error("Modal Sandboxes are not configured: set up a Modal account + MODAL_TOKEN_ID/MODAL_TOKEN_SECRET on the worker, then set SANDBOX_PROVIDER=modal. See docs/modal-sandboxes.md."); },
};
export function activeProvider(): SandboxProvider { return process.env.SANDBOX_PROVIDER === "modal" ? ModalProvider : LocalProvider; }
