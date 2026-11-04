"use client";
import { useState } from "react";
import { ensureSession } from "@/components/session";
import Link from "next/link";
type App = { capabilityIds?: string[]; id: string; title: string; repo: string; prompt: string; studioUrl: string; operations: string[]; permissions: string[]; exec?: { opLabel: string } | null; ui: { fields: { id: string; label: string; placeholder?: string }[] } };
// Trusted renderer: Muse generates a validated manifest; only OpenOS
// components render it. Untrusted repo code never reaches the DOM.
export default function AppRenderer({ app }: { app: App }) {
  const [input, setInput] = useState(""); const [output, setOutput] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [consent, setConsent] = useState(false);
  if (!app.exec) return (<div className="rounded-lg border border-white/10 bg-[#141416] p-6"><p className="text-sm text-zinc-300">This app runs in its dedicated studio:</p><Link href={app.studioUrl} className="mt-3 inline-block rounded-md bg-[#e8ff47] px-5 py-2.5 font-semibold text-black">Open {app.title} →</Link></div>);
  async function run() {
    setBusy(true); setMsg(""); setOutput("");
    try {
      await ensureSession();
      const g = await (await fetch("/api/grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id, action: "execute" }) })).json();
      if (!g.grant) throw new Error(g.error || "Permission denied");
      setMsg("Permission granted for this single run (scoped, expiring, revocable). Executing in the isolated sandbox…");
      const r = await fetch("/api/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id, grantId: g.grant.id, input, operation: app.operations[0] }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Execution failed");
      setOutput(j.output); setMsg("Done. The grant was consumed — the app must ask again next run.");
    } catch (e) { setMsg(String(e instanceof Error ? e.message : e)); } finally { setBusy(false); }
  }
  return (<div className="rounded-lg border border-white/10 bg-[#141416] p-6">
    <p className="text-xs text-zinc-500">Permissions for this app: {app.permissions.join(", ") || "none"} · Runs isolated — no access to your files, credentials, or shell.</p>
    <label className="mt-4 block text-sm font-medium">{app.ui.fields[0]?.label || "Your text"}<textarea value={input} onChange={(e) => setInput(e.target.value)} rows={6} placeholder={app.ui.fields[0]?.placeholder} className="mt-2 w-full rounded-md border border-white/15 bg-white/5 p-3 text-sm outline-none focus:border-[#e8ff47]" /></label>
    {!consent ? <div className="mt-4 rounded-md border border-white/15 p-4 text-sm"><p>Use your text for this run?</p><p className="mt-1 text-zinc-400">App: {app.title} · Action: {app.exec.opLabel} · Runs once; revoke anytime in My Apps → Permission center.</p><div className="mt-3 flex gap-2"><button onClick={() => setConsent(true)} className="rounded-md bg-[#e8ff47] px-4 py-2 font-semibold text-black">Allow once</button><button onClick={() => setMsg("Cancelled — nothing ran.")} className="rounded-md border border-white/20 px-4 py-2">Cancel</button></div></div> : <button onClick={run} disabled={busy} className="mt-3 rounded-md bg-[#e8ff47] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? "Running…" : `Run: ${app.exec.opLabel}`}</button>}
    {msg && <p role="status" className="mt-3 text-sm text-zinc-300">{msg}</p>}
    {output && <div className="mt-4"><h3 className="text-sm font-semibold">Result</h3><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/40 p-3 text-sm">{output}</pre><button onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([output], { type: "text/plain" })); a.download = "openos-result.txt"; a.click(); }} className="mt-2 rounded-md border border-[#e8ff47] px-4 py-2 text-sm font-semibold text-[#e8ff47]">Download result</button></div>}
  </div>);
}
