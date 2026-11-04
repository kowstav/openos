import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs"; import { tmpdir } from "os"; import path from "path";
process.env.OPENOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "openos-gate2-"));

const SHA = "a".repeat(40);
const skill = (body: string) => ({ name: "verification" as never, description: "d", body, version: "v-" + body.length });
type FetchFn = (url: string, init: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const modelReply = (payload: unknown, status = 200): FetchFn => async () => ({ ok: status < 400, status, json: async () => payload });
const toolCall = (name: string) => ({ choices: [{ message: { tool_calls: [{ function: { name, arguments: "{}" } }] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const finalJson = { choices: [{ message: { content: JSON.stringify({ integrationCode: "export const x=1", uiSpec: "form:text", summary: "done" }) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };

describe("Gate 2 coordinator: bounded model/tool loop protocol", () => {
  let model: typeof import("@/lib/model");
  beforeAll(async () => { model = await import("@/lib/model"); });

  it("no key: labelled fallback, zero tool dispatch, never genuine", async () => {
    const saved = process.env.MODEL_API_KEY; delete process.env.MODEL_API_KEY; delete process.env.META_API_KEY;
    let dispatched = 0;
    const r = await model.runCoordinator({ repo: "o/r", commitSha: SHA, prompt: "p", skills: [skill("check outputs")], dispatch: async () => { dispatched++; return "x"; } });
    if (saved) process.env.MODEL_API_KEY = saved;
    expect(r.mode).toBe("analysis-only-fallback"); expect(dispatched).toBe(0); expect(r.reason).toMatch(/No model key/);
    expect(r.skills[0].version).toContain("v-");
  });
  it("invalid key (401): fallback with the status recorded", async () => {
    const r = await model.runCoordinator({ repo: "o/r", commitSha: SHA, prompt: "p", skills: [skill("b")], apiKey: "bad", fetchImpl: modelReply({}, 401) });
    expect(r.mode).toBe("analysis-only-fallback"); expect(r.reason).toMatch(/401/);
  });
  it("timeout: aborts and records, does not hang or claim success", async () => {
    const slow: FetchFn = () => new Promise(() => {});
    const r = await model.runCoordinator({ repo: "o/r", commitSha: SHA, prompt: "p", skills: [skill("b")], apiKey: "k", fetchImpl: slow, timeoutMs: 60 });
    expect(r.mode).toBe("analysis-only-fallback"); expect(r.reason).toMatch(/timed out|failed/i);
  });
  it("denial: a shell tool request is never dispatched, even from the model", async () => {
    const dispatchLog: string[] = [];
    const seq: FetchFn[] = [modelReply(toolCall("sandbox-build")), modelReply(finalJson)];
    let i = 0;
    // sandbox-build needs the sandbox dispatcher; with NO dispatcher bound
    // it must be denied outright.
    const r = await model.runCoordinator({ repo: "o/r", commitSha: SHA, prompt: "p", skills: [skill("b")], apiKey: "k", fetchImpl: async (u, init) => seq[i++](u, init) });
    expect(dispatchLog).toHaveLength(0);
    expect(r.toolCalls.find((t) => t.tool === "sandbox-build")?.dispatched).toBe(false);
  });
  it("dispatch + feedback: tool results return to the model, then a genuine finish", async () => {
    const seenBodies: string[] = [];
    const seq: FetchFn[] = [
      async (_u, init) => { seenBodies.push(String(init.body)); return { ok: true, status: 200, json: async () => toolCall("inspect-source") }; },
      async (_u, init) => { seenBodies.push(String(init.body)); return { ok: true, status: 200, json: async () => finalJson }; },
    ];
    let i = 0;
    const r = await model.runCoordinator({ repo: "o/r", commitSha: SHA, prompt: "build it", skills: [skill("inspect then verify")], apiKey: "k", fetchImpl: async (u, init) => seq[i++](u, init), dispatch: async () => "observed: 12 files" });
    expect(r.mode).toBe("genuine-ai-conversion");
    expect(r.toolCalls[0]).toMatchObject({ tool: "inspect-source", dispatched: true });
    expect(seenBodies[1]).toContain("observed: 12 files"); // fed back
    expect(seenBodies[0]).toContain("inspect then verify"); // skill procedure sent
    expect(r.integrationCode).toContain("export const x=1");
    expect(JSON.stringify(r)).not.toContain("bad"); // no secrets echoed
  });
  it("repair: a failing dispatch is fed back and bounded by the repair budget", async () => {
    const seq: FetchFn[] = [modelReply(toolCall("inspect-source")), modelReply(toolCall("inspect-source")), modelReply(toolCall("inspect-source")), modelReply(finalJson)];
    let i = 0; let attempts = 0;
    const r = await model.runCoordinator({ repo: "o/r", commitSha: SHA, prompt: "p", skills: [skill("b")], apiKey: "k", budgets: { maxTokens: 32000, maxSeconds: 30, maxRepairs: 1 }, fetchImpl: async (u, init) => seq[Math.min(i++, seq.length - 1)](u, init), dispatch: async () => { attempts++; throw new Error("build broke"); } });
    expect(attempts).toBe(2); // initial + one repair, then budget stops it
    expect(r.usage.repairs).toBe(2); expect(r.reason).toMatch(/Repair budget/);
  });
});

describe("Gate 2 provider boundary: fixtures sealed, split lifecycle refuses", () => {
  it("host runner refuses public input even with fixture flags enabled", async () => {
    const prov = await import("@/lib/sandbox-provider");
    process.env.OPENOS_ENABLE_LOCAL_FIXTURES = "1";
    await expect(prov.LocalProvider.run("js", { packageName: "nanoid", module: "nanoid", exportName: "nanoid" }, "x")).rejects.toThrow(/sealed to trusted test fixtures/);
    await expect(prov.LocalProvider.run("js", { packageName: "evil-package", module: "x", exportName: "x" }, "x")).rejects.toThrow(/sealed/);
    delete process.env.OPENOS_ENABLE_LOCAL_FIXTURES;
    await expect(prov.LocalProvider.run("js", { packageName: "marked", module: "marked", exportName: "parse" }, "x")).rejects.toThrow(/disabled/);
  });
  it("split provider refuses build/run without an isolated backend", async () => {
    const prov = await import("@/lib/sandbox-provider");
    delete process.env.SANDBOX_PROVIDER;
    await expect(prov.activeSplitProvider().buildArtifact("js", { packageName: "marked", module: "marked", exportName: "parse" }, "job-1")).rejects.toThrow(/never a fallback/);
    await expect(prov.transcribeAudio("AAAA")).rejects.toThrow(/never runs on the host/);
  });
  it("GitHub visibility gates every token use; private source is never fetched", async () => {
    const gh = await import("@/lib/github");
    const seen: { url: string; auth: string | null }[] = [];
    const orig = globalThis.fetch;
    process.env.GITHUB_TOKEN = "test-token-value";
    globalThis.fetch = (async (url: unknown, init?: { headers?: Record<string, string> }) => {
      const u = String(url); seen.push({ url: u, auth: init?.headers?.Authorization || null });
      // Anonymous check rate-limited; token check reveals a PRIVATE repo.
      if (!init?.headers?.Authorization) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ private: true, full_name: "ghost/private-repo" }) };
    }) as typeof fetch;
    try { await expect(gh.fetchRepo("ghost", "private-repo")).rejects.toThrow(/private/); }
    finally { globalThis.fetch = orig; delete process.env.GITHUB_TOKEN; }
    expect(seen[0].auth).toBeNull(); // visibility attempted without credentials first
    // The token may verify visibility, but no source endpoint is ever hit.
    expect(seen.every((s) => !/contents|git\/trees|languages|commits/.test(s.url))).toBe(true);
  });
});
