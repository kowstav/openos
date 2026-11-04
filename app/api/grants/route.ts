import { NextRequest, NextResponse } from "next/server";
import { issueGrant, revokeGrant, listGrantsForUser } from "@/lib/broker";
import { requireUser } from "@/lib/auth";
import { getAppForOwner } from "@/lib/store";
// Identity is derived from the session. Client userId/scope/TTL are never
// authority: TTL is bounded by the broker, scope defaults to single-use.
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const app = b.appId ? await getAppForOwner(String(b.appId), u.userId) : null;
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  const action = String(b.action || "execute");
  if (action !== "execute" && !app.permissions.includes(action)) return NextResponse.json({ error: `App manifest does not allow "${action}"` }, { status: 403 });
  const g = await issueGrant({ userId: u.userId, appId: app.id, appVersion: app.version, action, resource: String(b.resource || app.id), purpose: String(b.purpose || "execute") });
  return "error" in g ? NextResponse.json(g, { status: 400 }) : NextResponse.json({ grant: g });
}
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ grants: await listGrantsForUser(u.userId) });
}
export async function DELETE(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  return NextResponse.json({ revoked: await revokeGrant(id, u.userId) });
}
