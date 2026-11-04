import { NextRequest, NextResponse } from "next/server";
import { fetchRepo, parseGitHubUrl, CURATED } from "@/lib/github";
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const list = req.nextUrl.searchParams.get("list");
  try {
    if (list) {
      const repos = await Promise.all(CURATED.map(async (c) => { try { const r = await fetchRepo(c.owner, c.repo); return { ...c, stars: r.stars, language: r.language, license: r.license, description: r.description }; } catch { return { ...c, stars: null, language: "—", license: "—", description: c.blurb }; } }));
      return NextResponse.json({ repos });
    }
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
    const p = parseGitHubUrl(url);
    if (!p) return NextResponse.json({ error: "Not a valid GitHub repository URL" }, { status: 400 });
    return NextResponse.json({ repo: await fetchRepo(p.owner, p.repo) });
  } catch (e) { return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 }); }
}
