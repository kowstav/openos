import { NextRequest, NextResponse } from "next/server";
import { createSession, requireUser, revokeSession, sessionCookie } from "@/lib/auth";
import { runMigrations } from "@/lib/store";
// Credential-free local sign-in (I2): issuing a session creates a real
// server-side owner identity. Production swaps this for an IdP behind the
// same session record; no client-chosen userId is ever trusted.
export async function POST() {
  await runMigrations();
  const { token, userId } = await createSession();
  return NextResponse.json({ userId }, { headers: { "Set-Cookie": sessionCookie(token) } });
}
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  return u ? NextResponse.json({ userId: u.userId }) : NextResponse.json({ error: "No session" }, { status: 401 });
}
export async function DELETE(req: NextRequest) {
  const u = await requireUser(req);
  if (u) await revokeSession(u.token);
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": "openos_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" } });
}
