"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ImageStudio from "@/components/ImageStudio";
function Inner() {
  const sp = useSearchParams(); const ops = (sp.get("ops") || "").split(",").filter(Boolean);
  return (<div className="py-10"><Link href="/" className="text-sm text-zinc-400 hover:text-white">← Marketplace</Link>
    <h1 className="font-display mt-4 text-4xl">Product Photo Studio</h1>
    <p className="mt-2 max-w-xl text-zinc-400">The remove.bg alternative that runs on your device. Built on the <strong className="text-zinc-200">rembg</strong> idea with a browser ML adapter — your image is never uploaded, and no per-image fee applies.</p>
    {ops.length > 0 && <p className="mt-3 inline-block rounded-full border border-[#e8ff47]/40 px-3 py-1 text-xs text-[#e8ff47]">Personalized by Muse workflow: {ops.join(" → ")}</p>}
    <div className="mt-8 max-w-3xl rounded-lg border border-white/10 bg-[#141416] p-6"><ImageStudio initialOps={ops} /></div></div>);
}
export default function Page() { return <Suspense fallback={<p className="py-16">Loading…</p>}><Inner /></Suspense>; }
