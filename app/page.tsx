"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
type Repo = { owner: string; repo: string; label: string; blurb: string; stars: number | null; language: string; license: string; description: string };
export default function Home() {
  const [repos, setRepos] = useState<Repo[]>([]); const [q, setQ] = useState(""); const [url, setUrl] = useState(""); const [err, setErr] = useState(""); const router = useRouter();
  useEffect(() => { fetch("/api/github?list=1").then((r) => r.json()).then((j) => setRepos(j.repos || [])).catch(() => {}); }, []);
  const shown = repos.filter((r) => (r.label + r.description + r.repo).toLowerCase().includes(q.toLowerCase()));
  return (<div>
    <section className="py-14">
      <p className="text-sm text-[#e8ff47]">Open-source, without the setup.</p>
      <h1 className="font-display mt-3 max-w-2xl text-5xl leading-[1.05] md:text-6xl">Software on GitHub,<br />usable by anyone.</h1>
      <p className="mt-4 max-w-xl text-zinc-400">Paste a repository. OpenOS explains what it does, shows how it works, and — for supported libraries — turns it into an app you can use right here.</p>
      <form className="mt-8 flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); if (!url.trim()) { setErr("Paste a GitHub URL first."); return; } router.push(`/repo?url=${encodeURIComponent(url.trim())}`); }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/Hopding/pdf-lib" aria-label="GitHub repository URL" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#e8ff47]" />
        <button className="shrink-0 rounded-lg bg-[#e8ff47] px-5 font-semibold text-black">Analyze →</button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-red-300">{err}</p>}
      <p className="mt-3 text-xs text-zinc-500">Try it: analysis is powered by Meta Muse (muse-wonder-1.0) when configured, and always labeled honestly.</p>
    </section>
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl">Marketplace</h2><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — try “pdf” or “ocr”" aria-label="Search marketplace" className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#e8ff47]" /></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r) => (<article key={r.repo} className="flex flex-col rounded-xl border border-white/10 bg-[#141416] p-5">
          <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{r.label}</h3><span className="text-xs text-zinc-400">{r.stars === null ? "★ —" : `★ ${r.stars.toLocaleString()}`}</span></div>
          <p className="mt-1 text-xs text-zinc-500">{r.owner}/{r.repo} · {r.language} · {r.license}</p>
          <p className="mt-3 flex-1 text-sm text-zinc-300">{r.description || r.blurb}</p>
          <button onClick={() => router.push(`/repo?url=${encodeURIComponent(`https://github.com/${r.owner}/${r.repo}`)}`)} className="mt-4 rounded-lg border border-white/20 py-2 text-sm hover:border-[#e8ff47] hover:text-[#e8ff47]">View blueprint →</button>
        </article>))}
        {!repos.length && <p className="text-sm text-zinc-500">Loading live GitHub data…</p>}
        {repos.length > 0 && !shown.length && <p className="text-sm text-zinc-500">No matches. Try a different search.</p>}
      </div>
    </section>
  </div>);
}
