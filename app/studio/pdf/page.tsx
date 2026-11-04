"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PdfStudio from "@/components/PdfStudio";
import Link from "next/link";
function Inner() {
  const sp = useSearchParams(); const ops = (sp.get("ops") || "").split(",").filter(Boolean);
  return (<div className="py-10"><Link href="/" className="text-sm text-[#5c5747] hover:text-[#1c1a14]">← Discover</Link><h1 className="font-display mt-4 text-4xl">PDF Studio</h1><p className="mt-2 max-w-xl text-[#5c5747]">Built on <strong className="text-[#1c1a14]">pdf-lib</strong> through a trusted server adapter. Files are processed in memory and never stored. Max 15 MB per file.</p>
  {ops.length > 0 && <p className="mt-3 inline-block rounded-full border border-[#1c1a14] px-3 py-1 text-xs text-[#1c1a14]">Personalized workflow: {ops.join(" → ")}</p>}
  <div className="mt-8 max-w-3xl rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6] p-6"><PdfStudio initialOps={ops} /></div></div>);
}
export default function Page() { return <Suspense fallback={<p className="py-16">Loading…</p>}><Inner /></Suspense>; }
