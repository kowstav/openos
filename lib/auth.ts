import { createHash, randomBytes, randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { findSession, saveSession, deleteSession } from "./store";
// Actual server-side sessions (I2). The browser receives an opaque token
// (httpOnly cookie set by /api/auth/session, or Bearer for API clients).
// Only the SHA-256 hash is stored. Identity is ALWAYS derived here —
// client-supplied userId/demo-user is never authority.
export const SESSION_TTL_MS = 7 * 24 * 3600_000;
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function createSession(userId?: string) {
  const token = randomBytes(32).toString("base64url");
  const uid = userId || `user-${randomUUID()}`;
  await saveSession({ tokenHash: hashToken(token), userId: uid, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
  return { token, userId: uid };
}
// Keyless development identity: a stable handle maps deterministically to
// one owner id, so the same person opening OpenOS in a fresh browser or on
// another device and entering the same handle sees the same library. This
// is a DEVELOPMENT sign-in (anyone who knows the handle can use it); a
// production deployment swaps it for an IdP behind the same session record.
// Guests (random ids) are a different, recoverable-only-by-cookie identity.
export function userIdForHandle(handle: string): string {
  const norm = handle.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  return `user-dev-${createHash("sha256").update(`openos-dev:${norm}`).digest("hex").slice(0, 24)}`;
}
export function identityKind(userId: string): "account" | "guest" {
  return userId.startsWith("user-dev-") ? "account" : "guest";
}
// Mutating browser requests must come from our own origin when an Origin
// header is present (CSRF defence-in-depth alongside SameSite=Lax cookies).
// Non-browser clients (tests, API callers) send no Origin and are unaffected.
export function crossOriginDenied(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host !== req.headers.get("host"); } catch { return true; }
}
export function tokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)openos_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
export async function requireUser(req: NextRequest): Promise<{ userId: string; token: string } | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const s = await findSession(hashToken(token));
  return s ? { userId: s.userId, token } : null;
}
export async function revokeSession(token: string) { await deleteSession(hashToken(token)); }
export function sessionCookie(token: string) {
  return `openos_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}
