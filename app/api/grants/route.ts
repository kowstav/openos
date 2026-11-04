import { NextRequest, NextResponse } from "next/server";
import { issueGrant, revokeGrant } from "@/lib/broker";
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const g = issueGrant({ userId: String(b.userId || "demo-user"), appId: String(b.appId || ""), action: String(b.action || "execute"), scope: b.scope ? String(b.scope) : undefined, ttlSec: b.ttlSec ? Number(b.ttlSec) : undefined });
  return "error" in g ? NextResponse.json(g, { status: 400 }) : NextResponse.json({ grant: g });
}
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || ""; return NextResponse.json({ revoked: revokeGrant(id) });
}
