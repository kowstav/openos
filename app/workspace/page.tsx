"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { policyTable, authorize, type Capability } from "@/lib/permissions";
type App = { id: string; title: string; repo: string; prompt: string; studioUrl: string; operations: string[]; permissions: string[]; blocked: string[]; createdAt: number };
type Saved = { title: string; want?: string; at: number };
export default function Page() {
  const [apps, setApps] = useState<App[]>(() => { try { return JSON.parse(localStorage.getItem("openos-apps-v2") || "[]"); } catch { return []; } }); const [items] = useState<Saved[]>(() => { try { return JSON.parse(localStorage.getItem("openos-blueprints") || "[]"); } catch { return []; } });
  const [check, setCheck] = useState(""); const [host, setHost] = useState(""); const [verdict, setVerdict] = useState(""); const [editId, setEditId] = useState(""); const [editPrompt, setEditPrompt] = useState("");
  const [serverApps, setServerApps] = useState<App[]>([]);
  useEffect(() => { fetch("/api/apps/list").then((r) => r.json()).then((j) => setServerApps(j.apps || [])).catch(() => {}); }, []);
  function save(next: App[]) { setApps(next); localStorage.setItem("openos-apps-v2", JSON.stringify(next)); }
  async function customize(app: App) {
    const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo: app.repo, prompt: editPrompt }) });
    const j = await res.json(); if (res.ok) save(apps.map((a) => (a.id === app.id ? { ...j.app, id: app.id, createdAt: app.createdAt } : a)));
    setEditId("");
  }
  async function runCheck() {
    const res = await fetch("/api/sandbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capability: check, host: host || undefined }) });
    const j = await res.json(); setVerdict(res.ok ? `${j.decision.toUpperCase()} — ${j.reason}` : j.error);
  }
  return (<div className="py-10"><h1 className="font-display text-4xl">My Apps</h1><p className="mt-2 max-w-xl leading-relaxed text-zinc-400">Your personal collection. Every app was generated from a real repository, checked by the permission gateway, and runs without local installation.</p>
  {serverApps.length > 0 && <><h2 className="font-display mt-8 text-2xl">Converted by the general engine</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{serverApps.map((a) => <article key={a.id} className="flex flex-col rounded-lg border border-[#e8ff47]/30 bg-[#141416] p-5"><h3 className="font-semibold">{a.title}</h3><p className="mt-1 text-xs text-zinc-500">{a.repo} · built by autonomous conversion</p><p className="mt-2 text-xs text-zinc-400">Workflow: {a.operations.join(" → ")}</p><div className="mt-4 flex gap-2"><Link href={`/app/${a.id}`} className="rounded-md bg-[#e8ff47] px-4 py-2 text-sm font-semibold text-black">Launch →</Link><button onClick={async () => { await fetch(`/api/apps/${a.id}`, { method: "DELETE" }); setServerApps(serverApps.filter((x) => x.id !== a.id)); }} className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-300">Remove</button></div></article>)}</div></>}
  <h2 className="font-display mt-8 text-2xl">Your generated apps</h2>
  {apps.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No generated apps yet — open a repository above and choose “Create my app”.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{apps.map((a) => <article key={a.id} className="flex flex-col rounded-lg border border-white/10 bg-[#141416] p-5">
    <h3 className="font-semibold">{a.title}</h3><p className="mt-1 text-xs text-zinc-500">{a.repo} · {new Date(a.createdAt).toLocaleString()}</p>
    {a.prompt && <p className="mt-2 text-sm italic text-zinc-400">“{a.prompt}”</p>}
    <p className="mt-2 text-xs text-zinc-400">Workflow: {a.operations.join(" → ") || "plan only"}</p>
    <p className="mt-1 text-xs text-zinc-500">Permissions: {a.permissions.join(", ") || "none"}{a.blocked?.length ? ` · Blocked: ${a.blocked.join("; ")}` : ""}</p>
    {editId === a.id ? <div className="mt-3 space-y-2"><textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={2} className="w-full rounded-md border border-white/15 bg-white/5 p-2 text-sm" aria-label="New description" /><div className="flex gap-2"><button onClick={() => customize(a)} className="rounded-md bg-[#e8ff47] px-3 py-1.5 text-sm font-semibold text-black">Regenerate</button><button onClick={() => setEditId("")} className="rounded-md border border-white/20 px-3 py-1.5 text-sm">Cancel</button></div></div> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href={a.studioUrl} className="rounded-md bg-[#e8ff47] px-4 py-2 text-sm font-semibold text-black">Launch →</Link>
      <button onClick={() => { setEditId(a.id); setEditPrompt(a.prompt); }} className="rounded-md border border-white/20 px-3 py-2 text-sm">Customize</button>
      <button onClick={() => save([{ ...a, id: Math.random().toString(36).slice(2, 10), title: `${a.title} (copy)`, createdAt: Date.now() }, ...apps])} className="rounded-md border border-white/20 px-3 py-2 text-sm">Duplicate</button>
      <button onClick={() => save(apps.filter((x) => x.id !== a.id))} className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-300">Remove</button>
    </div></article>)}</div>}
  <div className="mt-10 grid gap-4 sm:grid-cols-3">
    <article className="rounded-lg border border-[#e8ff47]/40 bg-[#141416] p-5"><h3 className="font-semibold">PDF Studio · pdf-lib</h3><p className="mt-1 text-sm text-zinc-400">Merge, split, rotate, watermark — or chain them into one workflow.</p><Link href="/studio/pdf" className="mt-4 inline-block rounded-md bg-[#e8ff47] px-4 py-2 text-sm font-semibold text-black">Launch →</Link></article>
    <article className="rounded-lg border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">Photo Studio · rembg idea</h3><p className="mt-1 text-sm text-zinc-400">AI background removal on-device. The remove.bg alternative.</p><Link href="/studio/image" className="mt-4 inline-block rounded-md border border-white/20 px-4 py-2 text-sm">Launch →</Link></article>
    <article className="rounded-lg border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">OCR Reader · Tesseract.js</h3><p className="mt-1 text-sm text-zinc-400">Extract text from images, in-browser.</p><Link href="/studio/ocr" className="mt-4 inline-block rounded-md border border-white/20 px-4 py-2 text-sm">Launch →</Link></article>
  </div>
  <h2 className="font-display mt-10 text-2xl">Saved blueprints & plans</h2>
  {items.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Nothing saved yet — analyze a repo and save its blueprint.</p> : <ul className="mt-3 space-y-2">{items.map((it, i) => <li key={i} className="rounded-md border border-white/10 bg-[#141416] p-4 text-sm"><strong>{it.title}</strong>{it.want && <span className="block text-zinc-400">{it.want}</span>}<span className="text-xs text-zinc-500">{new Date(it.at).toLocaleString()}</span></li>)}</ul>}
  <h2 className="font-display mt-10 text-2xl">Permission gateway & sandbox</h2>
  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">Deterministic rules in code — the AI model never grants access alone. Isolation: trusted adapters and browser WASM only; no arbitrary repository code runs. Uploads are capped at 15 MB, processed in memory, and never stored. Try to break it:</p>
  <div className="mt-4 overflow-hidden rounded-lg border border-white/10"><table className="w-full text-left text-sm"><thead><tr className="bg-white/5"><th className="p-3">Capability</th><th className="p-3">Decision</th></tr></thead><tbody>{policyTable().map((r) => <tr key={r.capability} className="border-t border-white/5"><td className="p-3 font-mono text-xs">{r.capability}</td><td className="p-3">{r.decision === "allow" ? "✅ Allow" : r.decision === "ask" ? "⚠️ Ask user" : "⛔ Deny"}</td></tr>)}</tbody></table></div>
  <div className="mt-4 flex flex-wrap gap-2"><input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="Try: shell:exec" aria-label="Capability to check" className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm" /><input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Network host (optional)" aria-label="Network host" className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm" /><button onClick={runCheck} disabled={!check} className="rounded-md bg-[#e8ff47] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">Test gateway</button><span className="py-2 text-sm">{check && !verdict && `Local preview → ${authorize(check as Capability)}`}</span></div>
  {verdict && <p role="status" className="mt-2 max-w-2xl rounded-md border border-white/10 bg-white/5 p-3 text-sm">{verdict}</p>}
  <p className="mt-3 text-xs text-zinc-500">Adversarial checks that must stay blocked: <button className="underline" onClick={() => { setCheck("shell:exec"); setVerdict(""); }}>shell:exec</button> · <button className="underline" onClick={() => { setCheck("credentials:read"); setVerdict(""); }}>credentials:read</button> · <button className="underline" onClick={() => { setCheck("network:github"); setHost("evil.example.com"); setVerdict(""); }}>network to evil.example.com</button>. Use “Test gateway” — the server enforces the same rules.</p>
  </div>);
}
