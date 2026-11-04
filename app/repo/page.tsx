"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
const Graph = dynamic(() => import("@/components/CapabilityGraph"), { ssr: false });
const capId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "capability";
import { ensureSession } from "@/components/session";
import ToolPreview from "@/components/ToolPreview";
import { previewFor } from "@/lib/preview";
const SUGGESTIONS: Record<string, string[]> = {
  "pdf-lib": ["Build me an invoice processor that merges PDFs, applies a watermark with our company name, and stamps the title", "Extract page 1 of each contract as its own PDF", "Rotate sideways scans and merge them into one document"],
  "rembg": ["Build me a product photo editor that removes backgrounds, resizes images, and exports marketplace-ready photos on white", "Remove the background and give me a transparent PNG", "Resize product photos for Etsy at 1200px"],
  "tesseract": ["Create a reader that extracts text from screenshots so I can search it", "Extract text from a scanned receipt"],
};
function Inner() {
  const sp = useSearchParams(); const router = useRouter(); const url = sp.get("url") || "";
  const [data, setData] = useState<{ repo: { fullName: string; stars: number; forks: number; language: string; license: string }; blueprint: import("@/lib/schemas").Blueprint; source: string; cachedTokens?: number } | null>(null);
  const [err, setErr] = useState(""); const [want, setWant] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [stage, setStage] = useState(-1); const [genMsg, setGenMsg] = useState("");
  const [job, setJob] = useState<{ status: string; steps: { name: string; skill?: string; status: string; detail: string }[]; appId?: string; error?: string } | null>(null);
  useEffect(() => { if (!url) return; ensureSession().then(() => fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Analysis failed"); setData(j); }).catch((e) => setErr(String(e.message))); }, [url]);
  if (err) return <p role="alert" className="py-16 text-red-300">{err} <Link className="underline" href="/">← Back</Link></p>;
  if (!data) return <p className="py-16 text-zinc-400">Analyzing repository — fetching live GitHub data…</p>;
  const { repo, blueprint: bp, source } = data;
  const supported = bp.supported || /pdf-lib|tesseract|rembg/i.test(repo.fullName);
  const key = Object.keys(SUGGESTIONS).find((k) => repo.fullName.toLowerCase().includes(k)) || "";
  async function createApp() {
    setStage(0); setGenMsg(""); setJob(null);
    try {
      await ensureSession();
      const res = await fetch("/api/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, prompt: want, selectedCapabilities: selected }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || "Conversion failed to start");
      const id = j.job.id;
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const jr = await (await fetch(`/api/jobs/${id}`)).json(); setJob(jr.job); setStage(jr.job.steps.length);
        if (["succeeded", "partial", "failed", "cancelled"].includes(jr.job.status)) {
          if (jr.job.appId) { setGenMsg(jr.job.status === "succeeded" ? "Built and verified. Opening your app…" : "Built with limitations — see the build log."); setTimeout(() => router.push(`/app/${jr.job.appId}`), 900); }
          else setGenMsg(jr.job.error || "Conversion finished without a runnable app — the build log explains exactly why. Nothing was faked.");
          break;
        }
      }
    } catch (e) { setGenMsg(String(e instanceof Error ? e.message : e)); setStage(-1); }
  }
  return (<div className="py-10">
    <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Marketplace</Link>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-4xl">{bp.capabilities[0]?.name || bp.purpose}</h1><p className="mt-1 text-sm text-zinc-500">{repo.fullName}</p><p className="mt-2 max-w-2xl leading-relaxed text-zinc-400">{bp.purpose}</p><div className="mt-3 max-w-xl"><ToolPreview asset={previewFor(bp.capabilities.map((c) => capId(c.name)), repo.fullName)} /></div></div>
    <div className="text-right text-sm text-zinc-400"><div>★ {repo.stars.toLocaleString()} · Forks {repo.forks.toLocaleString()}</div><div>{repo.language} · {repo.license}</div></div></div>
    <p className="mt-3 inline-block rounded-full border border-white/15 px-3 py-1 text-xs text-zinc-300">{source === "muse-wonder-1.0" ? "✦ Analyzed by Meta Muse · muse-wonder-1.0" : "Deterministic summary (no MODEL_API_KEY configured — not AI-generated)"}{data.cachedTokens ? ` · ${data.cachedTokens} cached tokens` : ""}</p>
    <section className="mt-8"><h2 className="mb-1 font-display text-xl">Capability map</h2><p className="mb-3 text-sm text-zinc-500">Click capabilities to shape your app. Inputs flow in, outputs flow out, locks show what the app may touch.</p><Graph bp={bp} selected={selected} onToggle={(n) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]))} /></section>
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      <section className="rounded-lg border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">Capabilities</h3><p className="text-xs text-zinc-500">The graph above and this keyboard-accessible list select the same capability IDs.</p><ul className="mt-3 space-y-3 text-sm">{bp.capabilities.map((c, i) => { const id = capId(c.name); return <li key={i}><button onClick={() => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} aria-pressed={selected.includes(id)} className={`text-left ${selected.includes(id) ? "text-[#e8ff47]" : ""}`}><strong>{selected.includes(id) ? "✓ " : ""}{c.name}</strong><span className="block text-xs text-zinc-500">{id}</span><span className="block text-zinc-400">{c.description}</span></button></li>; })}</ul>
      <h3 className="mt-5 font-semibold">Architecture</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">{bp.architecture || bp.summary}</p></section>
      <section className="rounded-lg border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">Good for</h3><ul className="mt-2 list-disc pl-5 text-sm text-zinc-300">{(bp.applications.length ? bp.applications : ["General-purpose library — see README"]).map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
      <h3 className="mt-5 font-semibold">Permissions & license</h3><p className="mt-2 text-sm text-zinc-400">{bp.licenseNotes}</p><ul className="mt-2 text-sm text-zinc-300">{bp.permissions.map((p: string, i: number) => <li key={i}>🔒 {p}</li>)}</ul>
      {bp.risks?.length > 0 && <><h3 className="mt-5 font-semibold">Considerations</h3><ul className="mt-2 list-disc pl-5 text-sm text-zinc-400">{bp.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></>}</section>
    </div>
    {bp.commercialAlternatives?.length > 0 && <section className="mt-6 rounded-lg border border-white/10 bg-[#141416] p-5"><h3 className="font-semibold">Commercial alternatives</h3><p className="text-xs text-zinc-500">Feature parity is not implied — compare before switching.</p><ul className="mt-3 space-y-2 text-sm">{bp.commercialAlternatives.map((a, i) => <li key={i}><strong>{a.name}</strong> <span className="text-xs text-zinc-500">{a.verified ? "· verified" : "· AI suggestion"}</span><span className="block text-zinc-400">{a.note}</span></li>)}</ul></section>}
    <section className="mt-6 rounded-lg border border-[#e8ff47]/40 bg-[#141416] p-5">
      <h3 className="font-display text-xl">Describe your app — Muse builds it</h3>
      <p className="mt-1 text-sm text-zinc-400">{supported ? "This library has a vetted OpenOS adapter. Your words become a real workflow — try it:" : "No vetted adapter yet. OpenOS will draft an honest implementation plan — it will not pretend to deploy untested code."}</p>
      {SUGGESTIONS[key]?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{SUGGESTIONS[key].map((s) => <button key={s} onClick={() => setWant(s)} className="rounded-full border border-white/15 px-3 py-1.5 text-left text-xs text-zinc-300 hover:border-[#e8ff47] hover:text-[#e8ff47]">{s}</button>)}</div>}
      <label className="mt-3 block text-sm font-medium">How should your app work?<textarea value={want} onChange={(e) => setWant(e.target.value)} placeholder="e.g. Build me an invoice processor that merges PDFs and stamps each with our company name" aria-label="How should your app work?" className="mt-2 w-full rounded-md border border-white/15 bg-white/5 p-3 text-sm outline-none focus:border-[#e8ff47]" rows={3} /></label>
      {selected.length > 0 && <div className="mt-3 text-sm"><p>Selected steps in order:</p><ol className="mt-1 space-y-1">{selected.map((s, i) => <li key={s} className="flex items-center gap-2">{i + 1}. {s}<button type="button" aria-label={`Move ${s} up`} onClick={() => { const n = [...selected]; if (i > 0) { [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSelected(n); } }}>↑</button><button type="button" aria-label={`Move ${s} down`} onClick={() => { const n = [...selected]; if (i < n.length - 1) { [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSelected(n); } }}>↓</button><button type="button" aria-label={`Remove ${s}`} onClick={() => setSelected(selected.filter((x) => x !== s))}>Remove</button></li>)}</ol><button type="button" onClick={() => setSelected([])} className="mt-2 underline">Undo selection</button>{selected.some((s) => s.includes("merge")) && <p className="mt-2 text-amber-200">Merging needs at least two files — the PDF workspace will ask for them before running.</p>}</div>}
      {job && <ol className="mt-4 space-y-2 text-sm" aria-live="polite">{job.steps.map((s) => <li key={s.name} className={s.status === "failed" ? "text-red-300" : s.status === "done" ? "text-zinc-400" : "font-medium text-[#e8ff47]"}>{s.status === "done" ? "✓" : s.status === "failed" ? "✕" : s.status === "skipped" ? "—" : "◉"} <strong>{s.name}</strong>{s.skill ? <span className="text-zinc-500"> · skill: {s.skill}</span> : null}<span className="block pl-5 text-xs font-normal text-zinc-500">{s.detail}</span></li>)}{job.status === "running" && <li className="text-[#e8ff47]">◉ Muse is working…</li>}</ol>}
      {!job && stage >= 0 && <p className="mt-4 text-sm text-[#e8ff47]">Starting conversion…</p>}
      {genMsg && <p role="status" className="mt-3 text-sm text-amber-200">{genMsg}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={createApp} disabled={stage >= 0} className="rounded-md bg-[#e8ff47] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{stage >= 0 ? "Building…" : supported ? "Create my app →" : "Save implementation plan"}</button>
        <button onClick={async () => { await ensureSession(); const r = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: repo.fullName, repoUrl: url, prompt: want, capabilityIds: selected }) }); setGenMsg(r.ok ? "Saved to My Apps." : "Save failed — check you are signed in."); }} className="rounded-md border border-white/20 px-5 py-2.5 text-sm">Save blueprint</button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Creation runs the permission gateway before launch. Blocked capabilities are reported, never silently granted.</p>
    </section>
  </div>);
}
export default function Page() { return <Suspense fallback={<p className="py-16">Loading…</p>}><Inner /></Suspense>; }
