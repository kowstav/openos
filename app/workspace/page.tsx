"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ensureSession } from "@/components/session";
type LibApp = { id: string; title: string; repo: string; prompt: string; operations: string[]; version: number; state?: string; commitSha?: string; lastUsedAt?: number; executionHistory?: { at: number; operation: string; outcome: string; detail: string }[] };
type Plan = { id: string; title: string; repoUrl: string; prompt: string; capabilityIds: string[] };
type Job = { id: string; repo: string; status: string; error?: string };
type Grant = { id: string; appId: string; action: string; purpose: string; expiresAt: number; revoked: boolean; usedCount: number; maxUses: number };
export default function Page() {
  const [apps, setApps] = useState<LibApp[]>([]); const [plans, setPlans] = useState<Plan[]>([]); const [jobs, setJobs] = useState<Job[]>([]); const [grants, setGrants] = useState<Grant[]>([]); const [msg, setMsg] = useState("");
  const load = useCallback(() => ensureSession().then(() => fetch("/api/library")).then((r) => r.json()).then((j) => { setApps(j.apps || []); setPlans(j.plans || []); setJobs(j.jobs || []); setGrants(j.permissions || []); }), []);
  useEffect(() => { ensureSession().then(() => fetch("/api/library")).then((r) => r.json()).then((j) => { setApps(j.apps || []); setPlans(j.plans || []); setJobs(j.jobs || []); setGrants(j.permissions || []); }).catch(() => setMsg("Your library could not be loaded.")); }, []);
  async function act(id: string, body: object, note: string) { const r = await fetch(`/api/apps/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setMsg(r.ok ? note : "That change could not be saved."); await load(); }
  async function remove(id: string) { await fetch(`/api/apps/${id}`, { method: "DELETE" }); setMsg("App and its stored data were deleted."); await load(); }
  return (<div className="py-10"><h1 className="font-display text-4xl">My Apps</h1>
  <p className="mt-2 max-w-xl leading-relaxed text-zinc-400">One library for your saved plans and converted apps. It follows your sign-in across sessions and devices.</p>
  {msg && <p role="status" className="mt-3 text-sm text-amber-200">{msg}</p>}
  <h2 className="font-display mt-8 text-2xl">Your apps</h2>
  {apps.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No apps yet. <Link className="underline" href="/">Find a tool</Link> to make your first one.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{apps.map((a) => <article key={a.id} className="flex flex-col rounded-lg border border-white/10 bg-[#141416] p-5">
    <h3 className="font-semibold">{a.title}</h3><p className="mt-1 text-xs text-zinc-500">{a.repo} · v{a.version}{a.commitSha ? ` · ${a.commitSha.slice(0, 7)}` : ""}{a.state === "suspended" ? " · Suspended" : ""}</p>
    <p className="mt-2 text-xs text-zinc-400">Steps: {a.operations.join(" → ") || "plan only"}</p>
    {a.executionHistory?.length ? <p className="mt-1 text-xs text-zinc-500">Last run: {a.executionHistory[0].operation} — {a.executionHistory[0].outcome}</p> : null}
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href={`/app/${a.id}`} className="rounded-md bg-[#e8ff47] px-4 py-2 text-sm font-semibold text-black">Open</Link>
      <form onSubmit={(e) => { e.preventDefault(); const t = new FormData(e.currentTarget).get("title"); if (t) act(a.id, { title: String(t) }, "Renamed."); }} className="flex gap-1"><input name="title" defaultValue={a.title} aria-label={`Rename ${a.title}`} className="w-32 rounded-md border border-white/15 bg-white/5 px-2 py-2 text-sm" /><button className="rounded-md border border-white/20 px-3 py-2 text-sm">Rename</button></form>
      <button onClick={() => act(a.id, { action: "duplicate" }, "Duplicated.")} className="rounded-md border border-white/20 px-3 py-2 text-sm">Duplicate</button>
      <form onSubmit={(e) => { e.preventDefault(); const ops = new FormData(e.currentTarget).get("ops"); if (ops) act(a.id, { operations: String(ops).split(",").map((s) => s.trim()).filter(Boolean) }, "Steps updated."); }} className="flex gap-1"><input name="ops" defaultValue={a.operations.join(",")} aria-label={`Steps for ${a.title} in order`} className="w-40 rounded-md border border-white/15 bg-white/5 px-2 py-2 text-sm" /><button className="rounded-md border border-white/20 px-3 py-2 text-sm">Reorder steps</button></form>
      <button onClick={() => act(a.id, { state: a.state === "suspended" ? "ready" : "suspended" }, a.state === "suspended" ? "Resumed." : "Suspended.")} className="rounded-md border border-white/20 px-3 py-2 text-sm">{a.state === "suspended" ? "Resume" : "Suspend"}</button>
      <button onClick={() => act(a.id, { action: "rebuild" }, "Rebuild details returned — submit the same repository again to publish a verified new version.")} className="rounded-md border border-white/20 px-3 py-2 text-sm">Rebuild</button>
      <button onClick={() => remove(a.id)} className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-300">Delete</button>
    </div></article>)}</div>}
  <h2 className="font-display mt-10 text-2xl">Saved plans</h2>
  {plans.length === 0 ? <p className="mt-3 text-sm text-zinc-500">Nothing saved yet — analyze a repository and save its plan.</p> : <ul className="mt-3 space-y-2">{plans.map((p) => <li key={p.id} className="flex items-center justify-between rounded-md border border-white/10 bg-[#141416] p-4 text-sm"><span><strong>{p.title}</strong><span className="block text-zinc-400">{p.prompt}</span></span><button onClick={async () => { await fetch(`/api/library?planId=${p.id}`, { method: "DELETE" }); await load(); }} className="text-red-300">Delete</button></li>)}</ul>}
  <h2 className="font-display mt-10 text-2xl">Build history</h2>
  {jobs.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No builds yet.</p> : <ul className="mt-3 space-y-2 text-sm">{jobs.map((j) => <li key={j.id} className="rounded-md border border-white/10 bg-[#141416] p-3">{j.repo} — {j.status}{j.error ? <span className="block text-red-300">{j.error}</span> : null}</li>)}</ul>}
  <h2 className="font-display mt-10 text-2xl">Permission center</h2>
  <p className="mt-1 text-sm text-zinc-400">Grants are scoped to one app, action and purpose, and expire. Revoking takes effect immediately.</p>
  {grants.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No active grants.</p> : <ul className="mt-3 space-y-2 text-sm">{grants.map((g) => <li key={g.id} className="flex items-center justify-between rounded-md border border-white/10 bg-[#141416] p-3"><span>{g.action} · {g.purpose} · used {g.usedCount}/{g.maxUses} · {g.revoked ? "revoked" : `expires ${new Date(g.expiresAt).toLocaleTimeString()}`}</span>{!g.revoked && <button onClick={async () => { await fetch(`/api/grants?id=${g.id}`, { method: "DELETE" }); await load(); }} className="text-red-300">Revoke access</button>}</li>)}</ul>}
  </div>);
}
