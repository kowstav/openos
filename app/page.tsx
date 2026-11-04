"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ToolPreview from "@/components/ToolPreview";
import { previewFor } from "@/lib/preview";
import { statusLabel } from "@/lib/status";
type Repo = { owner: string; repo: string; label: string; blurb: string; stars: number | null; language: string; license: string; description: string; category: string; collection: string; capabilityIds: string[]; covered: string[]; missing: string[]; comparisons: { product: string; coveredFeatures: string[]; missingFeatures: string[] }[]; processing: string; costNote: string; evidenceAsOf: string; runnable: boolean; studio?: string; adapterNote: string; reasons?: string[] };
const EXAMPLES = ["merge pdf", "remove background", "transcribe audio", "extract text from image"];
export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]); const [q, setQ] = useState(""); const [cat, setCat] = useState("All"); const [url, setUrl] = useState(""); const [err, setErr] = useState(""); const [loadErr, setLoadErr] = useState(""); const router = useRouter();
  function load(query: string, collection: string) {
    fetch(`/api/catalog?q=${encodeURIComponent(query)}&collection=${encodeURIComponent(collection)}`).then((r) => r.json()).then((j) => { setRepos(j.repos || []); setLoadErr(""); }).catch(() => setLoadErr("The catalog could not be loaded."));
  }
  useEffect(() => { fetch("/api/catalog").then((r) => r.json()).then((j) => setRepos(j.repos || [])).catch(() => setLoadErr("The catalog could not be loaded.")); }, []);
  const cats = ["All", "Documents", "Images", "Audio", "Writing"];
  return (<div>
    <section className="py-12 md:py-16">
      <h1 className="font-display mt-3 max-w-2xl text-5xl leading-[1.04] md:text-6xl">What would you like to do?</h1>
      <p className="mt-4 max-w-xl leading-relaxed text-zinc-400">Find a tool by the job, the capability, a paid product, a project name, or paste a GitHub link. Every result shows what it covers, what it misses, where your files are processed, and what it costs to run.</p>
      <form className="mt-6 flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); load(q, cat); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try ‘merge PDFs’ or paste a GitHub link" aria-label="Find a tool" className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#e8ff47]" />
        <button className="shrink-0 rounded-md bg-[#e8ff47] px-5 font-semibold text-black">Find a tool</button>
      </form>
      <div className="mt-4 flex max-w-xl flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => { setQ(e); load(e, cat); }} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:border-[#e8ff47] hover:text-[#e8ff47]">{e}</button>)}</div>
      <form className="mt-4 flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); if (!url.trim()) { setErr("Paste a GitHub URL first."); return; } router.push(`/repo?url=${encodeURIComponent(url.trim())}`); }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste any GitHub URL — https://github.com/Hopding/pdf-lib" aria-label="GitHub repository URL" className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#e8ff47]" />
        <button className="shrink-0 rounded-md border border-white/20 px-5">Analyze →</button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-red-300">{err}</p>}
    </section>
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl">Tools you can use</h2></div>
      <div className="mt-4 flex flex-wrap gap-2">{cats.map((c) => <button key={c} onClick={() => { setCat(c); load(q, c); }} aria-pressed={cat === c} className={`rounded-full border px-3 py-1.5 text-xs ${cat === c ? "border-[#e8ff47] bg-[#e8ff47] font-semibold text-black" : "border-white/15 text-zinc-300 hover:border-white/40"}`}>{c}</button>)}</div>
      {loadErr && <div className="mt-5 rounded-md border border-red-400/40 p-4 text-sm text-red-200">{loadErr} <button onClick={() => load(q, cat)} className="ml-2 underline">Retry</button></div>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {repos.map((r) => (<article key={r.repo} className="flex flex-col rounded-lg border border-white/10 bg-[#141416] p-5">
          <ToolPreview asset={previewFor(r.capabilityIds, r.label)} />
          <div className="mt-3 flex items-start justify-between gap-2"><h3 className="font-semibold">{r.covered[0] || r.label}</h3><span className="shrink-0 text-xs text-[#e8ff47]">{statusLabel(r.runnable).label}</span></div>
          <p className="mt-1 text-xs text-zinc-500">{r.owner}/{r.repo}</p>
          {r.reasons?.length ? <p className="mt-2 text-xs text-[#e8ff47]">{r.reasons[0]}</p> : null}
          <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-300">{r.description || r.blurb}</p>
          <ul className="mt-3 space-y-1 text-xs text-zinc-400">{r.covered.slice(0, 3).map((c) => <li key={c}>✓ {c}</li>)}{r.missing.slice(0, 1).map((m) => <li key={m} className="text-zinc-500">✕ {m}</li>)}</ul>
          <p className="mt-2 text-[11px] leading-snug text-zinc-500">{r.processing} {r.costNote} Evidence checked {r.evidenceAsOf}.</p>
          <details className="mt-2 text-xs text-zinc-400"><summary className="cursor-pointer">Feature comparison</summary>{r.comparisons.map((c) => <div key={c.product} className="mt-2"><strong className="text-zinc-200">{c.product}</strong><span className="block">Covers: {c.coveredFeatures.join(", ")}</span><span className="block text-zinc-500">Missing: {c.missingFeatures.join(", ")}</span></div>)}</details>
          <div className="mt-4 flex gap-2">
            <button onClick={() => router.push(`/repo?url=${encodeURIComponent(`https://github.com/${r.owner}/${r.repo}`)}`)} className="flex-1 rounded-md border border-white/20 py-2 text-sm hover:border-[#e8ff47] hover:text-[#e8ff47]">View tool →</button>
            {r.runnable && r.studio && <button onClick={() => router.push(r.studio!)} className="rounded-md bg-[#e8ff47] px-3 py-2 text-sm font-semibold text-black">Try it</button>}
          </div>
          {!r.runnable && <p className="mt-2 text-[11px] leading-snug text-zinc-500">{r.adapterNote}</p>}
        </article>))}
        {!loadErr && repos.length === 0 && <div className="text-sm text-zinc-500"><p>No matches for that search.</p><button onClick={() => { setQ(""); setCat("All"); load("", "All"); }} className="mt-2 underline">Clear filters</button></div>}
      </div>
    </section>
  </div>);
}
