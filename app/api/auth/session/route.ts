import { NextRequest, NextResponse } from "next/server";
import { createSession, requireUser, revokeSession, sessionCookie, userIdForHandle, identityKind, crossOriginDenied } from "@/lib/auth";
import { runMigrations, userIdForDevice, bindDevice } from "@/lib/store";
// Session issuance is IDEMPOTENT: a request that already carries a valid
// session gets that same identity back (no new user, no new cookie), so
// repeated helper calls and concurrent tabs cannot split one person into
// several owners. Identity is always derived server-side; a client-chosen
// userId is never trusted. Sign-in paths, in order:
//   1. existing valid session          -> same owner (idempotent)
//   2. { handle } keyless dev sign-in  -> stable account owner (same
//      library across fresh sessions/devices; development identity only)
//   3. { deviceKey } first visit       -> the owner already bound to this
//      browser profile, else a new guest owner bound to it
//   4. no body                         -> new guest owner
export async function POST(req: NextRequest) {
  if (crossOriginDenied(req)) return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  await runMigrations();
  const existing = await requireUser(req);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const handle = typeof body.handle === "string" ? body.handle.trim() : "";
  if (existing && !handle) return NextResponse.json({ userId: existing.userId, kind: identityKind(existing.userId) });
  if (handle) {
    if (handle.length < 2) return NextResponse.json({ error: "Enter a name or email with at least 2 characters." }, { status: 400 });
    const userId = userIdForHandle(handle);
    if (existing && existing.userId === userId) return NextResponse.json({ userId, kind: "account" });
    const { token } = await createSession(userId);
    return NextResponse.json({ userId, kind: "account" }, { headers: { "Set-Cookie": sessionCookie(token) } });
  }
  const deviceKey = typeof body.deviceKey === "string" && /^[A-Za-z0-9-]{8,80}$/.test(body.deviceKey) ? body.deviceKey : "";
  if (deviceKey) {
    const bound = await userIdForDevice(deviceKey);
    if (bound) {
      const { token } = await createSession(bound);
      return NextResponse.json({ userId: bound, kind: identityKind(bound) }, { headers: { "Set-Cookie": sessionCookie(token) } });
    }
    const { token, userId } = await createSession();
    await bindDevice(deviceKey, userId);
    return NextResponse.json({ userId, kind: "guest" }, { headers: { "Set-Cookie": sessionCookie(token) } });
  }
  const { token, userId } = await createSession();
  return NextResponse.json({ userId, kind: "guest" }, { headers: { "Set-Cookie": sessionCookie(token) } });
}
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  return u ? NextResponse.json({ userId: u.userId, kind: identityKind(u.userId) }) : NextResponse.json({ error: "No session" }, { status: 401 });
}
export async function DELETE(req: NextRequest) {
  const u = await requireUser(req);
  if (u) await revokeSession(u.token);
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": "openos_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" } });
}
