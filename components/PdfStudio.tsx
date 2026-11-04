"use client";
import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { ensureSession } from "./session";
const OPS = [{ id: "merge", label: "Merge PDFs" }, { id: "extract", label: "Extract page from each" }, { id: "rotate", label: "Rotate 90°" }, { id: "watermark", label: "Add watermark" }, { id: "metadata", label: "Stamp metadata" }];
export default function PdfStudio({ initialOps }: { initialOps?: string[] }) {
  const [steps, setSteps] = useState<string[]>(initialOps?.length ? initialOps : ["merge"]);
  const [files, setFiles] = useState<{ name: string; pages: number }[]>([]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [url, setUrl] = useState(""); const [wm, setWm] = useState("OpenOS");
  function toggle(id: string) { setSteps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }
  function move(list: string[], i: number, d: number, set: (v: string[]) => void) { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; set(n); }
  async function onFiles(list: FileList | null) {
    const out: { name: string; pages: number }[] = [];
    for (const f of list ? [...list] : []) { try { const d = await PDFDocument.load(await f.arrayBuffer()); out.push({ name: f.name, pages: d.getPageCount() }); } catch { out.push({ name: f.name, pages: -1 }); } }
    setFiles(out);
  }
  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(""); setUrl("");
    const input = e.currentTarget.querySelector<HTMLInputElement>('input[name="files"]');
    const fd = new FormData();
    // Upload in the order shown, not the picker's order.
    const picked = input?.files ? [...input.files] : [];
    const ordered = files.map((f) => picked.find((p) => p.name === f.name)).filter((f): f is File => Boolean(f));
    (ordered.length ? ordered : picked).forEach((f) => fd.append("files", f));
    fd.set("op", steps.length > 1 ? "pipeline" : steps[0] || "merge"); fd.set("steps", JSON.stringify(steps));
    const text = e.currentTarget.querySelector<HTMLInputElement>('input[name="text"]'); if (text) fd.set("text", text.value);
    const page = e.currentTarget.querySelector<HTMLInputElement>('input[name="page"]'); if (page) fd.set("page", page.value);
    const title = e.currentTarget.querySelector<HTMLInputElement>('input[name="title"]'); if (title) fd.set("title", title.value);
    try { await ensureSession(); const r = await fetch("/api/pdf", { method: "POST", body: fd }); if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Failed (${r.status})`); } const blob = await r.blob(); setUrl(URL.createObjectURL(blob)); setMsg(`Done — ran ${steps.join(" → ")} in that order.`); }
    catch (err) { setMsg(String(err instanceof Error ? err.message : err)); } finally { setBusy(false); }
  }
  return (<form onSubmit={run} className="space-y-5">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Operations in execution order">{OPS.map((o) => <button type="button" key={o.id} onClick={() => toggle(o.id)} aria-pressed={steps.includes(o.id)} className={`rounded-full border px-4 py-2 text-sm ${steps.includes(o.id) ? "border-[#1c1a14] bg-[#d9e021] font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]" : "border-[#1c1a14]/40 hover:border-[#1c1a14]"}`}>{o.label}</button>)}</div>
    {steps.length > 1 && <ol className="space-y-1 text-sm text-[#3d392c]">{steps.map((s, i) => <li key={s} className="flex items-center gap-2">{i + 1}. {OPS.find((o) => o.id === s)?.label}<button type="button" aria-label={`Move ${s} up`} onClick={() => move(steps, i, -1, setSteps)}>↑</button><button type="button" aria-label={`Move ${s} down`} onClick={() => move(steps, i, 1, setSteps)}>↓</button></li>)}</ol>}
    <p className="text-xs text-[#5c5747]">“Extract, then merge” takes the chosen page from each file and combines those pages. “Merge, then extract” takes one page from the combined document. Steps run in the order above.</p>
    <label className="block cursor-pointer rounded-md border border-dashed border-[#1c1a14]/40 p-6 text-center text-sm text-[#3d392c] hover:border-[#1c1a14]">Choose PDF file(s) — processed in memory on the server, never stored<input name="files" type="file" accept="application/pdf" multiple required onChange={(e) => onFiles(e.target.files)} className="mt-3 block w-full text-xs" /></label>
    {files.length > 0 && <div><p className="text-sm font-semibold">Your documents, in order</p>
      <ol className="mt-2 space-y-3">{files.map((f, i) => <li key={f.name} className="rounded-lg border-2 border-[#1c1a14]/25 bg-[#f2ecdd] p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm"><strong>{i + 1}. {f.name}</strong><span className="text-[#5c5747]">{f.pages >= 0 ? `${f.pages} page${f.pages === 1 ? "" : "s"}` : "Could not be read — choose another copy"}</span>
          <span className="ml-auto flex gap-1"><button type="button" aria-label={`Move ${f.name} up`} onClick={() => { const n = [...files]; if (i > 0) { [n[i - 1], n[i]] = [n[i], n[i - 1]]; setFiles(n); } }} className="rounded border border-[#1c1a14]/40 bg-white px-2 py-1">↑</button><button type="button" aria-label={`Move ${f.name} down`} onClick={() => { const n = [...files]; if (i < n.length - 1) { [n[i + 1], n[i]] = [n[i], n[i + 1]]; setFiles(n); } }} className="rounded border border-[#1c1a14]/40 bg-white px-2 py-1">↓</button></span></div>
        {f.pages > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Pages in ${f.name}`}>{Array.from({ length: Math.min(f.pages, 12) }, (_, p) => <span key={p} className="relative grid h-12 w-9 place-items-center rounded border border-[#1c1a14]/40 bg-[#fffdf6] text-[10px] font-bold">{p + 1}{steps.includes("watermark") && <span className="absolute inset-0 grid rotate-[-24deg] place-items-center text-[7px] font-bold text-[#1c1a14]/35">{wm.slice(0, 10)}</span>}</span>)}{f.pages > 12 && <span className="self-center text-xs text-[#5c5747]">+{f.pages - 12} more</span>}</div>}
      </li>)}</ol>
      {steps.includes("watermark") && <p className="mt-2 text-xs text-[#5c5747]">Watermark preview: “{wm}” will appear diagonally on every page, as shown on the thumbnails.</p>}</div>}
    {steps.includes("watermark") && <label className="block text-sm font-semibold">Watermark text<input name="text" value={wm} onChange={(e) => setWm(e.target.value)} placeholder="Watermark text" className="mt-1 w-full rounded-md border border-[#1c1a14]/30 bg-white px-3 py-2 font-normal" /></label>}
    {steps.includes("extract") && <input name="page" type="number" min={1} defaultValue={1} aria-label="Page number" className="w-full rounded-md border border-[#1c1a14]/30 bg-white px-3 py-2" />}
    {steps.includes("metadata") && <input name="title" placeholder="Document title" defaultValue="My OpenOS PDF" className="w-full rounded-md border border-[#1c1a14]/30 bg-white px-3 py-2" />}
    <button disabled={busy || !steps.length} className="rounded-md bg-[#d9e021] px-5 py-3 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14] disabled:opacity-50">{busy ? "Processing…" : steps.length > 1 ? "Run workflow" : "Run operation"}</button>
    {msg && <p role="status" className="text-sm text-[#3d392c]">{msg}</p>}
    {url && <a href={url} download="openos-workflow.pdf" className="inline-block rounded-md bg-[#d9e021] px-5 py-3 font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Download PDF</a>}
  </form>);
}
