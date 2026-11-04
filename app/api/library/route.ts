import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { listApps, listPlans, listJobs, savePlan, deletePlanForOwner, audit } from "@/lib/store";
import { listGrantsForUser } from "@/lib/broker";
import { requireUser } from "@/lib/auth";
// One personal library (I4): saved plans, converted apps, build history and
// the permission center, all behind the server session. Nothing here trusts
// a client-supplied user id (S2-3).
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const [apps, plans, jobs, grants] = await Promise.all([listApps(u.userId), listPlans(u.userId), listJobs(u.userId), listGrantsForUser(u.userId)]);
  return NextResponse.json({
    apps, plans, jobs: jobs.slice(0, 50),
    permissions: grants.map((g) => ({ id: g.id, appId: g.appId, action: g.action, purpose: g.purpose, expiresAt: g.expiresAt, revoked: g.revoked, usedCount: g.usedCount, maxUses: g.maxUses })),
  });
}
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.title || !b.repoUrl) return NextResponse.json({ error: "title and repoUrl are required" }, { status: 400 });
  const plan = { id: `plan-${randomUUID().slice(0, 12)}`, ownerId: u.userId, title: String(b.title).slice(0, 120), repoUrl: String(b.repoUrl).slice(0, 300), prompt: String(b.prompt || "").slice(0, 2000), capabilityIds: Array.isArray(b.capabilityIds) ? b.capabilityIds.map(String).slice(0, 20) : [], createdAt: Date.now(), updatedAt: Date.now() };
  await savePlan(plan); await audit("plan.saved", u.userId, plan.id, "saved");
  return NextResponse.json({ plan });
}
export async function DELETE(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("planId") || "";
  return NextResponse.json({ ok: await deletePlanForOwner(id, u.userId) });
}
