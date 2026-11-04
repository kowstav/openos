import { NextRequest, NextResponse } from "next/server";
import { CATALOG } from "@/lib/catalog";
import { rankDiscovery, byCollection } from "@/lib/discovery";
import { fetchRepo } from "@/lib/github";
import { checkQuota, clientSubject } from "@/lib/ratelimit";
// Public discovery stays intentionally public (S1) but returns only catalog
// evidence plus live public GitHub metadata — never user data. Per-client
// quota bounds GitHub fan-out from this surface (S3).
export async function GET(req: NextRequest) {
  const quota = checkQuota("catalog", clientSubject(req));
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });
  const q = req.nextUrl.searchParams.get("q") || "";
  const collection = req.nextUrl.searchParams.get("collection") || "All";
  const pool = byCollection(collection);
  const ranked = q ? rankDiscovery(q, pool) : pool.map((entry) => ({ entry, score: 0, reasons: ["Listed in this collection"], mode: "problem" as const }));
  const repos = await Promise.all(ranked.map(async (r) => {
    const c = r.entry;
    try { const g = await fetchRepo(c.owner, c.repo); return { ...c, stars: g.stars, language: g.language, license: g.license, description: g.description, score: r.score, reasons: r.reasons, mode: r.mode }; }
    catch { return { ...c, stars: null, language: "—", license: "—", description: c.blurb, score: r.score, reasons: r.reasons, mode: r.mode }; }
  }));
  return NextResponse.json({ repos, total: CATALOG.length, query: q, collection });
}
