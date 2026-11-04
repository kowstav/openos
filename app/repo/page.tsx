"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
const Graph = dynamic(() => import("@/components/CapabilityGraph"), { ssr: false });
function Inner() {
  const sp = useSearchParams(); const url = sp.get("url") || "";
  const [data, setData] = useState<{ repo: { fullName: string; stars: number; forks: number; language: string; license: string }; blueprint: import("@/lib/schemas").Blueprint; source: string; cachedTokens?: number } | null>(null); const [err, setErr] = useState(""); const [want, setWant] = useState("");
  useEffect(() => { if (!url) return; fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Analysis failed"); setData(j); }).catch((e) => setErr(String(e.message))); }, [url]);
  if (err) return <p role="alert" className="py-16 text-red-300">{err} <Link className="underline" href="/">← Back</Link></p>;
  if (!data) return <p className="py-16 text-zinc-400">Analyzing repository — fetching live GitHub data…</p>;
  const { repo, blueprint: bp, source } = data;
  const supported = bp.supported || /pdf-lib|tesseract/i.test(repo.fullName);
  const studio = /tesseract/i.test(repo.fullName) ? "/studio/ocr" : "/studio/pdf";
  return (<div className="py-10">
    <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Marketplace</Link>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-4xl">{repo.fullName}</h1><p className="mt-2 max-w-2xl text-zinc-400">{bp.purpose}</p></div>
    <div className="text-right text-sm text-zinc-400"><div>★ {repo.stars.toLocaleString()} · Forks {repo.forks.toLocaleString()}</div><div>{repo.language} · {repo.license}</div></div></div>
    <p className="mt-3 inline-block rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300">{source === "muse-wonder-1.0" ? "✦ Analyzed by Meta Muse · muse-wonder-1.0" : "Deterministic summary (no MODEL_API_KEY configured — not AI-generated)"}{data.cachedTokens ? ` · ${data.cachedTokens} cached tokens` : ""}</p>
    <section className="mt-8"><h2 className="mb-3 font-display text-xl">How it works</h2><Graph bp={bp} /></section>
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      <section className="rounded-xl border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">Capabilities</h3><ul className="mt-3 space-y-3 text-sm">{bp.capabilities.map((c, i) => <li key={i}><strong>{c.name}</strong><span className="block text-zinc-400">{c.description}</span></li>)}</ul>
      <h3 className="mt-5 font-semibold">Architecture</h3><p className="mt-2 text-sm text-zinc-400">{bp.architecture || bp.summary}</p></section>
      <section className="rounded-xl border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">Good for</h3><ul className="mt-2 list-disc pl-5 text-sm text-zinc-300">{(bp.applications.length ? bp.applications : ["General-purpose library — see README"]).map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
      <h3 className="mt-5 font-semibold">Permissions & license</h3><p className="mt-2 text-sm text-zinc-400">{bp.licenseNotes}</p><ul className="mt-2 text-sm text-zinc-300">{bp.permissions.map((p: string, i: number) => <li key={i}>🔒 {p}</li>)}</ul>
      {bp.risks?.length > 0 && <><h3 className="mt-5 font-semibold">Considerations</h3><ul className="mt-2 list-disc pl-5 text-sm text-zinc-400">{bp.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></>}</section>
    </div>
    {bp.commercialAlternatives?.length > 0 && <section className="mt-6 rounded-xl border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">Commercial alternatives</h3><p className="text-xs text-zinc-500">Feature parity is not implied — compare before switching.</p><ul className="mt-3 space-y-2 text-sm">{bp.commercialAlternatives.map((a, i) => <li key={i}><strong>{a.name}</strong> <span className="text-xs text-zinc-500">{a.verified ? "· verified" : "· AI suggestion"}</span><span className="block text-zinc-400">{a.note}</span></li>)}</ul></section>}
    <section className="mt-6 rounded-xl border border-[#e8ff47]/40 bg-[#141416] p-5">
      <h3 className="font-display text-xl">Make it yours</h3>
      <p className="mt-1 text-sm text-zinc-400">{supported ? "This library has a vetted OpenOS adapter. Describe what you need, then launch it." : "No vetted adapter yet. OpenOS will draft an honest implementation plan — it will not pretend to deploy untested code."}</p>
      <textarea value={want} onChange={(e) => setWant(e.target.value)} placeholder="e.g. Merge invoices and stamp each with our company name" aria-label="Describe your app" className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm outline-none focus:border-[#e8ff47]" rows={3} />
      <div className="mt-3 flex flex-wrap gap-2">
        {supported ? <Link href={studio} className="rounded-lg bg-[#e8ff47] px-5 py-2.5 font-semibold text-black">Launch app →</Link> : <button onClick={() => { const plan = { title: repo.fullName, want, url, at: Date.now() }; const old = JSON.parse(localStorage.getItem("openos-blueprints") || "[]"); localStorage.setItem("openos-blueprints", JSON.stringify([plan, ...old])); alert("Saved to My Apps as an implementation plan (not deployed)."); }} className="rounded-lg border border-[#e8ff47] px-5 py-2.5 font-semibold text-[#e8ff47]">Save implementation plan</button>}
        <button onClick={() => { const item = { title: repo.fullName, want, url, at: Date.now() }; const old = JSON.parse(localStorage.getItem("openos-blueprints") || "[]"); localStorage.setItem("openos-blueprints", JSON.stringify([item, ...old])); alert("Saved to My Apps."); }} className="rounded-lg border border-white/20 px-5 py-2.5 text-sm">Save blueprint</button>
      </div>
    </section>
  </div>);
}
export default function Page() { return <Suspense fallback={<p className="py-16">Loading…</p>}><Inner /></Suspense>; }
