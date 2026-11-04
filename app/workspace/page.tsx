"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ensureSession, signIn, signOut, currentIdentity } from "@/components/session";
import ToolPreview from "@/components/ToolPreview";
import { previewFor } from "@/lib/preview";
type LibApp = { id: string; title: string; repo: string; prompt: string; operations: string[]; capabilityIds?: string[]; version: number; state?: string; commitSha?: string; lastUsedAt?: number; executionHistory?: { at: number; operation: string; outcome: string; detail: string }[] };
type Plan = { id: string; title: string; repoUrl: string; prompt: string; capabilityIds: string[] };
type Job = { id: string; repo: string; status: string; error?: string };
type Grant = { id: string; appId: string; action: string; purpose: string; expiresAt: number; revoked: boolean; usedCount: number; maxUses: number };
type Version = { id: string; version: number; createdAt: number; operations: string[] };
export default function Page() {
  const [apps, setApps] = useState<LibApp[]>([]); const [plans, setPlans] = useState<Plan[]>([]); const [jobs, setJobs] = useState<Job[]>([]); const [grants, setGrants] = useState<Grant[]>([]);
  const [msg, setMsg] = useState(""); const [who, setWho] = useState<{ userId: string; kind: string } | null>(null); const [handle, setHandle] = useState("");
  const [versions, setVersions] = useState<Record<string, Version[]>>({});
  const load = useCallback(() => ensureSession().then(() => fetch("/api/library")).then((r) => r.json()).then((j) => { setApps(j.apps || []); setPlans(j.plans || []); setJobs(j.jobs || []); setGrants(j.permissions || []); }).then(() => currentIdentity()).then(setWho).catch(() => {}), []);
  useEffect(() => { load().catch(() => setMsg("Your library could not be loaded.")); }, [load]);
  async function act(id: string, body: object, note: string) { const r = await fetch(`/api/apps/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); setMsg(r.ok ? note : (j.error || "That change could not be saved.")); await load(); }
  async function remove(id: string, title: string) { if (!confirm(`Delete “${title}” and its saved data? Other apps are not affected.`)) return; await fetch(`/api/apps/${id}`, { method: "DELETE" }); setMsg("App deleted. Your other apps, files and permissions were not touched."); await load(); }
  async function showVersions(id: string) { const r = await fetch(`/api/apps/${id}`); const j = await r.json().catch(() => ({})); setVersions((v) => ({ ...v, [id]: j.versions || [] })); }
  return (<div className="py-10"><h1 className="font-display text-4xl">My Apps</h1>
    <p className="mt-2 max-w-xl leading-relaxed text-[#5c5747]">Your saved plans and the apps you built. They stay with your sign-in, on any device.</p>
    <section aria-label="Your account" className="mt-5 max-w-xl rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6] p-4">
      {who?.kind === "account" ? <div className="flex flex-wrap items-center gap-3 text-sm"><span><strong>Signed in.</strong> This library follows you across browsers and devices.</span><button onClick={async () => { await signOut(); setWho(null); await load(); }} className="rounded-md border-2 border-[#1c1a14] px-3 py-1.5 font-semibold">Sign out</button></div>
      : <form onSubmit={async (e) => { e.preventDefault(); try { await signIn(handle); setMsg("Signed in — this is now your library everywhere."); await load(); } catch (err) { setMsg(String(err instanceof Error ? err.message : err)); } }} className="text-sm">
          <p><strong>Visiting as a guest.</strong> Sign in with a name or email to keep this same library on another browser or device. No password is needed in this development build — use a handle only you would type.</p>
          <div className="mt-2 flex gap-2"><label className="sr-only" htmlFor="handle">Name or email</label><input id="handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Name or email" className="min-w-0 flex-1 rounded-md border-2 border-[#1c1a14]/30 bg-white px-3 py-2" /><button className="rounded-md bg-[#d9e021] px-4 py-2 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Sign in</button></div>
        </form>}
    </section>
    {msg && <p role="status" className="mt-3 max-w-xl rounded-md bg-[#e9e1cd] px-3 py-2 text-sm">{msg}</p>}
    <h2 className="font-display mt-10 text-2xl">Your apps</h2>
    {apps.length === 0 ? <div className="mt-4 max-w-xl rounded-lg border-2 border-dashed border-[#1c1a14]/40 bg-[#fffdf6] p-6 text-center"><p className="text-[#5c5747]">Nothing here yet — your first app takes about a minute.</p><Link href="/" className="mt-3 inline-block rounded-md bg-[#d9e021] px-5 py-2.5 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Find a tool</Link></div>
    : <div className="mt-4 grid gap-5 sm:grid-cols-2">{apps.map((a) => <article key={a.id} className="flex flex-col overflow-hidden rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6]">
      <ToolPreview asset={previewFor(a.capabilityIds || [], a.title)} />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-lg font-bold">{a.title}</h3>
        <p className="mt-0.5 text-xs text-[#8a8268]">Version {a.version}{a.state === "suspended" ? " · Paused" : ""}{a.lastUsedAt ? ` · Last used ${new Date(a.lastUsedAt).toLocaleDateString()}` : ""}</p>
        <p className="mt-2 flex-1 text-sm text-[#3d392c]">{a.operations.length ? `Runs: ${a.operations.join(" → ")}` : "Plan only — open it to see the next step."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/app/${a.id}`} className="rounded-md bg-[#d9e021] px-5 py-2.5 text-sm font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Open</Link>
          <details className="text-sm"><summary className="cursor-pointer rounded-md border-2 border-[#1c1a14]/40 px-3 py-2 font-semibold">More actions</summary>
            <div className="mt-2 flex max-w-xs flex-col gap-2 rounded-md border border-[#e9e1cd] bg-[#f2ecdd] p-3">
              <form onSubmit={(e) => { e.preventDefault(); const t = new FormData(e.currentTarget).get("title"); if (t) act(a.id, { title: String(t) }, "Renamed."); }} className="flex gap-1"><input name="title" defaultValue={a.title} aria-label={`Rename ${a.title}`} className="min-w-0 flex-1 rounded-md border border-[#1c1a14]/30 bg-white px-2 py-1.5" /><button className="rounded-md border border-[#1c1a14]/40 px-2 py-1.5">Rename</button></form>
              <button onClick={() => act(a.id, { action: "duplicate" }, "Duplicated as its own app with its own history.")} className="rounded-md border border-[#1c1a14]/40 px-3 py-1.5 text-left">Duplicate</button>
              <form onSubmit={async (e) => { e.preventDefault(); const r = await fetch(`/api/apps/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rebuild" }) }); const j = await r.json(); if (j.rebuild) { await ensureSession(); await fetch("/api/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: j.rebuild.repoUrl, prompt: j.rebuild.prompt, selectedCapabilities: j.rebuild.capabilityIds, workflowOrder: j.rebuild.capabilityIds, appKey: j.rebuild.appKey }) }); setMsg("Rebuild started — the new version replaces this one only after it passes its checks. Watch Build history below."); await load(); } }}><button className="w-full rounded-md border border-[#1c1a14]/40 px-3 py-1.5 text-left">Rebuild to latest source</button></form>
              <button onClick={() => showVersions(a.id)} className="rounded-md border border-[#1c1a14]/40 px-3 py-1.5 text-left">Version history</button>
              {(versions[a.id] || []).map((v) => <div key={v.id} className="flex items-center justify-between gap-2 text-xs"><span>v{v.version} · {new Date(v.createdAt).toLocaleDateString()} · {v.operations.join(" → ") || "plan"}</span>{v.id !== a.id && <button onClick={() => act(a.id, { action: "rollback", targetId: v.id }, `Rolled back — published as a new version so history stays intact.`)} className="underline">Roll back</button>}</div>)}
              <button onClick={() => act(a.id, { state: a.state === "suspended" ? "ready" : "suspended" }, a.state === "suspended" ? "Resumed." : "Paused — it will not run until you resume it.")} className="rounded-md border border-[#1c1a14]/40 px-3 py-1.5 text-left">{a.state === "suspended" ? "Resume" : "Pause"}</button>
              <button onClick={() => remove(a.id, a.title)} className="rounded-md border border-[#8a2f23] px-3 py-1.5 text-left font-semibold text-[#8a2f23]">Delete app</button>
            </div></details>
        </div>
      </div></article>)}</div>}
    <h2 className="font-display mt-10 text-2xl">Saved plans</h2>
    <p className="mt-1 text-sm text-[#5c5747]">Plans are ideas you saved before building. They are not runnable apps yet.</p>
    {plans.length === 0 ? <p className="mt-3 text-sm text-[#5c5747]">No saved plans.</p> : <ul className="mt-3 space-y-2">{plans.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border-2 border-[#1c1a14]/30 bg-[#fffdf6] p-4 text-sm"><span><strong>{p.title}</strong><span className="block text-[#5c5747]">{p.prompt || "No description yet"}</span></span><span className="flex shrink-0 gap-2"><Link href={`/repo?url=${encodeURIComponent(p.repoUrl)}`} className="rounded-md bg-[#d9e021] px-3 py-1.5 font-bold text-[#1c1a14] ring-1 ring-[#1c1a14]">Build it</Link><button onClick={async () => { await fetch(`/api/library?planId=${p.id}`, { method: "DELETE" }); await load(); }} className="rounded-md border border-[#8a2f23] px-3 py-1.5 text-[#8a2f23]">Delete</button></span></li>)}</ul>}
    <h2 className="font-display mt-10 text-2xl">Build history</h2>
    {jobs.length === 0 ? <p className="mt-3 text-sm text-[#5c5747]">No builds yet.</p> : <ul className="mt-3 space-y-2 text-sm">{jobs.map((j) => <li key={j.id} className="rounded-lg border-2 border-[#1c1a14]/20 bg-[#fffdf6] p-3">{j.repo} — {j.status === "succeeded" ? "Ready" : j.status}{j.error ? <span className="block text-[#8a2f23]">{j.error}</span> : null}</li>)}</ul>}
    <h2 className="font-display mt-10 text-2xl">Permissions</h2>
    <p className="mt-1 max-w-xl text-sm text-[#5c5747]">Each permission covers one app, one action and one purpose, then expires. Revoking stops it right away.</p>
    {grants.length === 0 ? <p className="mt-3 text-sm text-[#5c5747]">No active permissions.</p> : <ul className="mt-3 space-y-2 text-sm">{grants.map((g) => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-[#1c1a14]/20 bg-[#fffdf6] p-3"><span>{g.purpose} · used {g.usedCount} of {g.maxUses} · {g.revoked ? "Revoked" : `until ${new Date(g.expiresAt).toLocaleTimeString()}`}</span>{!g.revoked && <button onClick={async () => { await fetch(`/api/grants?id=${g.id}`, { method: "DELETE" }); await load(); }} className="font-semibold text-[#8a2f23]">Revoke access</button>}</li>)}</ul>}
  </div>);
}
