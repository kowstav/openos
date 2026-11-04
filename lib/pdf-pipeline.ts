// Declared-order pipeline validation for the trusted PDF adapter (I4).
// Kept out of the route module: Next.js route files may only export
// handlers and config, and tests import this directly.
export const PDF_STEPS = ["merge", "extract", "rotate", "watermark", "metadata"] as const;
export type PdfStep = (typeof PDF_STEPS)[number];
export function validatePipeline(steps: string[], fileCount: number): string | null {
  if (!Array.isArray(steps) || !steps.length) return "Pipeline steps must be a non-empty ordered list";
  if (steps.length > 5) return "Pipeline has too many steps (5 max)";
  for (const s of steps) if (!(PDF_STEPS as readonly string[]).includes(s)) return `Unknown pipeline step: ${s}`;
  if (new Set(steps).size !== steps.length) return "Pipeline steps must not repeat";
  if (steps[0] === "merge" && fileCount < 2) return "Merge needs at least two files";
  return null;
}
