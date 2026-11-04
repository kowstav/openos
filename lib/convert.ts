import { parseGitHubUrl } from "./github";
import { saveJob, findJobByIdempotency, type Job } from "./store";
import { drainQueue } from "./job-worker";
import { randomBytes } from "crypto";
// Enqueue only (I2): creation is transactional + idempotent; execution is
// claimed by the durable worker with leases. The inline drain keeps local
// dev single-process, but closing the browser/process does not lose the job.
export async function createJob(url: string, prompt: string, ownerId: string, idempotencyKey?: string, opts?: { selectedCapabilities?: string[]; workflowOrder?: string[]; options?: Record<string, unknown> }): Promise<Job> {
  const p = parseGitHubUrl(url); if (!p) throw new Error("Invalid GitHub URL");
  if (!ownerId) throw new Error("Authenticated owner is required");
  if (idempotencyKey) { const existing = await findJobByIdempotency(ownerId, idempotencyKey); if (existing) return existing; }
  const now = Date.now();
  const job: Job = {
    id: `job-${randomBytes(9).toString("base64url")}`, ownerId, url, repo: `${p.owner}/${p.repo}`, prompt,
    status: "queued", selectedCapabilities: opts?.selectedCapabilities?.slice(0,20), workflowOrder: opts?.workflowOrder?.slice(0,20), options: opts?.options, steps: [], events: [{ at: now, type: "queued", detail: "conversion enqueued" }],
    attempts: 0, maxAttempts: 2, idempotencyKey, cost: { inputChars: prompt.length + url.length, outputChars: 0, executions: 0 },
    createdAt: now, updatedAt: now, expiresAt: now + 30 * 24 * 3600_000,
  };
  await saveJob(job);
  void drainQueue().catch(() => {});
  return job;
}
