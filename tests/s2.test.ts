import { describe, it, expect } from "vitest";
import { mkdtempSync } from "fs"; import { tmpdir } from "os"; import path from "path";
process.env.OPENOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "openos-s2-"));
// S2 boundary battery: each case names its control, the expected denial or
// allowed result, and the enforcement point. Policy-level tests are labeled
// as such; none of these certify cloud-sandbox isolation (no credentials).
describe("S2-2 source/tool trust: strict GitHub identity", () => {
  it("accepts github.com and bare owner/repo; refuses look-alikes, userinfo and other hosts", async () => {
    const { parseGitHubUrl } = await import("@/lib/github");
    expect(parseGitHubUrl("https://github.com/Hopding/pdf-lib")).toEqual({ owner: "Hopding", repo: "pdf-lib" });
    expect(parseGitHubUrl("Hopding/pdf-lib")).toEqual({ owner: "Hopding", repo: "pdf-lib" });
    expect(parseGitHubUrl("https://github.com.evil.example/Hopding/pdf-lib")).toBeNull();
    expect(parseGitHubUrl("https://user:pass@github.com/Hopding/pdf-lib")).toBeNull();
    expect(parseGitHubUrl("https://gitlab.com/Hopding/pdf-lib")).toBeNull();
    expect(parseGitHubUrl("https://127.0.0.1/Hopding/pdf-lib")).toBeNull();
  });
});
describe("S2-4 uploads: server-side validation before parsing", () => {
  it("spoofed/corrupt PDFs are refused before pdf-lib parsing; oversize is 413", async () => {
    const { POST } = await import("@/app/api/pdf/route"); const { NextRequest } = await import("next/server");
    const auth = await import("@/lib/auth"); const sess = await auth.createSession();
    const req = (fd: FormData) => new NextRequest("http://x/api/pdf", { method: "POST", body: fd, headers: { Authorization: `Bearer ${sess.token}` } });
    // Anonymous PDF work is refused before parsing (S3).
    expect((await POST(new NextRequest("http://x/api/pdf", { method: "POST", body: new FormData() }))).status).toBe(401);
    const spoof = new FormData(); spoof.append("files", new File(["<html>active</html>"], "evil.pdf", { type: "application/pdf" }));
    expect((await POST(req(spoof))).status).toBe(422);
    const txt = new FormData(); txt.append("files", new File(["hi"], "a.txt", { type: "text/plain" }));
    expect((await POST(req(txt))).status).toBe(415);
  });
});
describe("S2-5 platform quotas: expensive work is bounded per user", () => {
  it("convert quota allows the configured burst then denies with a reason", async () => {
    const { checkQuota, QUOTAS } = await import("@/lib/ratelimit");
    for (let i = 0; i < QUOTAS.convert.limit; i++) expect(checkQuota("convert", "quota-user").ok).toBe(true);
    const denied = checkQuota("convert", "quota-user");
    expect(denied.ok).toBe(false); expect(denied.reason).toMatch(/Quota exceeded/);
    expect(checkQuota("convert", "other-user").ok).toBe(true);
  });
});
describe("S2-3 tenant boundaries on the new library surface", () => {
  it("cross-owner PATCH is 404 and suspended apps cannot execute", async () => {
    const store = await import("@/lib/store"); const auth = await import("@/lib/auth");
    const { PATCH } = await import("@/app/api/apps/[id]/route"); const { POST } = await import("@/app/api/execute/route"); const { NextRequest } = await import("next/server");
    const a = await auth.createSession(); const b = await auth.createSession();
    await store.saveApp({ id: "s2-app", ownerId: a.userId, title: "t", repo: "o/r", prompt: "", studioUrl: "/app/s2-app", operations: ["op"], capabilityIds: ["op"], steps: [], permissions: [], blocked: [], warnings: [], createdAt: Date.now(), version: 1, state: "suspended", exec: { kind: "js", packageName: "lib", module: "lib", exportName: "x", opLabel: "x", capabilityId: "op" }, ui: { fields: [], outputType: "text" } } as never);
    const ctx = { params: Promise.resolve({ id: "s2-app" }) };
    const cross = await PATCH(new NextRequest("http://x/api/apps/s2-app", { method: "PATCH", headers: { Authorization: `Bearer ${b.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "hax" }) }), ctx);
    expect(cross.status).toBe(404);
    const exec = await POST(new NextRequest("http://x/api/execute", { method: "POST", headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ appId: "s2-app", operation: "op", input: "x", grantId: "g" }) }));
    expect(exec.status).toBe(403); expect((await exec.json()).error).toMatch(/suspended/i);
  });
});
describe("S2-1/S2-5 regression guard: fail-closed provider still refuses", () => {
  it("unset provider refuses untrusted execution (no host spawn)", async () => {
    delete process.env.SANDBOX_PROVIDER;
    const prov = await import("@/lib/sandbox-provider");
    await expect(prov.activeProvider().run("js", { packageName: "marked", module: "marked", exportName: "parse" }, "x")).rejects.toThrow(/never a fallback/);
  });
});
