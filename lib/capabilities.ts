import { createHash } from "crypto";
import { CapabilityGraphSchema, type Capability, type CapabilityGraph } from "./contracts";
import { CATALOG } from "./catalog";
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
// Capability-specific semantic verification — never exit-zero, nonempty
// stdout, a substring, or "same output twice" alone. Every verification
// runs TWO different inputs and requires: typed non-empty output, no error
// dump, input sensitivity (different inputs must not collapse to one
// constant output), and repeat consistency (the same input either repeats
// exactly, as a pure transform must, or varies in a valid identifier
// format, as an ID generator must). Callers with an independent expectation
// for the transformation (a slug, rendered HTML, a UUID shape) pass it in;
// a constant stub fails the transformation checks.
const ID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type VerifyOptions = { secondInput?: string; expectation?: { name: string; test: (input: string, output: string) => boolean } };
export async function verifySemantically(run: (input: string) => Promise<string>, sampleInput: string, opts: VerifyOptions = {}): Promise<{ passed: boolean; checks: { name: string; passed: boolean; detail: string }[]; output: string }> {
  const checks: { name: string; passed: boolean; detail: string }[] = [];
  let out = "";
  try { out = await run(sampleInput); checks.push({ name: "executes", passed: true, detail: "first sample call returned" }); } catch (e) { return { passed: false, checks: [{ name: "executes", passed: false, detail: String(e instanceof Error ? e.message : e).slice(0, 200) }], output: "" }; }
  checks.push({ name: "typed-nonempty-output", passed: typeof out === "string" && out.trim().length > 0, detail: `${out.trim().length} chars` });
  checks.push({ name: "not-an-error-dump", passed: !/^(Error|Traceback)/.test(out.trim()), detail: out.slice(0, 60) });
  const secondInput = opts.secondInput ?? (sampleInput + " — second sample 42");
  try {
    const outB = await run(secondInput);
    checks.push({ name: "second-input-executes", passed: typeof outB === "string" && outB.trim().length > 0, detail: `${outB.trim().length} chars for a different input` });
    checks.push({ name: "input-sensitive", passed: outB !== out, detail: outB !== out ? "different inputs produced different outputs" : "different inputs collapsed to one constant output — not a real transformation" });
    if (opts.expectation) checks.push({ name: opts.expectation.name, passed: opts.expectation.test(sampleInput, out) && opts.expectation.test(secondInput, outB), detail: "independent expected transformation checked on both inputs" });
  } catch { checks.push({ name: "second-input-executes", passed: false, detail: "second input run failed" }); }
  try {
    const again = await run(sampleInput);
    const deterministic = again === out;
    const variableId = !deterministic && ID_FORMAT.test(out.trim()) && ID_FORMAT.test(again.trim());
    checks.push({ name: "repeat-consistency", passed: deterministic || variableId, detail: deterministic ? "same input repeats exactly (pure transform)" : variableId ? "same input varies as valid identifiers (ID generator)" : "same input gave unrelated outputs" });
  } catch { checks.push({ name: "repeat-consistency", passed: false, detail: "repeat run failed" }); }
  return { passed: checks.every((c) => c.passed), checks, output: out };
}
// Independent expectations derived from the capability's own evidence (its
// id/export), never from the implementation under test.
export function expectationFor(cap: Capability): VerifyOptions["expectation"] {
  const hay = `${cap.id} ${cap.exec?.exportName || ""} ${cap.label}`.toLowerCase();
  if (/uuid|nanoid|random[ -]?id|generate[ -]?id|\bid\b.*generat/.test(hay)) return { name: "identifier-format", test: (_i, o) => ID_FORMAT.test(o.trim()) || /^[A-Za-z0-9_-]{8,}$/.test(o.trim()) };
  if (/slug/.test(hay)) return { name: "slug-transformation", test: (i, o) => o.trim() === i.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") };
  if (/markdown|marked/.test(hay)) return { name: "markdown-transformation", test: (_i, o) => /<[a-z][^>]*>/.test(o) };
  if (/upper/.test(hay)) return { name: "uppercase-transformation", test: (i, o) => o === i.toUpperCase() };
  return undefined;
}
export const evidenceHash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
// ---- ONE canonical, revision-bound capability graph ---------------------
// The UI, the convert route and the worker must all select from the SAME
// ids. This builder is the single source: manifest-derived capabilities for
// unfamiliar repositories, catalog capabilities for curated adapters. The
// graph is bound to the pinned commit; `revision` fingerprints its exact
// contents so a selection can be checked against the graph it was made from.
export const CURATED_LABEL_BY_CAPABILITY: Record<string, string> = {
  "pdf.merge": "Merge documents", "pdf.extract": "Extract pages", "pdf.rotate": "Rotate pages", "pdf.watermark": "Add watermark", "pdf.metadata": "Edit title & metadata", "pdf.view": "View PDF",
  "image.cutout": "Remove background", "image.center": "Center on canvas", "image.resize": "Resize image", "image.export": "Export images",
  "ocr.extract": "Extract text from image", "audio.transcribe": "Transcribe audio", "audio.subtitles": "Create subtitles", "text.markdown": "Convert Markdown", "diagram.render": "Render diagram", "doc.convert": "Convert document",
};
export const CURATED_OP_BY_CAPABILITY: Record<string, string> = {
  "pdf.merge": "merge", "pdf.extract": "extract", "pdf.rotate": "rotate", "pdf.watermark": "watermark", "pdf.metadata": "metadata",
  "image.cutout": "remove-bg", "image.center": "center", "image.resize": "resize", "image.export": "compress",
  "ocr.extract": "ocr", "audio.transcribe": "transcribe", "audio.subtitles": "subtitles", "text.markdown": "markdown",
};
const CURATED_TYPES: Record<string, { inputType: "text" | "file"; outputType: "text" | "file" }> = {
  pdf: { inputType: "file", outputType: "file" }, image: { inputType: "file", outputType: "file" },
  ocr: { inputType: "file", outputType: "text" }, audio: { inputType: "file", outputType: "text" }, text: { inputType: "text", outputType: "text" },
};
export function buildCanonicalGraph(repo: Repo & { fullName: string }): CapabilityGraph {
  const entry = CATALOG.find((e) => `${e.owner}/${e.repo}`.toLowerCase() === repo.fullName.toLowerCase());
  const curatedRepo = /pdf-lib|tesseract|rembg/i.test(repo.fullName);
  if (entry && (curatedRepo || entry.runnable)) {
    const sha = repo.sha || "unknown";
    const caps: Capability[] = entry.capabilityIds.map((id) => {
      const family = id.split(".")[0];
      const t = CURATED_TYPES[family] || { inputType: "text" as const, outputType: "text" as const };
      return { id, label: CURATED_LABEL_BY_CAPABILITY[id] || id, description: `${entry.label} · ${entry.processing}`, inputType: t.inputType, outputType: t.outputType, sourceRef: { path: "lib/catalog.ts (curated adapter)", commitSha: sha }, limitations: entry.missing.slice(0, 2), resourceNeeds: ["trusted-adapter"], confidence: 0.95, executable: entry.runnable, exec: null };
    });
    return CapabilityGraphSchema.parse({ v: 1, repo: repo.fullName, commitSha: sha, capabilities: caps, edges: [], conflicts: [] });
  }
  return extractCapabilities(repo);
}
export function graphRevision(graph: CapabilityGraph): string {
  return createHash("sha256").update(JSON.stringify({ repo: graph.repo, commitSha: graph.commitSha, capabilities: graph.capabilities.map((c) => [c.id, c.executable, c.exec]) })).digest("hex").slice(0, 16);
}
export function curatedOpsFor(workflowOrder: string[]): string[] | null {
  const ops = workflowOrder.map((id) => CURATED_OP_BY_CAPABILITY[id]);
  return ops.every(Boolean) ? (ops as string[]) : null;
}
