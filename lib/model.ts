import { BlueprintSchema, type Blueprint } from "./schemas";
// Server-only. Stable system prompt first → prompt-cache friendly.
const SYSTEM = `You are OpenOS's repository analyst. Return ONLY valid JSON matching the requested schema. Never invent stars, features, or parity with commercial products. Mark commercial alternatives verified=false unless they are well-known products. Be honest about what the evidence shows.`;
const cache = new Map<string, Blueprint>();
export async function analyzeWithModel(repo: Awaited<ReturnType<typeof import("./github").fetchRepo>>): Promise<{ blueprint: Blueprint; source: "muse-wonder-1.0" | "deterministic-fallback"; cachedTokens?: number }> {
  const key = process.env.MODEL_API_KEY || process.env.META_API_KEY;
  const cacheKey = repo.fullName + "@" + repo.sha;
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
          { role: "user", content: `Analyze this GitHub repository. Schema keys: purpose, summary, capabilities[{name,description}], architecture, modules[{name,role}], inputs[], outputs[], runtime[], applications[], permissions[], licenseNotes, risks[], supported (true only for pdf-lib or tesseract.js), supportReason, commercialAlternatives[{name,note,verified}].\n\nRepo: ${repo.fullName}\nDescription: ${repo.description}\nLanguages: ${repo.languages.join(", ")}\nLicense: ${repo.license}\nTopics: ${repo.topics.join(", ")}\nREADME (truncated):\n${repo.readme.slice(0, 8000)}` },
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
function deterministic(repo: Awaited<ReturnType<typeof import("./github").fetchRepo>>): Blueprint {
  const supported = /pdf-lib|tesseract|rembg/i.test(repo.fullName);
  const caps = repo.readme.split("\n").filter((l) => /^[-*] /.test(l)).slice(0, 6).map((l) => ({ name: l.replace(/^[-*] /, "").slice(0, 60), description: "From README" }));
  return {
    purpose: repo.description || "See README summary below.", summary: repo.readme.replace(/[#>*`]/g, "").slice(0, 600) || repo.description,
    capabilities: caps.length ? caps : [{ name: "Core library", description: repo.description || "As described in README" }],
    architecture: "Deterministic summary — connect MODEL_API_KEY for full AI architecture analysis.",
    modules: [], inputs: ["Repository files (as documented)"], outputs: ["Library API (as documented)"],
    runtime: repo.languages.length ? repo.languages : ["See repository"], applications: [],
    permissions: ["network:github"], licenseNotes: `License: ${repo.license}. Verify terms in the repository before commercial use.`,
    risks: ["Analysis without AI is limited to README/metadata."], supported,
    supportReason: supported ? "Curated adapter available in OpenOS Studio." : "No vetted adapter yet — OpenOS will show an implementation plan, not a fake deploy.",
    commercialAlternatives: [],
  };
}
