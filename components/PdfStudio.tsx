"use client";
import { useState } from "react";
const OPS = [{ id: "merge", label: "Merge PDFs" }, { id: "split", label: "Extract one page" }, { id: "rotate", label: "Rotate 90°" }, { id: "watermark", label: "Add watermark" }, { id: "metadata", label: "Stamp metadata" }];
export default function PdfStudio({ initialOps }: { initialOps?: string[] }) {
  const [selected, setSelected] = useState<string[]>(initialOps?.length ? initialOps : ["merge"]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [url, setUrl] = useState("");
  function toggle(id: string) { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }
  const pipeline = selected.length > 1;
  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(""); setUrl("");
    const fd = new FormData(e.currentTarget);
    if (pipeline) { fd.set("op", "pipeline"); fd.set("steps", JSON.stringify(selected)); } else fd.set("op", selected[0] || "merge");
    try { const r = await fetch("/api/pdf", { method: "POST", body: fd }); if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Failed (${r.status})`); } const blob = await r.blob(); setUrl(URL.createObjectURL(blob)); setMsg(pipeline ? `Done — ran ${selected.join(" → ")} as one workflow.` : "Done — your PDF is ready."); }
    catch (err) { setMsg(String(err instanceof Error ? err.message : err)); } finally { setBusy(false); }
  }
  return (<form onSubmit={run} className="space-y-5">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Operations — select one or combine into a workflow">{OPS.map((o) => <button type="button" key={o.id} onClick={() => toggle(o.id)} aria-pressed={selected.includes(o.id)} className={`rounded-full border px-4 py-2 text-sm ${selected.includes(o.id) ? "border-[#e8ff47] bg-[#e8ff47] font-semibold text-black" : "border-white/20 hover:border-white/50"}`}>{o.label}</button>)}</div>
    <p className="text-xs text-zinc-500">{pipeline ? `Multi-step workflow: ${selected.map((s) => OPS.find((o) => o.id === s)?.label).join(" → ")} — executed in one isolated server pass.` : "Select two or more operations to run them as a single personalized workflow."}</p>
    <label className="block cursor-pointer rounded-md border border-dashed border-white/25 p-6 text-center text-sm text-zinc-300 hover:border-[#e8ff47]/60">Choose PDF file(s) — processed in memory on the server, never stored<input name="files" type="file" accept="application/pdf" multiple required className="mt-3 block w-full text-xs" /></label>
    {selected.includes("watermark") && <input name="text" placeholder="Watermark text" defaultValue="OpenOS" className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />}
    {selected.includes("split") && <input name="page" type="number" min={1} defaultValue={1} aria-label="Page number" className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />}
    {selected.includes("metadata") && <input name="title" placeholder="Document title" defaultValue="My OpenOS PDF" className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2" />}
    <button disabled={busy || !selected.length} className="rounded-md bg-[#e8ff47] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? "Processing…" : pipeline ? "Run workflow" : "Run operation"}</button>
    {msg && <p role="status" className="text-sm text-zinc-300">{msg}</p>}
    {url && <a href={url} download="openos-workflow.pdf" className="inline-block rounded-md border border-[#e8ff47] px-5 py-2.5 font-semibold text-[#e8ff47]">Download result</a>}
  </form>);
}
