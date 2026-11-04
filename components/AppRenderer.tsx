"use client";
import { useState } from "react";
import { ensureSession } from "@/components/session";
import Link from "next/link";
type Field = { id: string; label: string; type?: string; placeholder?: string; options?: string[] };
type App = { capabilityIds?: string[]; id: string; title: string; repo: string; prompt: string; studioUrl: string; operations: string[]; steps?: { op: string; label: string }[]; permissions: string[]; exec?: { opLabel: string } | null; ui: { fields: Field[]; outputType?: string } };
// Trusted renderer: Muse generates a validated manifest; only OpenOS
// components render it. Untrusted repo code never reaches the DOM.
export default function AppRenderer({ app }: { app: App }) {
  const [input, setInput] = useState(""); const [output, setOutput] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [consent, setConsent] = useState(false);
  if (!app.exec) return (<div className="rounded-lg border border-[#1c1a14] bg-[#fffdf6] p-6"><p className="text-sm text-[#3d392c]">This app runs in its dedicated studio:</p><Link href={app.studioUrl} className="mt-3 inline-block rounded-md bg-[#d9e021] ring-2 ring-[#1c1a14] px-5 py-2.5 font-semibold text-black">Open {app.title} →</Link></div>);
  async function run() {
    setBusy(true); setMsg(""); setOutput("");
    try {
      await ensureSession();
      const g = await (await fetch("/api/grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id, action: "execute" }) })).json();
      if (!g.grant) throw new Error(g.error || "Permission denied");
      setMsg("Allowed for this one run. Running now…");
      const r = await fetch("/api/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id, grantId: g.grant.id, input, operation: app.operations[0] }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Execution failed");
      setOutput(j.output); setMsg("Done. That permission is finished — the app will ask again next time.");
    } catch (e) { setMsg(String(e instanceof Error ? e.message : e)); } finally { setBusy(false); }
  }
  return (<div className="rounded-lg border border-[#1c1a14] bg-[#fffdf6] p-6">
    <p className="text-xs text-[#5c5747]">Permissions for this app: {app.permissions.join(", ") || "none"} · Runs in an isolated workspace — no access to your files or accounts.</p>
    {(app.steps?.length || app.operations.length > 1) ? <p className="mt-3 text-sm text-[#3d392c]">This app runs, in order: <strong>{(app.steps?.map((s) => s.label) || app.operations).join(" → ")}</strong></p> : null}
    {app.ui.fields.map((f) => f.type === "select" ? (
      <label key={f.id} className="mt-4 block text-sm font-medium">{f.label}<select value={input} onChange={(e) => setInput(e.target.value)} className="mt-2 w-full rounded-md border border-[#1c1a14]/30 bg-white p-3 text-sm outline-none focus:border-[#1c1a14]">{(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
    ) : f.type === "number" || f.type === "text" ? (
      <label key={f.id} className="mt-4 block text-sm font-medium">{f.label}<input type={f.type} value={input} onChange={(e) => setInput(e.target.value)} placeholder={f.placeholder} className="mt-2 w-full rounded-md border border-[#1c1a14]/30 bg-white p-3 text-sm outline-none focus:border-[#1c1a14]" /></label>
    ) : (
      <label key={f.id} className="mt-4 block text-sm font-medium">{f.label}<textarea value={input} onChange={(e) => setInput(e.target.value)} rows={6} placeholder={f.placeholder} className="mt-2 w-full rounded-md border border-[#1c1a14]/30 bg-white p-3 text-sm outline-none focus:border-[#1c1a14]" /></label>
    ))}
    {!consent ? <div className="mt-4 rounded-md border border-[#1c1a14]/25 p-4 text-sm"><p>Use your text for this run?</p><p className="mt-1 text-zinc-400">App: {app.title} · Action: {app.exec.opLabel} · Runs once; revoke anytime in My Apps → Permission center.</p><div className="mt-3 flex gap-2"><button onClick={() => setConsent(true)} className="rounded-md bg-[#d9e021] ring-2 ring-[#1c1a14] px-4 py-2 font-semibold text-black">Allow once</button><button onClick={() => setMsg("Cancelled — nothing ran.")} className="rounded-md border border-[#1c1a14]/40 px-4 py-2">Cancel</button></div></div> : <button onClick={run} disabled={busy} className="mt-3 rounded-md bg-[#d9e021] ring-2 ring-[#1c1a14] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? "Running…" : `Run: ${app.exec.opLabel}`}</button>}
    {msg && <p role="status" className="mt-3 text-sm text-[#3d392c]">{msg}</p>}
    {output && <div className="mt-4"><h3 className="text-sm font-semibold">Result</h3>{app.ui.outputType === "html"
      ? <div className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-[#1c1a14]/25 bg-[#f2ecdd] p-3 text-sm"><code>{output}</code><p className="mt-2 text-xs text-[#5c5747]">Shown as text — generated markup is never run in your browser.</p></div>
      : <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-[#1c1a14]/25 bg-[#f2ecdd] p-3 text-sm">{app.ui.outputType === "json" ? (() => { try { return JSON.stringify(JSON.parse(output), null, 2); } catch { return output; } })() : output}</pre>}
      <button onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([output], { type: "text/plain" })); a.download = "openos-result.txt"; a.click(); }} className="mt-2 rounded-md border-2 border-[#1c1a14] px-4 py-2 text-sm font-semibold">Download result (.txt)</button></div>}
  </div>);
}
