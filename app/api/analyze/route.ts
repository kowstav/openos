import { NextRequest, NextResponse } from "next/server";
import { fetchRepo, parseGitHubUrl } from "@/lib/github";
import { analyzeWithModel } from "@/lib/model";
export async function POST(req: NextRequest) {
  const { url } = await req.json().catch(() => ({}));
  const p = url ? parseGitHubUrl(url) : null;
  if (!p) return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
  try {
    const repo = await fetchRepo(p.owner, p.repo);
    const { blueprint, source, cachedTokens } = await analyzeWithModel(repo);
    return NextResponse.json({ repo, blueprint, source, cachedTokens: cachedTokens ?? null });
  } catch (e) { return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 }); }
}
