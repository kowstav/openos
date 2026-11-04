"use client";
// Ensures a real server session (httpOnly cookie) exists before calling
// owner-scoped APIs. Identity is derived server-side from this session.
// Initialization is idempotent: one in-flight promise per page, a stable
// per-browser device key so concurrent tabs converge on one owner, and a
// server that returns the existing identity instead of minting a new user.
let pending: Promise<void> | null = null;
let ensured = false;
function deviceKey(): string {
  try {
    let k = localStorage.getItem("openos-device-key");
    if (!k) { k = `dev-${crypto.randomUUID()}`; localStorage.setItem("openos-device-key", k); }
    return k;
  } catch { return ""; }
}
export function ensureSession(): Promise<void> {
  if (ensured) return Promise.resolve();
  if (!pending) {
    pending = fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKey: deviceKey() }) })
      .then(() => { ensured = true; })
      .catch(() => {})
      .finally(() => { pending = null; });
  }
  return pending;
}
// Keyless development sign-in: the same handle on any browser/device opens
// the same library. Sign-out revokes the server session; the next visit
// starts as a fresh guest until the person signs in again.
export async function signIn(handle: string): Promise<{ userId: string; kind: string }> {
  const r = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Sign-in failed");
  ensured = true;
  return j;
}
export async function signOut(): Promise<void> {
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  ensured = false;
}
export async function currentIdentity(): Promise<{ userId: string; kind: string } | null> {
  const r = await fetch("/api/auth/session").catch(() => null);
  if (!r || !r.ok) return null;
  return r.json().catch(() => null);
}
