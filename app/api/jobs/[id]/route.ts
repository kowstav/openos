import { NextRequest, NextResponse } from "next/server";
import { getJobForOwner, updateJob, audit } from "@/lib/store";
import { requireUser } from "@/lib/auth";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params; const job = await getJobForOwner(id, u.userId);
  // Cross-owner reads return 404, not 403: job existence is not enumerable.
  return job ? NextResponse.json({ job }) : NextResponse.json({ error: "Job not found" }, { status: 404 });
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params; const job = await getJobForOwner(id, u.userId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  await updateJob(id, { status: "cancelled" });
  await audit("job.cancelled", u.userId, id, "cancelled");
  return NextResponse.json({ ok: true });
}
