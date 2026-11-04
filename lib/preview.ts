// U1 visual preview system: classify input/transform/output from the
// evidence-backed capability schema. Fixtures are local, licensed,
// illustrative diagrams — never passed off as real run output, never
// fetched from README assets, never sent to a thumbnail/model service.
export type PreviewAsset = { kind: "diagram" | "before-after" | "waveform" | "text-pair" | "flow" | "table" | "icon"; family: "pdf" | "image" | "audio" | "ocr" | "diagram" | "data" | "generic"; accent: string; input: string; transform: string; output: string; provenance: string; rights: string; alt: string; width: number; height: number; previewType: "illustration" | "verified-result" };
const A = (p: Partial<PreviewAsset> & Pick<PreviewAsset, "kind" | "alt">): PreviewAsset => ({ family: "generic", accent: "#8a7f5c", input: "", transform: "", output: "", provenance: "OpenOS illustrative diagram derived from capability types", rights: "OpenOS (self-authored diagram)", width: 640, height: 360, previewType: "illustration", ...p });
export function previewFor(capabilityIds: string[], label: string): PreviewAsset {
  const has = (p: string) => capabilityIds.some((c) => c.startsWith(p));
  if (has("pdf.merge") || has("pdf.")) return A({ kind: "before-after", family: "pdf", accent: "#c2512f", input: "Two PDF files", transform: "Merge in order", output: "One PDF", alt: `Illustration: two miniature invoices merging into one numbered document for ${label}` });
  if (has("image.")) return A({ kind: "before-after", family: "image", accent: "#1f7a6d", input: "Product photo", transform: "Remove background", output: "Transparent PNG", alt: `Illustration: the same photographed product on its original backdrop and on checkerboard transparency for ${label}` });
  if (has("audio.")) return A({ kind: "waveform", family: "audio", accent: "#a86f14", input: "Audio file", transform: "Transcribe", output: "Timestamped transcript", alt: `Illustration: waveform with aligned timestamped transcript for ${label}` });
  if (has("ocr.")) return A({ kind: "text-pair", family: "ocr", accent: "#3d6391", input: "Image or receipt crop", transform: "Extract text", output: "Selectable text", alt: `Illustration: receipt crop beside its extracted text for ${label}` });
  if (has("diagram.")) return A({ kind: "flow", family: "diagram", accent: "#5b7a3a", input: "Text outline", transform: "Render diagram", output: "Node diagram", alt: `Illustration: text outline rendered as nodes for ${label}` });
  if (has("doc.") || has("text.")) return A({ kind: "table", family: "data", accent: "#5b7a3a", input: "Untidy input", transform: "Convert", output: "Clean output", alt: `Illustration: untidy rows becoming a clean table for ${label}` });
  return A({ kind: "icon", family: "generic", input: "Repository input", transform: "Convert", output: "Usable app", alt: `Preview unavailable: neutral type icon for ${label}` });
}
