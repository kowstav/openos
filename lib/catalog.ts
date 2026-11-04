// Evidence-backed discovery catalog (I4). No prices, no parity or runtime
// claims: every entry states what is covered, what is missing, where the
// processing happens, what it costs to run, and when the evidence was checked.
// Capability IDs here are the same IDs the builder and renderer use.
export type Comparison = { product: string; coveredFeatures: string[]; missingFeatures: string[] };
export type CatalogEntry = {
  owner: string; repo: string; label: string; blurb: string;
  category: string; collection: string;
  capabilityIds: string[]; problems: string[];
  covered: string[]; missing: string[];
  comparisons: Comparison[];
  processing: string; costNote: string; evidenceAsOf: string;
  runnable: boolean; studio?: string; adapterNote: string;
};
const AS_OF = "2026-11-04";
export const CATALOG: CatalogEntry[] = [
  { owner: "Hopding", repo: "pdf-lib", label: "PDF Toolkit", blurb: "Create and modify PDFs in any JS runtime", category: "Documents", collection: "Documents",
    capabilityIds: ["pdf.merge", "pdf.extract", "pdf.rotate", "pdf.watermark", "pdf.metadata"],
    problems: ["merge pdf", "split pdf", "invoice", "watermark document", "rotate pdf", "edit pdf"],
    covered: ["Merge documents in a chosen order", "Extract a page from each file or from a merged document", "Rotate pages", "Watermark and metadata with your values"],
    missing: ["No OCR inside scanned PDFs", "No e-signature workflow", "No PDF form designer"],
    comparisons: [{ product: "Adobe Acrobat (document editing)", coveredFeatures: ["Merge", "Extract pages", "Rotate", "Watermark", "Metadata"], missingFeatures: ["OCR of scans", "E-signatures", "Form designer", "Redaction"] }],
    processing: "Trusted OpenOS server adapter (pdf-lib); files processed in memory, never stored.", costNote: "No per-file fee; bounded by the 15 MB upload limit.", evidenceAsOf: AS_OF,
    runnable: true, studio: "/studio/pdf", adapterNote: "Trusted server adapter (pdf-lib). Files processed in memory, never stored." },
  { owner: "danielgatis", repo: "rembg", label: "Background Remover", blurb: "Remove image backgrounds with AI", category: "Images", collection: "Images",
    capabilityIds: ["image.cutout", "image.center", "image.resize", "image.export"],
    problems: ["remove background", "product photo", "marketplace photo", "transparent png", "cutout"],
    covered: ["Background cutout with transparency preview", "Centering with margins on a chosen canvas", "Batch sizing and grouped export"],
    missing: ["Hair and fine-edge quality varies by photo", "No team brand kits"],
    comparisons: [{ product: "remove.bg (background removal)", coveredFeatures: ["Single-image cutout", "Transparent PNG export"], missingFeatures: ["Bulk API at scale", "Brand kits"] }],
    processing: "Browser adapter (IMG.LY model) on this device. This is not the rembg Python package; a conversion is only labelled rembg when the pinned rembg code ran in the sandbox.", costNote: "No per-image fee; the model downloads once in the browser.", evidenceAsOf: AS_OF,
    runnable: true, studio: "/studio/image", adapterNote: "Browser ML adapter (IMG.LY model, inspired by rembg). Your image never leaves this device. rembg's Python code is not executed." },
  { owner: "naptha", repo: "tesseract.js", label: "OCR Reader", blurb: "OCR for 100+ languages, runs in browser", category: "Documents", collection: "Documents",
    capabilityIds: ["ocr.extract"],
    problems: ["ocr", "extract text from image", "scan to text", "screenshot text"],
    covered: ["Text extraction from images", "English configured; more languages loadable"],
    missing: ["No layout or table reconstruction", "Handwriting support is weak"],
    comparisons: [{ product: "Adobe Acrobat OCR", coveredFeatures: ["Text extraction from images"], missingFeatures: ["Layout reconstruction", "Integrated PDF editing"] }],
    processing: "Entirely in your browser via WebAssembly; the image is never uploaded.", costNote: "No per-page fee.", evidenceAsOf: AS_OF,
    runnable: true, studio: "/studio/ocr", adapterNote: "Runs entirely in your browser via WebAssembly. Image never uploaded." },
  { owner: "SYSTRAN", repo: "faster-whisper", label: "Speech to Text", blurb: "Fast Whisper transcription with CTranslate2", category: "Audio", collection: "Audio",
    capabilityIds: ["audio.transcribe", "audio.subtitles"],
    problems: ["transcribe audio", "subtitles", "meeting notes", "speech to text", "podcast transcript"],
    covered: ["Timestamped transcript editing once transcription runs", "SRT and WebVTT subtitle export"],
    missing: ["Transcription itself needs a Python runtime that is not configured here", "No speaker diarization in the base model"],
    comparisons: [{ product: "Otter.ai / Descript (transcription)", coveredFeatures: ["Timestamped editing", "Subtitle export"], missingFeatures: ["Live meeting capture", "Speaker diarization", "Hosted collaboration"] }],
    processing: "Requires the isolated Python sandbox (faster-whisper). Without it, OpenOS shows the requirement instead of faking a transcript.", costNote: "Compute depends on audio length and the configured sandbox; nothing is charged by OpenOS itself.", evidenceAsOf: AS_OF,
    runnable: false, studio: "/studio/audio", adapterNote: "Integration and subtitle tooling are ready; live transcription is blocked until a Python sandbox with the model is configured." },
  { owner: "mozilla", repo: "pdf.js", label: "PDF Viewer", blurb: "Mozilla's PDF reader in JavaScript", category: "Documents", collection: "Documents",
    capabilityIds: ["pdf.view"],
    problems: ["view pdf", "read pdf in browser", "pdf reader"],
    covered: ["In-browser PDF rendering (upstream capability)"], missing: ["No editing in OpenOS yet"],
    comparisons: [{ product: "Adobe Acrobat Reader", coveredFeatures: ["Viewing PDFs"], missingFeatures: ["Editing", "Signing"] }],
    processing: "Upstream library; no OpenOS adapter yet.", costNote: "Not runnable in OpenOS.", evidenceAsOf: AS_OF,
    runnable: false, adapterNote: "Analysis only for now. No vetted OpenOS adapter yet." },
  { owner: "markedjs", repo: "marked", label: "Markdown Editor", blurb: "Fast Markdown parser and compiler", category: "Writing", collection: "Writing",
    capabilityIds: ["text.markdown"],
    problems: ["markdown", "write docs", "readme", "notes to html"],
    covered: ["Markdown to HTML (upstream capability)"], missing: ["No hosted editor in OpenOS yet"],
    comparisons: [{ product: "Notion (notes)", coveredFeatures: ["Markdown conversion"], missingFeatures: ["Hosted workspace", "Collaboration"] }],
    processing: "Upstream library; converted through the general engine when selected.", costNote: "Sandbox compute only.", evidenceAsOf: AS_OF,
    runnable: false, adapterNote: "Analysis only for now. No vetted OpenOS adapter yet." },
  { owner: "mermaid-js", repo: "mermaid", label: "Diagram Maker", blurb: "Diagrams from text, like Markdown", category: "Writing", collection: "Writing",
    capabilityIds: ["diagram.render"],
    problems: ["flowchart", "diagram", "org chart", "sequence diagram"],
    covered: ["Text-to-diagram rendering (upstream capability)"], missing: ["No drag-and-drop canvas in OpenOS yet"],
    comparisons: [{ product: "Lucidchart / Miro (diagrams)", coveredFeatures: ["Text-defined diagrams"], missingFeatures: ["Drag-and-drop canvas", "Real-time collaboration"] }],
    processing: "Upstream library; no OpenOS adapter yet.", costNote: "Not runnable in OpenOS.", evidenceAsOf: AS_OF,
    runnable: false, adapterNote: "Analysis only for now. No vetted OpenOS adapter yet." },
  { owner: "jgm", repo: "pandoc", label: "Doc Converter", blurb: "Universal document converter", category: "Documents", collection: "Documents",
    capabilityIds: ["doc.convert"],
    problems: ["convert document", "docx to pdf", "markdown to docx", "epub"],
    covered: ["Dozens of format conversions (upstream capability)"], missing: ["Needs a native binary sandbox; not runnable in OpenOS yet"],
    comparisons: [{ product: "CloudConvert (conversion)", coveredFeatures: ["Many format pairs (upstream)"], missingFeatures: ["Hosted conversion in OpenOS"] }],
    processing: "Native binary; requires-infrastructure in OpenOS.", costNote: "Not runnable in OpenOS.", evidenceAsOf: AS_OF,
    runnable: false, adapterNote: "Honest plan only: Pandoc is a native binary. OpenOS will not fake conversion." },
];
export function searchCatalog(q: string): CatalogEntry[] {
  const s = q.trim().toLowerCase(); if (!s) return CATALOG;
  return CATALOG.filter((e) => [e.label, e.repo, e.owner, e.category, e.blurb, ...e.problems, ...e.comparisons.map((c) => c.product), ...e.covered, ...e.capabilityIds].join(" ").toLowerCase().includes(s));
}
