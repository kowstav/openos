"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
type Repo = { owner: string; repo: string; label: string; blurb: string; stars: number | null; language: string; license: string; description: string; category: string; replaces: { name: string; price: string }[]; covered: string[]; missing: string[]; runnable: boolean; studio?: string; adapterNote: string };
const EXAMPLES = ["Replace remove.bg", "Merge invoices into one PDF", "Transcribe a podcast", "Extract text from a screenshot"];
export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]); const [q, setQ] = useState(""); const [cat, setCat] = useState("All"); const [url, setUrl] = useState(""); const [err, setErr] = useState(""); const router = useRouter();
  useEffect(() => { fetch("/api/catalog").then((r) => r.json()).then((j) => setRepos(j.repos || [])).catch(() => {}); }, []);
  const cats = useMemo(() => ["All", ...Array.from(new Set(repos.map((r) => r.category)))], [repos]);
  const shown = repos.filter((r) => (cat === "All" || r.category === cat) && (r.label + r.description + r.repo + r.category + r.replaces.map((x) => x.name).join(" ") + r.covered.join(" ")).toLowerCase().includes(q.toLowerCase().replace(/^replace /, "")));
  return (<div>
    <section className="py-12 md:py-16">
      <p className="text-sm font-medium text-[#e8ff47]">Open-source, without the setup.</p>
      <h1 className="font-display mt-3 max-w-2xl text-5xl leading-[1.04] md:text-6xl">Stop renting software.<br />Start owning it.</h1>
      <p className="mt-4 max-w-xl leading-relaxed text-zinc-400">Search for the paid tool you want to replace. OpenOS finds the open-source alternative, shows exactly what it covers, and Muse turns it into an app made for you — no install, no code.</p>
      <div className="mt-6 flex max-w-xl flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => setQ(e.replace(/^Replace /, ""))} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:border-[#e8ff47] hover:text-[#e8ff47]">{e}</button>)}</div>
      <form className="mt-6 flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); if (!url.trim()) { setErr("Paste a GitHub URL first."); return; } router.push(`/repo?url=${encodeURIComponent(url.trim())}`); }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste any GitHub URL — https://github.com/Hopding/pdf-lib" aria-label="GitHub repository URL" className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#e8ff47]" />
        <button className="shrink-0 rounded-md bg-[#e8ff47] px-5 font-semibold text-black">Analyze →</button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-red-300">{err}</p>}
      <p className="mt-3 text-xs text-zinc-500">Analysis by Meta Muse (muse-wonder-1.0) when configured — always labeled honestly. Execution is isolated; your files are never stored.</p>
    </section>
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl">Replace paid software</h2><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a paid tool, problem, or capability…" aria-label="Search marketplace" className="w-full max-w-xs rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#e8ff47]" /></div>
      <div className="mt-4 flex flex-wrap gap-2">{cats.map((c) => <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={`rounded-full border px-3 py-1.5 text-xs ${cat === c ? "border-[#e8ff47] bg-[#e8ff47] font-semibold text-black" : "border-white/15 text-zinc-300 hover:border-white/40"}`}>{c}</button>)}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r) => (<article key={r.repo} className="flex flex-col rounded-lg border border-white/10 bg-[#141416] p-5">
          <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{r.label}</h3><span className="shrink-0 text-xs text-zinc-400">{r.stars === null ? "★ —" : `★ ${r.stars.toLocaleString()}`}</span></div>
          <p className="mt-1 text-xs text-zinc-500">{r.owner}/{r.repo} · {r.language} · {r.license}</p>
          <p className="mt-2 text-xs font-medium text-[#e8ff47]">Replaces {r.replaces.map((x) => `${x.name} (${x.price})`).join(" · ")}</p>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-300">{r.description || r.blurb}</p>
          <ul className="mt-3 space-y-1 text-xs text-zinc-400">{r.covered.slice(0, 3).map((c) => <li key={c}>✓ {c}</li>)}{r.missing.slice(0, 1).map((m) => <li key={m} className="text-zinc-500">✕ {m}</li>)}</ul>
          <div className="mt-4 flex gap-2">
            <button onClick={() => router.push(`/repo?url=${encodeURIComponent(`https://github.com/${r.owner}/${r.repo}`)}`)} className="flex-1 rounded-md border border-white/20 py-2 text-sm hover:border-[#e8ff47] hover:text-[#e8ff47]">View blueprint →</button>
            {r.runnable && r.studio && <button onClick={() => router.push(r.studio!)} className="rounded-md bg-[#e8ff47] px-3 py-2 text-sm font-semibold text-black">Try it</button>}
          </div>
          {!r.runnable && <p className="mt-2 text-[11px] leading-snug text-zinc-500">Analysis & honest plan — not yet runnable in OpenOS.</p>}
        </article>))}
        {!repos.length && <p className="text-sm text-zinc-500">Loading live GitHub data…</p>}
        {repos.length > 0 && !shown.length && <p className="text-sm text-zinc-500">No matches. Try a paid tool name like “remove.bg” or a problem like “merge pdf”.</p>}
      </div>
    </section>
  </div>);
}
