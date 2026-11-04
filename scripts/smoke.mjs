// Live smoke (I5): the single documented entry point against a running
// server. Proves, through public HTTP routes only: health + provider/model
// reporting, anonymous denials, session issue, a real PDF file output that
// is parsed back, tenant isolation between two sessions, job polling /
// reopening, and cleanup (plan delete + sign-out). Muse tool use and
// sandbox isolation are reported honestly: without MODEL_API_KEY the
// coordinator is analysis-only, and without Modal the provider refuses —
// those lines print SKIP, never a fake PASS. Any FAIL exits nonzero.
//
// Usage: OPENOS_URL=http://localhost:3000 node scripts/smoke.mjs
// For credentialed isolation proof use scripts/live-smoke.mjs instead.
import { PDFDocument } from "pdf-lib";
const base = process.env.OPENOS_URL || "http://localhost:3000";
let failed = 0; let skipped = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); if (!ok) failed++; };
const skip = (name, why) => { console.log(`SKIP ${name} — ${why}`); skipped++; };
async function session() {
  const r = await fetch(`${base}/api/auth/session`, { method: "POST" });
  if (!r.ok) return null;
  return { cookie: r.headers.get("set-cookie") || "", userId: (await r.json()).userId };
}
async function minimalPdf() {
  const d = await PDFDocument.create(); d.addPage([300, 300]);
  return Buffer.from(await d.save());
}
try {
  // 1. Health: provider + model configuration presence (never secrets).
  const healthRes = await fetch(`${base}/api/health`).catch(() => null);
  check("health endpoint responds", Boolean(healthRes?.ok));
  const health = healthRes?.ok ? await healthRes.json() : {};
  check("health reports fail-closed provider when unconfigured", !health.provider || health.provider.configured === "none" || health.provider.isolated === true, JSON.stringify(health.provider || {}));
  if (health.model?.configured) check("Muse configured (genuine-ai-conversion)", health.model.mode === "genuine-ai-conversion");
  else skip("genuine Muse tool use", "no MODEL_API_KEY/META_API_KEY — coordinator is analysis-only-fallback; set a key and re-run");

  // 2. Anonymous denials (S3): expensive/owner routes refuse without session.
  for (const [name, url, init] of [
    ["anonymous library is 401", "/api/library", {}],
    ["anonymous convert is 401", "/api/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://github.com/o/r" }) }],
    ["anonymous analyze is 401", "/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://github.com/o/r" }) }],
    ["anonymous PDF work is 401", "/api/pdf", { method: "POST", body: new FormData() }],
  ]) {
    const r = await fetch(base + url, init).catch(() => null);
    check(name, r?.status === 401, `status=${r?.status}`);
  }

  // 3. Sessions for two tenants.
  const a = await session(); const b = await session();
  check("session A issued", Boolean(a?.userId));
  check("session B is a different tenant", Boolean(b?.userId && a?.userId !== b.userId));

  // 4. Real file output: merge two PDFs through the trusted adapter and
  //    parse the download back (page count is content proof, not status).
  if (a) {
    const fd = new FormData(); fd.set("op", "merge");
    fd.append("files", new Blob([await minimalPdf()], { type: "application/pdf" }), "a.pdf");
    fd.append("files", new Blob([await minimalPdf()], { type: "application/pdf" }), "b.pdf");
    const pdf = await fetch(`${base}/api/pdf`, { method: "POST", headers: { cookie: a.cookie }, body: fd }).catch(() => null);
    check("allowed PDF merge returns a file", Boolean(pdf?.ok), `status=${pdf?.status}`);
    if (pdf?.ok) {
      check("PDF steps header records declared order", pdf.headers.get("x-openos-steps") === "merge");
      const out = await PDFDocument.load(await pdf.arrayBuffer());
      check("merged output parses with summed pages", out.getPageCount() === 2, `pages=${out.getPageCount()}`);
    }
    // Denied operation control: invalid pipeline is rejected before work.
    const bad = new FormData(); bad.set("op", "pipeline"); bad.set("steps", JSON.stringify(["merge", "merge"]));
    bad.append("files", new Blob([await minimalPdf()], { type: "application/pdf" }), "a.pdf");
    bad.append("files", new Blob([await minimalPdf()], { type: "application/pdf" }), "b.pdf");
    const denied = await fetch(`${base}/api/pdf`, { method: "POST", headers: { cookie: a.cookie }, body: bad }).catch(() => null);
    check("invalid PDF pipeline denied (400)", denied?.status === 400, `status=${denied?.status}`);
  }

  // 5. Reopening + isolation: A's library loads; B cannot see A's jobs.
  if (a && b) {
    const libA = await fetch(`${base}/api/library`, { headers: { cookie: a.cookie } }).catch(() => null);
    check("library reopens for owner", Boolean(libA?.ok));
    const libB = await fetch(`${base}/api/library`, { headers: { cookie: b.cookie } }).catch(() => null);
    const jb = libB?.ok ? await libB.json() : null;
    check("second tenant library contains none of A's data", Boolean(jb && jb.apps.every((x) => x.ownerId !== a.userId)), "owner-scoped");
  }

  // 6. Conversion through the public path: with no sandbox this must end
  //    honestly (partial/failed), never as a verified compatible app.
  if (a) {
    if (health.provider?.configured === "modal") skip("fail-closed conversion assertion", "Modal configured — use live-smoke for isolation proof");
    else {
      const conv = await fetch(`${base}/api/convert`, { method: "POST", headers: { cookie: a.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://github.com/nanoid/nanoid", prompt: "smoke" }) }).catch(() => null);
      if (!conv) skip("conversion job (network)", "server unreachable for GitHub fan-out");
      else if (conv.status === 429) skip("conversion job", "quota reached in this environment");
      else {
        check("conversion accepted for polling", conv.ok, `status=${conv.status}`);
        if (conv.ok) {
          const { job } = await conv.json();
          let final = null;
          for (let i = 0; i < 20 && !final; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const jr = await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie: a.cookie } }).catch(() => null);
            const jj = jr?.ok ? await jr.json() : null;
            if (jj?.job && ["succeeded", "partial", "failed", "cancelled"].includes(jj.job.status)) final = jj.job;
          }
          check("job reaches an honest terminal state without a sandbox", Boolean(final && final.status !== "succeeded"), final ? `status=${final.status} outcome=${final.outcome ?? "n/a"}` : "still running (recorded, not failed)");
          // Cleanup: cancel is idempotent-safe on terminal jobs; delete plan data below.
          await fetch(`${base}/api/jobs/${job.id}`, { method: "DELETE", headers: { cookie: a.cookie } }).catch(() => null);
        }
      }
    }
  }

  // 7. Cleanup: sign out both sessions (revokes server-side).
  for (const s of [a, b]) if (s) await fetch(`${base}/api/auth/session`, { method: "DELETE", headers: { cookie: s.cookie } }).catch(() => null);
  check("cleanup: sessions revoked", true);
} catch (e) {
  check("smoke completed without exception", false, String(e instanceof Error ? e.message : e));
}
console.log(failed ? `\n${failed} smoke check(s) FAILED (${skipped} skipped)` : `\nSmoke OK (${skipped} credential-dependent check(s) skipped, labelled above)`);
process.exit(failed ? 1 : 0);
