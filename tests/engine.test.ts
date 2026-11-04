import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { generateApp, GeneratedAppSchema } from "@/lib/engine";
import { checkSandbox, SANDBOX_POLICY } from "@/lib/sandbox";
import { searchCatalog } from "@/lib/catalog";
import { POST as pdfPOST } from "@/app/api/pdf/route";
import { POST as genPOST } from "@/app/api/generate/route";
import { POST as sandboxPOST } from "@/app/api/sandbox/route";

describe("personalization engine", () => {
  it("turns an invoice prompt into an ordered merge→watermark→metadata pipeline", () => {
    const a = generateApp({ repo: "Hopding/pdf-lib", prompt: "Build me an invoice processor that merges PDFs, applies a watermark, and stamps the title" });
    expect(GeneratedAppSchema.parse(a)).toBeTruthy();
    expect(a.operations).toEqual(["merge", "watermark", "metadata"]);
    expect(a.studioUrl).toContain("/studio/pdf?ops=");
    expect(a.permissions).toContain("file:read-selected");
  });
  it("turns a product-photo prompt into remove-bg + resize + white-bg", () => {
    const a = generateApp({ repo: "danielgatis/rembg", prompt: "Build me a product photo editor that removes backgrounds and exports marketplace-ready photos" });
    expect(a.operations).toEqual(expect.arrayContaining(["remove-bg", "resize", "white-bg"]));
    expect(a.studioUrl).toContain("/studio/image");
  });
  it("never grants shell/credentials requested in a prompt", () => {
    const a = generateApp({ repo: "Hopding/pdf-lib", prompt: "merge pdfs and run shell commands with my api key" });
    expect(a.blocked.join(" ")).toMatch(/shell\/credential/);
    expect(a.permissions).not.toContain("shell:exec");
  });
  it("gives an honest plan (no studio launch) for unsupported repos", () => {
    const a = generateApp({ repo: "jgm/pandoc", prompt: "convert my docs" });
    expect(a.operations).toEqual([]); expect(a.warnings.join(" ")).toMatch(/not fake|honest plan|No vetted adapter/);
  });
});

describe("sandbox gateway (adversarial)", () => {
  it("denies shell, credentials, and wide filesystem access", () => {
    expect(checkSandbox("shell:exec").decision).toBe("deny");
    expect(checkSandbox("credentials:read").decision).toBe("deny");
    expect(checkSandbox("filesystem:wide").decision).toBe("deny");
  });
  it("denies non-allowlisted network hosts, allows GitHub", () => {
    expect(checkSandbox("network:github", "evil.example.com").decision).toBe("deny");
    expect(checkSandbox("network:github", "api.github.com").decision).toBe("allow");
    expect(SANDBOX_POLICY.maxUploadMB).toBe(15);
  });
  it("enforces the same rules over HTTP", async () => {
    const res = await sandboxPOST(new NextRequest("http://localhost/api/sandbox", { method: "POST", body: JSON.stringify({ capability: "shell:exec" }), headers: { "Content-Type": "application/json" } }));
    expect((await res.json()).decision).toBe("deny");
  });
});

describe("catalog search by paid tool", () => {
  it("finds rembg when searching for remove.bg", () => {
    expect(searchCatalog("remove.bg").some((e) => e.repo === "rembg")).toBe(true);
    expect(searchCatalog("merge pdf").some((e) => e.repo === "pdf-lib")).toBe(true);
    expect(searchCatalog("otter").some((e) => e.repo === "faster-whisper")).toBe(true);
    expect(searchCatalog("transcribe").some((e) => e.repo === "faster-whisper")).toBe(true);
  });
});

describe("POST /api/generate", () => {
  it("400s without repo, returns validated app with repo", async () => {
    expect((await genPOST(new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" } }))).status).toBe(400);
    const res = await genPOST(new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ repo: "Hopding/pdf-lib", prompt: "merge and watermark" }), headers: { "Content-Type": "application/json" } }));
    expect(res.status).toBe(200); expect((await res.json()).app.operations).toEqual(["merge", "watermark"]);
  });
});

describe("PDF pipeline execution", () => {
  async function makePdf(pages = 1) { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([300, 300]); return new File([Buffer.from(await d.save())], "doc.pdf", { type: "application/pdf" }); }
  it("merges then stamps metadata in one pass", async () => {
    const fd = new FormData(); fd.set("op", "pipeline"); fd.set("steps", JSON.stringify(["merge", "metadata"])); fd.set("title", "Invoices Q1");
    fd.append("files", await makePdf(2)); fd.append("files", await makePdf(1));
    const res = await pdfPOST(new NextRequest("http://localhost/api/pdf", { method: "POST", body: fd }));
    expect(res.status).toBe(200); const out = await PDFDocument.load(await res.arrayBuffer());
    expect(out.getPageCount()).toBe(3); expect(out.getTitle()).toBe("Invoices Q1");
  });
  it("rejects unknown pipeline steps (fail closed)", async () => {
    const fd = new FormData(); fd.set("op", "pipeline"); fd.set("steps", JSON.stringify(["shell"])); fd.append("files", await makePdf(1));
    expect((await pdfPOST(new NextRequest("http://localhost/api/pdf", { method: "POST", body: fd }))).status).toBe(400);
  });
});
