"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ImageStudio from "@/components/ImageStudio";
function Inner() {
  const sp = useSearchParams(); const ops = (sp.get("ops") || "").split(",").filter(Boolean);
  return (<div className="py-10"><Link href="/" className="text-sm text-[#5c5747] hover:text-[#1c1a14]">← Discover</Link>
    <h1 className="font-display mt-4 text-4xl">Product Photo Studio</h1>
    <p className="mt-2 max-w-xl text-[#5c5747]">The remove.bg alternative that runs on your device. Built on the <strong className="text-[#1c1a14]">rembg</strong> idea with a browser ML adapter — your image is never uploaded, and no per-image fee applies.</p>
    {ops.length > 0 && <p className="mt-3 inline-block rounded-full border border-[#1c1a14] px-3 py-1 text-xs text-[#1c1a14]">Personalized by Muse workflow: {ops.join(" → ")}</p>}
    <div className="mt-8 max-w-3xl rounded-lg border border-[#1c1a14] bg-[#fffdf6] p-6"><ImageStudio initialOps={ops} /></div></div>);
}
export default function Page() { return <Suspense fallback={<p className="py-16">Loading…</p>}><Inner /></Suspense>; }
