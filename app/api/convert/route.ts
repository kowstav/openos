import { NextRequest, NextResponse } from "next/server";
import { createJob } from "@/lib/convert";
import { listJobs } from "@/lib/store";
import { requireUser } from "@/lib/auth";
import { checkQuota } from "@/lib/ratelimit";
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const quota = checkQuota("convert", u.userId);
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (!b.url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  try {
    const job = await createJob(String(b.url), String(b.prompt || ""), u.userId, b.idempotencyKey ? String(b.idempotencyKey) : undefined, { selectedCapabilities: Array.isArray(b.selectedCapabilities) ? b.selectedCapabilities.map(String).slice(0,20) : undefined, workflowOrder: Array.isArray(b.workflowOrder) ? b.workflowOrder.map(String).slice(0,20) : undefined, options: b.options && typeof b.options==="object" ? b.options : undefined });
    return NextResponse.json({ job });
  } catch (e) { return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 }); }
}
export async function GET(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ jobs: await listJobs(u.userId) });
}
