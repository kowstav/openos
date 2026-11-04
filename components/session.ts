"use client";
// Ensures a real server session (httpOnly cookie) exists before calling
// owner-scoped APIs. Identity is derived server-side from this session.
let pending: Promise<void> | null = null;
export function ensureSession(): Promise<void> {
  if (!pending) {
    pending = fetch("/api/auth/session", { method: "POST" }).then(() => {}).catch(() => {}).finally(() => { pending = null; });
  }
  return pending;
}
