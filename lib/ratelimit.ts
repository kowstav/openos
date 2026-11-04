// Per-user and global quotas (S2-5/S3). In-memory fixed-window counters bound
// expensive work (conversions, PDF processing, executions, model/GitHub
// fan-out) before it starts. A multi-instance deployment swaps this for a
// shared counter behind the same checkQuota call; the enforcement point does
// not move. Authenticated routes key by user; intentionally-public
// discovery routes key by client IP (see clientSubject).
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
export const QUOTAS = {
  convert: { limit: 10, windowMs: 3600_000, label: "conversions per hour" },
  pdf: { limit: 60, windowMs: 3600_000, label: "PDF operations per hour" },
  execute: { limit: 120, windowMs: 3600_000, label: "executions per hour" },
  analyze: { limit: 60, windowMs: 3600_000, label: "repository analyses per hour" },
  generate: { limit: 60, windowMs: 3600_000, label: "app generations per hour" },
  github: { limit: 120, windowMs: 3600_000, label: "GitHub lookups per hour" },
  catalog: { limit: 60, windowMs: 3600_000, label: "catalog lookups per hour" },
} as const;
export type QuotaKind = keyof typeof QUOTAS;
export function checkQuota(kind: QuotaKind, subject: string): { ok: boolean; reason: string } {
  const q = QUOTAS[kind]; const key = `${kind}:${subject}`; const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + q.windowMs }); return { ok: true, reason: "within quota" }; }
  if (b.count >= q.limit) return { ok: false, reason: `Quota exceeded: ${q.limit} ${q.label}. Try again after ${new Date(b.resetAt).toISOString()}.` };
  b.count += 1; return { ok: true, reason: "within quota" };
}
export function quotaSnapshot() { return [...buckets.entries()].map(([key, b]) => ({ key, count: b.count, resetAt: b.resetAt })); }
// Subject for anonymous-but-public routes: first forwarded IP, else a shared
// bucket. Behind a trusted proxy this is the client; direct deployments fall
// back to one bucket, which is the safe (stricter) direction.
export function clientSubject(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip");
  return `ip:${(ip || "unknown").slice(0, 64)}`;
}
