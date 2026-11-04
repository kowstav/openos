import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { saveApp, audit, hashId } from "@/lib/store";
// Explicit legacy migration (I2): validated localStorage/JSON records are
// imported ONLY into the caller's authenticated account. Legacy execution
// grants are never restored; imported apps must request fresh grants, and
// their exec spec is kept only as data (execution still needs the isolated
// provider + a new grant).
const LegacyApp = z.object({
  id: z.string().min(1).max(100), title: z.string().max(300), repo: z.string().max(300),
  prompt: z.string().max(5000).default(""), studioUrl: z.string().max(500).default(""),
  operations: z.array(z.string().max(100)).max(50).default([]),
  permissions: z.array(z.string().max(100)).max(20).default([]),
  createdAt: z.number().optional(),
}).passthrough();
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const parsed = z.object({ apps: z.array(LegacyApp).max(100) }).safeParse(b);
  if (!parsed.success) return NextResponse.json({ error: "Invalid legacy data — nothing imported" }, { status: 400 });
  let imported = 0;
  // Imported ids are namespaced by owner: two accounts migrating the same
  // legacy id must never overwrite each other's app.
  const ownerTag = hashId(u.userId);
  for (const a of parsed.data.apps) {
    const newId = `migrated-${ownerTag}-${a.id}`.slice(0, 120);
    await saveApp({
      id: newId, appKey: `appkey-${newId}`, ownerId: u.userId, title: a.title, repo: a.repo, prompt: a.prompt,
      studioUrl: a.studioUrl || "/workspace", operations: a.operations, steps: a.operations.map((op) => ({ op, label: op })),
      permissions: a.permissions.filter((p) => !["shell:exec", "credentials:read", "filesystem:wide"].includes(p)),
      blocked: [], warnings: ["Migrated from legacy local storage. Execution requires a fresh permission grant."],
      createdAt: a.createdAt || Date.now(), version: 1, exec: null,
      ui: { fields: [{ id: "input", label: "Input", type: "textarea" }], outputType: "text" },
    });
    imported++;
  }
  await audit("legacy.migrated", u.userId, "legacy", `${imported} apps`);
  return NextResponse.json({ imported });
}
