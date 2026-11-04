import { authorize, type Capability } from "./permissions";
// Enforceable sandbox policy for generated apps. Trusted adapters only:
// OpenOS never executes arbitrary repository code. Untrusted-code execution
// (e.g. Modal Sandboxes) is the documented next step, not a current claim.
export const SANDBOX_POLICY = {
  isolation: "Trusted server adapter / browser WASM only. No arbitrary repo code is executed.",
  cpu: "1 vCPU (serverless default)", memoryMB: 512, timeoutSec: 30,
  maxUploadMB: 15, storage: "Ephemeral, in-memory only. Nothing is persisted server-side.",
  networkAllowlist: ["api.github.com", "api.meta.ai"],
  deniedCapabilities: ["shell:exec", "credentials:read", "filesystem:wide"] as Capability[],
};
export type SandboxVerdict = { decision: "allow" | "deny" | "ask"; reason: string };
export function checkSandbox(capability: string, host?: string): SandboxVerdict {
  const d = authorize(capability as Capability);
  if (d === "deny") return { decision: "deny", reason: `"${capability}" is always denied. The permission gateway is deterministic code — the AI model cannot override it.` };
  if (capability.startsWith("network:") && host) {
    const ok = SANDBOX_POLICY.networkAllowlist.some((h) => host === h || host.endsWith("." + h));
    return ok ? { decision: "allow", reason: `Host ${host} is on the sandbox allowlist.` } : { decision: "deny", reason: `Host ${host} is not on the sandbox allowlist (${SANDBOX_POLICY.networkAllowlist.join(", ")}). Blocked.` };
  }
  if (d === "ask") return { decision: "ask", reason: `"${capability}" needs explicit user approval in the permission gateway before any data flows.` };
  return { decision: "allow", reason: `"${capability}" is permitted for explicitly user-selected data only.` };
}
