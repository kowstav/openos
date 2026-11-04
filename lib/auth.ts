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
