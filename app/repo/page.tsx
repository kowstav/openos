"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
const Graph = dynamic(() => import("@/components/CapabilityGraph"), { ssr: false });
import { ensureSession } from "@/components/session";
import ToolPreview from "@/components/ToolPreview";
import { previewFor } from "@/lib/preview";
type Cap = { id: string; label: string; description: string; executable: boolean };
type GraphData = { repo: string; commitSha: string; capabilities: Cap[] };
const EXAMPLES: Record<string, string> = {
  "pdf-lib": "Merge my invoices in order, add our company name as a watermark, and set the document title",
  "rembg": "Remove backgrounds, center each product on white, and resize everything for my shop",
  "tesseract": "Extract the text from scanned receipts so I can search it",
};
function Inner() {
  const sp = useSearchParams(); const router = useRouter(); const url = sp.get("url") || "";
  const [data, setData] = useState<{ repo: { fullName: string; stars: number; forks: number; language: string; license: string }; blueprint: import("@/lib/schemas").Blueprint; graph: GraphData; graphRevision: string; source: string } | null>(null);
  const [err, setErr] = useState(""); const [want, setWant] = useState(""); const [appName, setAppName] = useState("");
  const [selected, setSelected] = useState<string[]>([]); const [building, setBuilding] = useState(false); const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<{ status: string; steps: { name: string; status: string; detail: string }[]; appId?: string; error?: string } | null>(null);
  const [genMsg, setGenMsg] = useState("");
  useEffect(() => { if (!url) return; ensureSession().then(() => fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Analysis failed"); setData(j); }).catch((e) => setErr(String(e.message))); }, [url]);
  // Draft survives reloads and navigation: restore name, description, steps.
  // Saving stays off until the restore has run, so a reload can never wipe
  // the saved draft with the page's initial empty state.
  const draftReady = useRef(false);
  useEffect(() => { const t = setTimeout(() => { try { const d = JSON.parse(localStorage.getItem(`openos-draft:${url}`) || "null"); if (d) { setWant(d.want || ""); setAppName(d.appName || ""); setSelected(Array.isArray(d.selected) ? d.selected : []); } } catch { /* fresh draft */ } draftReady.current = true; }, 0); return () => clearTimeout(t); }, [url]);
  useEffect(() => { if (!draftReady.current) return; try { localStorage.setItem(`openos-draft:${url}`, JSON.stringify({ want, appName, selected })); } catch { /* storage unavailable */ } }, [url, want, appName, selected]);
  if (err) return <div className="py-16"><p role="alert" className="max-w-xl rounded-lg border-2 border-[#8a2f23] bg-[#fffdf6] p-5 text-[#8a2f23]">{/403|rate/i.test(err) ? "GitHub is limiting repository lookups right now. Wait a minute, then try again — your place here is saved." : err}</p><Link className="mt-4 inline-block font-semibold underline" href="/">← Back to Discover</Link></div>;
  if (!data) return <p role="status" className="py-16 text-[#5c5747]">Looking at this repository — fetching its real files and license…</p>;
  const { repo, blueprint: bp, graph, source } = data;
  const caps = graph?.capabilities || [];
  const executable = caps.filter((c) => c.executable);
  const canBuild = executable.length > 0;
  const exampleKey = Object.keys(EXAMPLES).find((k) => repo.fullName.toLowerCase().includes(k)) || "";
  const studioFor = /pdf-lib/i.test(repo.fullName) ? "/studio/pdf" : /rembg/i.test(repo.fullName) ? "/studio/image" : /tesseract/i.test(repo.fullName) ? "/studio/ocr" : "";
  async function createApp() {
    setBuilding(true); setGenMsg(""); setJob(null);
    try {
      await ensureSession();
      const res = await fetch("/api/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, prompt: want, selectedCapabilities: selected, workflowOrder: selected, options: { appName: appName.trim() || undefined } }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || "Conversion failed to start");
      const id = j.job.id; setJobId(id);
      for (let i = 0; i < 160; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const jr = await (await fetch(`/api/jobs/${id}`)).json(); setJob(jr.job);
        if (["succeeded", "partial", "failed", "cancelled"].includes(jr.job.status)) {
          if (jr.job.appId) { setGenMsg(jr.job.status === "succeeded" ? "Built and checked. Opening your app…" : "Finished with limits — the build details below explain exactly what works."); setTimeout(() => router.push(`/app/${jr.job.appId}`), 900); }
          else setGenMsg(jr.job.error || "This could not be built into a runnable app here. The build details below give the reason.");
          break;
        }
      }
    } catch (e) { setGenMsg(String(e instanceof Error ? e.message : e)); } finally { setBuilding(false); }
  }
  async function cancel() { if (jobId) await fetch(`/api/jobs/${jobId}`, { method: "DELETE" }).catch(() => {}); setGenMsg("Cancelling — the build will stop at its next step."); }
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const move = (i: number, d: number) => setSelected((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const labelOf = (id: string) => caps.find((c) => c.id === id)?.label || id;
  return (<div className="py-10">
    <Link href="/" className="text-sm font-medium text-[#5c5747] hover:text-[#1c1a14]">← Discover</Link>
    <div className="mt-5 grid items-start gap-8 lg:grid-cols-2">
      <div><ToolPreview asset={previewFor(caps.map((c) => c.id), repo.fullName)} large />
        <p className="mt-3 text-sm text-[#5c5747]">From <strong className="text-[#1c1a14]">{repo.fullName}</strong> · {repo.language} · {repo.license} · ★ {repo.stars.toLocaleString()}</p></div>
      <div>
        <h1 className="font-display text-4xl leading-tight">{caps[0]?.label ? `${caps[0].label} and more` : bp.purpose}</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-[#3d392c]">{bp.purpose}</p>
        <p className="mt-2 text-sm text-[#5c5747]">{source === "muse-wonder-1.0" ? "Analyzed by Meta Muse from the real source at this commit." : "Summarized from the repository files (AI analysis is not configured here)."}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {studioFor && canBuild && <Link href={studioFor} className="rounded-md bg-[#d9e021] px-5 py-2.5 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Try a sample</Link>}
          {canBuild ? <a href="#build" className="rounded-md border-2 border-[#1c1a14] bg-[#fffdf6] px-5 py-2.5 font-semibold">Create my app</a> : <a href="#requirements" className="rounded-md border-2 border-[#1c1a14] bg-[#fffdf6] px-5 py-2.5 font-semibold">View requirements</a>}
        </div>
        <h2 className="mt-7 text-lg font-bold">What it can do</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-[#3d392c]">{caps.slice(0, 6).map((c) => <li key={c.id}>{c.executable ? "✓" : "—"} {c.label} — <span className="text-[#5c5747]">{c.description.slice(0, 110)}</span></li>)}</ul>
      </div>
    </div>
    <section className="mt-10"><h2 className="font-display text-2xl">Choose what your app does</h2>
      <p className="mt-1 text-sm text-[#5c5747]">Pick steps and put them in order. The map and the list are the same choices — use whichever you prefer.</p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Graph bp={{ ...bp, capabilities: caps.map((c) => ({ id: c.id, name: c.label, description: c.description })) }} selected={selected} onToggle={(id) => toggle(id)} />
        <div className="rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6] p-5"><h3 className="font-bold">Steps, in plain words</h3>
          <ul className="mt-3 space-y-2.5">{caps.map((c) => <li key={c.id}><button onClick={() => toggle(c.id)} aria-pressed={selected.includes(c.id)} disabled={!c.executable} className={`w-full rounded-md border-2 px-3 py-2.5 text-left text-sm ${selected.includes(c.id) ? "border-[#1c1a14] bg-[#d9e021] font-bold" : "border-[#1c1a14]/25 hover:border-[#1c1a14]"} disabled:opacity-50`}><span className="block">{selected.includes(c.id) ? "✓ " : ""}{c.label}{c.executable ? "" : " (not runnable here)"}</span><span className="block text-xs font-normal text-[#5c5747]">{c.description.slice(0, 140)}</span></button></li>)}</ul>
          {selected.length > 0 && <div className="mt-4"><p className="text-sm font-bold">Your app will run, in this order:</p>
            <ol className="mt-2 space-y-1.5 text-sm">{selected.map((s, i) => <li key={s} className="flex flex-wrap items-center gap-2 rounded-md bg-[#f2ecdd] px-3 py-2"><span>{i + 1}. {labelOf(s)}</span><span className="ml-auto flex gap-1"><button type="button" aria-label={`Move ${labelOf(s)} up`} onClick={() => move(i, -1)} className="rounded border border-[#1c1a14]/40 px-2 py-1">↑</button><button type="button" aria-label={`Move ${labelOf(s)} down`} onClick={() => move(i, 1)} className="rounded border border-[#1c1a14]/40 px-2 py-1">↓</button><button type="button" aria-label={`Remove ${labelOf(s)}`} onClick={() => toggle(s)} className="rounded border border-[#1c1a14]/40 px-2 py-1">Remove</button></span></li>)}</ol>
            <button type="button" onClick={() => setSelected([])} className="mt-2 text-sm underline">Clear steps</button></div>}
        </div>
      </div>
    </section>
    <section id="build" className="mt-10 max-w-3xl rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6] p-6">
      <h2 className="font-display text-2xl">Make it yours</h2>
      {exampleKey && <p className="mt-2 text-sm text-[#5c5747]">For example: <button onClick={() => setWant(EXAMPLES[exampleKey])} className="font-medium text-[#1c1a14] underline">{EXAMPLES[exampleKey]}</button></p>}
      <label className="mt-4 block text-sm font-bold">App name<input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. Invoice Merger" className="mt-1.5 w-full rounded-md border-2 border-[#1c1a14]/30 bg-white px-3 py-2.5 font-normal outline-none focus:border-[#1c1a14]" /></label>
      <label className="mt-4 block text-sm font-bold">How should your app work?<textarea value={want} onChange={(e) => setWant(e.target.value)} placeholder="Describe the job in your own words" aria-label="How should your app work?" className="mt-1.5 w-full rounded-md border-2 border-[#1c1a14]/30 bg-white p-3 text-sm font-normal outline-none focus:border-[#1c1a14]" rows={3} /></label>
      {job && <div className="mt-4" aria-live="polite"><p className="text-sm font-bold">{job.status === "running" ? "Building your app…" : `Build ${job.status}`}</p>
        <details className="mt-2"><summary className="cursor-pointer text-sm font-medium">Build details</summary>
          <ol className="mt-2 space-y-1.5 text-sm">{job.steps.map((s) => <li key={s.name} className={s.status === "failed" ? "text-[#8a2f23]" : "text-[#3d392c]"}>{s.status === "done" ? "✓" : s.status === "failed" ? "✕" : "…"} <strong>{s.name}</strong><span className="block pl-4 text-xs text-[#5c5747]">{s.detail}</span></li>)}</ol></details></div>}
      {genMsg && <p role="status" className="mt-3 rounded-md bg-[#f2ecdd] px-3 py-2 text-sm">{genMsg}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={createApp} disabled={building || (canBuild && selected.length === 0)} className="rounded-md bg-[#d9e021] px-5 py-2.5 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14] disabled:opacity-50">{building ? "Building…" : canBuild ? "Create my app" : "Save the plan"}</button>
        {building && <button onClick={cancel} className="rounded-md border-2 border-[#1c1a14] px-5 py-2.5 text-sm font-semibold">Cancel build</button>}
        <button onClick={async () => { await ensureSession(); const r = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: appName || repo.fullName, repoUrl: url, prompt: want, capabilityIds: selected }) }); setGenMsg(r.ok ? "Saved to My Apps → Saved plans." : "That could not be saved. Try again."); }} className="rounded-md border-2 border-[#1c1a14]/40 px-5 py-2.5 text-sm font-semibold">Save plan only</button>
      </div>
      {canBuild && selected.length === 0 && <p className="mt-2 text-sm text-[#5c5747]">Choose at least one step above first — your app runs exactly what you pick, in your order.</p>}
      <details id="requirements" className="mt-5 text-sm"><summary className="cursor-pointer font-bold">Technical details, license and requirements</summary>
        <div className="mt-2 space-y-2 text-[#3d392c]"><p>{bp.licenseNotes}</p><p>Source: {repo.fullName} at the pinned commit shown in your build details. {bp.architecture || bp.summary}</p>
        {bp.risks?.length > 0 && <ul className="list-disc pl-5">{bp.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>}
        {bp.commercialAlternatives?.length > 0 && <div><p className="font-bold">Compared with paid tools</p><ul className="mt-1 space-y-1">{bp.commercialAlternatives.map((a, i) => <li key={i}><strong>{a.name}</strong> — {a.note}</li>)}</ul></div>}</div></details>
    </section>
  </div>);
}
export default function Page() { return <Suspense fallback={<p className="py-16">Loading…</p>}><Inner /></Suspense>; }
