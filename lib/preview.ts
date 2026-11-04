// U1 visual preview system: classify input/transform/output from the
// evidence-backed capability schema. Fixtures are local, licensed,
// illustrative diagrams — never passed off as real run output, never
// fetched from README assets, never sent to a thumbnail/model service.
export type PreviewAsset = { kind: "diagram" | "before-after" | "waveform" | "text-pair" | "flow" | "table" | "icon"; input: string; transform: string; output: string; provenance: string; rights: string; alt: string; width: number; height: number; previewType: "illustration" | "verified-result" };
const A = (p: Partial<PreviewAsset> & Pick<PreviewAsset, "kind" | "alt">): PreviewAsset => ({ input: "", transform: "", output: "", provenance: "OpenOS illustrative diagram derived from capability types", rights: "OpenOS (self-authored diagram)", width: 640, height: 360, previewType: "illustration", ...p });
export function previewFor(capabilityIds: string[], label: string): PreviewAsset {
  const has = (p: string) => capabilityIds.some((c) => c.startsWith(p));
  if (has("pdf.merge") || has("pdf.")) return A({ kind: "before-after", input: "Two PDF files", transform: "Merge in order", output: "One PDF", alt: `Illustration: two page stacks merging into one numbered document for ${label}` });
  if (has("image.")) return A({ kind: "before-after", input: "Product photo", transform: "Remove background", output: "Transparent PNG", alt: `Illustration: same product photo on its backdrop and on checkerboard transparency for ${label}` });
  if (has("audio.")) return A({ kind: "waveform", input: "Audio file", transform: "Transcribe", output: "Timestamped transcript", alt: `Illustration: waveform with aligned timestamped transcript for ${label}` });
  if (has("ocr.")) return A({ kind: "text-pair", input: "Image or receipt crop", transform: "Extract text", output: "Selectable text", alt: `Illustration: receipt crop beside its extracted text for ${label}` });
  if (has("diagram.")) return A({ kind: "flow", input: "Text outline", transform: "Render diagram", output: "Node diagram", alt: `Illustration: text outline rendered as nodes for ${label}` });
  if (has("doc.") || has("text.")) return A({ kind: "table", input: "Untidy input", transform: "Convert", output: "Clean output", alt: `Illustration: untidy rows becoming a clean table for ${label}` });
  return A({ kind: "icon", input: "Repository input", transform: "Convert", output: "Usable app", alt: `Preview unavailable: neutral type icon for ${label}` });
}
