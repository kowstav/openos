export type CatalogEntry = {
  owner: string; repo: string; label: string; blurb: string;
  category: string; replaces: { name: string; price: string }[];
  problems: string[]; covered: string[]; missing: string[];
  runnable: boolean; studio?: string; adapterNote: string;
};
export const CATALOG: CatalogEntry[] = [
  { owner: "Hopding", repo: "pdf-lib", label: "PDF Toolkit", blurb: "Create & modify PDFs in any JS runtime", category: "Documents",
    replaces: [{ name: "Adobe Acrobat Pro", price: "$19.99/mo" }, { name: "Smallpdf Pro", price: "$12/mo" }],
    problems: ["merge pdf", "split pdf", "invoice", "watermark document", "rotate pdf", "edit pdf"],
    covered: ["Merge & split PDFs", "Rotate pages", "Watermarks & metadata", "Runs entirely on your files"],
    missing: ["No OCR inside scanned PDFs", "No e-signature workflow", "No PDF form designer"],
    runnable: true, studio: "/studio/pdf", adapterNote: "Trusted server adapter (pdf-lib). Files processed in memory, never stored." },
  { owner: "danielgatis", repo: "rembg", label: "Background Remover", blurb: "Remove image backgrounds with AI", category: "Images",
    replaces: [{ name: "remove.bg", price: "$9/mo+" }, { name: "Adobe Express BG Remover", price: "$9.99/mo" }],
    problems: ["remove background", "product photo", "marketplace photo", "transparent png", "cutout"],
    covered: ["AI background removal", "Transparent PNG export", "Resize for marketplaces", "Runs locally in your browser"],
    missing: ["No batch API at scale", "Hair/fine-edge quality varies by photo", "No team brand kits"],
    runnable: true, studio: "/studio/image", adapterNote: "Browser ML adapter (IMG.LY model, inspired by rembg). Your image never leaves this device. rembg's Python code is not executed." },
  { owner: "naptha", repo: "tesseract.js", label: "OCR Reader", blurb: "OCR for 100+ languages, runs in browser", category: "Documents",
    replaces: [{ name: "Adobe Acrobat OCR", price: "$19.99/mo" }, { name: "ABBYY FineReader", price: "$16/mo" }],
    problems: ["ocr", "extract text from image", "scan to text", "screenshot text"],
    covered: ["Text extraction from images", "100+ languages (English configured)", "Image never uploaded"],
    missing: ["No layout/table reconstruction", "Handwriting support is weak"],
    runnable: true, studio: "/studio/ocr", adapterNote: "Runs entirely in your browser via WebAssembly. Image never uploaded." },
  { owner: "SYSTRAN", repo: "faster-whisper", label: "Speech to Text", blurb: "Fast Whisper transcription with CTranslate2", category: "Audio",
    replaces: [{ name: "Otter.ai", price: "$16.99/mo" }, { name: "Descript", price: "$24/mo" }],
    problems: ["transcribe audio", "subtitles", "meeting notes", "speech to text", "podcast transcript"],
    covered: ["High-accuracy transcription (upstream)", "Timestamps & subtitles (upstream)", "Runs on your own hardware (upstream)"],
    missing: ["Not yet runnable in OpenOS — needs a GPU sandbox", "No speaker diarization in base model"],
    runnable: false, adapterNote: "Honest plan only: transcription needs a Python/GPU runtime. OpenOS will not fake a deploy." },
  { owner: "mozilla", repo: "pdf.js", label: "PDF Viewer", blurb: "Mozilla's PDF reader in JavaScript", category: "Documents",
    replaces: [{ name: "Adobe Acrobat Reader Pro features", price: "$19.99/mo" }],
    problems: ["view pdf", "read pdf in browser", "pdf reader"],
    covered: ["In-browser PDF rendering (upstream)"], missing: ["Viewer only — no editing in OpenOS yet"],
    runnable: false, adapterNote: "Analysis only for now. No vetted OpenOS adapter yet." },
  { owner: "markedjs", repo: "marked", label: "Markdown Editor", blurb: "Fast Markdown parser & compiler", category: "Writing",
    replaces: [{ name: "Notion AI add-on", price: "$10/mo" }],
    problems: ["markdown", "write docs", "readme", "notes to html"],
    covered: ["Markdown → HTML (upstream)"], missing: ["No hosted editor in OpenOS yet"],
    runnable: false, adapterNote: "Analysis only for now. No vetted OpenOS adapter yet." },
  { owner: "mermaid-js", repo: "mermaid", label: "Diagram Maker", blurb: "Diagrams from text, like Markdown", category: "Writing",
    replaces: [{ name: "Lucidchart", price: "$9/mo" }, { name: "Miro", price: "$10/mo" }],
    problems: ["flowchart", "diagram", "org chart", "sequence diagram"],
    covered: ["Text-to-diagram rendering (upstream)"], missing: ["No drag-and-drop canvas in OpenOS yet"],
    runnable: false, adapterNote: "Analysis only for now. No vetted OpenOS adapter yet." },
  { owner: "jgm", repo: "pandoc", label: "Doc Converter", blurb: "Universal document converter", category: "Documents",
    replaces: [{ name: "CloudConvert", price: "$9/mo+" }],
    problems: ["convert document", "docx to pdf", "markdown to docx", "epub"],
    covered: ["Dozens of format conversions (upstream)"], missing: ["Needs a native binary sandbox — not runnable in OpenOS yet"],
    runnable: false, adapterNote: "Honest plan only: Pandoc is a native binary. OpenOS will not fake conversion." },
];
export function searchCatalog(q: string): CatalogEntry[] {
  const s = q.trim().toLowerCase(); if (!s) return CATALOG;
  return CATALOG.filter((e) => [e.label, e.repo, e.owner, e.category, e.blurb, ...e.problems, ...e.replaces.map((r) => r.name), ...e.covered].join(" ").toLowerCase().includes(s));
}
