"use client";
import { useState } from "react";
const OPS = [{ id: "merge", label: "Merge PDFs" }, { id: "split", label: "Extract one page" }, { id: "rotate", label: "Rotate 90°" }, { id: "watermark", label: "Add watermark" }, { id: "metadata", label: "Stamp metadata" }];
export default function PdfStudio() {
  const [op, setOp] = useState("merge"); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [url, setUrl] = useState("");
  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(""); setUrl("");
    const fd = new FormData(e.currentTarget); fd.set("op", op);
    try { const r = await fetch("/api/pdf", { method: "POST", body: fd }); if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Failed (${r.status})`); } const blob = await r.blob(); setUrl(URL.createObjectURL(blob)); setMsg("Done — your PDF is ready."); }
    catch (err) { setMsg(String(err instanceof Error ? err.message : err)); } finally { setBusy(false); }
  }
  return (<form onSubmit={run} className="space-y-5">
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Operation">{OPS.map((o) => <button type="button" key={o.id} onClick={() => setOp(o.id)} aria-pressed={op === o.id} className={`rounded-full border px-4 py-2 text-sm ${op === o.id ? "border-[#e8ff47] bg-[#e8ff47] text-black font-semibold" : "border-white/20 hover:border-white/50"}`}>{o.label}</button>)}</div>
    <label className="block rounded-xl border border-dashed border-white/25 p-6 text-center text-sm text-zinc-300 hover:border-[#e8ff47]/60 cursor-pointer">Choose PDF file(s) — processed on the server, never stored<input name="files" type="file" accept="application/pdf" multiple={op === "merge"} required className="mt-3 block w-full text-xs" /></label>
    {op === "watermark" && <input name="text" placeholder="Watermark text" defaultValue="OpenOS" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2" />}
    {op === "split" && <input name="page" type="number" min={1} defaultValue={1} aria-label="Page number" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2" />}
    {op === "metadata" && <input name="title" placeholder="Document title" defaultValue="My OpenOS PDF" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2" />}
    <button disabled={busy} className="rounded-lg bg-[#e8ff47] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? "Processing…" : "Run operation"}</button>
    {msg && <p role="status" className="text-sm text-zinc-300">{msg}</p>}
    {url && <a href={url} download={`openos-${op}.pdf`} className="inline-block rounded-lg border border-[#e8ff47] px-5 py-2.5 font-semibold text-[#e8ff47]">⬇ Download result</a>}
  </form>);
}
