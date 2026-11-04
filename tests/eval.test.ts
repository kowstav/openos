import { describe, it, expect } from "vitest";
import { runJsOperation, runPythonOperation } from "@/lib/runner";
// GENERALIZATION EVALUATION — these repositories are NOT in /demo and have no
// showcase configuration. They convert through the same classify → spec →
// isolated install → execute path as any user submission. Network required;
// failures here are real signal, not flaky decoration.
describe("novel repository conversion (unseen repos, real execution)", () => {
  it("converts markedjs/marked (JS): Markdown → HTML matches the pinned fixture", async () => {
    const out = await runJsOperation({ packageName: "marked", module: "marked", exportName: "marked.parse" }, "# Hello OpenOS\n\nTurn **code** into apps.\n");
    expect(out).toContain("<h1>Hello OpenOS</h1>"); expect(out).toContain("<strong>code</strong>");
  }, 180_000);
  it("converts un33k/python-slugify (Python): text → slug in an isolated venv", async () => {
    const out = await runPythonOperation({ packageName: "python-slugify", module: "slugify", exportName: "slugify" }, "Hello OpenOS World!");
    expect(out).toBe("hello-openos-world");
  }, 240_000);
  it("refuses code-shaped package names (injection fails closed)", async () => {
    await expect(runJsOperation({ packageName: "marked; rm -rf /", module: "marked", exportName: "parse" }, "x")).rejects.toThrow(/refused/);
  }, 30_000);
});
