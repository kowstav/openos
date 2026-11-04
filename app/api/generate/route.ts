import { NextRequest, NextResponse } from "next/server";
import { generateApp } from "@/lib/engine";
import { requireUser } from "@/lib/auth";
import { checkQuota } from "@/lib/ratelimit";
// Generation shapes a user's app: authenticated + quota-bounded (S3).
export async function POST(req: NextRequest) {
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const quota = checkQuota("generate", u.userId);
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (!body.repo || typeof body.repo !== "string") return NextResponse.json({ error: "repo is required" }, { status: 400 });
  const app = generateApp({ repo: body.repo, prompt: String(body.prompt || ""), selectedCapabilities: Array.isArray(body.selectedCapabilities) ? body.selectedCapabilities : [] });
  return NextResponse.json({ app });
}
