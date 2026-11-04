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
  if (err) return <p role="alert" className="py-16 text-[#8a2f23]">{err} <Link className="underline" href="/workspace">← My Apps</Link></p>;
  if (!app) return <p className="py-16 text-[#5c5747]">Loading your app…</p>;
  return (<div className="py-10"><Link href="/workspace" className="text-sm font-medium text-[#5c5747] hover:text-[#1c1a14]">← My Apps</Link>
    <h1 className="font-display mt-4 max-w-2xl text-4xl">{app.title}</h1>
    <p className="mt-2 text-sm text-[#5c5747]">Built from {app.repo} · {new Date(app.createdAt).toLocaleString()} · Runs only when you allow it, in an isolated workspace</p>
    {app.prompt && <p className="mt-2 max-w-xl text-sm italic text-[#5c5747]">“{app.prompt}”</p>}
    <div className="mt-8 max-w-3xl"><AppRenderer app={app} /></div>
    <p className="mt-6 max-w-3xl text-sm text-[#3d392c]">{art ? (art.verification.passed ? `Checked before it reached you: a real sample ran through this exact version and produced “${art.verification.sampleOutputExcerpt.slice(0, 90)}”.` : "This version opens its studio, which runs the real operation on your files — no sample was pre-run for this build.") : ""}</p>
    {art && <details className="mt-4 max-w-3xl rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6] p-5 text-sm"><summary className="cursor-pointer font-display text-lg">Build record (for people who want the details)</summary>
      <dl className="mt-3 space-y-2 text-[#3d392c]">
        <div><dt className="text-[#5c5747]">App version</dt><dd>v{art.version.version} · source {art.version.sourceSha || "HEAD"}</dd></div>
        <div><dt className="text-[#5c5747]">How it was built</dt><dd>{art.plan.strategy} · {art.build.installCommand}</dd></div>
        <div><dt className="text-[#5c5747]">Where it runs</dt><dd>{art.security.isolation} Always refused: {art.security.deniedCapabilities.join(", ")}.</dd></div>
        <div><dt className="text-[#5c5747]">Checks</dt><dd>{art.verification.passed ? "Passed" : "No pre-run sample"} — “{art.verification.sampleInput.slice(0, 60)}” → “{art.verification.sampleOutputExcerpt.slice(0, 80)}”</dd></div>
      </dl></details>}
  </div>);
}
