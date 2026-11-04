import { spawn } from "child_process"; import { promises as fs } from "fs"; import path from "path";
// Isolated runner: installs a vetted package into a throwaway sandbox dir and
// executes ONE fixed harness. Package/module/export names are validated as
// data — user input travels only via stdin JSON, never into code strings.
// Limits: timeout, output cap, scrubbed env, no secrets. Network is needed
// for install; execution itself needs none. True netns isolation is the
// documented production step (Modal Sandboxes).
const BASE = path.join(process.cwd(), ".openos-data", "sandbox");
const NAME_RE = /^[a-z0-9@][a-z0-9@/_.-]*$/i; const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$.]*$/;
function run(cmd: string, args: string[], opts: { cwd: string; input?: string; timeoutMs: number }): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const proxy = Object.fromEntries(["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy", "NODE_USE_ENV_PROXY"].filter((k) => process.env[k]).map((k) => [k, process.env[k] as string]));
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { PATH: process.env.PATH || "", HOME: opts.cwd, TMPDIR: opts.cwd, NODE_ENV: "production", ...proxy }, stdio: ["pipe", "pipe", "pipe"] }) as unknown as { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream; kill: (s: string) => void; on: (e: string, f: (...a: never[]) => void) => void };
    let out = "", err = ""; const kill = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    child.stdout.on("data", (d) => { out = (out + d).slice(0, 200_000); }); child.stderr.on("data", (d) => { err = (err + d).slice(0, 20_000); });
    child.on("error", (e) => { clearTimeout(kill); resolve({ code: -1, out, err: String(e) }); });
    child.on("close", (code) => { clearTimeout(kill); resolve({ code: code ?? -1, out, err }); });
    if (opts.input) child.stdin.end(opts.input); else child.stdin.end();
  });
}
async function ensureJs(pkg: string) {
  const dir = path.join(BASE, "js-" + pkg.replace(/[^a-z0-9]/gi, "_")); await fs.mkdir(dir, { recursive: true });
  try { await fs.access(path.join(dir, "node_modules", pkg.split("/").pop() || pkg)); return dir; } catch { /* install below */ }
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ private: true }));
  const r = await run("npm", ["install", "--prefix", dir, "--no-audit", "--no-fund", "--ignore-scripts", pkg], { cwd: dir, timeoutMs: 120_000 });
  if (r.code !== 0) throw new Error(`npm install failed: ${r.err.slice(-400)}`);
  return dir;
}
export async function runJsOperation(spec: { packageName: string; module: string; exportName: string }, input: string): Promise<string> {
  if (!NAME_RE.test(spec.packageName) || !NAME_RE.test(spec.module) || !IDENT_RE.test(spec.exportName)) throw new Error("Invalid package/module/export — refused.");
  const dir = await ensureJs(spec.packageName);
  const harness = `const m=require(process.argv[2]);let f=m;for(const p of process.argv[3].split('.')){if(f&&p in Object(f))f=f[p];}if(typeof f!=='function')f=m.default||m.marked||m.parse||m;let inp='';process.stdin.on('data',d=>inp+=d).on('end',async()=>{const v=await f(JSON.parse(inp).input);process.stdout.write(typeof v==='string'?v:JSON.stringify(v));});`;
  const hf = path.join(dir, "harness.cjs"); await fs.writeFile(hf, harness);
  const r = await run("node", [hf, spec.module, spec.exportName], { cwd: dir, input: JSON.stringify({ input }), timeoutMs: 20_000 });
  if (r.code !== 0) throw new Error(`Execution failed: ${r.err.slice(-400) || r.out.slice(-200)}`);
  return r.out;
}
async function ensurePy(pkg: string) {
  const dir = path.join(BASE, "py-" + pkg.replace(/[^a-z0-9]/gi, "_")); const venv = path.join(dir, "venv"); const marker = path.join(dir, ".installed");
  try { await fs.access(marker); return dir; } catch { /* build below */ }
  await fs.mkdir(dir, { recursive: true });
  try { await fs.access(path.join(venv, "bin", "python")); } catch { const r = await run("python3", ["-m", "venv", venv], { cwd: dir, timeoutMs: 60_000 }); if (r.code !== 0) throw new Error(`venv failed: ${r.err.slice(-300)}`); }
  const r = await run(path.join(venv, "bin", "pip"), ["install", "--quiet", pkg], { cwd: dir, timeoutMs: 180_000 }); if (r.code !== 0) throw new Error(`pip install failed: ${r.err.slice(-400)}`);
  await fs.writeFile(marker, pkg); return dir;
}
export async function runPythonOperation(spec: { packageName: string; module: string; exportName: string }, input: string): Promise<string> {
  if (!NAME_RE.test(spec.packageName) || !/^[a-z0-9_.]+$/i.test(spec.module) || !IDENT_RE.test(spec.exportName)) throw new Error("Invalid package/module/export — refused.");
  const dir = await ensurePy(spec.packageName);
  const code = `import sys,json\nfrom ${spec.module} import ${spec.exportName.split(".").pop()}\nd=json.load(sys.stdin)\nv=${spec.exportName.split(".").pop()}(d["input"])\nsys.stdout.write(v if isinstance(v,str) else json.dumps(v))`;
  const hf = path.join(dir, "harness.py"); await fs.writeFile(hf, code);
  const r = await run(path.join(dir, "venv", "bin", "python"), [hf], { cwd: dir, input: JSON.stringify({ input }), timeoutMs: 20_000 });
  if (r.code !== 0) throw new Error(`Execution failed: ${r.err.slice(-400)}`);
  return r.out;
}
export async function runOperation(kind: string, spec: { packageName: string; module: string; exportName: string }, input: string) {
  return kind === "python" ? runPythonOperation(spec, input) : runJsOperation(spec, input);
}
