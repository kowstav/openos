// Separately runnable OpenOS worker: polls the durable job queue through
// the token-gated drain endpoint. Run any number of these processes —
// leases make claiming safe, and a worker that dies mid-build simply lets
// its lease expire for another worker to recover (attempts are capped).
//   OPENOS_URL=http://localhost:3000 OPENOS_WORKER_TOKEN=… node scripts/worker.mjs
const base = process.env.OPENOS_URL || "http://127.0.0.1:3000";
const token = process.env.OPENOS_WORKER_TOKEN || "";
const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 3000);
if (!token) { console.error("OPENOS_WORKER_TOKEN is required"); process.exit(1); }
console.log(`worker polling ${base} every ${intervalMs}ms`);
for (;;) {
  try {
    const r = await fetch(`${base}/api/jobs/drain`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) console.error(`drain ${r.status}`);
  } catch (e) { console.error(`drain failed: ${e.message}`); }
  await new Promise((r) => setTimeout(r, intervalMs));
}
