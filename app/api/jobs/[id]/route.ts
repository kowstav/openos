import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/store";
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; const job = await getJob(id);
  return job ? NextResponse.json({ job }) : NextResponse.json({ error: "Job not found" }, { status: 404 });
}
