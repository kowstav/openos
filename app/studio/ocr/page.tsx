"use client";
import { useState } from "react";
import Link from "next/link";
export default function Page() {
  const [busy, setBusy] = useState(false); const [prog, setProg] = useState(0); const [text, setText] = useState(""); const [err, setErr] = useState("");
  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(""); setText(""); setProg(0);
    const file = new FormData(e.currentTarget).get("image") as File;
    if (!file) { setErr("Choose an image first."); setBusy(false); return; }
    try { const T = (await import("tesseract.js")).default; const r = await T.recognize(file, "eng", { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") setProg(Math.round(m.progress * 100)); } }); setText(r.data.text || "(no text found)"); }
    catch { setErr("OCR failed — try a clearer image."); } finally { setBusy(false); }
  }
  return (<div className="py-10"><Link href="/" className="text-sm text-[#5c5747]">← Discover</Link><h1 className="font-display mt-4 text-4xl">OCR Reader</h1><p className="mt-2 max-w-xl text-[#5c5747]">Built on <strong className="text-[#1c1a14]">Tesseract.js</strong>. Recognition runs entirely in your browser — your image is never uploaded.</p>
  <form onSubmit={run} className="mt-8 max-w-2xl space-y-4 rounded-xl border border-[#1c1a14] bg-[#fffdf6] p-6">
    <label className="block rounded-xl border border-dashed border-[#1c1a14]/40 p-6 text-center text-sm text-[#3d392c] cursor-pointer">Choose an image (PNG/JPG)<input name="image" type="file" accept="image/*" required className="mt-3 block w-full text-xs" /></label>
    <button disabled={busy} className="rounded-lg bg-[#d9e021] ring-2 ring-[#1c1a14] px-5 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? `Reading… ${prog}%` : "Extract text"}</button>
    {busy && <progress value={prog} max={100} className="w-full" aria-label="OCR progress" />}
    {err && <p role="alert" className="text-sm text-[#8a2f23]">{err}</p>}
    {text && <><textarea readOnly value={text} rows={10} className="w-full rounded-lg border border-[#1c1a14]/30 bg-white p-3 text-sm" aria-label="Extracted text" /><button type="button" onClick={() => { const b = new Blob([text], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "openos-ocr.txt"; a.click(); }} className="rounded-lg border border-[#e8ff47] px-4 py-2 text-sm font-semibold text-[#1c1a14]">⬇ Download .txt</button></>}
  </form></div>);
}
