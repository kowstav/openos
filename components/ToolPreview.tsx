"use client";
import { useState } from "react";
import type { PreviewAsset } from "@/lib/preview";
// Visual catalog previews: each family renders its own outcome scene from
// self-authored, rights-cleared local artwork (inline SVG — no README
// embeds, no invented screenshots). The caption states the preview type
// once; detail views carry provenance, rights and dimensions.
function Invoice({ n, accent, total }: { n: number; accent: string; total?: string }) {
  return (<g><rect x="0" y="0" width="54" height="72" rx="3" fill="#fffdf6" stroke="#1c1a14" strokeWidth="1.5" />
    <rect x="6" y="7" width="26" height="5" fill={accent} /><text x="38" y="12" fontSize="7" fill="#1c1a14" fontWeight="700">#{n}</text>
    <rect x="6" y="18" width="42" height="3" fill="#d8d0ba" /><rect x="6" y="24" width="42" height="3" fill="#d8d0ba" /><rect x="6" y="30" width="30" height="3" fill="#d8d0ba" />
    <rect x="6" y="40" width="42" height="3" fill="#e9e1cd" /><rect x="6" y="46" width="42" height="3" fill="#e9e1cd" />
    <text x="6" y="62" fontSize="6" fill="#5c5747">Total</text><text x="30" y="62" fontSize="6.5" fill="#1c1a14" fontWeight="700">{total || `£${n * 120}`}</text></g>);
}
function Mug({ bg }: { bg: boolean }) {
  return (<g>{bg ? <rect x="0" y="0" width="90" height="72" fill="#b9cdd6" /> : null}
    <ellipse cx="45" cy="62" rx="26" ry="4" fill="#1c1a14" opacity="0.18" />
    <path d="M28 26 h34 v22 a10 10 0 0 1 -10 10 h-14 a10 10 0 0 1 -10 -10 z" fill="#c2512f" stroke="#1c1a14" strokeWidth="1.5" />
    <path d="M62 30 q12 4 0 14" fill="none" stroke="#1c1a14" strokeWidth="3" />
    <rect x="28" y="26" width="34" height="6" fill="#1c1a14" opacity="0.15" /></g>);
}
function Scene({ asset, split }: { asset: PreviewAsset; split: number }) {
  const a = asset.accent;
  if (asset.family === "pdf") return (<svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label={asset.alt}>
    <g transform="translate(8,22)"><Invoice n={101} accent={a} total="£120" /></g><g transform="translate(48,30)"><Invoice n={102} accent={a} total="£240" /></g>
    <path d="M118 60 h34" stroke="#1c1a14" strokeWidth="2.5" markerEnd="url(#arr)" />
    <g transform="translate(196,14)"><rect x="0" y="0" width="58" height="76" rx="3" fill="#fffdf6" stroke="#1c1a14" strokeWidth="1.5" /><rect x="6" y="7" width="28" height="5" fill={a} />
      {[0, 1, 2, 3].map((i) => <g key={i}><circle cx="12" cy={24 + i * 13} r="4" fill={a} /><text x="10.2" y={27 + i * 13} fontSize="6" fill="#fff">{i + 1}</text><rect x="20" y={21 + i * 13} width="30" height="4" fill="#d8d0ba" /></g>)}
      <text x="6" y="86" fontSize="7" fill="#5c5747">One document, your order</text></g>
    <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill="#1c1a14" /></marker></defs></svg>);
  if (asset.family === "image") return (<div className="relative h-full w-full overflow-hidden" role="img" aria-label={asset.alt}>
    <svg viewBox="0 0 90 72" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice"><Mug bg /></svg>
    <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
      <div className="absolute inset-0 bg-[repeating-conic-gradient(#ddd6c2_0_25%,#f7f3e8_0_50%)] bg-[length:14px_14px]" />
      <svg viewBox="0 0 90 72" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice"><Mug bg={false} /></svg>
    </div>
    <span className="absolute left-2 top-2 rounded bg-[#1c1a14] px-1.5 py-0.5 text-[10px] font-semibold text-white">After · transparent</span>
    <span className="absolute right-2 top-2 rounded bg-[#1c1a14] px-1.5 py-0.5 text-[10px] font-semibold text-white">Before</span></div>);
  if (asset.family === "audio") return (<svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label={asset.alt}>
    {[14, 26, 40, 22, 48, 34, 18, 44, 30, 52, 26, 38, 20, 46, 32, 24, 42, 28, 16, 36].map((h, i) => <rect key={i} x={10 + i * 9} y={44 - h / 2} width="5" height={h} rx="2" fill={i < 8 ? a : "#d8d0ba"} />)}
    <rect x="8" y="66" width="300" height="1.5" fill="#1c1a14" opacity="0.25" />
    <g fontSize="8" fill="#1c1a14"><rect x="8" y="76" width="140" height="16" rx="3" fill="#fffdf6" stroke="#1c1a14" /><text x="14" y="87">0:04 “the invoice is ready”</text>
      <rect x="156" y="76" width="150" height="16" rx="3" fill="#fffdf6" stroke="#d8d0ba" /><text x="162" y="87" fill="#5c5747">0:09 “send it on Friday”</text></g>
    <text x="8" y="108" fontSize="8" fill="#5c5747">Tap a line to jump the player to that moment</text></svg>);
  if (asset.family === "ocr") return (<svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label={asset.alt}>
    <g transform="rotate(-2 70 55)"><rect x="25" y="12" width="92" height="92" rx="3" fill="#fffdf6" stroke="#1c1a14" strokeWidth="1.5" />
      <text x="38" y="30" fontSize="8" fontWeight="700" fill="#1c1a14">CORNER SHOP</text>
      {[0, 1, 2, 3].map((i) => <g key={i}><rect x="33" y={40 + i * 12} width="46" height="4" fill="#d8d0ba" /><text x="92" y={44 + i * 12} fontSize="7" fill="#1c1a14">£{(i + 2)}.50</text></g>)}
      <text x="33" y="96" fontSize="7" fontWeight="700" fill="#1c1a14">TOTAL £14.00</text></g>
    <path d="M126 58 h26" stroke="#1c1a14" strokeWidth="2.5" markerEnd="url(#arr2)" />
    <g><rect x="164" y="18" width="142" height="84" rx="4" fill="#1c1a14" /><text x="176" y="38" fontSize="9" fill="#fffdf6" fontFamily="monospace">CORNER SHOP</text>
      <text x="176" y="54" fontSize="8" fill="#d8d0ba" fontFamily="monospace">Milk £2.50</text><text x="176" y="68" fontSize="8" fill="#d8d0ba" fontFamily="monospace">Bread £3.50</text><text x="176" y="82" fontSize="8" fill="#fffdf6" fontFamily="monospace">TOTAL £14.00</text>
      <text x="176" y="96" fontSize="7" fill={a}>Selectable, copyable text</text></g>
    <defs><marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill="#1c1a14" /></marker></defs></svg>);
  if (asset.family === "diagram") return (<svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label={asset.alt}>
    <g fontSize="9" fill="#1c1a14"><text x="10" y="30">– Plan the launch</text><text x="18" y="48">– Book the venue</text><text x="18" y="66">– Invite guests</text><text x="10" y="84">– Run the event</text></g>
    <path d="M104 56 h30" stroke="#1c1a14" strokeWidth="2.5" markerEnd="url(#arr3)" />
    <g fontSize="8" fill="#1c1a14"><rect x="146" y="14" width="76" height="20" rx="10" fill="#fffdf6" stroke={a} strokeWidth="2" /><text x="158" y="27">Plan launch</text>
      <rect x="238" y="14" width="70" height="20" rx="4" fill="#fffdf6" stroke="#1c1a14" /><text x="248" y="27">Book venue</text>
      <rect x="146" y="66" width="76" height="20" rx="4" fill="#fffdf6" stroke="#1c1a14" /><text x="156" y="79">Invite guests</text>
      <rect x="238" y="66" width="70" height="20" rx="10" fill={a} /><text x="250" y="79" fill="#fff">Run event</text>
      <path d="M222 24 h16 M184 34 v32 M273 34 v32 M222 76 h16" stroke="#1c1a14" strokeWidth="1.5" /></g>
    <defs><marker id="arr3" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill="#1c1a14" /></marker></defs></svg>);
  if (asset.family === "data") return (<svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label={asset.alt}>
    <g fontSize="8"><rect x="8" y="14" width="128" height="72" rx="4" fill="#fffdf6" stroke="#d8d0ba" />
      <text x="16" y="30" fill="#8a2f23">name , DATE , amt</text><text x="16" y="46" fill="#5c5747">ada, 32/13/26, £12O</text><text x="16" y="62" fill="#5c5747">BOB ,2026-1-2, 45</text><text x="16" y="78" fill="#8a2f23">missing values…</text></g>
    <path d="M144 50 h26" stroke="#1c1a14" strokeWidth="2.5" markerEnd="url(#arr4)" />
    <g fontSize="8"><rect x="182" y="14" width="128" height="72" rx="4" fill="#fffdf6" stroke={a} strokeWidth="2" />
      <text x="190" y="30" fontWeight="700" fill="#1c1a14">Name · Date · Amount</text><text x="190" y="46" fill="#1c1a14">Ada · 2026-01-13 · £120</text><text x="190" y="62" fill="#1c1a14">Bob · 2026-01-02 · £45</text><text x="190" y="78" fill={a}>Ready to chart or export</text></g>
    <defs><marker id="arr4" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill="#1c1a14" /></marker></defs></svg>);
  return (<div className="grid h-full place-items-center" role="img" aria-label={asset.alt}><div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full border-2 border-[#1c1a14] bg-[#fffdf6] text-lg" aria-hidden="true">◆</span><p className="mt-2 text-xs text-[#5c5747]">Preview unavailable — see what it can do below.</p></div></div>);
}
export default function ToolPreview({ asset, large = false }: { asset: PreviewAsset; large?: boolean }) {
  const [split, setSplit] = useState(55);
  const interactive = asset.family === "image";
  return (<figure className="overflow-hidden rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6]">
    <div className={large ? "h-52 sm:h-64" : "h-36"} style={{ background: `color-mix(in srgb, ${asset.accent} 12%, #fffdf6)` }}><Scene asset={asset} split={split} /></div>
    {interactive && <div className="border-t border-[#e9e1cd] px-3 py-2"><label className="block text-xs font-medium">Compare before and after<input type="range" min={5} max={95} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Reveal the after result" className="mt-1 w-full accent-[#1c1a14]" /></label></div>}
    <figcaption className="flex flex-wrap items-center gap-x-2 border-t border-[#e9e1cd] px-3 py-2 text-[11px] text-[#5c5747]">
      <span className="font-semibold text-[#1c1a14]">{asset.input} → {asset.transform} → {asset.output}</span>
      <span>{asset.previewType === "verified-result" ? "· Verified result" : "· Illustration"}</span>
    </figcaption>
  </figure>);
}
