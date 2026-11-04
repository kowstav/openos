import { NextRequest, NextResponse } from "next/server";
import { createJob } from "@/lib/convert";
import { listJobs, getJob } from "@/lib/store";
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (!b.url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  try { const job = await createJob(String(b.url), String(b.prompt || "")); return NextResponse.json({ job }); }
  catch (e) { return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 }); }
}
export async function GET() { return NextResponse.json({ jobs: await listJobs() }); }
