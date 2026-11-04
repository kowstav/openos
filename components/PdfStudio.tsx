"use client";
import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { ensureSession } from "./session";
const OPS = [{ id: "merge", label: "Merge PDFs" }, { id: "extract", label: "Extract page from each" }, { id: "rotate", label: "Rotate 90°" }, { id: "watermark", label: "Add watermark" }, { id: "metadata", label: "Stamp metadata" }];
export default function PdfStudio({ initialOps }: { initialOps?: string[] }) {
  const [steps, setSteps] = useState<string[]>(initialOps?.length ? initialOps : ["merge"]);
  const [files, setFiles] = useState<{ name: string; pages: number }[]>([]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [url, setUrl] = useState("");
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
    <div className="flex flex-wrap gap-2" role="group" aria-label="Operations in execution order">{OPS.map((o) => <button type="button" key={o.id} onClick={() => toggle(o.id)} aria-pressed={steps.includes(o.id)} className={`rounded-full border px-4 py-2 text-sm ${steps.includes(o.id) ? "border-[#e8ff47] bg-[#e8ff47] font-semibold text-black" : "border-white/20 hover:border-white/50"}`}>{o.label}</button>)}</div>
    {steps.length > 1 && <ol className="space-y-1 text-sm text-zinc-300">{steps.map((s, i) => <li key={s} className="flex items-center gap-2">{i + 1}. {OPS.find((o) => o.id === s)?.label}<button type="button" aria-label={`Move ${s} up`} onClick={() => move(steps, i, -1, setSteps)}>↑</button><button type="button" aria-label={`Move ${s} down`} onClick={() => move(steps, i, 1, setSteps)}>↓</button></li>)}</ol>}
    <p className="text-xs text-zinc-500">“Extract, then merge” takes the chosen page from each file and combines those pages. “Merge, then extract” takes one page from the combined document. Steps run in the order above.</p>
    <label className="block cursor-pointer rounded-md border border-dashed border-white/25 p-6 text-center text-sm text-zinc-300 hover:border-[#e8ff47]/60">Choose PDF file(s) — processed in memory on the server, never stored<input name="files" type="file" accept="application/pdf" multiple required onChange={(e) => onFiles(e.target.files)} className="mt-3 block w-full text-xs" /></label>
    {files.length > 0 && <ul className="space-y-1 text-sm text-zinc-300">{files.map((f, i) => <li key={f.name} className="flex items-center gap-2">{f.name} · {f.pages >= 0 ? `${f.pages} pages` : "unreadable"}<button type="button" aria-label={`Move ${f.name} up`} onClick={() => { const n = [...files]; if (i > 0) { [n[i - 1], n[i]] = [n[i], n[i - 1]]; setFiles(n); } }}>↑</button><button type="button" aria-label={`Move ${f.name} down`} onClick={() => { const n = [...files]; if (i < n.length - 1) { [n[i + 1], n[i]] = [n[i], n[i + 1]]; setFiles(n); } }}>↓</button></li>)}</ul>}
    {steps.includes("watermark") && <input name="text" placeholder="Watermark text" defaultValue="OpenOS" className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />}
    {steps.includes("extract") && <input name="page" type="number" min={1} defaultValue={1} aria-label="Page number" className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />}
    {steps.includes("metadata") && <input name="title" placeholder="Document title" defaultValue="My OpenOS PDF" className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />}
    <button disabled={busy || !steps.length} className="rounded-md bg-[#e8ff47] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? "Processing…" : steps.length > 1 ? "Run workflow" : "Run operation"}</button>
    {msg && <p role="status" className="text-sm text-zinc-300">{msg}</p>}
    {url && <a href={url} download="openos-workflow.pdf" className="inline-block rounded-md border border-[#e8ff47] px-5 py-2.5 font-semibold text-[#e8ff47]">Download result (PDF)</a>}
  </form>);
}
