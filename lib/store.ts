import { promises as fs } from "fs"; import path from "path";
// Durable single-instance store (JSON files). Swap for a DB in multi-instance deploys.
const DIR = path.join(process.cwd(), ".openos-data");
async function read<T>(file: string, fallback: T): Promise<T> { try { return JSON.parse(await fs.readFile(path.join(DIR, file), "utf8")); } catch { return fallback; } }
async function write(file: string, data: unknown) { await fs.mkdir(DIR, { recursive: true }); await fs.writeFile(path.join(DIR, file), JSON.stringify(data, null, 2)); }
export type JobStep = { name: string; skill?: string; status: "pending" | "running" | "done" | "failed" | "skipped"; detail: string; at: number };
export type Job = { id: string; url: string; repo: string; prompt: string; status: "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled"; steps: JobStep[]; appId?: string; error?: string; createdAt: number; updatedAt: number };
export type StoredApp = { id: string; title: string; repo: string; prompt: string; studioUrl: string; operations: string[]; steps: { op: string; label: string }[]; permissions: string[]; blocked: string[]; warnings: string[]; createdAt: number; sourceJobId?: string; exec?: { kind: string; packageName: string; module: string; exportName: string; opLabel: string } | null; ui: { fields: { id: string; label: string; type: string; placeholder?: string }[]; outputType: string } };
export async function saveJob(job: Job) { const all = await read<Job[]>("jobs.json", []); const i = all.findIndex((j) => j.id === job.id); if (i >= 0) all[i] = job; else all.unshift(job); await write("jobs.json", all.slice(0, 100)); }
export async function getJob(id: string) { return (await read<Job[]>("jobs.json", [])).find((j) => j.id === id) || null; }
export async function listJobs() { return read<Job[]>("jobs.json", []); }
export async function saveApp(app: StoredApp) { const all = await read<StoredApp[]>("apps.json", []); const i = all.findIndex((a) => a.id === app.id); if (i >= 0) all[i] = app; else all.unshift(app); await write("apps.json", all); }
export async function getApp(id: string) { return (await read<StoredApp[]>("apps.json", [])).find((a) => a.id === id) || null; }
export async function listApps() { return read<StoredApp[]>("apps.json", []); }
export async function deleteApp(id: string) { await write("apps.json", (await read<StoredApp[]>("apps.json", [])).filter((a) => a.id !== id)); }
export async function saveArtifacts(appId: string, bundle: unknown) { const all = await read<Record<string, unknown>>("artifacts.json", {}); all[appId] = bundle; await write("artifacts.json", all); }
export async function getArtifacts(appId: string) { const all = await read<Record<string, unknown>>("artifacts.json", {}); return all[appId] || null; }
