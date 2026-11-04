"use client";
import { useState } from "react";
import type { PreviewAsset } from "@/lib/preview";
// Illustrative previews only; caption always states the preview type.
export default function ToolPreview({ asset }: { asset: PreviewAsset }) {
  const [split, setSplit] = useState(50);
  return (<figure className="rounded-md border border-white/10 bg-black/30 p-3">
    <div className="flex items-center gap-2 text-[11px] text-zinc-400" role="img" aria-label={asset.alt}>
      <span className="rounded border border-white/15 px-2 py-1">{asset.input || "Input"}</span><span aria-hidden="true">→</span>
      <span className="rounded border border-[#e8ff47]/40 px-2 py-1 text-[#e8ff47]">{asset.transform || "Transform"}</span><span aria-hidden="true">→</span>
      <span className="rounded border border-white/15 px-2 py-1">{asset.output || "Output"}</span>
    </div>
    {asset.kind === "before-after" && <div className="mt-3"><label className="block text-xs text-zinc-400">Before / after — drag or use arrow keys<input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Before and after comparison" className="mt-1 w-full" /></label><div className="relative mt-2 flex h-16 overflow-hidden rounded text-[10px]"><div style={{ width: `${split}%` }} className="grid place-items-center bg-zinc-700">Before</div><div className="grid flex-1 place-items-center bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:12px_12px]">After</div></div></div>}
    <figcaption className="mt-2 text-[11px] text-zinc-500">{asset.previewType === "verified-result" ? "Verified result" : "Illustration — not a run result"} · {asset.provenance} · {asset.rights} · {asset.width}×{asset.height}</figcaption>
  </figure>);
}
