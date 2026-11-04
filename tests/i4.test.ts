import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "fs"; import { tmpdir } from "os"; import path from "path";
import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
process.env.OPENOS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "openos-i4-"));
async function markedPdf(marker: string, pages: number) {
  const d = await PDFDocument.create(); const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) { const p = d.addPage([300, 300]); p.drawText(`${marker}-p${i + 1}`, { x: 40, y: 150, size: 20, font }); }
  return new File([Buffer.from(await d.save())], `${marker}.pdf`, { type: "application/pdf" });
}
async function pdfReq(fd: FormData) { const { createSession } = await import("@/lib/auth"); const s = await createSession(); return new NextRequest("http://x/api/pdf", { method: "POST", body: fd, headers: { Authorization: `Bearer ${s.token}` } }); }
describe("I4 PDF declared order (I4 bug: merge must not jump the queue)", () => {
  it("extract page 1 from each, then merge yields 2 distinct pages; merge then extract yields 1", async () => {
    const { POST } = await import("@/app/api/pdf/route");
    const a = await markedPdf("alpha", 3); const b = await markedPdf("beta", 2);
    const fd1 = new FormData(); fd1.set("op", "pipeline"); fd1.set("steps", JSON.stringify(["extract", "merge"])); fd1.set("page", "1"); fd1.append("files", a); fd1.append("files", b);
    const r1 = await POST(await pdfReq(fd1)); expect(r1.status).toBe(200); expect(r1.headers.get("x-openos-steps")).toBe("extract>merge");
    const out1 = await PDFDocument.load(await r1.arrayBuffer()); expect(out1.getPageCount()).toBe(2);
    const fd2 = new FormData(); fd2.set("op", "pipeline"); fd2.set("steps", JSON.stringify(["merge", "extract"])); fd2.set("page", "1"); fd2.append("files", a); fd2.append("files", b);
    const r2 = await POST(await pdfReq(fd2)); expect(r2.status).toBe(200);
    const out2 = await PDFDocument.load(await r2.arrayBuffer()); expect(out2.getPageCount()).toBe(1);
  });
  it("rejects invalid combinations before processing", async () => {
    const { POST } = await import("@/app/api/pdf/route"); const { validatePipeline } = await import("@/lib/pdf-pipeline");
    expect(validatePipeline(["merge"], 1)).toMatch(/two files/);
    expect(validatePipeline(["merge", "merge"], 2)).toMatch(/repeat/);
    expect(validatePipeline(["shell"], 1)).toMatch(/Unknown/);
    const fd = new FormData(); fd.set("op", "pipeline"); fd.set("steps", JSON.stringify(["merge", "merge"])); fd.append("files", await markedPdf("x", 1)); fd.append("files", await markedPdf("y", 1));
    expect((await POST(await pdfReq(fd))).status).toBe(400);
  });
});
describe("I4 discovery: no prices/parity claims, shared capability IDs", () => {
  it("catalog carries comparisons, omissions, costs and dated evidence — never prices", async () => {
    const { CATALOG } = await import("@/lib/catalog");
    const raw = JSON.stringify(CATALOG);
    expect(raw).not.toMatch(/\$\d/); expect(raw).not.toMatch(/price/i);
    for (const e of CATALOG) { expect(e.comparisons.length).toBeGreaterThan(0); expect(e.missing.length).toBeGreaterThan(0); expect(e.costNote.length).toBeGreaterThan(0); expect(e.evidenceAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(e.capabilityIds.length).toBeGreaterThan(0); }
    expect(CATALOG.find((e) => e.repo === "rembg")?.adapterNote).toMatch(/not executed/);
  });
  it("all five search modes resolve through one ranking layer with reasons", async () => {
    const { rankDiscovery, detectMode } = await import("@/lib/discovery");
    expect(detectMode("https://github.com/Hopding/pdf-lib")).toBe("url");
    expect(rankDiscovery("merge pdf")[0].entry.repo).toBe("pdf-lib");
    expect(rankDiscovery("merge pdf")[0].reasons.length).toBeGreaterThan(0);
    expect(rankDiscovery("pdf.merge")[0].entry.capabilityIds).toContain("pdf.merge");
    expect(rankDiscovery("remove.bg")[0].entry.repo).toBe("rembg");
    expect(rankDiscovery("zzzz-no-match")).toHaveLength(0);
  });
  it("subtitle export produces parseable SRT/VTT and rejects bad segments", async () => {
    const { toSrt, toVtt, validateSegments } = await import("@/lib/subtitles");
    const segs = [{ start: 0, end: 2.5, text: "Hello" }, { start: 2.5, end: 5, text: "World" }];
    expect(toSrt(segs)).toContain("00:00:00,000 --> 00:00:02,500");
    expect(toVtt(segs)).toMatch(/^WEBVTT/);
    expect(validateSegments([{ start: 3, end: 1, text: "x" }])).toMatch(/end after/);
  });
});
describe("I4 unified library: plans, versions, rollback, suspension", () => {
  let store: typeof import("@/lib/store"); let auth: typeof import("@/lib/auth");
  beforeAll(async () => { store = await import("@/lib/store"); auth = await import("@/lib/auth"); });
  const app = (over: object) => ({ id: "lib-1", ownerId: "", title: "T", repo: "o/r", prompt: "", studioUrl: "/app/lib-1", operations: ["merge"], steps: [{ op: "merge", label: "Merge" }], permissions: [], blocked: [], warnings: [], createdAt: Date.now(), exec: null, ui: { fields: [], outputType: "text" }, ...over }) as never;
  it("rename/reorder/duplicate/rollback/suspend are owner-scoped and history-preserving", async () => {
    const a = await auth.createSession(); const b = await auth.createSession();
    await store.saveApp(app({ id: "lib-1", ownerId: a.userId }));
    expect(await store.updateAppForOwner("lib-1", b.userId, { title: "hax" })).toBeNull();
    const renamed = await store.updateAppForOwner("lib-1", a.userId, { title: "Mine", operations: ["extract", "merge"] });
    expect(renamed?.title).toBe("Mine"); expect(renamed?.operations).toEqual(["extract", "merge"]);
    const copy = await store.duplicateAppForOwner("lib-1", a.userId); expect(copy?.title).toMatch(/copy/);
    const v2 = await store.publishAppVersion(app({ id: "lib-2", ownerId: a.userId, operations: ["merge", "watermark"] }));
    expect(v2.version).toBe(2);
    const rolled = await store.rollbackToVersion(a.userId, "lib-1");
    expect(rolled?.version).toBe(3); expect(rolled?.operations).toEqual(["extract", "merge"]);
    const versions = await store.listAppVersions(a.userId, "o/r"); expect(versions.map((v) => v.version).slice(0, 3)).toEqual([3, 2, 1]);
    await store.updateAppForOwner("lib-1", a.userId, { state: "suspended" });
    expect((await store.getAppForOwner("lib-1", a.userId))?.state).toBe("suspended");
    await store.savePlan({ id: "p1", ownerId: a.userId, title: "plan", repoUrl: "https://github.com/o/r", prompt: "", capabilityIds: [], createdAt: 1, updatedAt: 1 });
    expect(await store.listPlans(b.userId)).toHaveLength(0); expect(await store.listPlans(a.userId)).toHaveLength(1);
    expect(await store.deletePlanForOwner("p1", b.userId)).toBe(false);
  });
  it("library route: anonymous 401, owner sees apps+plans+permissions, other owner sees none", async () => {
    const { GET } = await import("@/app/api/library/route");
    expect((await GET(new NextRequest("http://x/api/library"))).status).toBe(401);
    const a = await auth.createSession();
    const res = await GET(new NextRequest("http://x/api/library", { headers: { Authorization: `Bearer ${a.token}` } }));
    expect(res.status).toBe(200); const j = await res.json();
    expect(Array.isArray(j.apps) && Array.isArray(j.plans) && Array.isArray(j.permissions)).toBe(true);
  });
});
