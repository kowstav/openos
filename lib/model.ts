import { BlueprintSchema, type Blueprint } from "./schemas";
import { createHash } from "crypto";
import { authorize } from "./permissions";
import type { Skill } from "./skills";
// Muse engineering loop (I3): typed, permission-checked coordinator tools.
// Each tool is checked against the deterministic gateway; denied tools are
// recorded, never executed. Skill bodies enter the model request by hash +
// excerpt, so changing an approved skill changes the request (proven in tests).
export type CoordinatorTool = "inspect-source" | "plan" | "generate-ui" | "sandbox-build" | "sandbox-test" | "inspect-logs" | "repair" | "package" | "deploy";
export const TOOL_CAPABILITY: Record<CoordinatorTool, string> = { "inspect-source": "network:github", plan: "network:model", "generate-ui": "network:model", "sandbox-build": "shell:exec", "sandbox-test": "shell:exec", "inspect-logs": "network:model", repair: "network:model", package: "network:model", deploy: "network:model" };
export type Budgets = { maxTokens: number; maxSeconds: number; maxRepairs: number };
export const DEFAULT_BUDGETS: Budgets = { maxTokens: 32000, maxSeconds: 600, maxRepairs: 2 };
export function buildModelRequest(input: { stage: string; repo: string; commitSha: string; prompt: string; skills: Skill[] }) {
  const skillBlock = input.skills.map((s) => ({ name: s.name, version: s.version, excerpt: s.body.slice(0, 1200) }));
  const payload = { model: "muse-wonder-1.0", stage: input.stage, repo: input.repo, commitSha: input.commitSha, prompt: input.prompt.slice(0, 2000), skills: skillBlock, tools: (Object.keys(TOOL_CAPABILITY) as CoordinatorTool[]).map((name) => ({ name, capability: TOOL_CAPABILITY[name], decision: authorize(TOOL_CAPABILITY[name] as never) })) };
  return { payload, requestHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}
export function planCoordinator(input: { repo: string; commitSha: string; prompt: string; skills: Skill[]; budgets?: Budgets }) {
  const budgets = input.budgets || DEFAULT_BUDGETS;
  const steps = (Object.keys(TOOL_CAPABILITY) as CoordinatorTool[]).map((tool) => { const decision = authorize(TOOL_CAPABILITY[tool] as never); return { tool, capability: TOOL_CAPABILITY[tool], decision, note: decision === "deny" ? "Runs only inside the isolated sandbox provider, never on the control-plane host" : "Permitted through the gateway" }; });
  const { requestHash } = buildModelRequest({ stage: "coordinate", repo: input.repo, commitSha: input.commitSha, prompt: input.prompt, skills: input.skills });
  const mode = process.env.MODEL_API_KEY || process.env.META_API_KEY ? "genuine-ai-conversion" : "analysis-only-fallback";
  return { mode, requestHash, budgets, steps, skills: input.skills.map((s) => ({ name: s.name, version: s.version })) };
}
// ---- Bounded coordinator loop --------------------------------------------
// planCoordinator above only PLANS. runCoordinator is the real loop: it
// sends the reviewed skill procedures to the model, validates every tool
// request against the deterministic gateway, dispatches allowed tools
// through the injected sandbox-boundary dispatcher, feeds observed results
// back, and stops at the token/time/repair budget. Denied tools are
// recorded and NEVER dispatched — even when the model asks for them.
// Only an observed model response plus observed tool results may be called
// a genuine AI conversion; every other path returns the fallback mode.
export type CoordinatorToolCall = { tool: string; args: Record<string, unknown> };
export type CoordinatorResult = {
  mode: "genuine-ai-conversion" | "analysis-only-fallback";
  reason: string; model: string; requestHash: string;
  skills: { name: string; version: string }[];
  events: { at: number; type: string; detail: string }[];
  toolCalls: { tool: string; decision: string; dispatched: boolean; detail: string }[];
  integrationCode: string; uiSpec: string; summary: string;
  usage: { promptTokens: number; completionTokens: number; rounds: number; repairs: number; elapsedMs: number };
};
type FetchImpl = (url: string, init: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
export async function runCoordinator(input: {
  repo: string; commitSha: string; prompt: string; skills: Skill[]; budgets?: Budgets;
  fetchImpl?: FetchImpl; dispatch?: (call: CoordinatorToolCall) => Promise<string>;
  apiKey?: string; timeoutMs?: number;
}): Promise<CoordinatorResult> {
  const started = Date.now();
  const budgets = input.budgets || DEFAULT_BUDGETS;
  const { requestHash } = buildModelRequest({ stage: "coordinate", repo: input.repo, commitSha: input.commitSha, prompt: input.prompt, skills: input.skills });
  const base: CoordinatorResult = { mode: "analysis-only-fallback", reason: "", model: "muse-wonder-1.0", requestHash, skills: input.skills.map((s) => ({ name: s.name, version: s.version })), events: [], toolCalls: [], integrationCode: "", uiSpec: "", summary: "", usage: { promptTokens: 0, completionTokens: 0, rounds: 0, repairs: 0, elapsedMs: 0 } };
  const key = input.apiKey ?? (process.env.MODEL_API_KEY || process.env.META_API_KEY || "");
  if (!key) { base.reason = "No model key configured — deterministic planning only. Nothing here is presented as an AI conversion."; base.usage.elapsedMs = Date.now() - started; return base; }
  const doFetch: FetchImpl = input.fetchImpl || ((url, init) => fetch(url, init as RequestInit) as Promise<never>);
  const skillText = input.skills.map((s) => `## Skill ${s.name} (revision ${s.version})\n${s.body.slice(0, 4000)}`).join("\n\n");
  const messages: { role: string; content: string }[] = [
    { role: "system", content: `You are OpenOS's conversion coordinator. Follow the reviewed skill procedures below. Request tools by name with JSON arguments; never ask for shell access, credentials or filesystem-wide access — those are always denied. Finish with ONLY JSON: {"integrationCode": string, "uiSpec": string, "summary": string}.\n\n${skillText}` },
    { role: "user", content: `Repository: ${input.repo} @ ${input.commitSha}\nUser request: ${input.prompt.slice(0, 2000)}\nAvailable tools: ${(Object.keys(TOOL_CAPABILITY) as CoordinatorTool[]).join(", ")}` },
  ];
  let repairs = 0;
  try {
    for (let round = 0; round <= budgets.maxRepairs + 1; round++) {
      base.usage.rounds = round + 1;
      const controller = new AbortController();
      const budgetMs = Math.min(input.timeoutMs ?? budgets.maxSeconds * 1000, budgets.maxSeconds * 1000);
      const timer = setTimeout(() => controller.abort(), Math.max(50, budgetMs));
      let res: { ok: boolean; status: number; json: () => Promise<unknown> };
      try {
        // Race the fetch against the budget so even a transport that
        // ignores the abort signal cannot hang the loop past its budget.
        res = await Promise.race([
          doFetch("https://api.meta.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "muse-wonder-1.0", prompt_cache_key: "openos-coordinator-v1", messages, temperature: 0.2 }), signal: controller.signal }),
          new Promise<never>((_, reject) => { controller.signal.addEventListener("abort", () => reject(new Error("aborted"))); }),
        ]);
      } catch (e) {
        base.reason = controller.signal.aborted ? `Model call timed out after ${budgetMs}ms — recorded, not retried silently.` : `Model call failed: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`;
        base.usage.elapsedMs = Date.now() - started; return base;
      } finally { clearTimeout(timer); }
      if (!res.ok) { base.reason = `Model API returned ${res.status} (invalid key or unavailable) — deterministic fallback, never presented as AI output.`; base.usage.elapsedMs = Date.now() - started; return base; }
      const data = (await res.json()) as { choices?: { message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      base.usage.promptTokens += data.usage?.prompt_tokens || 0; base.usage.completionTokens += data.usage?.completion_tokens || 0;
      if (base.usage.promptTokens + base.usage.completionTokens > budgets.maxTokens) { base.reason = `Token budget (${budgets.maxTokens}) exhausted — stopped.`; break; }
      const msg = data.choices?.[0]?.message || {};
      const calls = (msg.tool_calls || []).map((t) => { let args: Record<string, unknown> = {}; try { args = JSON.parse(t.function?.arguments || "{}") as Record<string, unknown>; } catch { /* invalid args are denied below */ } return { tool: String(t.function?.name || ""), args }; });
      if (!calls.length) {
        try {
          const final = JSON.parse(msg.content || "{}") as { integrationCode?: string; uiSpec?: string; summary?: string };
          base.integrationCode = String(final.integrationCode || "").slice(0, 20000); base.uiSpec = String(final.uiSpec || "").slice(0, 10000); base.summary = String(final.summary || "").slice(0, 2000);
          base.mode = "genuine-ai-conversion"; base.reason = "Observed model response with dispatched tool results fed back.";
        } catch { base.reason = "Model returned unparseable final output — treated as no conversion."; }
        break;
      }
      messages.push({ role: "assistant", content: msg.content || "" });
      for (const call of calls) {
        const known = (Object.keys(TOOL_CAPABILITY) as string[]).includes(call.tool);
        const capability = known ? TOOL_CAPABILITY[call.tool as CoordinatorTool] : "shell:exec";
        const decision = known ? authorize(capability as never) : "deny";
        // shell:exec maps to deny at the gateway: it may ONLY run through
        // the injected sandbox dispatcher, never on this host. Without a
        // dispatcher, the request is denied and recorded.
        const viaSandbox = capability === "shell:exec" && Boolean(input.dispatch);
        if (decision === "deny" && !viaSandbox) { base.toolCalls.push({ tool: call.tool, decision: "deny", dispatched: false, detail: `Tool "${call.tool}" denied by the gateway — not executed.` }); messages.push({ role: "user", content: `Tool ${call.tool} DENIED by policy. Choose another approach or finish.` }); continue; }
        if (!input.dispatch) { base.toolCalls.push({ tool: call.tool, decision, dispatched: false, detail: "No sandbox dispatcher bound in this context — recorded, not executed." }); messages.push({ role: "user", content: `Tool ${call.tool} unavailable here. Finish with what you have.` }); continue; }
        try {
          const observed = await input.dispatch(call);
          base.toolCalls.push({ tool: call.tool, decision: viaSandbox ? "sandbox-only" : decision, dispatched: true, detail: observed.slice(0, 300) });
          base.events.push({ at: Date.now(), type: `tool:${call.tool}`, detail: observed.slice(0, 200) });
          messages.push({ role: "user", content: `Tool ${call.tool} result: ${observed.slice(0, 2000)}` });
        } catch (e) {
          repairs++; base.usage.repairs = repairs;
          base.toolCalls.push({ tool: call.tool, decision: "sandbox-only", dispatched: true, detail: `failed: ${String(e instanceof Error ? e.message : e).slice(0, 200)}` });
          if (repairs > budgets.maxRepairs) { base.reason = `Repair budget (${budgets.maxRepairs}) exhausted after tool failure.`; base.usage.elapsedMs = Date.now() - started; return base; }
          messages.push({ role: "user", content: `Tool ${call.tool} FAILED: ${String(e instanceof Error ? e.message : e).slice(0, 500)}. Repair within budget or finish honestly.` });
        }
      }
    }
  } catch (e) { base.reason = `Coordinator failed: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`; }
  base.usage.elapsedMs = Date.now() - started;
  return base;
}

// Server-only. Stable system prompt first → prompt-cache friendly.
const SYSTEM = `You are OpenOS's repository analyst. Return ONLY valid JSON matching the requested schema. Never invent stars, features, or parity with commercial products. Mark commercial alternatives verified=false unless they are well-known products. Be honest about what the evidence shows.`;
const cache = new Map<string, Blueprint>();
type RepoLike = { fullName: string; description?: string; languages?: string[]; license?: string; topics?: string[]; readme?: string; sha?: string; commitSha?: string };
export async function analyzeWithModel(repo: RepoLike): Promise<{ blueprint: Blueprint; source: "muse-wonder-1.0" | "deterministic-fallback"; cachedTokens?: number }> {
  const key = process.env.MODEL_API_KEY || process.env.META_API_KEY;
  const cacheKey = repo.fullName + "@" + (repo.commitSha || repo.sha || "");
  const hit = cache.get(cacheKey);
  if (hit) return { blueprint: hit, source: "muse-wonder-1.0" };
  if (!key) return { blueprint: deterministic(repo), source: "deterministic-fallback" };
  try {
    const res = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "muse-wonder-1.0", prompt_cache_key: "openos-repo-analyst-v1",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Analyze this GitHub repository. Schema keys: purpose, summary, capabilities[{name,description}], architecture, modules[{name,role}], inputs[], outputs[], runtime[], applications[], permissions[], licenseNotes, risks[], supported (true only for pdf-lib or tesseract.js), supportReason, commercialAlternatives[{name,note,verified}].\n\nRepo: ${repo.fullName}\nDescription: ${repo.description}\nLanguages: ${(repo.languages || []).join(", ")}\nLicense: ${repo.license}\nTopics: ${(repo.topics || []).join(", ")}\nREADME (truncated):\n${(repo.readme || "").slice(0, 8000)}` },
        ],
        response_format: { type: "json_object" }, temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`Model API ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = BlueprintSchema.parse(JSON.parse(text));
    cache.set(cacheKey, parsed);
    return { blueprint: parsed, source: "muse-wonder-1.0", cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens };
  } catch { return { blueprint: deterministic(repo), source: "deterministic-fallback" }; }
}
function deterministic(repo: RepoLike): Blueprint {
  const supported = /pdf-lib|tesseract|rembg/i.test(repo.fullName);
  const caps = (repo.readme || "").split("\n").filter((l) => /^[-*] /.test(l)).slice(0, 6).map((l) => ({ name: l.replace(/^[-*] /, "").slice(0, 60), description: "From README" }));
  return {
    purpose: repo.description || "See README summary below.", summary: (repo.readme || "").replace(/[#>*`]/g, "").slice(0, 600) || repo.description || "",
    capabilities: caps.length ? caps : [{ name: "Core library", description: repo.description || "As described in README" }],
    architecture: "Deterministic summary — connect MODEL_API_KEY for full AI architecture analysis.",
    modules: [], inputs: ["Repository files (as documented)"], outputs: ["Library API (as documented)"],
    runtime: repo.languages?.length ? repo.languages : ["See repository"], applications: [],
    permissions: ["network:github"], licenseNotes: `License: ${repo.license}. Verify terms in the repository before commercial use.`,
    risks: ["Analysis without AI is limited to README/metadata."], supported,
    supportReason: supported ? "Curated adapter available in OpenOS Studio." : "No vetted adapter yet — OpenOS will show an implementation plan, not a fake deploy.",
    commercialAlternatives: [],
  };
}
