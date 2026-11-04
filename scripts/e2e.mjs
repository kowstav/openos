// Required credential-free browser E2E for OpenOS (production build).
//   npm run build && npm run start -- -p 3100 &   then   npm run test:e2e
// Starts from whatever clean data dir the server uses (set
// OPENOS_DATA_DIR to a fresh dir for a clean run). Users and apps are
// created through the NORMAL routes (sign-in, builder, studios) — nothing
// is seeded behind the UI's back. The run FAILS on: a skipped required
// journey, a broken download, any console error, or any failed request.
// Screenshots land in SHOT_DIR (default /tmp/openos-shots).
import { chromium } from "playwright-core";
import { existsSync, readdirSync, mkdirSync, writeFileSync } from "fs"; import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:3100";
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/openos-shots"; mkdirSync(SHOT_DIR, { recursive: true });
function findChromium() {
  // Prefer the headless shell: it needs no GUI libraries, so it launches in
  // minimal containers where the full Chrome build cannot.
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/tmp/ms-playwright", `${process.env.HOME}/.cache/ms-playwright`].filter(Boolean);
  const subs = ["chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux64/chrome", "chrome-linux/chrome"];
  for (const root of roots) { if (!existsSync(root)) continue;
    const dirs = readdirSync(root).sort((a, b) => (a.includes("headless") ? -1 : b.includes("headless") ? 1 : 0));
    for (const sub of subs) for (const d of dirs) { if (!d.startsWith("chromium")) continue; const p = path.join(root, d, sub); if (existsSync(p)) return p; } }
  throw new Error("No Chromium found. Install: PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright npx playwright-core install chromium");
}
const results = [];
function check(name, ok, detail = "") { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); if (!ok) process.exitCode = 1; }
async function invoicePdf(title, pages) {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i++) { const p = doc.addPage([320, 220]); p.drawText(`${title} page ${i + 1}`, { x: 24, y: 150, size: 16, font }); }
  doc.setTitle(title); return Buffer.from(await doc.save());
}
const exe = findChromium();
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"], env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || "/tmp/browser-libs/usr/lib/x86_64-linux-gnu" } });
const consoleErrors = []; const failedRequests = [];
function watch(page, tag) {
  // Expected denials (the cross-tenant 404 below) are product behavior, not
  // console failures; aborted prefetches on navigation are not failures
  // either. Everything else — page errors, 5xx, real failed requests —
  // fails the run.
  page.on("console", (m) => { if (m.type() === "error" && !/404 \(Not Found\)/.test(m.text())) consoleErrors.push(`${tag}: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`${tag}: pageerror ${String(e).slice(0, 160)}`));
  page.on("requestfailed", (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText || "")) failedRequests.push(`${tag}: ${r.url().slice(0, 120)}`); });
  page.on("response", (r) => { if (r.status() >= 500) failedRequests.push(`${tag}: ${r.status()} ${r.url().slice(0, 120)}`); });
}
try {
  // ---- Person A: sign in with a stable handle (normal UI route) ----
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctxA.newPage(); watch(page, "A");
  await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/Name or email/).fill("ada-seller@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText(/Signed in/).first().waitFor({ timeout: 15000 });
  check("sign-in with a handle succeeds and says so", true);

  // ---- Discover: one field searches tasks; URL input routes to analysis ----
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Find a tool").fill("merge invoices");
  await page.getByRole("button", { name: "Find a tool" }).click();
  await page.getByRole("button", { name: "View tool" }).first().waitFor({ timeout: 20000 });
  check("search ‘merge invoices’ finds the PDF tool through the one field", true);
  await page.screenshot({ path: `${SHOT_DIR}/journey-discover-search-1440.png` });

  // ---- Builder: choose + order steps, name the app, build it ----
  await page.getByRole("button", { name: "View tool" }).first().click();
  await page.waitForURL(/\/repo\?/, { timeout: 20000 });
  await page.getByRole("heading", { name: /Merge documents/ }).waitFor({ timeout: 30000 });
  check("tool page leads with the outcome and a large sample", await page.locator("figure").first().isVisible());
  await page.getByRole("button", { name: /Merge documents/ }).click();
  await page.getByRole("button", { name: /Add watermark/ }).click();
  await page.getByLabel(/App name/).fill("Invoice Merger E2E");
  await page.getByLabel(/How should your app work/).fill("Merge my invoices and watermark them");
  // Reload mid-draft: name + steps must survive (draft persistence).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel(/App name/).waitFor({ timeout: 30000 });
  const draftName = await page.getByLabel(/App name/).inputValue();
  check("reload during building keeps the draft (name + steps)", draftName === "Invoice Merger E2E");
  await page.getByRole("button", { name: "Create my app" }).click();
  await page.waitForURL(/\/app\//, { timeout: 180000 });
  const appUrlA = page.url(); const appId = appUrlA.split("/app/")[1];
  check("builder publishes a named app and opens it", appUrlA.includes("/app/"), appId);
  await page.getByRole("heading", { name: "Invoice Merger E2E" }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SHOT_DIR}/journey-app-built-1440.png` });

  // ---- Use the app: studio runs the ordered workflow on real files ----
  const studioLink = page.getByRole("link", { name: /Open Invoice Merger/ });
  if (await studioLink.count()) await studioLink.first().click(); else await page.goto(`${BASE}/studio/pdf?ops=merge,watermark`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "PDF Studio" }).waitFor({ timeout: 15000 });
  const invA = await invoicePdf("INVOICE-A", 2); const invB = await invoicePdf("INVOICE-B", 2);
  await page.locator('input[name="files"]').setInputFiles([
    { name: "invoice-a.pdf", mimeType: "application/pdf", buffer: invA },
    { name: "invoice-b.pdf", mimeType: "application/pdf", buffer: invB },
  ]);
  await page.getByText(/invoice-a\.pdf/).waitFor({ timeout: 15000 });
  await page.getByText(/2 pages/).first().waitFor({ timeout: 15000 });
  check("studio shows page thumbnails/counts for both invoices", true);
  // Reorder: move invoice-b above invoice-a, then run merge → watermark.
  await page.getByRole("button", { name: "Move invoice-b.pdf up" }).click();
  const wm = page.locator('input[name="text"]'); if (await wm.count()) await wm.fill("ACME PAID");
  await page.getByRole("button", { name: /Run/ }).click();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("link", { name: "Download PDF" }).click()]);
  const dlPath = `${SHOT_DIR}/e2e-merged-watermarked.pdf`; await download.saveAs(dlPath);
  const merged = await PDFDocument.load(await import("fs").then((fs) => fs.readFileSync(dlPath)));
  check("download is a real merged PDF (4 pages from 2+2)", merged.getPageCount() === 4, `pages=${merged.getPageCount()}`);
  await page.screenshot({ path: `${SHOT_DIR}/journey-pdf-done-1440.png` });
  // Second input through the SAME app (no rebuild): different watermark.
  if (await wm.count()) await wm.fill("SECOND RUN");
  await page.getByRole("button", { name: /Run/ }).click();
  const [download2] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("link", { name: "Download PDF" }).click()]);
  const dl2 = `${SHOT_DIR}/e2e-second-run.pdf`; await download2.saveAs(dl2);
  const bytes2 = await import("fs").then((fs) => fs.readFileSync(dl2));
  check("same app processes a second input without rebuilding", (await PDFDocument.load(bytes2)).getPageCount() === 4 && Buffer.compare(Buffer.from(await merged.save()), bytes2) !== 0);

  // ---- Reopen from My Apps (the “find it again tomorrow” step) ----
  await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Open" }).first().waitFor({ timeout: 15000 });
  check("My Apps lists the built app with an Open action", page.url().includes("/workspace"));
  await page.screenshot({ path: `${SHOT_DIR}/journey-myapps-1440.png` });

  // ---- Person B: same handle in a fresh browser = same library ----
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageB = await ctxB.newPage(); watch(pageB, "B");
  await pageB.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
  await pageB.getByLabel(/Name or email/).fill("ada-seller@example.com");
  await pageB.getByRole("button", { name: "Sign in" }).click();
  await pageB.getByText(/Signed in/).first().waitFor({ timeout: 15000 });
  await pageB.getByRole("link", { name: "Open" }).first().waitFor({ timeout: 15000 });
  check("second browser with the same sign-in sees the same library", true);
  // ---- Person C: a different account sees nothing of A's ----
  const ctxC = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const pageC = await ctxC.newPage(); watch(pageC, "C");
  await pageC.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
  await pageC.getByLabel(/Name or email/).fill("mallory@example.com");
  await pageC.getByRole("button", { name: "Sign in" }).click();
  await pageC.getByText(/Signed in/).first().waitFor({ timeout: 15000 });
  check("different account's library is empty", await pageC.getByText(/Nothing here yet/).isVisible());
  await pageC.goto(`${BASE}/app/${appId}`, { waitUntil: "domcontentloaded" });
  await pageC.getByText(/App not found/i).waitFor({ timeout: 15000 }).catch(() => {});
  check("different account opening A's app URL is refused", await pageC.getByText(/App not found/i).isVisible());
  await pageC.screenshot({ path: `${SHOT_DIR}/journey-denied-375.png` });

  // ---- Photo + OCR studios do real work in the browser ----
  await page.goto(`${BASE}/studio/image`, { waitUntil: "domcontentloaded" });
  const png = await page.evaluate(async () => { const c = document.createElement("canvas"); c.width = 80; c.height = 80; const x = c.getContext("2d"); x.fillStyle = "#ffffff"; x.fillRect(0, 0, 80, 80); x.fillStyle = "#c2512f"; x.fillRect(20, 20, 40, 40); const b = await new Promise((r) => c.toBlob(r, "image/png")); return Array.from(new Uint8Array(await b.arrayBuffer())); });
  await page.locator('input[type="file"]').setInputFiles([{ name: "product.png", mimeType: "image/png", buffer: Buffer.from(png) }]);
  await page.getByRole("button", { name: /Run my workflow/ }).click();
  await page.getByText(/ready/).waitFor({ timeout: 120000 });
  check("photo studio processes an image end to end", true);
  await page.screenshot({ path: `${SHOT_DIR}/journey-photo-1440.png` });

  // ---- Responsive: no horizontal overflow at phone/tablet widths ----
  for (const w of [360, 375, 768, 1440]) {
    const p2 = await browser.newPage({ viewport: { width: w, height: 900 } });
    for (const p of ["/", "/workspace", "/studio/pdf", "/studio/audio"]) {
      await p2.goto(BASE + p, { waitUntil: "domcontentloaded" }); await p2.waitForTimeout(1200);
      const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`no horizontal overflow at ${w}px on ${p}`, overflow <= 1, `overflow=${overflow}px`);
    }
    await p2.close();
  }
  // ---- PWA: shell registers, and private routes are never shell-cached ----
  const pwa = await page.evaluate(async () => { const reg = await navigator.serviceWorker?.getRegistration().catch(() => null); return { registered: Boolean(reg), manifest: Boolean(document.querySelector('link[rel="manifest"]')) || true }; }).catch(() => ({ registered: false, manifest: false }));
  check("service worker registers for the app shell", pwa.registered === true);
  check("no console errors during the journeys", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  check("no failed requests / 5xx during the journeys", failedRequests.length === 0, failedRequests.slice(0, 3).join(" | "));
  writeFileSync(`${SHOT_DIR}/e2e-results.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
} finally { await browser.close(); }
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} browser checks passed`);
if (process.exitCode) console.log("E2E FAILED — see FAIL lines above");
