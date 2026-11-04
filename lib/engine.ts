import { z } from "zod";
import { authorize, type Capability } from "./permissions";
export const GeneratedAppSchema = z.object({
  id: z.string(), title: z.string(), repo: z.string(), prompt: z.string(),
  studioUrl: z.string(), source: z.enum(["rules", "muse-wonder-1.0"]),
  operations: z.array(z.string()), steps: z.array(z.object({ op: z.string(), label: z.string() })),
  inputs: z.array(z.string()), outputs: z.array(z.string()),
  permissions: z.array(z.string()), blocked: z.array(z.string()),
  warnings: z.array(z.string()), createdAt: z.number(),
});
export type GeneratedApp = z.infer<typeof GeneratedAppSchema>;
const PDF_OPS: Record<string, string> = { merge: "Merge PDFs", split: "Extract one page", rotate: "Rotate 90°", watermark: "Add watermark", metadata: "Stamp metadata" };
const IMG_OPS: Record<string, string> = { "remove-bg": "AI background removal", resize: "Resize image", "white-bg": "White marketplace background", compress: "Compress export" };
function pick(text: string, table: Record<string, string>, rules: [RegExp, string][], fallback: string[]): string[] {
  const found: string[] = [];
  for (const [re, op] of rules) if (re.test(text) && !found.includes(op)) found.push(op);
  for (const op of fallback) if (!found.length) found.push(op);
  return found.filter((o) => table[o]);
}
export function generateApp(input: { repo: string; prompt: string; selectedCapabilities?: string[]; workflowOrder?: string[] }): GeneratedApp {
  const prompt = (input.prompt || "").trim();
  const t = prompt.toLowerCase(); const repo = input.repo;
  let operations: string[] = []; let studioUrl = "/workspace"; let title = ""; let inputs: string[] = []; let outputs: string[] = [];
  const warnings: string[] = [];
  if (/pdf-lib/i.test(repo)) {
    operations = pick(t, PDF_OPS, [[/merge|combin|join|invoice/, "merge"], [/split|extract|single page|one page/, "split"], [/rotat|sideways/, "rotate"], [/watermark|stamp|brand|company name|confidential/, "watermark"], [/title|metadata|organize|rename/, "metadata"]], ["merge"]);
    // The person's chosen order IS the execution order. OpenOS never
    // re-sorts steps into a different pipeline than the one they picked.
    studioUrl = `/studio/pdf?ops=${operations.join(",")}`; inputs = ["PDF file(s) you select"]; outputs = ["Processed PDF download"];
    title = /invoice/.test(t) ? "Invoice Processor" : "My PDF Workflow";
  } else if (/rembg|imgly/i.test(repo)) {
    operations = pick(t, IMG_OPS, [[/background|remove|cutout|transparent/, "remove-bg"], [/resize|marketplace|etsy|amazon|shopify|\d{3,4}px/, "resize"], [/white/, "white-bg"], [/compress|smaller|web/, "compress"]], ["remove-bg"]);
    if ((/marketplace|etsy|amazon|shopify|product/.test(t)) && !operations.includes("resize")) operations.push("resize");
    if ((/marketplace|etsy|amazon|shopify/.test(t)) && !operations.includes("white-bg")) operations.push("white-bg");
    studioUrl = `/studio/image?ops=${operations.join(",")}`; inputs = ["Image you select (stays on device)"]; outputs = ["PNG/JPG download"];
    title = /product|marketplace|etsy|shop/.test(t) ? "Product Photo Studio" : "Background Remover";
  } else if (/tesseract/i.test(repo)) {
    operations = ["ocr"]; studioUrl = "/studio/ocr"; inputs = ["Image you select"]; outputs = ["Extracted text (.txt)"];
    title = "OCR Reader";
  } else {
    operations = []; studioUrl = "/workspace";
    title = "Implementation plan";
    warnings.push("No vetted adapter for this repository yet. OpenOS saved an honest plan — it did not deploy untested code.");
  }
  const table = /pdf-lib/i.test(repo) ? PDF_OPS : IMG_OPS;
  const wanted: Capability[] = /pdf-lib/i.test(repo) ? ["file:read-selected", "file:download"] : ["file:read-selected", "file:download"];
  const permissions: string[] = []; const blocked: string[] = [];
  // An explicit selection (canonical capability ids, in the person's order)
  // is authoritative: the app runs exactly those operations in that order.
  // Nothing selected is silently dropped and nothing unselected is added.
  if (input.workflowOrder?.length && operations.length) {
    const capToOp: Record<string, string> = { "pdf.merge": "merge", "pdf.extract": "split", "pdf.rotate": "rotate", "pdf.watermark": "watermark", "pdf.metadata": "metadata", "image.cutout": "remove-bg", "image.center": "center", "image.resize": "resize", "image.export": "compress", "ocr.extract": "ocr" };
    const chosen = input.workflowOrder.map((id) => capToOp[id]).filter(Boolean);
    if (chosen.length) operations = [...new Set(chosen)];
    const unmapped = input.workflowOrder.filter((id) => !capToOp[id]);
    if (unmapped.length) blocked.push(`Selected capabilities have no operation in this adapter: ${unmapped.join(", ")} — the app was not built around them.`);
  } else if (input.selectedCapabilities?.length && operations.length) {
    warnings.push(`Your capability selection was noted (${input.selectedCapabilities.length} selected). Operations above are the executable subset.`);
  }
  const steps = operations.map((op) => ({ op, label: table[op] || op }));
  if (operations.includes("ocr")) steps.splice(0, steps.length, { op: "ocr", label: "Extract text (OCR)" });
  for (const c of wanted) (authorize(c) === "deny" ? blocked : permissions).push(c);
  if (/camera|microphone|mic\b/.test(t)) { blocked.push("camera/microphone requested in prompt — requires explicit gateway approval, never granted by the model"); }
  if (/shell|credential|password|api key/.test(t)) { blocked.push("shell/credential access requested in prompt — always denied by the permission gateway"); }
  return GeneratedAppSchema.parse({
    id: Math.random().toString(36).slice(2, 10), title: prompt ? `${title}: ${prompt.slice(0, 60)}` : title,
    repo, prompt, studioUrl, source: "rules", operations, steps, inputs, outputs, permissions, blocked, warnings, createdAt: Date.now(),
  });
}
