"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ToolPreview from "@/components/ToolPreview";
import { previewFor } from "@/lib/preview";
import { statusLabel } from "@/lib/status";
type Repo = { owner: string; repo: string; label: string; blurb: string; stars: number | null; language: string; license: string; description: string; category: string; collection: string; capabilityIds: string[]; covered: string[]; missing: string[]; comparisons: { product: string; coveredFeatures: string[]; missingFeatures: string[] }[]; processing: string; costNote: string; evidenceAsOf: string; runnable: boolean; studio?: string; adapterNote: string; reasons?: string[] };
const EXAMPLES = ["merge invoices", "remove background", "transcribe audio", "extract text from image"];
const isRepoUrl = (s: string) => /github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(s) || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.trim());
export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]); const [q, setQ] = useState(""); const [cat, setCat] = useState("All");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading"); const [searched, setSearched] = useState(false);
  const seq = useRef(0); const router = useRouter();
  function load(query: string, collection: string) {
    const mine = ++seq.current; setState("loading");
    fetch(`/api/catalog?q=${encodeURIComponent(query)}&collection=${encodeURIComponent(collection)}`)
      .then(async (r) => { if (!r.ok) throw new Error(`Catalog ${r.status}`); return r.json(); })
      .then((j) => { if (seq.current !== mine) return; setRepos(j.repos || []); setState("ready"); })
      .catch(() => { if (seq.current !== mine) return; setState("error"); });
  }
  useEffect(() => { const t = setTimeout(() => load("", "All"), 0); return () => clearTimeout(t); }, []);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (isRepoUrl(v)) { router.push(`/repo?url=${encodeURIComponent(v.startsWith("http") ? v : `https://github.com/${v}`)}`); return; }
    setSearched(true); load(v, cat);
  }
  const cats = ["All", "Documents", "Images", "Audio", "Writing"];
  const hero = repos.find((r) => r.repo === "pdf-lib") || repos[0];
  return (<div>
    <section className="py-10 md:py-14">
      <h1 className="font-display max-w-2xl text-5xl leading-[1.04] md:text-6xl">What would you like to do?</h1>
      <p className="mt-4 max-w-xl leading-relaxed text-[#5c5747]">Describe the job, name a tool you pay for, or paste a GitHub link. OpenOS finds open-source software that does it and turns it into an app shaped around your work.</p>
      <form className="mt-6 flex max-w-xl gap-2" onSubmit={submit} role="search">
        <label className="sr-only" htmlFor="find-tool">Find a tool</label>
        <input id="find-tool" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try ‘merge PDFs’ or paste a GitHub link" className="min-w-0 flex-1 rounded-md border-2 border-[#1c1a14] bg-[#fffdf6] px-4 py-3 outline-none placeholder:text-[#8a8268]" />
        <button className="shrink-0 rounded-md bg-[#d9e021] px-5 py-3 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Find a tool</button>
      </form>
      <div className="mt-4 flex max-w-xl flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => { setQ(e); setSearched(true); load(e, cat); }} className="rounded-full border border-[#1c1a14]/40 bg-[#fffdf6] px-3 py-1.5 text-xs hover:border-[#1c1a14]">{e}</button>)}</div>
      {hero && <div className="mt-10 grid items-center gap-6 md:grid-cols-2">
        <ToolPreview asset={previewFor(hero.capabilityIds, hero.label)} large />
        <div><p className="text-sm font-semibold" style={{ color: "#c2512f" }}>Worth trying first</p>
          <h2 className="font-display mt-1 text-3xl">{hero.covered[0] || hero.label}</h2>
          <p className="mt-2 max-w-md leading-relaxed text-[#5c5747]">{hero.description || hero.blurb}</p>
          <p className="mt-2 text-sm text-[#5c5747]">{hero.processing}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {hero.studio && <Link href={hero.studio} className="rounded-md bg-[#d9e021] px-5 py-2.5 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Try it now</Link>}
            <button onClick={() => router.push(`/repo?url=${encodeURIComponent(`https://github.com/${hero.owner}/${hero.repo}`)}`)} className="rounded-md border-2 border-[#1c1a14] bg-[#fffdf6] px-5 py-2.5 font-semibold">See how it works</button>
          </div></div>
      </div>}
    </section>
    <section aria-label="Tools">
      <h2 className="font-display text-2xl">Tools you can use</h2>
      <div className="mt-4 flex flex-wrap gap-2">{cats.map((c) => <button key={c} onClick={() => { setCat(c); load(q, c); }} aria-pressed={cat === c} className={`rounded-full border-2 px-3 py-1.5 text-xs ${cat === c ? "border-[#1c1a14] bg-[#d9e021] font-bold text-[#1c1a14]" : "border-[#1c1a14]/30 bg-[#fffdf6] hover:border-[#1c1a14]"}`}>{c}</button>)}</div>
      {state === "loading" && <p role="status" className="mt-6 text-sm text-[#5c5747]">Loading tools…</p>}
      {state === "error" && <div role="alert" className="mt-6 max-w-xl rounded-lg border-2 border-[#8a2f23] bg-[#fffdf6] p-4 text-sm"><strong>The tool list could not be loaded.</strong><span className="block text-[#5c5747]">Check your connection, then try again.</span><button onClick={() => load(q, cat)} className="mt-3 rounded-md bg-[#d9e021] px-4 py-2 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Retry</button></div>}
      {state === "ready" && repos.length === 0 && <div className="mt-6 text-sm"><p>{searched ? `No tools match “${q}”. Try different words, or paste a GitHub link above.` : "No tools in this collection yet."}</p><button onClick={() => { setQ(""); setCat("All"); setSearched(false); load("", "All"); }} className="mt-2 font-semibold underline">Clear filters</button></div>}
      {state === "ready" && repos.length > 0 && <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {repos.map((r) => (<article key={r.repo} className="flex flex-col overflow-hidden rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6]">
          <ToolPreview asset={previewFor(r.capabilityIds, r.label)} />
          <div className="flex flex-1 flex-col p-4">
            <div className="flex items-start justify-between gap-2"><h3 className="text-lg font-bold leading-snug">{r.covered[0] || r.label}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.runnable ? "bg-[#d9e021] text-[#1c1a14]" : "bg-[#e9e1cd] text-[#5c5747]"}`}>{statusLabel(r.runnable).label}</span></div>
            <p className="mt-1 text-xs text-[#8a8268]">{r.owner}/{r.repo}</p>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-[#3d392c]">{r.missing[0] ? `Good for this job. Note: ${r.missing[0].charAt(0).toLowerCase() + r.missing[0].slice(1)}.` : (r.description || r.blurb)}</p>
            <p className="mt-2 text-xs text-[#5c5747]">{r.costNote}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => router.push(`/repo?url=${encodeURIComponent(`https://github.com/${r.owner}/${r.repo}`)}`)} className="flex-1 rounded-md border-2 border-[#1c1a14] py-2.5 text-sm font-semibold hover:bg-[#f2ecdd]">View tool</button>
              {r.runnable && r.studio && <Link href={r.studio} className="rounded-md bg-[#d9e021] px-4 py-2.5 text-sm font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Try it</Link>}
            </div>
            {!r.runnable && <p className="mt-2 text-xs leading-snug text-[#5c5747]">{r.adapterNote}</p>}
            <details className="mt-3 text-xs text-[#5c5747]"><summary className="cursor-pointer font-medium text-[#1c1a14]">Compare and details</summary>
              <ul className="mt-2 space-y-1">{r.covered.slice(0, 3).map((c) => <li key={c}>Covers: {c}</li>)}{r.missing.slice(0, 2).map((m) => <li key={m}>Missing: {m}</li>)}</ul>
              {r.comparisons.map((c) => <p key={c.product} className="mt-2"><strong className="text-[#1c1a14]">vs {c.product}:</strong> covers {c.coveredFeatures.join(", ").toLowerCase()}; missing {c.missingFeatures.join(", ").toLowerCase()}.</p>)}
              <p className="mt-2">{r.processing} Evidence checked {r.evidenceAsOf}. License and source are on the tool page.</p></details>
          </div>
        </article>))}
      </div>}
    </section>
  </div>);
}
