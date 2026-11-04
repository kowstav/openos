"use client";
import { useState } from "react";
import Link from "next/link";
import { toSrt, toVtt, validateSegments, type Segment } from "@/lib/subtitles";
// Transcription studio (I4): upload validation, playback and the timestamp
// editor with real SRT/VTT export work today. Automatic transcription needs
// the faster-whisper Python sandbox; until it is configured the page says
// exactly that instead of inventing a transcript.
export default function Page() {
  const [segs, setSegs] = useState<Segment[]>([{ start: 0, end: 4, text: "" }]);
  const [fileInfo, setFileInfo] = useState(""); const [msg, setMsg] = useState("");
  function download(name: string, body: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" })); a.download = name; a.click(); }
  function exportAs(kind: "srt" | "vtt") { const err = validateSegments(segs); if (err) { setMsg(err); return; } download(`openos-subtitles.${kind}`, kind === "srt" ? toSrt(segs) : toVtt(segs)); setMsg(`Exported ${segs.length} segments as .${kind}.`); }
  return (<div className="py-10"><Link href="/" className="text-sm text-zinc-400">← Marketplace</Link>
  <h1 className="font-display mt-4 text-4xl">Transcription Studio</h1>
  <p className="mt-2 max-w-xl text-zinc-400">Built on <strong className="text-zinc-200">faster-whisper</strong> upstream. Automatic transcription runs in an isolated Python sandbox — it is not configured in this deployment, so no transcript will be invented here. The timestamp editor and subtitle export below work now with text you provide.</p>
  <div className="mt-6 max-w-2xl space-y-4 rounded-lg border border-white/10 bg-[#141416] p-6">
    <label className="block cursor-pointer rounded-md border border-dashed border-white/25 p-6 text-center text-sm text-zinc-300">Choose an audio file (MP3/WAV/M4A, max 25 MB)<input type="file" accept="audio/*" className="mt-3 block w-full text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 25 * 1024 * 1024) { setMsg("File over 25 MB."); return; } setFileInfo(`${f.name} · ${(f.size / 1024 / 1024).toFixed(1)} MB · ready for the sandbox when configured`); }} /></label>
    {fileInfo && <p className="text-sm text-zinc-300">{fileInfo}</p>}
    <p role="status" className="rounded-md border border-amber-300/30 p-3 text-sm text-amber-100">Automatic transcription: needs a runtime. Configure the isolated sandbox with faster-whisper and a model to enable it; CPU settings are tried before GPU is declared essential. Until then, edit timestamps below and export subtitles.</p>
    {segs.map((s, i) => <div key={i} className="flex flex-wrap items-center gap-2 text-sm"><input type="number" step="0.1" min={0} value={s.start} aria-label={`Segment ${i + 1} start seconds`} onChange={(e) => setSegs(segs.map((x, j) => j === i ? { ...x, start: Number(e.target.value) } : x))} className="w-24 rounded-md border border-white/15 bg-white/5 px-2 py-1.5" /><span>→</span><input type="number" step="0.1" min={0} value={s.end} aria-label={`Segment ${i + 1} end seconds`} onChange={(e) => setSegs(segs.map((x, j) => j === i ? { ...x, end: Number(e.target.value) } : x))} className="w-24 rounded-md border border-white/15 bg-white/5 px-2 py-1.5" /><input value={s.text} placeholder="Transcript text" aria-label={`Segment ${i + 1} text`} onChange={(e) => setSegs(segs.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} className="min-w-48 flex-1 rounded-md border border-white/15 bg-white/5 px-2 py-1.5" /></div>)}
    <div className="flex flex-wrap gap-2"><button onClick={() => setSegs([...segs, { start: segs.length ? segs[segs.length - 1].end : 0, end: (segs.length ? segs[segs.length - 1].end : 0) + 4, text: "" }])} className="rounded-md border border-white/20 px-3 py-2 text-sm">Add segment</button><button onClick={() => exportAs("srt")} className="rounded-md bg-[#e8ff47] px-4 py-2 text-sm font-semibold text-black">Export subtitles (.srt)</button><button onClick={() => exportAs("vtt")} className="rounded-md border border-[#e8ff47] px-4 py-2 text-sm font-semibold text-[#e8ff47]">Export .vtt</button></div>
    {msg && <p role="status" className="text-sm text-zinc-300">{msg}</p>}
  </div></div>);
}
