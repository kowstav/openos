import { randomBytes } from "crypto";
import { promises as fs } from "fs"; import path from "path";
import { DATA_DIR } from "./store";
// Permission broker (I2/S1): high-entropy, persisted, narrowly-scoped grants.
// A grant binds user + app + appVersion + action + resource + purpose, has a
// bounded TTL (max 15 min) and a max-use count. Reserve/consume is a single
// serialized transaction, so concurrent replays dispatch at most once.
// Grants are never restored from legacy data or backups.
export type Grant = {
  id: string; userId: string; appId: string; appVersion: number; action: string;
  resource: string; purpose: string; scope: string; maxUses: number; usedCount: number;
  expiresAt: number; revoked: boolean; createdAt: number;
};
const FILE = path.join(DATA_DIR, "grants.json");
let chain: Promise<unknown> = Promise.resolve();
function tx<T>(fn: () => Promise<T>): Promise<T> { const n = chain.then(fn, fn); chain = n.then(() => undefined, () => undefined); return n; }
async function readAll(): Promise<Grant[]> { try { return JSON.parse(await fs.readFile(FILE, "utf8")); } catch { return []; } }
async function writeAll(all: Grant[]) { await fs.mkdir(DATA_DIR, { recursive: true }); const tmp = `${FILE}.${process.pid}.tmp`; await fs.writeFile(tmp, JSON.stringify(all, null, 2)); await fs.rename(tmp, FILE); }
const ALWAYS_DENY = new Set(["shell:exec", "credentials:read", "filesystem:wide"]);
export const MAX_TTL_SEC = 900;
export async function issueGrant(input: { userId: string; appId: string; appVersion?: number; action: string; resource?: string; purpose?: string; scope?: string; ttlSec?: number; maxUses?: number }): Promise<Grant | { error: string }> {
  if (ALWAYS_DENY.has(input.action)) return { error: `"${input.action}" can never be granted.` };
  if (!input.userId || !input.appId) return { error: "userId and appId are required — anonymous grants do not exist." };
  const ttl = Math.min(Math.max(input.ttlSec ?? 300, 1), MAX_TTL_SEC);
  const g: Grant = {
    id: randomBytes(24).toString("base64url"), userId: input.userId, appId: input.appId,
    appVersion: input.appVersion ?? 1, action: input.action, resource: input.resource || input.appId,
    purpose: input.purpose || "execute", scope: input.scope || "single-use",
    maxUses: input.scope === "single-use" ? 1 : Math.min(input.maxUses ?? 1, 10), usedCount: 0,
    expiresAt: Date.now() + ttl * 1000, revoked: false, createdAt: Date.now(),
  };
  await tx(async () => { const all = await readAll(); all.unshift(g); await writeAll(all.slice(0, 1000)); });
  return g;
}
function verdict(g: Grant | undefined, ctx: { userId: string; appId: string; action: string; appVersion?: number }): { ok: boolean; reason: string } {
  if (!g) return { ok: false, reason: "Unknown grant — denied." };
  if (g.revoked) return { ok: false, reason: "Grant was revoked — denied." };
  if (Date.now() > g.expiresAt) return { ok: false, reason: "Grant expired — denied. Ask the user again." };
  if (g.usedCount >= g.maxUses) return { ok: false, reason: "Grant already consumed — denied (replay protection)." };
  if (g.userId !== ctx.userId) return { ok: false, reason: "Grant belongs to a different user — denied (cross-user isolation)." };
  if (g.appId !== ctx.appId) return { ok: false, reason: "Grant belongs to a different app — denied." };
  if (ctx.appVersion !== undefined && g.appVersion !== ctx.appVersion) return { ok: false, reason: "Grant was issued for a different app version — denied (rebuild invalidates grants)." };
  if (g.action !== ctx.action) return { ok: false, reason: `Grant covers "${g.action}", not "${ctx.action}" — denied.` };
  return { ok: true, reason: `Scoped grant honored for ${ctx.action} (${g.scope}, use ${g.usedCount + 1}/${g.maxUses}).` };
}
export async function checkGrant(grantId: string, ctx: { userId: string; appId: string; action: string; appVersion?: number }) {
  const all = await readAll(); return verdict(all.find((g) => g.id === grantId), ctx);
}
// Atomic reserve+consume: check and increment happen in one transaction.
// If dispatch later times out after running, the use stays consumed — a
// timed-out operation is never silently replayed (safe semantics, S1).
export async function consumeGrantAtomic(grantId: string, ctx: { userId: string; appId: string; action: string; appVersion?: number }) {
  return tx(async () => {
    const all = await readAll(); const g = all.find((x) => x.id === grantId);
    const v = verdict(g, ctx); if (!v.ok || !g) return v;
    g.usedCount += 1; if (g.usedCount >= g.maxUses) g.revoked = true;
    await writeAll(all); return v;
  });
}
export async function consumeGrant(id: string) { const all = await readAll(); const g = all.find((x) => x.id === id); if (g) await consumeGrantAtomic(id, { userId: g.userId, appId: g.appId, action: g.action }); }
export async function revokeGrant(id: string, userId?: string) {
  return tx(async () => { const all = await readAll(); const g = all.find((x) => x.id === id); if (!g || (userId && g.userId !== userId)) return false; g.revoked = true; await writeAll(all); return true; });
}
export async function listGrantsForUser(userId: string) { return (await readAll()).filter((g) => g.userId === userId); }
export async function revokeGrantsForApp(userId: string, appId: string) {
  return tx(async () => { const all = await readAll(); let n = 0; for (const g of all) { if (g.userId === userId && g.appId === appId && !g.revoked) { g.revoked = true; n++; } } if (n) await writeAll(all); return n; });
}
export async function cleanupGrants(now = Date.now()) { return tx(async () => { const all = await readAll(); const kept = all.filter((g) => g.expiresAt > now - 3600_000); await writeAll(kept); return all.length - kept.length; }); }
