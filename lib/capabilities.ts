import { createHash } from "crypto";
import { CapabilityGraphSchema, type Capability, type CapabilityGraph } from "./contracts";
// Capability extraction from source evidence only (I3): manifest fields and
// exported symbols in files fetched at the pinned commit. Repository or
// package NAMES never select operations — shape does. Conflicting evidence
// (e.g. both `main` and `bin`) yields both capabilities plus a conflict note.
type Repo = { fullName: string; sha: string; pkg: Record<string, unknown> | null; pyproject: string; files: string[]; sources?: { path: string; content: string }[] };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "op";
function lineOf(content: string, needle: string) { const i = content.split("\n").findIndex((l) => l.includes(needle)); return i >= 0 ? i + 1 : undefined; }
export function extractCapabilities(repo: Repo): CapabilityGraph {
  const caps: Capability[] = []; const conflicts: string[] = []; const sha = repo.sha || "unknown";
  const pkg = repo.pkg as { name?: string; main?: string; bin?: unknown; exports?: unknown } | null;
  const pkgName = String(pkg?.name || "");
  const nameOk = /^[a-z0-9@][a-z0-9@/_.-]*$/i.test(pkgName);
  if (pkg && nameOk) {
    if (pkg.main) caps.push({ id: slug(`lib-${String(pkg.main).replace(/\.[^.]+$/, "")}`), label: `Call ${pkgName} library`, description: `Library entry ${pkg.main} declared in package.json`, inputType: "text", outputType: "text", sourceRef: { path: "package.json", commitSha: sha }, limitations: ["Single text input; structured arguments are not inferred"], resourceNeeds: ["sandbox:js"], confidence: 0.8, executable: true, exec: { kind: "js", packageName: pkgName, module: pkgName, exportName: "default" } });
    if (pkg.bin) { const bins = typeof pkg.bin === "string" ? [pkgName.split("/").pop() || "cli"] : Object.keys(pkg.bin as object); for (const b of bins) caps.push({ id: slug(`cli-${b}`), label: `Run ${b} CLI`, description: `CLI bin "${b}" declared in package.json`, inputType: "text", outputType: "text", sourceRef: { path: "package.json", commitSha: sha }, limitations: ["Arguments are argv tokens; shell syntax is refused"], resourceNeeds: ["sandbox:js-cli"], confidence: 0.8, executable: true, exec: { kind: "js-cli", packageName: pkgName, module: pkgName, exportName: b } }); }
    if (pkg.main && pkg.bin) conflicts.push("package.json declares both a library main and a CLI bin; both capabilities are offered and the user selects.");
  }
  const pyName = (repo.pyproject || "").match(/name\s*=\s*"([^"]+)"/)?.[1] || "";
  if (pyName && /^[a-z0-9@][a-z0-9@/_.-]*$/i.test(pyName)) {
    const mod = pyName.replace(/-/g, "_");
    const scripts = [...(repo.pyproject || "").matchAll(/\[project\.scripts\][^\[]*?([a-z0-9_-]+)\s*=/gi)].map((m) => m[1]);
    for (const s of scripts.length ? scripts : [""]) caps.push(s ? { id: slug(`cli-${s}`), label: `Run ${s} CLI`, description: `[project.scripts] entry "${s}" in pyproject.toml`, inputType: "text", outputType: "text", sourceRef: { path: "pyproject.toml", commitSha: sha }, limitations: ["CLI argv only"], resourceNeeds: ["sandbox:python"], confidence: 0.75, executable: true, exec: { kind: "python", packageName: pyName, module: mod, exportName: s } } : { id: slug(`lib-${mod}`), label: `Call ${pyName} library`, description: `Python package "${pyName}" declared in pyproject.toml`, inputType: "text", outputType: "text", sourceRef: { path: "pyproject.toml", commitSha: sha }, limitations: ["Export is resolved from source files when available"], resourceNeeds: ["sandbox:python"], confidence: 0.7, executable: true, exec: { kind: "python", packageName: pyName, module: mod, exportName: "default" } });
  }
  // Exported symbols in fetched source files refine library exports.
  for (const src of repo.sources || []) {
    const fns = src.path.endsWith(".py") ? [...src.content.matchAll(/^def ([a-zA-Z_][a-zA-Z0-9_]*)\(/gm)].map((m) => m[1]) : [...src.content.matchAll(/export (?:async )?(?:function|const) ([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    for (const fn of fns.slice(0, 6)) {
      const lib = caps.find((c) => c.executable && c.exec && ((src.path.endsWith(".py") && c.exec.kind === "python") || (!src.path.endsWith(".py") && c.exec.kind === "js")));
      if (lib?.exec && lib.exec.exportName === "default") lib.exec = { ...lib.exec, exportName: fn };
      caps.push({ id: slug(`fn-${fn}`), label: `${fn}()`, description: `Exported symbol ${fn} in ${src.path}`, inputType: "text", outputType: "text", sourceRef: { path: src.path, line: lineOf(src.content, fn), commitSha: sha }, limitations: ["Inferred text signature"], resourceNeeds: ["sandbox"], confidence: 0.6, executable: Boolean(lib?.exec), exec: lib?.exec ? { ...lib.exec, exportName: fn } : null });
    }
  }
  const seen = new Set<string>(); const dedup = caps.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  return CapabilityGraphSchema.parse({ v: 1, repo: repo.fullName, commitSha: sha, capabilities: dedup, edges: [], conflicts });
}
export function specForCapability(c: Capability) { return c.exec ? { kind: c.exec.kind, packageName: c.exec.packageName, module: c.exec.module, exportName: c.exec.exportName, opLabel: c.label, capabilityId: c.id, sampleInput: "Hello OpenOS World!" } : null; }
// Semantic verification: not exit-zero/substring alone. The sample must
// return a typed non-empty text output, be deterministic across two runs,
// and not look like an error dump.
export async function verifySemantically(run: (input: string) => Promise<string>, sampleInput: string): Promise<{ passed: boolean; checks: { name: string; passed: boolean; detail: string }[]; output: string }> {
  let out = ""; const checks: { name: string; passed: boolean; detail: string }[] = [];
  try { out = await run(sampleInput); checks.push({ name: "executes", passed: true, detail: "sample call returned" }); } catch (e) { return { passed: false, checks: [{ name: "executes", passed: false, detail: String(e instanceof Error ? e.message : e).slice(0, 200) }], output: "" }; }
  checks.push({ name: "typed-nonempty-output", passed: typeof out === "string" && out.trim().length > 0, detail: `${out.trim().length} chars` });
  checks.push({ name: "not-an-error-dump", passed: !/^(Error|Traceback)/.test(out.trim()), detail: out.slice(0, 60) });
  try { const again = await run(sampleInput); checks.push({ name: "deterministic", passed: again === out, detail: again === out ? "two runs identical" : "two runs differ" }); } catch { checks.push({ name: "deterministic", passed: false, detail: "second run failed" }); }
  return { passed: checks.every((c) => c.passed), checks, output: out };
}
export const evidenceHash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
