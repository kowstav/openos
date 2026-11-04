import { promises as fs } from "fs"; import path from "path"; import { createHash, randomUUID } from "crypto";
// Durable single-instance store (I2): JSON collections with serialized
// read/modify/write transactions, atomic tmp+rename publishes, per-owner
// scoping, job leases/heartbeats, audit log and TTL. The collection API is
// the relational boundary: swap the file adapter for Postgres/SQLite behind
// these same functions in multi-instance deploys (see docs/i2-platform.md).
const DIR = process.env.OPENOS_DATA_DIR || path.join(process.cwd(), ".openos-data");
export const DATA_DIR = DIR;
const chains = new Map<string, Promise<unknown>>();
function tx<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(file) || Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(file, next.then(() => undefined, () => undefined));
  return next;
}
async function read<T>(file: string, fallback: T): Promise<T> { try { return JSON.parse(await fs.readFile(path.join(DIR, file), "utf8")); } catch { return fallback; } }
async function write(file: string, data: unknown) {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = path.join(DIR, `.${file}.${process.pid}.${randomUUID()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, path.join(DIR, file));
}
export function hashId(id: string) { return createHash("sha256").update(id).digest("hex").slice(0, 12); }

export type JobStep = { name: string; skill?: string; status: "pending" | "running" | "done" | "failed" | "skipped"; detail: string; at: number };
export type JobEvent = { at: number; type: string; detail: string };
export type Job = {
  id: string; ownerId: string; url: string; repo: string; prompt: string;
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";
  steps: JobStep[]; events: JobEvent[]; appId?: string; error?: string;
  attempts: number; maxAttempts: number; leaseOwner?: string; leaseExpiresAt?: number; heartbeatAt?: number;
  selectedCapabilities?: string[]; workflowOrder?: string[]; options?: Record<string, unknown>; commitSha?: string; outcome?: string | null;
  appKey?: string; graphRevision?: string;
  idempotencyKey?: string; cost: { inputChars: number; outputChars: number; executions: number };
  createdAt: number; updatedAt: number; expiresAt?: number;
};
export type ExecutionRecord = { at: number; operation: string; outcome: "succeeded" | "denied" | "failed"; detail: string };
export type StoredApp = {
  id: string; ownerId: string; appKey?: string; title: string; repo: string; prompt: string; studioUrl: string;
  operations: string[]; steps: { op: string; label: string }[]; permissions: string[]; blocked: string[]; warnings: string[];
  createdAt: number; updatedAt?: number; version: number; sourceJobId?: string; supersedes?: string;
  capabilityIds?: string[]; workflow?: unknown; commitSha?: string; outcome?: string | null;
  state?: "ready" | "suspended"; lastUsedAt?: number; executionHistory?: ExecutionRecord[];
  exec?: { kind: string; packageName: string; module: string; exportName: string; opLabel: string; capabilityId?: string } | null;
  execChain?: { kind: string; packageName: string; module: string; exportName: string; opLabel: string; capabilityId?: string }[];
  ui: { fields: { id: string; label: string; type: string; placeholder?: string }[]; outputType: string };
};
export type SavedPlan = { id: string; ownerId: string; title: string; repoUrl: string; prompt: string; capabilityIds: string[]; createdAt: number; updatedAt: number };
export async function saveJob(job: Job) { return tx("jobs.json", async () => { const all = await read<Job[]>("jobs.json", []); const i = all.findIndex((j) => j.id === job.id); if (i >= 0) all[i] = job; else all.unshift(job); await write("jobs.json", all.slice(0, 500)); }); }
export async function getJob(id: string) { return (await read<Job[]>("jobs.json", [])).find((j) => j.id === id) || null; }
export async function getJobForOwner(id: string, ownerId: string) { const j = await getJob(id); return j && j.ownerId === ownerId ? j : null; }
export async function listJobs(ownerId?: string) { const all = await read<Job[]>("jobs.json", []); return ownerId ? all.filter((j) => j.ownerId === ownerId) : all; }
export async function findJobByIdempotency(ownerId: string, key: string) { return (await read<Job[]>("jobs.json", [])).find((j) => j.ownerId === ownerId && j.idempotencyKey === key) || null; }
export async function updateJob(id: string, patch: Partial<Job>) { return tx("jobs.json", async () => { const all = await read<Job[]>("jobs.json", []); const j = all.find((x) => x.id === id); if (!j) return null; Object.assign(j, patch, { updatedAt: Date.now() }); await write("jobs.json", all); return j; }); }
export async function claimQueuedJobs(workerId: string, limit: number, leaseMs = 60_000) {
  return tx("jobs.json", async () => {
    const all = await read<Job[]>("jobs.json", []); const now = Date.now(); const claimed: Job[] = [];
    for (const j of all) {
      if (claimed.length >= limit) break;
      const stale = j.status === "running" && (j.leaseExpiresAt || 0) < now;
      if (j.status === "queued" || stale) {
        if (stale && j.attempts >= j.maxAttempts) { j.status = "failed"; j.error = "Worker lost and retry limit reached."; continue; }
        j.status = "running"; j.leaseOwner = workerId; j.leaseExpiresAt = now + leaseMs; j.heartbeatAt = now; j.attempts += 1; j.updatedAt = now;
        j.events = [...(j.events || []), { at: now, type: stale ? "lease-recovered" : "lease-claimed", detail: `worker ${workerId} attempt ${j.attempts}` }];
        claimed.push(j);
      }
    }
    await write("jobs.json", all); return claimed;
  });
}
export async function saveApp(app: StoredApp) { return tx("apps.json", async () => { const all = await read<StoredApp[]>("apps.json", []); const i = all.findIndex((a) => a.id === app.id); if (i >= 0) all[i] = app; else all.unshift(app); await write("apps.json", all); }); }
export async function getApp(id: string) { return (await read<StoredApp[]>("apps.json", [])).find((a) => a.id === id) || null; }
export async function getAppForOwner(id: string, ownerId: string) { const a = await getApp(id); return a && a.ownerId === ownerId ? a : null; }
export async function listApps(ownerId?: string) { const all = await read<StoredApp[]>("apps.json", []); return ownerId ? all.filter((a) => a.ownerId === ownerId) : all; }
export async function deleteAppForOwner(id: string, ownerId: string) { return tx("apps.json", async () => { const all = await read<StoredApp[]>("apps.json", []); const kept = all.filter((a) => !(a.id === id && a.ownerId === ownerId)); await write("apps.json", kept); return kept.length !== all.length; }); }
export async function deleteApp(id: string) { return tx("apps.json", async () => { await write("apps.json", (await read<StoredApp[]>("apps.json", [])).filter((a) => a.id !== id)); }); }
// Atomic publish: a verified rebuild creates a NEW version; a failed/cancelled
// rebuild never touches the stored last-good app (callers simply do not call this).
// Each personalized app has its own identity (`appKey`), separate from repo
// and version: two apps built from one repo keep independent version lines.
// Only a rebuild that passes the same appKey continues that app's line;
// legacy records without an appKey fall back to repo lineage.
export async function publishAppVersion(app: Omit<StoredApp, "version"> & { version?: number }) {
  return tx("apps.json", async () => {
    const all = await read<StoredApp[]>("apps.json", []);
    const lineage = app.appKey
      ? all.filter((a) => a.ownerId === app.ownerId && a.appKey === app.appKey)
      : all.filter((a) => a.ownerId === app.ownerId && a.repo === app.repo);
    const prev = lineage.sort((x, y) => y.version - x.version)[0];
    const versioned: StoredApp = { ...app, appKey: app.appKey || prev?.appKey || `appkey-${app.id}`, version: (prev?.version || 0) + 1, supersedes: prev?.id, updatedAt: Date.now() } as StoredApp;
    all.unshift(versioned); await write("apps.json", all); return versioned;
  });
}
// ---- Personal library (I4): one owner-scoped library for plans + apps ----
export async function updateAppForOwner(id: string, ownerId: string, patch: Partial<Pick<StoredApp, "title" | "prompt" | "operations" | "steps" | "capabilityIds" | "state">>) {
  return tx("apps.json", async () => {
    const all = await read<StoredApp[]>("apps.json", []); const a = all.find((x) => x.id === id && x.ownerId === ownerId);
    if (!a) return null;
    if (patch.title !== undefined) a.title = String(patch.title).slice(0, 120);
    if (patch.prompt !== undefined) a.prompt = String(patch.prompt).slice(0, 2000);
    if (patch.operations) { a.operations = patch.operations.slice(0, 20); a.capabilityIds = patch.operations.slice(0, 20); }
    if (patch.steps) a.steps = patch.steps.slice(0, 20);
    if (patch.state) a.state = patch.state;
    a.updatedAt = Date.now(); await write("apps.json", all); return a;
  });
}
export async function duplicateAppForOwner(id: string, ownerId: string) {
  const src = await getAppForOwner(id, ownerId); if (!src) return null;
  // A duplicate is a NEW personalized app: fresh appKey, its own version
  // line starting at v1, and an empty execution history.
  const newId = `app-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const copy: StoredApp = { ...src, id: newId, appKey: `appkey-${newId}`, title: `${src.title} (copy)`, createdAt: Date.now(), updatedAt: Date.now(), version: 1, supersedes: undefined, executionHistory: [] };
  await saveApp(copy); return copy;
}
export async function listAppVersions(ownerId: string, appOrRepo: string | { appKey?: string; repo: string }) {
  const app = typeof appOrRepo === "string" ? { repo: appOrRepo } : appOrRepo;
  const all = await read<StoredApp[]>("apps.json", []);
  const mine = app.appKey
    ? all.filter((a) => a.ownerId === ownerId && a.appKey === app.appKey)
    : all.filter((a) => a.ownerId === ownerId && a.repo === app.repo);
  return mine.sort((x, y) => y.version - x.version)
    .map((a) => ({ id: a.id, version: a.version, commitSha: a.commitSha || null, outcome: a.outcome || null, createdAt: a.createdAt, operations: a.operations }));
}
// Editing a published app's operations must never rewrite its manifest in
// place: the edit is validated by the caller and published as a NEW version
// of the same appKey, leaving every earlier version intact for rollback.
export async function publishAppEdit(id: string, ownerId: string, patch: { operations: string[]; steps: { op: string; label: string }[]; prompt?: string }) {
  const src = await getAppForOwner(id, ownerId); if (!src) return null;
  return publishAppVersion({ ...src, id: `app-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`, operations: patch.operations, steps: patch.steps, capabilityIds: patch.operations, prompt: patch.prompt ?? src.prompt, createdAt: Date.now(), executionHistory: src.executionHistory || [] });
}
export async function diffVersions(a: StoredApp, b: StoredApp) {
  return { addedOps: b.operations.filter((o) => !a.operations.includes(o)), removedOps: a.operations.filter((o) => !b.operations.includes(o)), fromCommit: a.commitSha || null, toCommit: b.commitSha || null, fromVersion: a.version, toVersion: b.version };
}
// Rollback never rewrites history: it publishes the target version's
// configuration as a NEW version, so the audit trail stays intact.
export async function rollbackToVersion(ownerId: string, targetId: string) {
  const target = await getAppForOwner(targetId, ownerId); if (!target) return null;
  return publishAppVersion({ ...target, id: `app-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`, sourceJobId: target.sourceJobId, createdAt: Date.now() });
}
export async function recordExecution(id: string, ownerId: string, rec: ExecutionRecord) {
  return tx("apps.json", async () => {
    const all = await read<StoredApp[]>("apps.json", []); const a = all.find((x) => x.id === id && x.ownerId === ownerId);
    if (!a) return null; a.executionHistory = [rec, ...(a.executionHistory || [])].slice(0, 100); a.lastUsedAt = rec.at; await write("apps.json", all); return a;
  });
}
export async function savePlan(plan: SavedPlan) { return tx("plans.json", async () => { const all = await read<SavedPlan[]>("plans.json", []); const i = all.findIndex((p) => p.id === plan.id); if (i >= 0) all[i] = plan; else all.unshift(plan); await write("plans.json", all.slice(0, 200)); }); }
export async function listPlans(ownerId: string) { return (await read<SavedPlan[]>("plans.json", [])).filter((p) => p.ownerId === ownerId); }
export async function deletePlanForOwner(id: string, ownerId: string) { return tx("plans.json", async () => { const all = await read<SavedPlan[]>("plans.json", []); const kept = all.filter((p) => !(p.id === id && p.ownerId === ownerId)); await write("plans.json", kept); return kept.length !== all.length; }); }
export async function saveArtifacts(appId: string, bundle: unknown) { return tx("artifacts.json", async () => { const all = await read<Record<string, unknown>>("artifacts.json", {}); all[appId] = bundle; await write("artifacts.json", all); }); }
export async function getArtifacts(appId: string) { const all = await read<Record<string, unknown>>("artifacts.json", {}); return all[appId] || null; }
export async function getArtifactsForOwner(appId: string, ownerId: string) { const a = await getAppForOwner(appId, ownerId); return a ? getArtifacts(appId) : null; }
export async function deleteArtifacts(appId: string) { return tx("artifacts.json", async () => { const all = await read<Record<string, unknown>>("artifacts.json", {}); delete all[appId]; await write("artifacts.json", all); }); }

// Transcription jobs (faster-whisper path): the audio bytes live in scoped
// object storage; this record carries status + editable segments only.
export type Transcription = { id: string; ownerId: string; fileName: string; objectKey: string; status: "queued" | "running" | "succeeded" | "needs-runtime" | "failed" | "cancelled"; segments: { start: number; end: number; text: string }[]; language?: string; error?: string; createdAt: number; updatedAt: number };
export async function saveTranscription(t: Transcription) { return tx("transcriptions.json", async () => { const all = await read<Transcription[]>("transcriptions.json", []); const i = all.findIndex((x) => x.id === t.id); if (i >= 0) all[i] = t; else all.unshift(t); await write("transcriptions.json", all.slice(0, 200)); }); }
export async function getTranscriptionForOwner(id: string, ownerId: string) { const t = (await read<Transcription[]>("transcriptions.json", [])).find((x) => x.id === id); return t && t.ownerId === ownerId ? t : null; }
export async function listTranscriptions(ownerId: string) { return (await read<Transcription[]>("transcriptions.json", [])).filter((t) => t.ownerId === ownerId); }
export async function claimTranscriptions(workerId: string, limit: number) {
  return tx("transcriptions.json", async () => {
    const all = await read<Transcription[]>("transcriptions.json", []); const claimed: Transcription[] = [];
    for (const t of all) { if (claimed.length >= limit) break; if (t.status === "queued") { t.status = "running"; t.updatedAt = Date.now(); claimed.push(t); } }
    await write("transcriptions.json", all); void workerId; return claimed;
  });
}

// Sessions: only SHA-256 hashes of tokens are stored.
export type Session = { tokenHash: string; userId: string; createdAt: number; expiresAt: number };
export async function saveSession(s: Session) { return tx("sessions.json", async () => { const all = await read<Session[]>("sessions.json", []); all.unshift(s); await write("sessions.json", all.filter((x) => x.expiresAt > Date.now()).slice(0, 1000)); }); }
export async function findSession(tokenHash: string) { return (await read<Session[]>("sessions.json", [])).find((s) => s.tokenHash === tokenHash && s.expiresAt > Date.now()) || null; }
export async function deleteSession(tokenHash: string) { return tx("sessions.json", async () => { await write("sessions.json", (await read<Session[]>("sessions.json", [])).filter((s) => s.tokenHash !== tokenHash)); }); }
// Device bindings make first sign-in idempotent across concurrent tabs and
// requests from the same browser profile: every tab presents the same
// device key, so racing POSTs converge on one owner instead of minting one
// user per request. Bindings never authenticate by themselves — they only
// choose which owner a NEW session is issued for.
export async function userIdForDevice(deviceKey: string): Promise<string | null> {
  const all = await read<Record<string, string>>("devices.json", {});
  return all[deviceKey] || null;
}
export async function bindDevice(deviceKey: string, userId: string) {
  return tx("devices.json", async () => { const all = await read<Record<string, string>>("devices.json", {}); if (!all[deviceKey]) { all[deviceKey] = userId; await write("devices.json", all); } return all[deviceKey]; });
}

// Redacted audit log: hashed subject ids, never secrets/prompts/file contents.
export type AuditEvent = { at: number; actor: string; action: string; target: string; outcome: string };
export async function audit(action: string, actorId: string, targetId: string, outcome: string) {
  return tx("audit.json", async () => { const all = await read<AuditEvent[]>("audit.json", []); all.unshift({ at: Date.now(), actor: hashId(actorId), action, target: hashId(targetId), outcome }); await write("audit.json", all.slice(0, 2000)); });
}
export async function listAudit(limit = 100) { return (await read<AuditEvent[]>("audit.json", [])).slice(0, limit); }

export async function purgeExpired(now = Date.now()) {
  let jobs = 0, sessions = 0;
  await tx("jobs.json", async () => { const all = await read<Job[]>("jobs.json", []); const kept = all.filter((j) => !j.expiresAt || j.expiresAt > now); jobs = all.length - kept.length; await write("jobs.json", kept); });
  await tx("sessions.json", async () => { const all = await read<Session[]>("sessions.json", []); const kept = all.filter((s) => s.expiresAt > now); sessions = all.length - kept.length; await write("sessions.json", kept); });
  return { jobs, sessions };
}
export async function storeHealth() {
  await fs.mkdir(DIR, { recursive: true });
  const probe = path.join(DIR, `.health-${process.pid}`);
  await fs.writeFile(probe, "ok"); await fs.unlink(probe);
  const [jobs, apps] = await Promise.all([read<Job[]>("jobs.json", []), read<StoredApp[]>("apps.json", [])]);
  return { ok: true, dataDir: DIR, jobs: jobs.length, apps: apps.length, queued: jobs.filter((j) => j.status === "queued").length, running: jobs.filter((j) => j.status === "running").length };
}
export async function storeMetrics() {
  const jobs = await read<Job[]>("jobs.json", []);
  const byStatus: Record<string, number> = {}; for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  return { jobsByStatus: byStatus, totalCost: jobs.reduce((a, j) => ({ executions: a.executions + (j.cost?.executions || 0), outputChars: a.outputChars + (j.cost?.outputChars || 0) }), { executions: 0, outputChars: 0 }) };
}
const MIGRATION_FILE = "migrations.json";
export async function runMigrations() {
  return tx(MIGRATION_FILE, async () => {
    const done = await read<string[]>(MIGRATION_FILE, []);
    const applied: string[] = [];
    if (!done.includes("001-owner-fields")) {
      // Legacy records without an owner are parked under a non-login owner.
      // They are NEVER imported into an arbitrary account; /api/auth/migrate
      // is the explicit, validated claim path (and it strips legacy grants).
      await tx("jobs.json", async () => { const all = await read<Record<string, unknown>[]>("jobs.json", []); for (const j of all) { if (!j.ownerId) { j.ownerId = "legacy-unmigrated"; j.attempts = (j.attempts as number) || 0; j.maxAttempts = 2; j.events = j.events || []; j.cost = j.cost || { inputChars: 0, outputChars: 0, executions: 0 }; } } await write("jobs.json", all); });
      await tx("apps.json", async () => { const all = await read<Record<string, unknown>[]>("apps.json", []); for (const a of all) { if (!a.ownerId) a.ownerId = "legacy-unmigrated"; if (!a.version) a.version = 1; } await write("apps.json", all); });
      applied.push("001-owner-fields");
    }
    await write(MIGRATION_FILE, [...done, ...applied]); return applied;
  });
}
export async function backupStore(label = new Date().toISOString().replace(/[:.]/g, "-")) {
  const dest = path.join(DIR, "backups", label); await fs.mkdir(dest, { recursive: true });
  const files = ["jobs.json", "apps.json", "artifacts.json", "sessions.json", "grants.json", "audit.json", MIGRATION_FILE];
  const copied: string[] = [];
  for (const f of files) { try { await fs.copyFile(path.join(DIR, f), path.join(dest, f)); copied.push(f); } catch { /* absent collection */ } }
  return { dest, copied };
}
export async function restoreStore(backupLabel: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(backupLabel)) throw new Error("Invalid backup label");
  const src = path.join(DIR, "backups", backupLabel);
  const files = ["jobs.json", "apps.json", "artifacts.json", "audit.json", MIGRATION_FILE]; // sessions/grants deliberately not restored
  const restored: string[] = [];
  for (const f of files) {
    try { const parsed: unknown = JSON.parse(await fs.readFile(path.join(src, f), "utf8")); if (typeof parsed !== "object" || parsed === null) throw new Error("bad backup"); await write(f, parsed); restored.push(f); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  return { restored };
}
