"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toSrt, toVtt, validateSegments, type Segment } from "@/lib/subtitles";
import { ensureSession } from "@/components/session";
// Transcription workstation: upload → isolated faster-whisper job (CPU
// profile) → timestamped, playable, editable transcript → SRT/VTT export.
// Without the sandbox the upload is saved, the state says exactly what is
// missing, and the editor/export still work — no transcript is invented.
export default function Page() {
  const [segs, setSegs] = useState<Segment[]>([{ start: 0, end: 4, text: "" }]);
  const [msg, setMsg] = useState(""); const [audioUrl, setAudioUrl] = useState(""); const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState(""); const [playing, setPlaying] = useState(-1); const [fileName, setFileName] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null); const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  function download(name: string, body: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" })); a.download = name; a.click(); }
  function exportAs(kind: "srt" | "vtt") { const err = validateSegments(segs); if (err) { setMsg(err); return; } download(`openos-subtitles.${kind}`, kind === "srt" ? toSrt(segs) : toVtt(segs)); setMsg(`Exported ${segs.length} lines as .${kind}.`); }
  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setMsg("That file is over 25 MB. Choose a shorter recording."); return; }
    setFileName(f.name); setAudioUrl(URL.createObjectURL(f)); setMsg(""); setStatus("uploading");
    try {
      await ensureSession();
      const fd = new FormData(); fd.set("audio", f);
      const r = await fetch("/api/transcribe", { method: "POST", body: fd });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Upload failed");
      const t = j.transcription; setJobId(t.id); setStatus(t.status);
      if (t.status === "needs-runtime") setMsg(t.error || "Automatic transcription needs the isolated sandbox. Your file is saved below.");
      if (t.status === "queued" || t.status === "running") {
        setMsg("Transcribing in the isolated workspace (CPU model). You can leave and come back — the job keeps its place.");
        pollRef.current = setInterval(async () => {
          const jr = await fetch(`/api/transcribe?id=${t.id}`).then((x) => x.json()).catch(() => null);
          const rec = jr?.transcription; if (!rec) return;
          setStatus(rec.status);
          if (rec.status === "succeeded") { setSegs(rec.segments.length ? rec.segments : segs); setMsg(`Transcribed${rec.language ? ` (detected ${rec.language})` : ""}. Click any line to hear it, edit the words, then export.`); if (pollRef.current) clearInterval(pollRef.current); }
          if (rec.status === "failed" || rec.status === "cancelled") { setMsg(rec.error || "Transcription stopped."); if (pollRef.current) clearInterval(pollRef.current); }
        }, 2500);
      }
    } catch (e) { setStatus(""); setMsg(String(e instanceof Error ? e.message : e)); }
  }
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  async function saveEdits() { if (!jobId) return; const r = await fetch("/api/transcribe", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: jobId, segments: segs }) }); setMsg(r.ok ? "Your edits are saved." : "Edits could not be saved — check each line ends after it starts."); }
  function seek(i: number) { const a = audioRef.current; if (!a) return; a.currentTime = segs[i].start; void a.play().catch(() => {}); setPlaying(i); }
  return (<div className="py-10"><Link href="/" className="text-sm font-medium text-[#5c5747]">← Discover</Link>
    <h1 className="font-display mt-4 text-4xl">Transcription Studio</h1>
    <p className="mt-2 max-w-xl text-[#5c5747]">Upload a recording and get timestamped words you can play, fix and export as subtitles. Transcription runs in an isolated workspace with the faster-whisper CPU model — your audio is stored only with your account and deleted with the job.</p>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6] p-6" aria-label="Recording">
        <label className="block cursor-pointer rounded-md border-2 border-dashed border-[#1c1a14]/40 p-6 text-center text-sm hover:border-[#1c1a14]">Choose an audio file (MP3, WAV, M4A · max 25 MB)<input type="file" accept="audio/*" className="mt-3 block w-full text-xs" onChange={(e) => onFile(e.target.files?.[0])} /></label>
        {fileName && <p className="mt-3 text-sm"><strong>{fileName}</strong>{status ? ` · ${status === "needs-runtime" ? "saved — waiting for a transcription runtime" : status}` : ""}</p>}
        {audioUrl && <audio ref={audioRef} controls src={audioUrl} className="mt-4 w-full" aria-label="Your recording" onTimeUpdate={() => { const a = audioRef.current; if (!a) return; const i = segs.findIndex((s) => a.currentTime >= s.start && a.currentTime < s.end); setPlaying(i); }} />}
        {(status === "queued" || status === "running") && <div className="mt-3 flex items-center gap-3"><p role="status" className="text-sm">Working on it…</p><button onClick={async () => { if (jobId) await fetch("/api/transcribe", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: jobId, action: "cancel" }) }); if (pollRef.current) clearInterval(pollRef.current); setStatus("cancelled"); setMsg("Cancelled. The saved audio stays with your account until you delete it."); }} className="rounded-md border-2 border-[#1c1a14] px-3 py-1.5 text-sm font-semibold">Cancel job</button></div>}
        {msg && <p role="status" className="mt-3 rounded-md bg-[#f2ecdd] px-3 py-2 text-sm">{msg}</p>}
        <p className="mt-4 text-xs leading-relaxed text-[#5c5747]">Where it runs: the isolated Python sandbox (faster-whisper, CPU “tiny” model). If that runtime is not configured, nothing is transcribed and no words are made up — the editor on the right still works with text you type.</p>
      </section>
      <section className="rounded-lg border-2 border-[#1c1a14] bg-[#fffdf6] p-6" aria-label="Transcript editor">
        <h2 className="font-bold">Transcript — click a timestamp to listen</h2>
        <ol className="mt-3 space-y-2">{segs.map((s, i) => <li key={i} className={`flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-sm ${playing === i ? "bg-[#d9e021]/50" : ""}`}>
          <button type="button" onClick={() => seek(i)} aria-label={`Play from ${s.start} seconds`} className="rounded-md border-2 border-[#1c1a14] bg-white px-2 py-1 font-mono text-xs font-bold">{s.start.toFixed(1)}s ▶</button>
          <input type="number" step="0.1" min={0} value={s.start} aria-label={`Line ${i + 1} start seconds`} onChange={(e) => setSegs(segs.map((x, j) => j === i ? { ...x, start: Number(e.target.value) } : x))} className="w-20 rounded-md border border-[#1c1a14]/30 bg-white px-2 py-1.5" />
          <span aria-hidden="true">→</span>
          <input type="number" step="0.1" min={0} value={s.end} aria-label={`Line ${i + 1} end seconds`} onChange={(e) => setSegs(segs.map((x, j) => j === i ? { ...x, end: Number(e.target.value) } : x))} className="w-20 rounded-md border border-[#1c1a14]/30 bg-white px-2 py-1.5" />
          <input value={s.text} placeholder="Words at this moment" aria-label={`Line ${i + 1} text`} onChange={(e) => setSegs(segs.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} className="min-w-40 flex-1 rounded-md border border-[#1c1a14]/30 bg-white px-2 py-1.5" />
        </li>)}</ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setSegs([...segs, { start: segs.length ? segs[segs.length - 1].end : 0, end: (segs.length ? segs[segs.length - 1].end : 0) + 4, text: "" }])} className="rounded-md border-2 border-[#1c1a14]/50 px-3 py-2 text-sm font-semibold">Add line</button>
          {jobId && <button onClick={saveEdits} className="rounded-md border-2 border-[#1c1a14] px-3 py-2 text-sm font-semibold">Save edits</button>}
          <button onClick={() => exportAs("srt")} className="rounded-md bg-[#d9e021] px-4 py-2 text-sm font-bold text-[#1c1a14] ring-2 ring-[#1c1a14]">Export subtitles (.srt)</button>
          <button onClick={() => exportAs("vtt")} className="rounded-md border-2 border-[#1c1a14] px-4 py-2 text-sm font-semibold">Export .vtt</button>
        </div>
      </section>
    </div></div>);
}
