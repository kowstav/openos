import { NextRequest, NextResponse } from "next/server";
import { SANDBOX_POLICY, checkSandbox } from "@/lib/sandbox";
import { policyTable } from "@/lib/permissions";
export async function GET() { return NextResponse.json({ policy: SANDBOX_POLICY, permissions: policyTable() }); }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (!b.capability) return NextResponse.json({ error: "capability is required" }, { status: 400 });
  return NextResponse.json(checkSandbox(String(b.capability), b.host ? String(b.host) : undefined));
}
