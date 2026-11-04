import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/job-worker";
// Worker entry point: a SEPARATE process (scripts/worker.mjs, the compose
// `worker` service) claims durable jobs through here with a shared worker
// token. Browser sessions can never drain the queue. Without a configured
// token the endpoint refuses — it is deployment configuration, not a user
// secret, and it never appears in client code.
export async function POST(req: NextRequest) {
  const expected = process.env.OPENOS_WORKER_TOKEN || "";
  if (!expected) return NextResponse.json({ error: "Worker token not configured (OPENOS_WORKER_TOKEN)" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Worker authentication required" }, { status: 401 });
  const drained = await drainQueue(3);
  return NextResponse.json({ drained });
}
