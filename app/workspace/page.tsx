"use client";
import { useState } from "react";
import Link from "next/link";
import { policyTable, authorize, type Capability } from "@/lib/permissions";
export default function Page() {
  type Saved = { title: string; want?: string; at: number }; const [items] = useState<Saved[]>(() => { try { return JSON.parse(localStorage.getItem("openos-blueprints") || "[]"); } catch { return []; } }); const [check, setCheck] = useState("");
  return (<div className="py-10"><h1 className="font-display text-4xl">My Apps</h1><p className="mt-2 text-zinc-400">Launch supported apps, revisit saved blueprints and plans.</p>
  <div className="mt-6 grid gap-4 sm:grid-cols-2">
    <article className="rounded-xl border border-[#e8ff47]/40 bg-[#141416] p-5"><h3 className="font-semibold">PDF Studio · pdf-lib</h3><p className="mt-1 text-sm text-zinc-400">Merge, split, rotate, watermark PDFs.</p><Link href="/studio/pdf" className="mt-4 inline-block rounded-lg bg-[#e8ff47] px-4 py-2 text-sm font-semibold text-black">Launch →</Link></article>
    <article className="rounded-xl border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">OCR Reader · Tesseract.js</h3><p className="mt-1 text-sm text-zinc-400">Extract text from images, in-browser.</p><Link href="/studio/ocr" className="mt-4 inline-block rounded-lg border border-white/20 px-4 py-2 text-sm">Launch →</Link></article>
  </div>
  <h2 className="font-display mt-10 text-2xl">Saved blueprints</h2>
  {items.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Nothing saved yet — analyze a repo and save its blueprint.</p> : <ul className="mt-3 space-y-2">{items.map((it, i) => <li key={i} className="rounded-lg border border-white/10 bg-[#141416] p-4 text-sm"><strong>{it.title}</strong>{it.want && <span className="block text-zinc-400">{it.want}</span>}<span className="text-xs text-zinc-500">{new Date(it.at).toLocaleString()}</span></li>)}</ul>}
  <h2 className="font-display mt-10 text-2xl">Permission gateway</h2>
  <p className="mt-1 max-w-xl text-sm text-zinc-400">Deterministic rules — the AI model never grants access alone. Try checking a capability:</p>
  <div className="mt-4 overflow-hidden rounded-xl border border-white/10"><table className="w-full text-left text-sm"><thead><tr className="bg-white/5"><th className="p-3">Capability</th><th className="p-3">Decision</th></tr></thead><tbody>{policyTable().map((r) => <tr key={r.capability} className="border-t border-white/5"><td className="p-3 font-mono text-xs">{r.capability}</td><td className="p-3">{r.decision === "allow" ? "✅ Allow" : r.decision === "ask" ? "⚠️ Ask user" : "⛔ Deny"}</td></tr>)}</tbody></table></div>
  <div className="mt-4 flex gap-2"><input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="shell:exec" aria-label="Capability to check" className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" /><span className="py-2 text-sm">{check && `→ ${authorize(check as Capability)}`}</span></div>
  </div>);
}
