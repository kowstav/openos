import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";
export const runtime = "nodejs";
const MAX = 15 * 1024 * 1024;
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const op = String(form.get("op") || "merge");
  if (!["merge", "split", "rotate", "watermark", "metadata", "pipeline"].includes(op)) return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });
  for (const f of files) { if (f.size > MAX) return NextResponse.json({ error: "File over 15MB" }, { status: 413 }); if (!/pdf/i.test(f.type) && !f.name.endsWith(".pdf")) return NextResponse.json({ error: "Only PDF files" }, { status: 415 }); }
  try {
    const docs = await Promise.all(files.map(async (f) => PDFDocument.load(await f.arrayBuffer())));
    let out: PDFDocument;
    if (op === "merge") { out = await PDFDocument.create(); for (const d of docs) { const pages = await out.copyPages(d, d.getPageIndices()); pages.forEach((p) => out.addPage(p)); } }
    else if (op === "rotate") { out = docs[0]; out.getPages().forEach((p) => p.setRotation(degrees(((p.getRotation().angle + 90) % 360)))); }
    else if (op === "watermark") { out = docs[0]; const font = await out.embedFont(StandardFonts.HelveticaBold); const text = String(form.get("text") || "OpenOS"); out.getPages().forEach((p) => { const { width, height } = p.getSize(); p.drawText(text, { x: width / 4, y: height / 2, size: 36, font, color: rgb(0.6, 0.6, 0.65), opacity: 0.35, rotate: degrees(30) }); }); }
    else if (op === "split") { const idx = Math.max(0, parseInt(String(form.get("page") || "1"), 10) - 1); out = await PDFDocument.create(); const [p] = await out.copyPages(docs[0], [Math.min(idx, docs[0].getPageCount() - 1)]); out.addPage(p); }
    else if (op === "pipeline") {
      let steps: string[] = []; try { steps = JSON.parse(String(form.get("steps") || "[]")); } catch { return NextResponse.json({ error: "Invalid steps" }, { status: 400 }); }
      const allowed = ["merge", "split", "rotate", "watermark", "metadata"];
      if (!Array.isArray(steps) || !steps.length || steps.some((s) => !allowed.includes(s))) return NextResponse.json({ error: "Pipeline steps must be a non-empty subset of merge/split/rotate/watermark/metadata" }, { status: 400 });
      out = docs[0];
      if (steps.includes("merge") && docs.length > 1) { const merged = await PDFDocument.create(); for (const d of docs) { const ps = await merged.copyPages(d, d.getPageIndices()); ps.forEach((p) => merged.addPage(p)); } out = merged; steps = steps.filter((s) => s !== "merge"); }
      for (const s of steps) {
        if (s === "rotate") out.getPages().forEach((p) => p.setRotation(degrees((p.getRotation().angle + 90) % 360)));
        else if (s === "watermark") { const font = await out.embedFont(StandardFonts.HelveticaBold); const text = String(form.get("text") || "OpenOS"); out.getPages().forEach((p) => { const { width, height } = p.getSize(); p.drawText(text, { x: width / 4, y: height / 2, size: 36, font, color: rgb(0.6, 0.6, 0.65), opacity: 0.35, rotate: degrees(30) }); }); }
        else if (s === "split") { const idx = Math.max(0, parseInt(String(form.get("page") || "1"), 10) - 1); const single = await PDFDocument.create(); const [p] = await single.copyPages(out, [Math.min(idx, out.getPageCount() - 1)]); single.addPage(p); out = single; }
        else if (s === "metadata") { out.setTitle(String(form.get("title") || "OpenOS PDF")); out.setProducer("OpenOS · pdf-lib"); }
      }
    }
    else { out = docs[0]; out.setTitle(String(form.get("title") || "OpenOS PDF")); out.setProducer("OpenOS · pdf-lib"); }
    const bytes = await out.save();
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="openos-${op}.pdf"` } });
  } catch { return NextResponse.json({ error: "Could not process PDF — file may be encrypted or corrupt." }, { status: 422 }); }
}
