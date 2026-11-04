// Browser E2E + mobile verification for OpenOS generated apps.
// Run: npm run build && npm run start -- -p 3100 &  then  npm run test:e2e
// Uses playwright-core with a Chromium build (PLAYWRIGHT_BROWSERS_PATH).
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "fs"; import path from "path";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:3100";
function findChromium() {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/tmp/ms-playwright", `${process.env.HOME}/.cache/ms-playwright`].filter(Boolean);
  for (const root of roots) { if (!existsSync(root)) continue;
    for (const d of readdirSync(root).sort((a, b) => (a.includes("headless") ? -1 : b.includes("headless") ? 1 : 0))) { if (!d.startsWith("chromium")) continue;
      for (const sub of ["chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux64/chrome", "chrome-linux/chrome"]) { const p = path.join(root, d, sub); if (existsSync(p)) return p; } } }
  // headless shell ships in its own directory and needs no GUI libraries
  throw new Error("No Chromium found. Install: PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright npx playwright-core install chromium");
}
const results = [];
function check(name, ok, detail = "") { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); if (!ok) process.exitCode = 1; }
const browser = await chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  check("home loads with marketplace", await page.locator("text=Replace paid software").first().isVisible());
  check("marketplace shows remove.bg alternative", await page.locator("text=remove.bg").first().isVisible());
  // Generated app: execute a real conversion through the trusted renderer
  const apps = await (await fetch(`${BASE}/api/apps/list`)).json();
  const gen = (apps.apps || []).find((a) => a.exec && a.exec.packageName === "marked") || (apps.apps || []).find((a) => a.exec);
  check("a generated (generic-executor) app exists", !!gen, gen ? gen.repo : "convert markedjs/marked first");
  if (gen) {
    await page.goto(`${BASE}/app/${gen.id}`, { waitUntil: "networkidle" });
    check("app page renders title + build record", await page.locator("text=Build & security record").first().isVisible().catch(() => false));
    await page.locator("textarea").first().fill("# E2E Heading\n\nBrowser **verified**.");
    await page.getByRole("button", { name: /Run:/ }).click();
    await page.waitForSelector("text=<h1>E2E Heading</h1>", { timeout: 60_000 }).catch(() => {});
    const body = await page.locator("body").innerText();
    check("in-browser execution returns real output", body.includes("<h1>E2E Heading</h1>") && body.includes("grant was consumed"));
  }
  // Mobile: 375px, no horizontal overflow on home, workspace, app
  const mob = await browser.newPage({ viewport: { width: 375, height: 667 } });
  for (const p of ["/", "/workspace", ...(gen ? [`/app/${gen.id}`] : [])]) {
    await mob.goto(BASE + p, { waitUntil: "networkidle", timeout: 60_000 });
    const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`mobile 375px no horizontal overflow: ${p}`, overflow <= 1, `overflow=${overflow}px`);
  }
  await mob.goto(BASE, { waitUntil: "networkidle" }); check("mobile home shows search", await mob.locator("input[placeholder*='Search']").first().isVisible());
} finally { await browser.close(); }
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} browser checks passed`);
