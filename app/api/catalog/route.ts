import { NextResponse } from "next/server";
import { CATALOG } from "@/lib/catalog";
import { fetchRepo } from "@/lib/github";
export async function GET() {
  const repos = await Promise.all(CATALOG.map(async (c) => {
    try { const r = await fetchRepo(c.owner, c.repo); return { ...c, stars: r.stars, language: r.language, license: r.license, description: r.description }; }
    catch { return { ...c, stars: null, language: "—", license: "—", description: c.blurb }; }
  }));
  return NextResponse.json({ repos });
}
