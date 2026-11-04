"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppRenderer from "@/components/AppRenderer";
import { ensureSession } from "@/components/session";
type App = React.ComponentProps<typeof AppRenderer>["app"] & { createdAt: number };
export default function Page() {
  const { id } = useParams<{ id: string }>(); const [app, setApp] = useState<App | null>(null); const [err, setErr] = useState(""); const [art, setArt] = useState<{ plan: { sourceSha: string; strategy: string; skills: string[] }; build: { installCommand: string; runtime: string }; security: { isolation: string; deniedCapabilities: string[] }; verification: { passed: boolean; sampleInput: string; sampleOutputExcerpt: string }; version: { version: number; sourceSha: string } } | null>(null);
  useEffect(() => { ensureSession().then(() => fetch(`/api/apps/${id}`)).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setApp(j.app); setArt(j.artifacts); }).catch((e) => setErr(String(e.message))); }, [id]);
  if (err) return <p role="alert" className="py-16 text-red-300">{err} <Link className="underline" href="/workspace">← My Apps</Link></p>;
  if (!app) return <p className="py-16 text-zinc-400">Loading your app…</p>;
  return (<div className="py-10"><Link href="/workspace" className="text-sm text-zinc-400 hover:text-white">← My Apps</Link>
    <h1 className="font-display mt-4 max-w-2xl text-4xl">{app.title}</h1>
    <p className="mt-2 text-sm text-zinc-500">Built from {app.repo} · {new Date(app.createdAt).toLocaleString()} · Isolated execution, permissions enforced by the OpenOS gateway</p>
    {app.prompt && <p className="mt-2 max-w-xl text-sm italic text-zinc-400">“{app.prompt}”</p>}
    <div className="mt-8 max-w-3xl"><AppRenderer app={app} /></div>
    {art && <section className="mt-8 max-w-3xl rounded-lg border border-white/10 bg-[#141416] p-5 text-sm"><h2 className="font-display text-xl">Build & security record</h2>
      <dl className="mt-3 space-y-2 text-zinc-300">
        <div><dt className="text-zinc-500">App version</dt><dd>v{art.version.version} · source SHA {art.version.sourceSha || "HEAD"}</dd></div>
        <div><dt className="text-zinc-500">Conversion plan</dt><dd>Strategy {art.plan.strategy} · skills: {art.plan.skills.join(", ")}</dd></div>
        <div><dt className="text-zinc-500">Build manifest (reproducible)</dt><dd className="font-mono text-xs">{art.build.installCommand}</dd></div>
        <div><dt className="text-zinc-500">Security manifest</dt><dd>{art.security.isolation} Always denied: {art.security.deniedCapabilities.join(", ")}. No secrets enter the sandbox.</dd></div>
        <div><dt className="text-zinc-500">Verification report</dt><dd>{art.verification.passed ? "✓ Passed" : "✕ Not verified"} — sample “{art.verification.sampleInput.slice(0, 60)}” → “{art.verification.sampleOutputExcerpt.slice(0, 80)}”</dd></div>
      </dl></section>}
  </div>);
}
