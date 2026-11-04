"use client";
import { useRef, useState } from "react";
const ALL = [
  { id: "remove-bg", label: "AI background removal" },
  { id: "center", label: "Center on canvas" },
  { id: "resize", label: "Resize for marketplace" },
  { id: "compress", label: "Web export (JPG)" },
];
type Result = { name: string; url: string; label: string };
export default function ImageStudio({ initialOps }: { initialOps?: string[] }) {
  const [ops, setOps] = useState<string[]>(initialOps?.length ? initialOps : ["remove-bg"]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [results, setResults] = useState<Result[]>([]);
  const [size, setSize] = useState(1200); const [margin, setMargin] = useState(8); const [bg, setBg] = useState("#ffffff");
  const fileRef = useRef<HTMLInputElement>(null);
  function toggle(id: string) { setOps((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id])); }
  async function process(file: File): Promise<Result> {
    let blob: Blob = file; let mode = "no cutout";
    if (ops.includes("remove-bg")) {
      try { const mod = await import("@imgly/background-removal"); blob = await mod.removeBackground(file); mode = "IMG.LY browser model"; }
      catch { blob = await chromaFallback(file); mode = "solid-background fallback"; }
    }
    const out = await compose(blob, { size: ops.includes("resize") || ops.includes("center") ? size : 0, margin, bg, center: ops.includes("center"), jpg: ops.includes("compress") });
    return { name: file.name, url: URL.createObjectURL(out), label: mode };
  }
  async function run() {
    const picked = fileRef.current?.files ? [...fileRef.current.files] : [];
    if (!picked.length) { setMsg("Choose at least one image first."); return; }
    if (picked.length > 12) { setMsg("Batch is limited to 12 images at a time."); return; }
    setBusy(true); setResults([]); setMsg(`Processing ${picked.length} image(s) on this device — nothing is uploaded…`);
    try { const done: Result[] = []; for (const f of picked) done.push(await process(f)); setResults(done); setMsg(`Done — ${done.length} image(s) ready. Engine per file is listed under each result; this browser adapter is not the rembg Python package.`); }
    catch (e) { setMsg(`Could not process images: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  }
  return (<div className="space-y-5">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Operations">{ALL.map((o) => <button key={o.id} onClick={() => toggle(o.id)} aria-pressed={ops.includes(o.id)} className={`rounded-full border px-4 py-2 text-sm ${ops.includes(o.id) ? "border-[#e8ff47] bg-[#e8ff47] font-semibold text-black" : "border-white/20 hover:border-white/50"}`}>{o.label}</button>)}</div>
    <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
      <label>Canvas size <input type="number" min={200} max={4000} step={100} value={size} onChange={(e) => setSize(Number(e.target.value))} className="ml-1 w-24 rounded-md border border-white/15 bg-white/5 px-2 py-1" /> px</label>
      <label>Margin <input type="number" min={0} max={40} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="ml-1 w-20 rounded-md border border-white/15 bg-white/5 px-2 py-1" /> %</label>
      <label>Background <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="ml-1 h-8 w-12 rounded border border-white/15 bg-white/5" /></label>
    </div>
    <label className="block cursor-pointer rounded-md border border-dashed border-white/25 p-6 text-center text-sm text-zinc-300 hover:border-[#e8ff47]/60">Choose image(s) — they stay on this device (batch up to 12)<input ref={fileRef} type="file" accept="image/*" multiple className="mt-3 block w-full text-xs" /></label>
    <button onClick={run} disabled={busy || !ops.length} className="rounded-md bg-[#e8ff47] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? "Processing…" : "Run my workflow"}</button>
    {msg && <p role="status" className="text-sm text-zinc-300">{msg}</p>}
    {results.length > 0 && <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">{results.map((r) => <figure key={r.url}><img src={r.url} alt={`Processed ${r.name}`} className="w-full rounded-md border border-white/10 bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:16px_16px]" /><figcaption className="mt-1 flex items-center justify-between text-xs text-zinc-500"><span>{r.name} · {r.label}</span><a href={r.url} download={`openos-${r.name}`} className="text-[#e8ff47]">Download</a></figcaption></figure>)}</div>
    <button onClick={() => results.forEach((r, i) => setTimeout(() => { const a = document.createElement("a"); a.href = r.url; a.download = `openos-${r.name}`; a.click(); }, i * 250))} className="rounded-md border border-[#e8ff47] px-5 py-2.5 font-semibold text-[#e8ff47]">Download all results together</button></div>}
  </div>);
}
async function chromaFallback(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0); const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data;
  const r0 = d[0], g0 = d[1], b0 = d[2];
  for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) < 90) d[i + 3] = 0; }
  ctx.putImageData(img, 0, 0); return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
}
async function compose(blob: Blob, o: { size: number; margin: number; bg: string; center: boolean; jpg: boolean }): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const side = o.size > 0 ? o.size : Math.max(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = side; c.height = side; const ctx = c.getContext("2d")!;
  ctx.fillStyle = o.bg; ctx.fillRect(0, 0, side, side);
  const avail = side * (1 - (o.margin / 100) * 2); const scale = Math.min(avail / bmp.width, avail / bmp.height, 1);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  ctx.drawImage(bmp, o.center ? Math.round((side - w) / 2) : 0, o.center ? Math.round((side - h) / 2) : 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), o.jpg ? "image/jpeg" : "image/png", 0.85));
}
