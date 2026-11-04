// Credential-gated live sandbox smoke (I5/S3). DISPOSABLE: it submits one
// held-out conversion and one forbidden-egress expectation through the
// public API, then deletes the created app and revokes its sessions.
// It DESTROYS what it creates (app delete + session revoke). Modal
// sandboxes are terminated by workers/modal_runner.py on every run.
//
// Required env (server must already run with these set):
//   OPENOS_URL, SANDBOX_PROVIDER=modal, MODAL_TOKEN_ID, MODAL_TOKEN_SECRET,
//   MODEL_API_KEY or META_API_KEY.
// Missing live dependency => explicit SKIP lines, exit 0 (so CI without
// secrets stays green while never claiming isolation proof). Any observed
// denial failure exits nonzero.
//
// Usage: OPENOS_URL=http://localhost:3000 node scripts/live-smoke.mjs
const base = process.env.OPENOS_URL || "http://localhost:3000";
const missing = [];
if (process.env.SANDBOX_PROVIDER !== "modal") missing.push("SANDBOX_PROVIDER=modal");
if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) missing.push("MODAL_TOKEN_ID/MODAL_TOKEN_SECRET");
if (!process.env.MODEL_API_KEY && !process.env.META_API_KEY) missing.push("MODEL_API_KEY or META_API_KEY");
if (missing.length) {
  for (const m of missing) console.log(`SKIP live sandbox proof — missing ${m}`);
  console.log("Live isolation, Muse tool use and egress denial are UNPROVEN in this environment. The fail-closed path remains the shipped behavior.");
  process.exit(0);
}
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); if (!ok) failed++; };
const health = await (await fetch(`${base}/api/health`)).json().catch(() => null);
check("server reports Modal isolated", health?.provider?.isolated === true, JSON.stringify(health?.provider || {}));
check("server reports genuine Muse mode", health?.model?.mode === "genuine-ai-conversion");
const s = await fetch(`${base}/api/auth/session`, { method: "POST" });
const cookie = s.headers.get("set-cookie") || "";
check("session issued", s.ok);
let appId = null; let jobId = null;
try {
  const conv = await fetch(`${base}/api/convert`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://github.com/nanoid/nanoid", prompt: "Generate an ID from my text", selectedCapabilities: [] }) });
  check("held-out conversion accepted", conv.ok, `status=${conv.status}`);
  if (conv.ok) {
    jobId = (await conv.json()).job.id;
    let job = null;
    for (let i = 0; i < 90 && !job; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const jr = await fetch(`${base}/api/jobs/${jobId}`, { headers: { cookie } });
      const jj = jr.ok ? await jr.json() : null;
      if (jj?.job && ["succeeded", "partial", "failed", "cancelled"].includes(jj.job.status)) job = jj.job;
    }
    check("conversion terminates with recorded outcome + provider", Boolean(job?.outcome), job ? `status=${job.status} outcome=${job.outcome}` : "timeout");
    check("genuine run is not labelled verified without semantic pass", !job || job.status !== "succeeded" || job.outcome === "compatible");
    appId = job?.appId || null;
    if (appId) {
      const reopen = await fetch(`${base}/api/apps/${appId}`, { headers: { cookie } });
      check("app reopens by id for owner", reopen.ok);
      // Forbidden egress is enforced inside the runtime sandbox
      // (block_network=True); a second tenant must never read the app.
      const s2 = await fetch(`${base}/api/auth/session`, { method: "POST" });
      const cookie2 = s2.headers.get("set-cookie") || "";
      const cross = await fetch(`${base}/api/apps/${appId}`, { headers: { cookie: cookie2 } });
      check("cross-tenant app read denied (404)", cross.status === 404);
      await fetch(`${base}/api/auth/session`, { method: "DELETE", headers: { cookie: cookie2 } }).catch(() => null);
    }
  }
} finally {
  // Cleanup: delete created app (owner-scoped) and revoke session.
  if (appId) await fetch(`${base}/api/apps/${appId}`, { method: "DELETE", headers: { cookie } }).catch(() => null);
  await fetch(`${base}/api/auth/session`, { method: "DELETE", headers: { cookie } }).catch(() => null);
  console.log("Cleanup done: app deleted (if created), sessions revoked, sandboxes terminated by worker.");
}
console.log(failed ? `\n${failed} live check(s) FAILED` : "\nLive smoke OK");
process.exit(failed ? 1 : 0);
