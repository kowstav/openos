import { z } from "zod";
export const StrategySchema = z.enum(["js-library", "js-cli", "python-library", "python-cli", "web-app", "http-api", "container", "wasm", "curated-adapter", "unknown"]);
export type Strategy = z.infer<typeof StrategySchema>;
export const RepositoryAnalysisSchema = z.object({
  repo: z.string(), sha: z.string(), strategy: StrategySchema, confidence: z.number(),
  evidence: z.array(z.string()), entryPoints: z.array(z.string()),
  install: z.string(), risks: z.array(z.string()),
});
export type RepositoryAnalysis = z.infer<typeof RepositoryAnalysisSchema>;
type Repo = Awaited<ReturnType<typeof import("./github").fetchRepo>>;
export function classify(repo: Repo): RepositoryAnalysis {
  const files = repo.files || []; const ev: string[] = []; const entries: string[] = [];
  const has = (f: string) => files.includes(f) || files.some((x) => x.endsWith("/" + f));
  let strategy: Strategy = "unknown"; let install = ""; const risks: string[] = [];
  if (/pdf-lib|tesseract|rembg/i.test(repo.fullName)) { strategy = "curated-adapter"; ev.push("Matches a vetted OpenOS adapter (trusted execution path)"); install = "Prebuilt adapter, no repo code executed"; }
  else if (repo.pkg) {
    const pkg = repo.pkg as { main?: string; bin?: unknown; scripts?: Record<string, string>; dependencies?: Record<string, string> };
    if (pkg.main) entries.push(String(pkg.main));
    if (pkg.bin) entries.push("bin:" + (typeof pkg.bin === "string" ? pkg.bin : Object.keys(pkg.bin as object).join(",")));
    const deps = Object.keys(pkg.dependencies || {});
    if (pkg.bin && !pkg.main) { strategy = "js-cli"; ev.push(`package.json declares a CLI bin (${entries.join(", ")}) with no library main`); install = "npm install <package> in isolated sandbox dir, invoke its bin"; }
    else if (deps.some((d) => ["next", "react", "express", "fastify", "@nestjs/core"].includes(d)) || pkg.scripts?.dev) { strategy = deps.includes("express") || deps.includes("fastify") ? "http-api" : "web-app"; ev.push(`package.json depends on ${deps.filter((d) => ["next", "react", "express", "fastify"].includes(d)).join(", ") || "a framework"}`); install = "npm install (isolated)"; risks.push("Full web apps need a remote browser/runtime — OpenOS generates a plan, not a fake deploy."); }
    else { strategy = "js-library"; ev.push(`package.json main=${pkg.main || "index"}`); install = "npm install <package> in isolated sandbox dir"; }
  } else if (has("pyproject.toml") || has("setup.py") || has("requirements.txt")) {
    const isCli = /console_scripts|entry-points|\[project\.scripts\]/.test(repo.pyproject) || files.some((f) => f.endsWith("__main__.py") || f.includes("cli.py"));
    strategy = isCli ? "python-cli" : "python-library"; ev.push(has("pyproject.toml") ? "pyproject.toml present" : "setup.py/requirements present");
    const m = repo.pyproject.match(/name\s*=\s*"([^"]+)"/); entries.push(m ? `package:${m[1]}` : "python package");
    install = "python venv + pip install in isolated sandbox dir"; risks.push("Native extensions may need compilers — verification will surface real failures.");
  } else if (has("Dockerfile") || has("docker-compose.yml")) { strategy = "container"; ev.push("Dockerfile/compose present"); install = "Container build (requires container runtime)"; risks.push("No container runtime in this environment — plan only."); }
  else if (files.some((f) => f.endsWith(".wasm")) || has("Cargo.toml")) { strategy = "wasm"; ev.push("WASM/Rust artifacts present"); install = "WASM build (toolchain dependent)"; risks.push("Toolchain not provisioned — plan only."); }
  if (files.length) ev.push(`${files.length} files inspected; languages: ${repo.languages.join(", ") || repo.language}`);
  if (strategy === "unknown") risks.push("No recognized manifest — Muse analysis only, no executable conversion claimed.");
  const confidence = strategy === "unknown" ? 0.3 : strategy === "curated-adapter" ? 0.95 : 0.75;
  return RepositoryAnalysisSchema.parse({ repo: repo.fullName, sha: repo.sha, strategy, confidence, evidence: ev, entryPoints: entries, install, risks });
}
// Executable operation templates inferred from package metadata — data, not per-repo code.
export type ExecSpec = { kind: "js" | "js-cli" | "python"; packageName: string; module: string; exportName: string; opLabel: string; sampleInput: string; sampleCheck: string };
export function execSpecFor(repo: Repo, analysis: RepositoryAnalysis): ExecSpec | null {
  if (analysis.strategy === "js-cli" && repo.pkg) {
    const name = String((repo.pkg as { name?: string }).name || "");
    if (!/^[a-z0-9@][a-z0-9@/_.-]*$/i.test(name)) return null;
    if (/uuid/.test(name)) return { kind: "js-cli", packageName: name, module: name, exportName: "uuid", opLabel: "Generate a UUID (CLI)", sampleInput: "", sampleCheck: "" };
    return { kind: "js-cli", packageName: name, module: name, exportName: "cli", opLabel: `Run ${name} CLI`, sampleInput: "--help", sampleCheck: "" };
  }
  if (analysis.strategy === "js-library" && repo.pkg) {
    const name = String((repo.pkg as { name?: string }).name || "");
    if (!/^[a-z0-9@][a-z0-9@/_.-]*$/i.test(name)) return null;
    if (/marked/.test(name)) return { kind: "js", packageName: name, module: name, exportName: "marked.parse", opLabel: "Convert Markdown to HTML", sampleInput: "# Hello\n\nSome **bold** text.", sampleCheck: "<h1" };
    return { kind: "js", packageName: name, module: name, exportName: "default", opLabel: `Run ${name}`, sampleInput: "OpenOS", sampleCheck: "" };
  }
  if (analysis.strategy === "python-library" || analysis.strategy === "python-cli") {
    const m = repo.pyproject.match(/name\s*=\s*"([^"]+)"/); const name = m?.[1] || "";
    if (/slugify/.test(name)) return { kind: "python", packageName: name, module: "slugify", exportName: "slugify", opLabel: "Slugify text", sampleInput: "Hello OpenOS World!", sampleCheck: "hello-openos-world" };
    if (name) return { kind: "python", packageName: name, module: name.replace(/-/g, "_"), exportName: "default", opLabel: `Run ${name}`, sampleInput: "OpenOS", sampleCheck: "" };
  }
  return null;
}
