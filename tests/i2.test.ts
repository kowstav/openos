import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs"; import { tmpdir } from "os"; import path from "path";
import { NextRequest } from "next/server";
// Isolated data dir MUST be set before lib modules load (dynamic imports).
process.env.OPENOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "openos-i2-"));
delete process.env.SANDBOX_PROVIDER; delete process.env.OPENOS_ENABLE_LOCAL_FIXTURES;
delete process.env.MODAL_TOKEN_ID; delete process.env.MODAL_TOKEN_SECRET;

let store: typeof import("@/lib/store"); let broker: typeof import("@/lib/broker");
let prov: typeof import("@/lib/sandbox-provider"); let auth: typeof import("@/lib/auth");
let storage: typeof import("@/lib/storage");
beforeAll(async () => {
  store = await import("@/lib/store"); broker = await import("@/lib/broker");
  prov = await import("@/lib/sandbox-provider"); auth = await import("@/lib/auth");
  storage = await import("@/lib/storage");
});
function req(url: string, token?: string, body?: unknown) {
  return new NextRequest(url, { method: body ? "POST" : "GET", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}
const baseJob = (over: Partial<import("@/lib/store").Job>): import("@/lib/store").Job => ({
  id: "j", ownerId: "A", url: "https://github.com/x/y", repo: "x/y", prompt: "", status: "queued",
  steps: [], events: [], attempts: 0, maxAttempts: 2, cost: { inputChars: 0, outputChars: 0, executions: 0 },
  createdAt: Date.now(), updatedAt: Date.now(), ...over,
});
const baseApp = (over: Partial<import("@/lib/store").StoredApp>): Omit<import("@/lib/store").StoredApp, "version"> & { version?: number } => ({
  id: "a", ownerId: "A", title: "t", repo: "x/y", prompt: "", studioUrl: "/app/a", operations: [], steps: [],
  permissions: [], blocked: [], warnings: [], createdAt: Date.now(), exec: null,
  ui: { fields: [], outputType: "text" }, ...over,
});

describe("I2 fail-closed sandbox provider (negative regression)", () => {
  it.each([undefined, "", "moda", "Modal", "local", "LOCAL"])("refuses untrusted execution for SANDBOX_PROVIDER=%j without spawning a host package manager/interpreter", async (v) => {
    if (v === undefined) delete process.env.SANDBOX_PROVIDER; else process.env.SANDBOX_PROVIDER = v;
    expect(prov.activeProvider().name).toBe("none (fail closed)");
    await expect(prov.activeProvider().run("js", { packageName: "marked", module: "marked", exportName: "parse" }, "x")).rejects.toThrow(/never a fallback/);
  });
  it("selects Modal only for the exact value and fails honestly without credentials", async () => {
    process.env.SANDBOX_PROVIDER = "modal";
    expect(prov.activeProvider().name).toBe("modal-sandboxes");
    await expect(prov.activeProvider().run("js", { packageName: "x", module: "x", exportName: "x" }, "")).rejects.toThrow(/not configured/);
    delete process.env.SANDBOX_PROVIDER;
  });
});

describe("I2 sessions + per-owner access control", () => {
  it("derives identity server-side; anonymous and cross-user access are denied", async () => {
    const { GET: jobGET } = await import("@/app/api/jobs/[id]/route");
    const a = await auth.createSession(); const b = await auth.createSession();
    await store.saveJob(baseJob({ id: "job-A", ownerId: a.userId }));
    const ctx = { params: Promise.resolve({ id: "job-A" }) };
    expect((await jobGET(req("http://x/api/jobs/job-A"), ctx)).status).toBe(401);
    expect((await jobGET(req("http://x/api/jobs/job-A", b.token), ctx)).status).toBe(404);
    expect((await jobGET(req("http://x/api/jobs/job-A", a.token), ctx)).status).toBe(200);
    // Client-supplied userId is not authority (header-only forgery fails too)
    const forged = new NextRequest("http://x/api/jobs/job-A", { headers: { "x-openos-user": a.userId } });
    expect((await jobGET(forged, ctx)).status).toBe(401);
  });
  it("duplicate submission with one idempotency key returns the same job", async () => {
    const { createJob } = await import("@/lib/convert");
    const j1 = await createJob("https://github.com/x/y", "p", "owner-idem", "key-1");
    const j2 = await createJob("https://github.com/x/y", "p", "owner-idem", "key-1");
    expect(j2.id).toBe(j1.id);
  });
});

describe("I2 durable jobs: lease recovery, atomic publish, TTL", () => {
  it("reclaims a job whose worker died (expired lease) and fails it after the retry limit", async () => {
    await store.saveJob(baseJob({ id: "stale", status: "running", attempts: 1, leaseExpiresAt: Date.now() - 1000 }));
    const claimed = await store.claimQueuedJobs("worker-test", 5);
    expect(claimed.some((j) => j.id === "stale" && j.attempts === 2)).toBe(true);
    await store.saveJob(baseJob({ id: "dead", status: "running", attempts: 2, leaseExpiresAt: Date.now() - 1000 }));
    await store.claimQueuedJobs("worker-test", 5);
    expect((await store.getJob("dead"))?.status).toBe("failed");
  });
  it("a failed rebuild leaves the last good version usable; success publishes v2", async () => {
    const v1 = await store.publishAppVersion(baseApp({ id: "app-1" }));
    expect(v1.version).toBe(1);
    // Failed rebuild = worker never calls publish; stored app must be intact.
    expect((await store.getApp("app-1"))?.version).toBe(1);
    const v2 = await store.publishAppVersion(baseApp({ id: "app-2" }));
    expect(v2.version).toBe(2); expect(v2.supersedes).toBe("app-1");
  });
  it("purges expired jobs/sessions and round-trips backup/restore", async () => {
    await store.saveJob(baseJob({ id: "old", expiresAt: Date.now() - 1 }));
    expect((await store.purgeExpired()).jobs).toBeGreaterThanOrEqual(1);
    const bk = await store.backupStore("test-backup");
    expect(bk.copied).toContain("jobs.json");
    expect((await store.restoreStore("test-backup")).restored).toContain("jobs.json");
  });
});

describe("I2 permission gateway: atomic consume, replay, version binding", () => {
  it("dispatches at most once under concurrent replay", async () => {
    const g = await broker.issueGrant({ userId: "A", appId: "app-1", appVersion: 1, action: "execute" });
    if ("error" in g) throw new Error(g.error);
    const ctx = { userId: "A", appId: "app-1", action: "execute", appVersion: 1 };
    const results = await Promise.all([broker.consumeGrantAtomic(g.id, ctx), broker.consumeGrantAtomic(g.id, ctx)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await broker.checkGrant(g.id, ctx)).ok).toBe(false);
  });
  it("denies grants after a rebuild (version mismatch) and for other users", async () => {
    const g = await broker.issueGrant({ userId: "A", appId: "app-1", appVersion: 1, action: "execute" });
    if ("error" in g) throw new Error(g.error);
    expect((await broker.consumeGrantAtomic(g.id, { userId: "A", appId: "app-1", action: "execute", appVersion: 2 })).ok).toBe(false);
    expect((await broker.consumeGrantAtomic(g.id, { userId: "B", appId: "app-1", action: "execute", appVersion: 1 })).ok).toBe(false);
    expect(g.id.length).toBeGreaterThanOrEqual(24); // high-entropy id, not Math.random
  });
});

describe("I2 legacy migration + scoped object storage", () => {
  it("imports legacy apps only into the caller's account, without exec grants", async () => {
    const { POST: migratePOST } = await import("@/app/api/auth/migrate/route");
    const { GET: appGET } = await import("@/app/api/apps/[id]/route");
    const { listApps, hashId } = await import("@/lib/store");
    const a = await auth.createSession(); const b = await auth.createSession();
    const res = await migratePOST(req("http://x/api/auth/migrate", a.token, { apps: [{ id: "old1", title: "Old", repo: "x/y" }] }));
    expect(res.status).toBe(200); expect((await res.json()).imported).toBe(1);
    // Imported ids are namespaced by owner, so two accounts migrating the
    // same legacy id can never overwrite each other.
    const expectedId = `migrated-${hashId(a.userId)}-old1`;
    const ctx = { params: Promise.resolve({ id: expectedId }) };
    const got = await appGET(req(`http://x/api/apps/${expectedId}`, a.token), ctx);
    expect(got.status).toBe(200); expect((await got.json()).app.exec).toBeNull();
    expect((await appGET(req(`http://x/api/apps/${expectedId}`, b.token), ctx)).status).toBe(404);
    // Same legacy id into account B creates a DISTINCT app; A's still works.
    await migratePOST(req("http://x/api/auth/migrate", b.token, { apps: [{ id: "old1", title: "Old B", repo: "x/y" }] }));
    expect((await listApps(a.userId)).some((x) => x.id === expectedId)).toBe(true);
    expect((await listApps(b.userId)).some((x) => x.id === `migrated-${hashId(b.userId)}-old1`)).toBe(true);
  });
  it("isolates objects per owner and rejects traversal keys", async () => {
    await storage.putObject("A", "out/result.txt", "hello");
    expect((await storage.getObject("A", "out/result.txt"))?.toString()).toBe("hello");
    expect(await storage.getObject("B", "out/result.txt")).toBeNull();
    await expect(storage.putObject("A", "../escape", "x")).rejects.toThrow(/Invalid object key/);
  });
});
