import { NextResponse } from "next/server";
import { storeHealth, storeMetrics } from "@/lib/store";
import { providerStatus } from "@/lib/sandbox-provider";
// Health exposes configuration presence only — never secret values.
// `model.configured` lets operators validate MODEL_API_KEY/META_API_KEY
// activation without calling the provider (docs/i5-release.md).
export async function GET() {
  try {
    const [health, metrics] = await Promise.all([storeHealth(), storeMetrics()]);
    const modelConfigured = Boolean(process.env.MODEL_API_KEY || process.env.META_API_KEY);
    return NextResponse.json({ ...health, metrics, provider: providerStatus(), model: { configured: modelConfigured, mode: modelConfigured ? "genuine-ai-conversion" : "analysis-only-fallback" } });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 503 }); }
}
