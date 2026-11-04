import { describe, expect, it } from "vitest";
import { previewFor } from "../lib/preview";
import { statusLabel, reasonCopy } from "../lib/status";
describe("U1 preview classification", () => {
  it("classifies pdf/image/audio/ocr/unknown", () => {
    expect(previewFor(["pdf.merge"], "PDF").kind).toBe("before-after");
    expect(previewFor(["image.cutout"], "Img").alt).toContain("checkerboard");
    expect(previewFor(["audio.transcribe"], "A").kind).toBe("waveform");
    expect(previewFor(["ocr.extract"], "O").kind).toBe("text-pair");
    const u = previewFor(["x.y"], "Z"); expect(u.previewType).toBe("illustration"); expect(u.provenance).toContain("illustrative");
  });
});
describe("U2 status vocabulary", () => {
  it("maps states and reason codes", () => {
    expect(statusLabel(true).label).toBe("Ready to use");
    expect(statusLabel(false).label).toBe("Needs a runtime");
    expect(reasonCopy("password-pdf")).toContain("password-protected");
  });
});
