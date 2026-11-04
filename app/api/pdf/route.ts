import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";
import { validatePipeline, type PdfStep } from "@/lib/pdf-pipeline";
import { requireUser } from "@/lib/auth";
import { checkQuota } from "@/lib/ratelimit";
export const runtime = "nodejs";
const MAX = 15 * 1024 * 1024;
// Trusted pdf-lib adapter (I4). Semantics are explicit:
//  - `extract` is a file-list step: it takes the chosen page from EACH
//    current document, producing one single-page document per input.
//  - `merge` is a combining step: it concatenates the current documents.
//  - rotate/watermark/metadata act on every current document.
// Steps run in the DECLARED order and invalid combinations are rejected
// before processing. So [extract, merge] on two files yields the first
// page of each (2 pages), while [merge, extract] yields 1 page total.
// If the pipeline ends with several documents and no merge, they are
// concatenated in order for the single download.
async function mergeDocs(docs: PDFDocument[]): Promise<PDFDocument> {
  const merged = await PDFDocument.create();
  for (const d of docs) { const ps = await merged.copyPages(d, d.getPageIndices()); ps.forEach((p) => merged.addPage(p)); }
  return merged;
}
export async function POST(req: NextRequest) {
  // S3 sibling fix: studios are data-access paths, not anonymous compute.
  // Require a server session and bound per-user work before parsing input.
  const u = await requireUser(req);
  if (!u) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const quota = checkQuota("pdf", u.userId);
  if (!quota.ok) return NextResponse.json({ error: quota.reason }, { status: 429 });
  const form = await req.formData();
  const op = String(form.get("op") || "merge");
  if (!["merge", "extract", "split", "rotate", "watermark", "metadata", "pipeline"].includes(op)) return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });
  // S2-4: validate type/size/magic bytes on the server BEFORE parsing.
  for (const f of files) {
    if (f.size > MAX) return NextResponse.json({ error: "File over 15MB" }, { status: 413 });
    if (f.size === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
    if (!/pdf/i.test(f.type) && !f.name.endsWith(".pdf")) return NextResponse.json({ error: "Only PDF files" }, { status: 415 });
    const head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== "%PDF-") return NextResponse.json({ error: "File is not a PDF (bad header) — treated as corrupt before parsing" }, { status: 422 });
  }
  let steps: PdfStep[];
  if (op === "pipeline") {
    try { steps = JSON.parse(String(form.get("steps") || "[]")); } catch { return NextResponse.json({ error: "Invalid steps" }, { status: 400 }); }
  } else steps = [op === "split" ? "extract" : (op as PdfStep)];
  const invalid = validatePipeline(steps as string[], files.length);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  try {
    let current = await Promise.all(files.map(async (f) => PDFDocument.load(await f.arrayBuffer())));
    const page = Math.max(1, parseInt(String(form.get("page") || "1"), 10) || 1);
    for (const step of steps) {
      if (step === "merge") current = [await mergeDocs(current)];
      else if (step === "extract") {
        const next: PDFDocument[] = [];
        for (const d of current) { const single = await PDFDocument.create(); const [p] = await single.copyPages(d, [Math.min(page - 1, d.getPageCount() - 1)]); single.addPage(p); next.push(single); }
        current = next;
      } else if (step === "rotate") current.forEach((d) => d.getPages().forEach((p) => p.setRotation(degrees((p.getRotation().angle + 90) % 360))));
      else if (step === "watermark") {
        const text = String(form.get("text") || "OpenOS").slice(0, 80);
        for (const d of current) { const font = await d.embedFont(StandardFonts.HelveticaBold); d.getPages().forEach((p) => { const { width, height } = p.getSize(); p.drawText(text, { x: width / 4, y: height / 2, size: 36, font, color: rgb(0.6, 0.6, 0.65), opacity: 0.35, rotate: degrees(30) }); }); }
      } else current.forEach((d) => { d.setTitle(String(form.get("title") || "OpenOS PDF").slice(0, 200)); d.setProducer("OpenOS · pdf-lib"); });
    }
    const out = current.length === 1 ? current[0] : await mergeDocs(current);
    const bytes = await out.save();
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="openos-${op}.pdf"`, "X-OpenOS-Steps": steps.join(">") } });
  } catch { return NextResponse.json({ error: "Could not process PDF — file may be encrypted or corrupt." }, { status: 422 }); }
}
