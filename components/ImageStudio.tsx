"use client";
import { useRef, useState } from "react";
const ALL = [
  { id: "remove-bg", label: "AI background removal" },
  { id: "resize", label: "Resize to 1200px" },
  { id: "white-bg", label: "White background" },
  { id: "compress", label: "Web export (JPG)" },
];
export default function ImageStudio({ initialOps }: { initialOps?: string[] }) {
  const [ops, setOps] = useState<string[]>(initialOps?.length ? initialOps : ["remove-bg"]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [before, setBefore] = useState(""); const [after, setAfter] = useState(""); const [mode, setMode] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  function toggle(id: string) { setOps((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id])); }
  async function run() {
    const file = fileRef.current?.files?.[0]; if (!file) { setMsg("Choose an image first."); return; }
    setBusy(true); setMsg(""); setAfter(""); setBefore(URL.createObjectURL(file));
    try {
      let blob: Blob = file;
      if (ops.includes("remove-bg")) {
        setMsg("Removing background locally (AI model runs in your browser — image never uploaded)…");
        try {
          const mod = await import("@imgly/background-removal");
          blob = await mod.removeBackground(file);
          setMode("AI model (IMG.LY, in-browser)");
        } catch {
          setMsg("AI model could not load (needs network for model files). Falling back to solid-background removal…");
          blob = await chromaFallback(file); setMode("Fallback: solid-background removal");
        }
      }
      const out = await postProcess(blob, ops);
      setAfter(URL.createObjectURL(out.blob));
      setMsg(`Done — ${out.label}. Mode: ${mode || "No background removal"}. Nothing was uploaded.`);
    } catch (e) { setMsg(`Could not process image: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  }
  return (<div className="space-y-5">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Operations">{ALL.map((o) => <button key={o.id} onClick={() => toggle(o.id)} aria-pressed={ops.includes(o.id)} className={`rounded-full border px-4 py-2 text-sm ${ops.includes(o.id) ? "border-[#e8ff47] bg-[#e8ff47] font-semibold text-black" : "border-white/20 hover:border-white/50"}`}>{o.label}</button>)}</div>
    <p className="text-xs text-zinc-500">Your personalized workflow: {ops.length ? ALL.filter((o) => ops.includes(o.id)).map((o) => o.label).join(" → ") : "pick at least one operation"}</p>
    <label className="block cursor-pointer rounded-md border border-dashed border-white/25 p-6 text-center text-sm text-zinc-300 hover:border-[#e8ff47]/60">Choose an image — it stays on this device<input ref={fileRef} type="file" accept="image/*" className="mt-3 block w-full text-xs" /></label>
    <button onClick={run} disabled={busy || !ops.length} className="rounded-md bg-[#e8ff47] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? "Processing…" : "Run my workflow"}</button>
    {msg && <p role="status" className="text-sm text-zinc-300">{msg}</p>}
    {(before || after) && <div className="grid gap-4 sm:grid-cols-2">{before && <figure><img src={before} alt="Original uploaded" className="w-full rounded-md border border-white/10" /><figcaption className="mt-1 text-xs text-zinc-500">Before</figcaption></figure>}{after && <figure><img src={after} alt="Processed result" className="w-full rounded-md border border-white/10 bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:16px_16px]" /><figcaption className="mt-1 text-xs text-zinc-500">After</figcaption></figure>}</div>}
    {after && <a href={after} download="openos-image.png" className="inline-block rounded-md border border-[#e8ff47] px-5 py-2.5 font-semibold text-[#e8ff47]">Download result</a>}
  </div>);
}
async function chromaFallback(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0); const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data;
  const r0 = d[0], g0 = d[1], b0 = d[2];
  for (let i = 0; i < d.length; i += 4) { const dist = Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0); if (dist < 90) d[i + 3] = 0; }
  ctx.putImageData(img, 0, 0); return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png"));
}
async function postProcess(blob: Blob, ops: string[]): Promise<{ blob: Blob; label: string }> {
  if (!ops.includes("resize") && !ops.includes("white-bg") && !ops.includes("compress")) return { blob, label: "background processed" };
  const bmp = await createImageBitmap(blob); const target = ops.includes("resize") ? 1200 : bmp.width;
  const scale = Math.min(1, target / bmp.width); const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d")!;
  if (ops.includes("white-bg")) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bmp, 0, 0, w, h); const jpg = ops.includes("compress");
  return new Promise((res, rej) => c.toBlob((b) => (b ? res({ blob: b, label: `${w}×${h} ${jpg ? "JPG" : "PNG"}` }) : rej(new Error("export failed"))), jpg ? "image/jpeg" : "image/png", 0.85));
}
