import { NextRequest, NextResponse } from "next/server";
import { generateApp } from "@/lib/engine";
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.repo || typeof body.repo !== "string") return NextResponse.json({ error: "repo is required" }, { status: 400 });
  const app = generateApp({ repo: body.repo, prompt: String(body.prompt || ""), selectedCapabilities: Array.isArray(body.selectedCapabilities) ? body.selectedCapabilities : [] });
  return NextResponse.json({ app });
}
