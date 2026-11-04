import { NextRequest, NextResponse } from "next/server";
import { getApp } from "@/lib/store";
import { activeProvider } from "@/lib/sandbox-provider";
import { checkGrant, consumeGrant } from "@/lib/broker";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const app = b.appId ? await getApp(String(b.appId)) : null;
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (!app.exec) return NextResponse.json({ error: "This app runs through its studio, not the generic executor." }, { status: 400 });
  // Execution path enforces the permission broker: a valid scoped grant is required.
  if (!b.grantId) return NextResponse.json({ error: "A permission grant is required. The app must ask first — no silent execution." }, { status: 403 });
  const verdict = checkGrant(String(b.grantId), { userId: String(b.userId || "demo-user"), appId: app.id, action: "execute" });
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 403 });
  const input = String(b.input ?? ""); if (input.length > 20_000) return NextResponse.json({ error: "Input too large (20k max)" }, { status: 413 });
  try { const output = await activeProvider().run(app.exec.kind, app.exec, input); consumeGrant(String(b.grantId)); return NextResponse.json({ output, grant: verdict.reason, provider: activeProvider().name }); }
  catch (e) { return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 422 }); }
}
