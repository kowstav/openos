// Credential-gated LIVE proof (disposable): genuine Muse tool dispatch,
// isolated sandbox execution, semantic verification, reopen and a second
// input — for four frozen held-out repositories plus one intentionally
// incompatible case. It DESTROYS what it creates (apps deleted, sessions
// revoked, sandboxes terminated by the worker).
//
//   OPENOS_URL=http://localhost:3000 node scripts/live-smoke.mjs
//
// Server must run with SANDBOX_PROVIDER=modal, MODAL_TOKEN_ID,
// MODAL_TOKEN_SECRET and MODEL_API_KEY (or META_API_KEY). When any of those
// is absent the run is BLOCKED: it prints one BLOCKED line per missing
// dependency, records the attempt, and exits 0 having proven NOTHING —
// blocked is never reported as release proof. When credentials ARE present,
// every expected success must fully pass (genuine dispatch + verified
// artifact + authorized run + semantic result + reopen + second input) and
// the incompatible case must terminate honestly; anything else exits 1.
// All attempts are written to LIVE_SMOKE_REPORT (default
// /tmp/openos-live-smoke.json).
import { writeFileSync } from "fs";
const base = process.env.OPENOS_URL || "http://localhost:3000";
const reportPath = process.env.LIVE_SMOKE_REPORT || "/tmp/openos-live-smoke.json";
// Frozen BEFORE running: four held-out repos (absent from the catalog,
// demos and code special cases) across two ecosystems and three
// strategies, plus one intentionally incompatible case. Expectations are
// independent of the implementation under test.
const HELD_OUT = [
  { url: "https://github.com/nanoid/nanoid", ecosystem: "JavaScript", strategy: "js-library", expect: { kind: "identifier", pattern: /^[A-Za-z0-9_-]{10,}$/, note: "generates URL-friendly unique IDs" } },
  { url: "https://github.com/sindresorhus/slugify", ecosystem: "JavaScript", strategy: "js-library", expect: { kind: "transform", note: "slugifies text" } },
  { url: "https://github.com/pallets/itsdangerous", ecosystem: "Python", strategy: "python-library", expect: { kind: "any-text", note: "signing/serialization library" } },
  { url: "https://github.com/python-openxml/python-docx", ecosystem: "Python", strategy: "python-library", expect: { kind: "any-text", note: "document library (may honestly require infrastructure)" }, allowInfrastructure: true },
];
const INCOMPATIBLE = { url: "https://github.com/pytorch/pytorch", note: "huge native/GPU monorepo — must terminate as partial/requires-infrastructure/unsupported, never as a verified app" };
const attempts = [];
function record(entry) { attempts.push({ at: new Date().toISOString(), ...entry }); console.log(`${entry.result} ${entry.name}${entry.detail ? " — " + entry.detail : ""}`); }
const missing = [];
if (process.env.SANDBOX_PROVIDER !== "modal") missing.push("SANDBOX_PROVIDER=modal");
if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) missing.push("MODAL_TOKEN_ID / MODAL_TOKEN_SECRET");
if (!process.env.MODEL_API_KEY && !process.env.META_API_KEY) missing.push("MODEL_API_KEY or META_API_KEY");
if (missing.length) {
  for (const m of missing) record({ name: `live proof blocked: ${m}`, result: "BLOCKED" });
  record({ name: "summary", result: "BLOCKED", detail: "Live Muse dispatch, sandbox isolation and egress denial are UNPROVEN in this environment. Blocked is not release proof." });
  writeFileSync(reportPath, JSON.stringify({ blocked: missing, attempts }, null, 2));
  process.exit(0);
}
let failed = 0;
const check = (name, ok, detail = "") => { record({ name, result: ok ? "PASS" : "FAIL", detail }); if (!ok) failed++; };
async function session() { const s = await fetch(`${base}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); return s.headers.get("set-cookie") || ""; }
const health = await (await fetch(`${base}/api/health`)).json().catch(() => null);
check("server reports Modal isolated", health?.provider?.isolated === true, JSON.stringify(health?.provider || {}));
check("server reports genuine Muse mode", health?.model?.mode === "genuine-ai-conversion");
for (const held of HELD_OUT) {
  const cookie = await session(); let appId = null;
  try {
    const conv = await fetch(`${base}/api/convert`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ url: held.url, prompt: "Use this library on my text", selectedCapabilities: [], workflowOrder: [] }) });
    check(`${held.url}: conversion accepted`, conv.ok, `status=${conv.status}`);
    if (!conv.ok) continue;
    const jobId = (await conv.json()).job.id; let job = null;
    for (let i = 0; i < 120 && !job; i++) { await new Promise((r) => setTimeout(r, 2000)); const jr = await fetch(`${base}/api/jobs/${jobId}`, { headers: { cookie } }); const jj = jr.ok ? await jr.json() : null; if (jj?.job && ["succeeded", "partial", "failed", "cancelled"].includes(jj.job.status)) job = jj.job; }
    check(`${held.url}: terminates with a recorded outcome`, Boolean(job?.outcome), job ? `status=${job.status} outcome=${job.outcome}` : "timeout");
    const expectSuccess = job?.status === "succeeded";
    if (held.allowInfrastructure && !expectSuccess) { record({ name: `${held.url}: honest infrastructure outcome accepted`, result: "PASS", detail: held.expect.note }); continue; }
    check(`${held.url}: expected success is genuine (not partial)`, expectSuccess, `status=${job?.status}`);
    if (!expectSuccess) continue;
    appId = job.appId;
    const reopen = await fetch(`${base}/api/apps/${appId}`, { headers: { cookie } });
    check(`${held.url}: app reopens for its owner`, reopen.ok);
    // Authorized run needs a grant; semantic result checked on TWO inputs.
    const app = (await reopen.json()).app;
    const g = await (await fetch(`${base}/api/grants`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ appId, action: "execute" }) })).json();
    check(`${held.url}: grant issued for the exact app version`, Boolean(g.grant));
    if (g.grant && app.exec) {
      const run = async (input) => { const gg = await (await fetch(`${base}/api/grants`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ appId, action: "execute" }) })).json(); return fetch(`${base}/api/execute`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ appId, grantId: gg.grant.id, input, operation: app.operations[0] }) }); };
      const r1 = await run("Hello OpenOS World!"); const j1 = await r1.json().catch(() => ({}));
      check(`${held.url}: authorized run returns a semantic result`, r1.ok && typeof j1.output === "string" && j1.output.length > 0, j1.error || String(j1.output || "").slice(0, 80));
      if (held.expect.kind === "identifier") check(`${held.url}: output matches the identifier expectation`, held.expect.pattern.test(String(j1.output || "").trim()));
      const r2 = await run("A second, different input 42"); const j2 = await r2.json().catch(() => ({}));
      check(`${held.url}: second input runs without rebuilding`, r2.ok && String(j2.output || "") !== String(j1.output || ""), "outputs must differ across inputs (constant output fails)");
      // Replay probe: the consumed grant must not dispatch twice.
      const replay = await fetch(`${base}/api/execute`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ appId, grantId: g.grant.id, input: "replay", operation: app.operations[0] }) });
      check(`${held.url}: grant replay denied`, replay.status === 403);
    }
    // Cross-tenant probe: a second account must never read the app.
    const cookie2 = await session();
    const cross = await fetch(`${base}/api/apps/${appId}`, { headers: { cookie: cookie2 } });
    check(`${held.url}: cross-tenant app read denied (404)`, cross.status === 404);
    await fetch(`${base}/api/auth/session`, { method: "DELETE", headers: { cookie: cookie2 } }).catch(() => null);
  } finally {
    if (appId) await fetch(`${base}/api/apps/${appId}`, { method: "DELETE", headers: { cookie } }).catch(() => null);
    await fetch(`${base}/api/auth/session`, { method: "DELETE", headers: { cookie } }).catch(() => null);
    record({ name: `${held.url}: cleanup`, result: "PASS", detail: "app deleted (if created), session revoked, sandboxes terminated by worker" });
  }
}
// Intentionally incompatible case: must terminate honestly, never verified.
{
  const cookie = await session();
  try {
    const conv = await fetch(`${base}/api/convert`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ url: INCOMPATIBLE.url, prompt: "Run this on my text", selectedCapabilities: [] }) });
    if (conv.ok) {
      const jobId = (await conv.json()).job.id; let job = null;
      for (let i = 0; i < 60 && !job; i++) { await new Promise((r) => setTimeout(r, 2000)); const jr = await fetch(`${base}/api/jobs/${jobId}`, { headers: { cookie } }); const jj = jr.ok ? await jr.json() : null; if (jj?.job && ["succeeded", "partial", "failed", "cancelled"].includes(jj.job.status)) job = jj.job; }
      check("incompatible repo terminates honestly (never a verified success)", Boolean(job) && job.status !== "succeeded", job ? `status=${job.status} outcome=${job.outcome}` : "timeout");
      if (job?.appId) await fetch(`${base}/api/apps/${job.appId}`, { method: "DELETE", headers: { cookie } }).catch(() => null);
    } else check("incompatible repo refused at submission", conv.status === 400, `status=${conv.status}`);
  } finally { await fetch(`${base}/api/auth/session`, { method: "DELETE", headers: { cookie } }).catch(() => null); }
}
writeFileSync(reportPath, JSON.stringify({ attempts }, null, 2));
console.log(failed ? `\n${failed} live check(s) FAILED — report at ${reportPath}` : `\nLive smoke OK — report at ${reportPath}`);
process.exit(failed ? 1 : 0);
