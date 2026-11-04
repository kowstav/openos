import { NextRequest, NextResponse } from "next/server";
import { getAppForOwner, listApps, deleteAppForOwner, getArtifactsForOwner, deleteArtifacts, audit, updateAppForOwner, duplicateAppForOwner, rollbackToVersion, listAppVersions, diffVersions, getApp, publishAppEdit } from "@/lib/store";
import { requireUser, crossOriginDenied } from "@/lib/auth";
import { deleteAppObjects } from "@/lib/storage";
import { revokeGrantsForApp } from "@/lib/broker";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await ctx.params;
  if (id === "list") return NextResponse.json({ apps: await listApps(u.userId) });
  const app = await getAppForOwner(id, u.userId);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  const versions = await listAppVersions(u.userId, app);
  return NextResponse.json({ app, artifacts: await getArtifactsForOwner(id, u.userId), versions });
}
// Library management: rename, customize, reorder/remove steps,
// suspend/resume, duplicate and rollback. All owner-scoped; cross-owner
// access is 404 so existence is never leaked. Changing operations publishes
// a NEW validated version of the same app — a published manifest is never
// extended in place. Unsupported operations are rejected before publishing.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (crossOriginDenied(req)) return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  if (b.action === "duplicate") { const copy = await duplicateAppForOwner(id, u.userId); return copy ? NextResponse.json({ app: copy }) : NextResponse.json({ error: "App not found" }, { status: 404 }); }
  if (b.action === "rollback") {
    const target = b.targetId ? await getApp(String(b.targetId)) : null;
    if (!target || target.ownerId !== u.userId) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    const current = await getAppForOwner(id, u.userId); if (!current) return NextResponse.json({ error: "App not found" }, { status: 404 });
    if ((target.appKey || "") !== (current.appKey || "") && target.repo !== current.repo) return NextResponse.json({ error: "Version belongs to a different app" }, { status: 422 });
    const rolled = await rollbackToVersion(u.userId, target.id);
    return rolled ? NextResponse.json({ app: rolled, diff: await diffVersions(current, target) }) : NextResponse.json({ error: "Rollback failed" }, { status: 422 });
  }
  if (b.action === "rebuild") {
    // Rebuild re-enters the durable conversion path carrying this app's
    // identity, so a verified build publishes the NEXT version of the same
    // app; a failed rebuild leaves the last good version usable.
    const app = await getAppForOwner(id, u.userId); if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
    return NextResponse.json({ rebuild: { repoUrl: `https://github.com/${app.repo}`, prompt: app.prompt, capabilityIds: app.capabilityIds || app.operations, appKey: app.appKey || null, appId: app.id, note: "Submit via POST /api/convert with appKey; only a verified build publishes a new version." } });
  }
  const current = await getAppForOwner(id, u.userId);
  if (!current) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (Array.isArray(b.operations)) {
    const ops = b.operations.map(String).slice(0, 20);
    const allowed = new Set([...(current.capabilityIds || []), ...current.operations, ...(current.steps || []).map((s) => s.op)]);
    const unknown = ops.filter((o: string) => !allowed.has(o));
    if (unknown.length) return NextResponse.json({ error: `Unsupported operation(s) for this app: ${unknown.join(", ")}. Nothing was changed.` }, { status: 422 });
    if (!ops.length) return NextResponse.json({ error: "An app needs at least one operation. Nothing was changed." }, { status: 422 });
    if (new Set(ops).size !== ops.length) return NextResponse.json({ error: "Operations must not repeat. Nothing was changed." }, { status: 422 });
    const labelFor = (op: string) => current.steps.find((s) => s.op === op)?.label || op;
    const edited = await publishAppEdit(id, u.userId, { operations: ops, steps: ops.map((op: string) => ({ op, label: labelFor(op) })), prompt: typeof b.prompt === "string" ? b.prompt : undefined });
    if (!edited) return NextResponse.json({ error: "App not found" }, { status: 404 });
    await audit("app.version-published", u.userId, edited.id, `v${edited.version} from ${id}`);
    return NextResponse.json({ app: edited });
  }
  const patch: Record<string, unknown> = {};
  if (typeof b.title === "string") patch.title = b.title;
  if (typeof b.prompt === "string") patch.prompt = b.prompt;
  if (b.state === "ready" || b.state === "suspended") patch.state = b.state;
  const app = await updateAppForOwner(id, u.userId, patch as never);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  await audit("app.updated", u.userId, id, String(b.action || "edit"));
  return NextResponse.json({ app });
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (crossOriginDenied(req)) return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  const { id } = await ctx.params;
  const removed = await deleteAppForOwner(id, u.userId);
  if (!removed) return NextResponse.json({ error: "App not found" }, { status: 404 });
  // Scoped cleanup: only THIS app's artifacts, objects and grants. The
  // owner's other apps, files, versions and grants keep working.
  await deleteArtifacts(id);
  await deleteAppObjects(u.userId, id).catch(() => {});
  await revokeGrantsForApp(u.userId, id).catch(() => {});
  await audit("app.deleted", u.userId, id, "deleted");
  return NextResponse.json({ ok: true });
}
