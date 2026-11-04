import { NextRequest, NextResponse } from "next/server";
import { CATALOG } from "@/lib/catalog";
import { rankDiscovery, byCollection } from "@/lib/discovery";
import { confirmPublic } from "@/lib/github";
import { checkQuota, clientSubject } from "@/lib/ratelimit";
// Public discovery stays intentionally public but returns only catalog
// evidence plus live public GitHub metadata — never user data. Listing a
// card needs only the repo meta (stars/language/license/description), so
// this route confirms public visibility and reads that one record per
// repo instead of fetching full trees; results are cached briefly so the
// marketplace is fast and GitHub fan-out stays bounded per client.
const metaCache = new Map<string, { at: number; meta: { stars: number | null; language: string; license: string; description: string } }>();
const TTL_MS = 10 * 60_000;
async function lightMeta(owner: string, repo: string, blurb: string) {
  const key = `${owner}/${repo}`;
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.meta;
  try {
    const m = await confirmPublic(owner, repo) as { stargazers_count?: number; language?: string; license?: { spdx_id?: string }; description?: string };
    const meta = { stars: m.stargazers_count ?? null, language: m.language ?? "—", license: m.license?.spdx_id ?? "—", description: m.description ?? blurb };
    metaCache.set(key, { at: Date.now(), meta });
    return meta;
  } catch { return { stars: null, language: "—", license: "—", description: blurb }; }
}
export async function GET(req: NextRequest) {
  const quota = checkQuota("catalog", clientSubject(req));
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });
  const q = req.nextUrl.searchParams.get("q") || "";
  const collection = req.nextUrl.searchParams.get("collection") || "All";
  const pool = byCollection(collection);
  const ranked = q ? rankDiscovery(q, pool) : pool.map((entry) => ({ entry, score: 0, reasons: ["Listed in this collection"], mode: "problem" as const }));
  const repos = await Promise.all(ranked.map(async (r) => {
    const c = r.entry;
    const g = await lightMeta(c.owner, c.repo, c.blurb);
    return { ...c, ...g, score: r.score, reasons: r.reasons, mode: r.mode };
  }));
  return NextResponse.json({ repos, total: CATALOG.length, query: q, collection });
}
