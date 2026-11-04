import { NextRequest, NextResponse } from "next/server";
import { getAppForOwner, listApps, deleteAppForOwner, getArtifactsForOwner, deleteArtifacts, audit, updateAppForOwner, duplicateAppForOwner, rollbackToVersion, listAppVersions, diffVersions, getApp } from "@/lib/store";
import { requireUser } from "@/lib/auth";
import { deleteOwnerObjects } from "@/lib/storage";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (id === "list") return NextResponse.json({ apps: await listApps(u.userId) });
  const app = await getAppForOwner(id, u.userId);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  const versions = await listAppVersions(u.userId, app.repo);
  return NextResponse.json({ app, artifacts: await getArtifactsForOwner(id, u.userId), versions });
}
// Library management (I4): rename, customize, reorder/remove steps,
// suspend/resume, duplicate and rollback. All owner-scoped; cross-owner
// access is 404 so existence is never leaked (S2-3).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  if (b.action === "duplicate") { const copy = await duplicateAppForOwner(id, u.userId); return copy ? NextResponse.json({ app: copy }) : NextResponse.json({ error: "App not found" }, { status: 404 }); }
  if (b.action === "rollback") {
    const target = b.targetId ? await getApp(String(b.targetId)) : null;
    if (!target || target.ownerId !== u.userId) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const current = await getAppForOwner(id, u.userId); if (!current) return NextResponse.json({ error: "App not found" }, { status: 404 });
    const rolled = await rollbackToVersion(u.userId, target.id);
    return rolled ? NextResponse.json({ app: rolled, diff: await diffVersions(current, target) }) : NextResponse.json({ error: "Rollback failed" }, { status: 422 });
  }
  if (b.action === "rebuild") {
    // Rebuild against a new revision reuses the durable conversion path;
    // the route only records intent — the worker publishes a new version
    // and a failed rebuild leaves the last good version usable (I2).
    const app = await getAppForOwner(id, u.userId); if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
    return NextResponse.json({ rebuild: { repoUrl: `https://github.com/${app.repo}`, prompt: app.prompt, capabilityIds: app.capabilityIds || app.operations, note: "Submit via POST /api/convert; only a verified build publishes a new version." } });
  }
  const patch: Record<string, unknown> = {};
  if (typeof b.title === "string") patch.title = b.title;
  if (typeof b.prompt === "string") patch.prompt = b.prompt;
  if (b.state === "ready" || b.state === "suspended") patch.state = b.state;
  if (Array.isArray(b.operations)) { patch.operations = b.operations.map(String); patch.steps = b.operations.map((op: string) => ({ op: String(op), label: String(op) })); }
  const app = await updateAppForOwner(id, u.userId, patch as never);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  await audit("app.updated", u.userId, id, String(b.action || "edit"));
  return NextResponse.json({ app });
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  const removed = await deleteAppForOwner(id, u.userId);
  if (!removed) return NextResponse.json({ error: "App not found" }, { status: 404 });
  await deleteArtifacts(id); await deleteOwnerObjects(u.userId).catch(() => {});
  await audit("app.deleted", u.userId, id, "deleted");
  return NextResponse.json({ ok: true });
}
