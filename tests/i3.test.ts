import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { mkdtempSync } from "fs"; import { tmpdir } from "os"; import path from "path";
process.env.OPENOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "openos-i3-"));
delete process.env.SANDBOX_PROVIDER; delete process.env.MODEL_API_KEY; delete process.env.META_API_KEY;
const SHA = "a".repeat(40);
describe("I3 contracts", () => {
  it("validates all twelve contracts and migrates v0", async () => {
    const c = await import("@/lib/contracts");
    expect(Object.keys(c.CONTRACTS)).toHaveLength(12);
    expect(c.validateContract("RepositoryRecord", { url: "u", host: "github.com", owner: "o", name: "r", commitSha: SHA, defaultBranch: "main", license: "MIT", licenseEvidence: null, languages: [], fetchedAt: 1 })).toBeTruthy();
    expect(() => c.validateContract("RepositoryRecord", { commitSha: "pushed_at" })).toThrow();
    expect(c.CompatibilityOutcomeSchema.options).toHaveLength(6);
  });
  it("workflow graph: bounded, typed, order-exact; unselected/unknown rejected", async () => {
    const { extractCapabilities } = await import("@/lib/capabilities"); const { validateWorkflow } = await import("@/lib/contracts");
    const g = extractCapabilities({ fullName: "x/y", sha: SHA, pkg: { name: "lib", main: "i.js", bin: { tool: "c.js" } }, pyproject: "", files: [], sources: [] } as never);
    expect(g.conflicts.join(" ")).toMatch(/both/);
    const ids = g.capabilities.filter((c) => c.executable).map((c) => c.id); expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(validateWorkflow(g, ids).order).toEqual(ids);
    expect(() => validateWorkflow(g, ["nope"])).toThrow(/Unknown capability/);
    expect(() => validateWorkflow(g, ids, [ids[0]])).toThrow(/exactly once/);
  });
});
describe("I3 provenance + capabilities", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("pins a moving branch: files fetched at resolved commit, not branch/pushed_at", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); const s = String(u);
      if (s.includes("/commits/")) return { ok: true, json: async () => ({ sha: SHA }) };
      if (s.endsWith("/repos/o/r")) return { ok: true, json: async () => ({ full_name: "o/r", description: "", stargazers_count: 1, forks_count: 0, language: "JS", license: { spdx_id: "MIT" }, default_branch: "main", html_url: "", topics: [], updated_at: "", open_issues_count: 0 }) };
      if (s.includes("/languages")) return { ok: true, json: async () => ({ JavaScript: 1 }) };
      if (s.includes("/git/trees/")) return { ok: true, json: async () => ({ truncated: false, tree: [{ type: "blob", path: "package.json" }, { type: "blob", path: "LICENSE" }, { type: "blob", path: "index.js" }] }) };
      if (s.includes("package.json")) return { ok: true, text: async () => JSON.stringify({ name: "lib", main: "index.js" }) };
      if (s.includes("LICENSE")) return { ok: true, text: async () => "MIT License\n..." };
      return { ok: true, text: async () => "export function shout(s){return s.toUpperCase()}" };
    }));
    const { fetchRepo } = await import("@/lib/github"); const repo = await fetchRepo("o", "r");
    expect(repo.commitSha).toBe(SHA); expect(repo.sha).toBe(SHA); expect(repo.licenseEvidence).toContain("LICENSE@");
    expect(urls.some((u) => u.includes(`/git/trees/${SHA}`))).toBe(true); expect(urls.some((u) => u.includes("ref=" + SHA))).toBe(true);
    const { extractCapabilities } = await import("@/lib/capabilities"); const g = extractCapabilities(repo as never);
    expect(g.capabilities.some((c) => c.sourceRef.path === "index.js")).toBe(true);
  });
  it("semantic verification requires deterministic typed output, not substring", async () => {
    const { verifySemantically } = await import("@/lib/capabilities");
    expect((await verifySemantically(async (i) => i.toUpperCase(), "hi")).passed).toBe(true);
    let n = 0; expect((await verifySemantically(async () => String(++n), "x")).passed).toBe(false);
    expect((await verifySemantically(async () => "", "x")).passed).toBe(false);
  });
  it("changing an approved skill body changes the coordinator model request", async () => {
    const { buildModelRequest } = await import("@/lib/model"); const { skillHash } = await import("@/lib/skills");
    const mk = (body: string) => [{ name: "verification" as never, description: "d", body, version: skillHash(body) }];
    const a = buildModelRequest({ stage: "s", repo: "o/r", commitSha: SHA, prompt: "p", skills: mk("v1") });
    const b = buildModelRequest({ stage: "s", repo: "o/r", commitSha: SHA, prompt: "p", skills: mk("v2 changed") });
    expect(a.requestHash).not.toBe(b.requestHash);
    const { planCoordinator } = await import("@/lib/model"); const plan = planCoordinator({ repo: "o/r", commitSha: SHA, prompt: "p", skills: mk("v1") });
    expect(plan.mode).toBe("analysis-only-fallback"); expect(plan.steps.find((s) => s.tool === "sandbox-build")?.decision).toBe("deny");
  });
});
describe("I3 selection threading + unselected cannot run", () => {
  let store: typeof import("@/lib/store"); let auth: typeof import("@/lib/auth");
  beforeAll(async () => { store = await import("@/lib/store"); auth = await import("@/lib/auth"); });
  it("execute route rejects an unselected operation, accepts the selected one path to grant check", async () => {
    const { POST } = await import("@/app/api/execute/route"); const { NextRequest } = await import("next/server");
    const u = await auth.createSession();
    await store.saveApp({ id: "app-i3", ownerId: u.userId, title: "t", repo: "o/r", prompt: "", studioUrl: "/app/app-i3", operations: ["fn-shout"], capabilityIds: ["fn-shout"], steps: [], permissions: [], blocked: [], warnings: [], createdAt: Date.now(), version: 1, exec: { kind: "js", packageName: "lib", module: "lib", exportName: "shout", opLabel: "shout", capabilityId: "fn-shout" }, ui: { fields: [], outputType: "text" } } as never);
    const req = (body: unknown) => new NextRequest("http://x/api/execute", { method: "POST", headers: { Authorization: `Bearer ${u.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await POST(req({ appId: "app-i3", operation: "fn-delete-everything", input: "x" }))).status).toBe(403);
    const sel = await POST(req({ appId: "app-i3", operation: "fn-shout", input: "x" }));
    expect(sel.status).toBe(403); expect((await sel.json()).error).toMatch(/grant is required/i); // selected op passes selection gate, stops at grant gate
  });
  it("two selections from same repo produce different stored workflows", async () => {
    const { extractCapabilities } = await import("@/lib/capabilities"); const { validateWorkflow } = await import("@/lib/contracts");
    const g = extractCapabilities({ fullName: "x/y", sha: SHA, pkg: { name: "lib", main: "i.js", bin: { tool: "c.js" } }, pyproject: "", files: [], sources: [] } as never);
    const ids = g.capabilities.filter((c) => c.executable).map((c) => c.id);
    expect(validateWorkflow(g, [ids[0]]).order).not.toEqual(validateWorkflow(g, [ids[1]]).order);
  });
});
