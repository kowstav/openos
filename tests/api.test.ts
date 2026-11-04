import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { parseGitHubUrl } from "@/lib/github";
import { authorize, policyTable } from "@/lib/permissions";
import { BlueprintSchema } from "@/lib/schemas";
import { POST as pdfPOST } from "@/app/api/pdf/route";
import { GET as githubGET } from "@/app/api/github/route";
import { POST as analyzePOST } from "@/app/api/analyze/route";

async function makePdf(pages = 1) { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([300, 300]); return new File([Buffer.from(await d.save())], "doc.pdf", { type: "application/pdf" }); }
function pdfReq(fd: FormData) { return new NextRequest("http://localhost/api/pdf", { method: "POST", body: fd }); }

describe("parseGitHubUrl", () => {
  it("parses full URL, shorthand and .git", () => {
    expect(parseGitHubUrl("https://github.com/Hopding/pdf-lib")).toEqual({ owner: "Hopding", repo: "pdf-lib" });
    expect(parseGitHubUrl("naptha/tesseract.js")).toEqual({ owner: "naptha", repo: "tesseract.js" });
    expect(parseGitHubUrl("https://github.com/a/b.git")).toEqual({ owner: "a", repo: "b" });
  });
  it("rejects garbage", () => { expect(parseGitHubUrl("not a repo")).toBeNull(); expect(parseGitHubUrl("")).toBeNull(); });
});

describe("permission gateway (deterministic)", () => {
  it("allows selected-file read, denies shell/credentials/filesystem", () => {
    expect(authorize("file:read-selected")).toBe("allow");
    expect(authorize("shell:exec")).toBe("deny");
    expect(authorize("credentials:read")).toBe("deny");
    expect(authorize("filesystem:wide")).toBe("deny");
    expect(authorize("camera")).toBe("ask");
    expect(policyTable().length).toBeGreaterThanOrEqual(8);
  });
});

describe("BlueprintSchema", () => {
  it("applies defaults and rejects wrong types", () => {
    const b = BlueprintSchema.parse({ purpose: "p", summary: "s" });
    expect(b.capabilities).toEqual([]); expect(b.supported).toBe(false);
    expect(() => BlueprintSchema.parse({ purpose: 1, summary: "s" })).toThrow();
  });
});

describe("POST /api/pdf", () => {
  it("merges two PDFs into one with summed pages", async () => {
    const fd = new FormData(); fd.set("op", "merge"); fd.append("files", await makePdf(2)); fd.append("files", await makePdf(1));
    const res = await pdfPOST(pdfReq(fd));
    expect(res.status).toBe(200); expect(res.headers.get("content-type")).toContain("application/pdf");
    const out = await PDFDocument.load(await res.arrayBuffer()); expect(out.getPageCount()).toBe(3);
  });
  it("rotates pages 90 degrees", async () => {
    const fd = new FormData(); fd.set("op", "rotate"); fd.append("files", await makePdf(1));
    const out = await PDFDocument.load(await (await pdfPOST(pdfReq(fd))).arrayBuffer());
    expect(out.getPage(0).getRotation().angle).toBe(90);
  });
  it("splits to exactly one page and stamps metadata title", async () => {
    const fd = new FormData(); fd.set("op", "split"); fd.set("page", "2"); fd.append("files", await makePdf(3));
    const out = await PDFDocument.load(await (await pdfPOST(pdfReq(fd))).arrayBuffer()); expect(out.getPageCount()).toBe(1);
    const fd2 = new FormData(); fd2.set("op", "metadata"); fd2.set("title", "Report"); fd2.append("files", await makePdf(1));
    const out2 = await PDFDocument.load(await (await pdfPOST(pdfReq(fd2))).arrayBuffer()); expect(out2.getTitle()).toBe("Report");
  });
  it("rejects missing files (400), non-PDF (415) and corrupt PDF (422)", async () => {
    const empty = new FormData(); empty.set("op", "merge");
    expect((await pdfPOST(pdfReq(empty))).status).toBe(400);
    const txt = new FormData(); txt.append("files", new File(["hi"], "a.txt", { type: "text/plain" }));
    expect((await pdfPOST(pdfReq(txt))).status).toBe(415);
    const bad = new FormData(); bad.append("files", new File(["not-a-pdf"], "a.pdf", { type: "application/pdf" }));
    expect((await pdfPOST(pdfReq(bad))).status).toBe(422);
  });
});

describe("GET /api/github", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("400s on missing and invalid URLs", async () => {
    expect((await githubGET(new NextRequest("http://localhost/api/github"))).status).toBe(400);
    expect((await githubGET(new NextRequest("http://localhost/api/github?url=not-a-url"))).status).toBe(400);
  });
  it("returns live-shaped repo data (fetch mocked at network boundary)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => u.includes("/languages") ? { ok: true, json: async () => ({ TypeScript: 1 }) } : u.includes("/readme") ? { ok: true, text: async () => "# Hi" } : { ok: true, json: async () => ({ full_name: "Hopding/pdf-lib", description: "PDFs", stargazers_count: 10, forks_count: 2, language: "TypeScript", license: { spdx_id: "MIT" }, default_branch: "master", pushed_at: "2024-01-01", html_url: "https://github.com/Hopding/pdf-lib", topics: [], updated_at: "", open_issues_count: 0 }) }));
    const res = await githubGET(new NextRequest("http://localhost/api/github?url=https://github.com/Hopding/pdf-lib"));
    expect(res.status).toBe(200); const j = await res.json(); expect(j.repo.fullName).toBe("Hopding/pdf-lib"); expect(j.repo.license).toBe("MIT");
  });
});

describe("POST /api/analyze", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.MODEL_API_KEY; delete process.env.META_API_KEY; });
  it("400s on invalid URL", async () => {
    const res = await analyzePOST(new NextRequest("http://localhost/api/analyze", { method: "POST", body: JSON.stringify({ url: "nope" }), headers: { "Content-Type": "application/json" } }));
    expect(res.status).toBe(400);
  });
  it("returns Zod-valid blueprint via deterministic fallback when no model key", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => u.includes("/languages") ? { ok: true, json: async () => ({ TypeScript: 1 }) } : u.includes("/readme") ? { ok: true, text: async () => "# pdf-lib\n- Create PDFs" } : { ok: true, json: async () => ({ full_name: "Hopding/pdf-lib", description: "PDFs", stargazers_count: 1, forks_count: 0, language: "TypeScript", license: { spdx_id: "MIT" }, default_branch: "master", pushed_at: "x", html_url: "", topics: [], updated_at: "", open_issues_count: 0 }) }));
    const res = await analyzePOST(new NextRequest("http://localhost/api/analyze", { method: "POST", body: JSON.stringify({ url: "https://github.com/Hopding/pdf-lib" }), headers: { "Content-Type": "application/json" } }));
    expect(res.status).toBe(200); const j = await res.json();
    expect(j.source).toBe("deterministic-fallback"); expect(BlueprintSchema.parse(j.blueprint).supported).toBe(true);
  });
});
