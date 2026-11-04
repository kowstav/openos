// Permission broker: scoped, expiring, revocable grants. Deterministic —
// model output can request a grant, only this code can issue or honor it.
export type Grant = { id: string; userId: string; appId: string; action: string; scope: string; expiresAt: number; revoked: boolean };
const grants = new Map<string, Grant>();
const ALWAYS_DENY = new Set(["shell:exec", "credentials:read", "filesystem:wide"]);
export function issueGrant(input: { userId: string; appId: string; action: string; scope?: string; ttlSec?: number }): Grant | { error: string } {
  if (ALWAYS_DENY.has(input.action)) return { error: `"${input.action}" can never be granted.` };
  if (!input.userId || !input.appId) return { error: "userId and appId are required — anonymous grants do not exist." };
  const g: Grant = { id: Math.random().toString(36).slice(2, 12), userId: input.userId, appId: input.appId, action: input.action, scope: input.scope || "single-use", expiresAt: Date.now() + (input.ttlSec ?? 300) * 1000, revoked: false };
  grants.set(g.id, g); return g;
}
export function checkGrant(grantId: string, ctx: { userId: string; appId: string; action: string }): { ok: boolean; reason: string } {
  const g = grants.get(grantId);
  if (!g) return { ok: false, reason: "Unknown grant — denied." };
  if (g.revoked) return { ok: false, reason: "Grant was revoked — denied." };
  if (Date.now() > g.expiresAt) return { ok: false, reason: "Grant expired — denied. Ask the user again." };
  if (g.userId !== ctx.userId) return { ok: false, reason: "Grant belongs to a different user — denied (cross-user isolation)." };
  if (g.appId !== ctx.appId) return { ok: false, reason: "Grant belongs to a different app — denied." };
  if (g.action !== ctx.action) return { ok: false, reason: `Grant covers "${g.action}", not "${ctx.action}" — denied.` };
  return { ok: true, reason: `Scoped grant honored for ${ctx.action} (${g.scope}).` };
}
export function revokeGrant(id: string) { const g = grants.get(id); if (g) g.revoked = true; return !!g; }
export function consumeGrant(id: string) { const g = grants.get(id); if (g && g.scope === "single-use") g.revoked = true; }
