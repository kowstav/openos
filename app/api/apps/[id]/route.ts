import { NextRequest, NextResponse } from "next/server";
import { getApp, listApps, deleteApp, getArtifacts } from "@/lib/store";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === "list") return NextResponse.json({ apps: await listApps() });
  const app = await getApp(id); return app ? NextResponse.json({ app, artifacts: await getArtifacts(id) }) : NextResponse.json({ error: "App not found" }, { status: 404 });
}
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params; await deleteApp(id); return NextResponse.json({ ok: true });
}
