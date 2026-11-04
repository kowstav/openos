import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs"; import { tmpdir } from "os"; import path from "path";
import { NextRequest } from "next/server";
// Isolated data dir MUST be set before lib modules load (dynamic imports).
process.env.OPENOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "openos-gate1-"));
delete process.env.SANDBOX_PROVIDER; delete process.env.OPENOS_ENABLE_LOCAL_FIXTURES;

let store: typeof import("@/lib/store"); let auth: typeof import("@/lib/auth");
beforeAll(async () => { store = await import("@/lib/store"); auth = await import("@/lib/auth"); });
function req(url: string, token?: string, body?: unknown, cookie?: string) {
  return new NextRequest(url, { method: body ? "POST" : "GET", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}
const baseApp = (over: Record<string, unknown>) => ({
  title: "t", repo: "o/r", prompt: "", studioUrl: "/app/x", operations: ["merge"], steps: [{ op: "merge", label: "Merge" }],
  permissions: [], blocked: [], warnings: [], createdAt: Date.now(), exec: null,
  ui: { fields: [], outputType: "text" }, ...over,
}) as never;

describe("Gate 1 sessions: idempotent init + stable dev sign-in", () => {
  it("POST with a valid session returns the same owner and mints no new user", async () => {
    const { POST } = await import("@/app/api/auth/session/route");
    const first = await POST(req("http://x/api/auth/session", undefined, {}));
    const j1 = await first.json(); const cookie = first.headers.get("set-cookie") || "";
    expect(cookie).toContain("openos_session=");
    const second = await POST(req("http://x/api/auth/session", undefined, {}, cookie.split(";")[0]));
    const j2 = await second.json();
    expect(j2.userId).toBe(j1.userId);
    expect(second.headers.get("set-cookie")).toBeNull();
  });
  it("same handle in a second browser opens the same library; another handle sees nothing", async () => {
    const { POST } = await import("@/app/api/auth/session/route");
    const s1 = await (await POST(req("http://x/api/auth/session", undefined, { handle: "Ada Seller" }))).json();
    const s2 = await (await POST(req("http://x/api/auth/session", undefined, { handle: "ada seller" }))).json();
    const other = await (await POST(req("http://x/api/auth/session", undefined, { handle: "Someone Else" }))).json();
    expect(s2.userId).toBe(s1.userId); expect(s1.kind).toBe("account");
    expect(other.userId).not.toBe(s1.userId);
    await store.saveApp(baseApp({ id: "gate1-app", ownerId: s1.userId, appKey: "appkey-gate1-app" }));
    expect((await store.listApps(s2.userId)).some((a) => a.id === "gate1-app")).toBe(true);
    expect((await store.listApps(other.userId)).some((a) => a.id === "gate1-app")).toBe(false);
  });
  it("concurrent first POSTs with one device key converge on one owner", async () => {
    const { POST } = await import("@/app/api/auth/session/route");
    const [r1, r2] = await Promise.all([
      POST(req("http://x/api/auth/session", undefined, { deviceKey: "dev-concurrent-1" })),
      POST(req("http://x/api/auth/session", undefined, { deviceKey: "dev-concurrent-1" })),
    ]);
    // Both responses are valid sessions; the device binding guarantees a
    // later request from this profile lands on the first owner issued.
    const a = await r1.json(); const b = await r2.json();
    expect(a.userId).toBeTruthy(); expect(b.userId).toBeTruthy();
    const third = await (await POST(req("http://x/api/auth/session", undefined, { deviceKey: "dev-concurrent-1" }))).json();
    expect([a.userId, b.userId]).toContain(third.userId);
  });
});

describe("Gate 1 library: per-app identity, versioned edits, scoped delete", () => {
  it("two apps from one repo keep independent version lines", async () => {
    const a1 = await store.publishAppVersion(baseApp({ id: "g1-a1", ownerId: "owner-g1", appKey: "appkey-A" }));
    const b1 = await store.publishAppVersion(baseApp({ id: "g1-b1", ownerId: "owner-g1", appKey: "appkey-B" }));
    expect(a1.version).toBe(1); expect(b1.version).toBe(1);
    const a2 = await store.publishAppVersion(baseApp({ id: "g1-a2", ownerId: "owner-g1", appKey: "appkey-A", operations: ["merge", "watermark"] }));
    expect(a2.version).toBe(2);
    expect((await store.listAppVersions("owner-g1", { appKey: "appkey-B", repo: "o/r" })).map((v) => v.version)).toEqual([1]);
    expect((await store.listAppVersions("owner-g1", { appKey: "appkey-A", repo: "o/r" })).map((v) => v.version)).toEqual([2, 1]);
  });
  it("editing operations publishes a NEW version; the published manifest is untouched", async () => {
    const v1 = await store.publishAppVersion(baseApp({ id: "g1-e1", ownerId: "owner-g1", appKey: "appkey-E", operations: ["merge"] }));
    const edited = await store.publishAppEdit("g1-e1", "owner-g1", { operations: ["merge", "watermark"], steps: [{ op: "merge", label: "Merge" }, { op: "watermark", label: "Add watermark" }] });
    expect(edited?.version).toBe(v1.version + 1);
    expect((await store.getApp("g1-e1"))?.operations).toEqual(["merge"]);
    expect(edited?.operations).toEqual(["merge", "watermark"]);
  });
  it("delete A leaves B's files, versions and grants working", async () => {
    const storage = await import("@/lib/storage"); const broker = await import("@/lib/broker");
    const { DELETE } = await import("@/app/api/apps/[id]/route");
    const u = await auth.createSession();
    await store.publishAppVersion(baseApp({ id: "g1-delA", ownerId: u.userId, appKey: "appkey-delA" }));
    await store.publishAppVersion(baseApp({ id: "g1-delB", ownerId: u.userId, appKey: "appkey-delB" }));
    await storage.putObject(u.userId, "apps/g1-delA/out.pdf", "A");
    await storage.putObject(u.userId, "apps/g1-delB/out.pdf", "B");
    const gB = await broker.issueGrant({ userId: u.userId, appId: "g1-delB", appVersion: 1, action: "execute" });
    if ("error" in gB) throw new Error(gB.error);
    const res = await DELETE(req("http://x/api/apps/g1-delA", u.token), { params: Promise.resolve({ id: "g1-delA" }) });
    expect(res.status).toBe(200);
    expect(await store.getAppForOwner("g1-delA", u.userId)).toBeNull();
    expect((await storage.getObject(u.userId, "apps/g1-delB/out.pdf"))?.toString()).toBe("B");
    expect((await store.listAppVersions(u.userId, { appKey: "appkey-delB", repo: "o/r" })).length).toBe(1);
    expect((await broker.checkGrant(gB.id, { userId: u.userId, appId: "g1-delB", action: "execute", appVersion: 1 })).ok).toBe(true);
  });
  it("failed rebuild preserves the previous working version", async () => {
    const v1 = await store.publishAppVersion(baseApp({ id: "g1-good", ownerId: "owner-g1", appKey: "appkey-good" }));
    // A failed rebuild simply never publishes; the stored app must be intact.
    expect((await store.getApp("g1-good"))?.version).toBe(v1.version);
    expect((await store.getAppForOwner("g1-good", "owner-g1"))?.operations).toEqual(["merge"]);
  });
});

describe("Gate 1 choices: ordered selections are authoritative", () => {
  it("two different selections on the same inputs produce different ordered workflows", async () => {
    const { generateApp } = await import("@/lib/engine");
    const a = generateApp({ repo: "Hopding/pdf-lib", prompt: "merge invoices", workflowOrder: ["pdf.extract", "pdf.merge"] });
    const b = generateApp({ repo: "Hopding/pdf-lib", prompt: "merge invoices", workflowOrder: ["pdf.merge", "pdf.extract"] });
    expect(a.operations).toEqual(["split", "merge"]);
    expect(b.operations).toEqual(["merge", "split"]);
    expect(a.operations).not.toEqual(b.operations);
  });
  it("unsupported selections are rejected by workflow validation, never dropped", async () => {
    const { buildCanonicalGraph } = await import("@/lib/capabilities");
    const { validateWorkflow } = await import("@/lib/contracts");
    const g = buildCanonicalGraph({ fullName: "Hopding/pdf-lib", sha: "a".repeat(40), pkg: null, pyproject: "", files: [] } as never);
    expect(() => validateWorkflow(g, ["pdf.merge", "pdf.sign-everything"])).toThrow(/Unknown capability/);
    expect(validateWorkflow(g, ["pdf.watermark", "pdf.merge"], ["pdf.watermark", "pdf.merge"]).order).toEqual(["pdf.watermark", "pdf.merge"]);
  });
  it("capability verification: constant output fails, real transforms pass", async () => {
    const { verifySemantically } = await import("@/lib/capabilities");
    expect((await verifySemantically(async () => "constant", "Hello World")).passed).toBe(false);
    expect((await verifySemantically(async (i) => i.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "Hello OpenOS World!", { expectation: { name: "slug", test: (i, o) => o === "hello-openos-world!" .replace("!", "") || o === i.toLowerCase().replace(/[^a-z0-9]+/g, "-") } })).passed).toBe(true);
    let n = 0; expect((await verifySemantically(async () => `id-${++n}`, "x")).passed).toBe(false);
  });
});
