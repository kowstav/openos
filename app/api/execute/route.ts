import { NextRequest, NextResponse } from "next/server";
import { getAppForOwner, audit, recordExecution } from "@/lib/store";
import { activeProvider, providerStatus } from "@/lib/sandbox-provider";
import { consumeGrantAtomic } from "@/lib/broker";
import { requireUser } from "@/lib/auth";
import { checkQuota } from "@/lib/ratelimit";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const app = b.appId ? await getAppForOwner(String(b.appId), u.userId) : null;
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (app.state === "suspended") return NextResponse.json({ error: "This app is suspended. Resume it from My Apps before running it." }, { status: 403 });
  if (!app.exec) return NextResponse.json({ error: "This app runs through its studio, not the generic executor." }, { status: 400 });
  // Quota before grant consumption: a rate-limited request must not burn a
  // single-use grant (S3 ordering fix).
  const quota = checkQuota("execute", u.userId);
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });
  if (!b.grantId) return NextResponse.json({ error: "A permission grant is required. The app must ask first — no silent execution." }, { status: 403 });
  // Atomic reserve/consume BEFORE dispatch: concurrent replays dispatch once.
  // A timed-out dispatch stays consumed (it may already have run).
  const verdict = await consumeGrantAtomic(String(b.grantId), { userId: u.userId, appId: app.id, action: "execute", appVersion: app.version });
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 403 });
  const operation = String(b.operation || app.exec.capabilityId || app.operations[0] || "");
  const allowed = new Set([...(app.capabilityIds || []), ...app.operations]);
  if (operation && allowed.size && !allowed.has(operation)) return NextResponse.json({ error: `Operation "${operation}" was not selected for this app — unselected actions cannot run.` }, { status: 403 });
  if (app.exec.capabilityId && operation && operation !== app.exec.capabilityId && !app.operations.includes(operation)) return NextResponse.json({ error: "Operation is not executable for this app version." }, { status: 403 });
  const input = String(b.input ?? ""); if (input.length > 20_000) return NextResponse.json({ error: "Input too large (20k max)" }, { status: 413 });
  try {
    const output = await activeProvider().run(app.exec.kind, app.exec, input);
    await audit("app.executed", u.userId, app.id, providerStatus().configured);
    await recordExecution(app.id, u.userId, { at: Date.now(), operation, outcome: "succeeded", detail: `via ${activeProvider().name}` });
    return NextResponse.json({ output, grant: verdict.reason, provider: activeProvider().name });
  } catch (e) { await recordExecution(app.id, u.userId, { at: Date.now(), operation: String(b.operation || ""), outcome: "failed", detail: String(e instanceof Error ? e.message : e).slice(0, 120) }); return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 422 }); }
}
