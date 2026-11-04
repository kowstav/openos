// Deterministic permission gateway — the model never decides alone.
export type Capability = "file:read-selected" | "file:download" | "network:github" | "network:model" | "camera" | "microphone" | "filesystem:wide" | "shell:exec" | "credentials:read";
const POLICY: Record<Capability, "allow" | "deny" | "ask"> = {
  "file:read-selected": "allow",   // only files the user explicitly picks
  "file:download": "allow",
  "network:github": "allow",
  "network:model": "allow",
  "camera": "ask", "microphone": "ask",
  "filesystem:wide": "deny", "shell:exec": "deny", "credentials:read": "deny",
};
export function authorize(cap: Capability): "allow" | "deny" | "ask" { return POLICY[cap] ?? "deny"; }
export function policyTable() { return Object.entries(POLICY).map(([capability, decision]) => ({ capability: capability as Capability, decision })); }
