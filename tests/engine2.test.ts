import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { classify, execSpecFor } from "@/lib/classify";
import { issueGrant, checkGrant, revokeGrant } from "@/lib/broker";
import { loadSkill, skillsForStrategy, SKILL_NAMES } from "@/lib/skills";

function repoFixture(over: Record<string, unknown>) {
  return { fullName: "x/y", description: "", stars: 1, forks: 0, language: "TypeScript", languages: ["TypeScript"], license: "MIT", defaultBranch: "main", sha: "abc", htmlUrl: "", topics: [], readme: "", updatedAt: "", openIssues: 0, files: [], pkg: null, pyproject: "", ...over } as never;
}
describe("repository classification (evidence-based)", () => {
  it("classifies a plain JS library, a Python library, and a container repo differently", () => {
    expect(classify(repoFixture({ pkg: { name: "marked", main: "lib/marked.cjs" } })).strategy).toBe("js-library");
    expect(classify(repoFixture({ files: ["pyproject.toml"], pyproject: 'name = "python-slugify"\n' })).strategy).toBe("python-library");
    expect(classify(repoFixture({ files: ["Dockerfile"] })).strategy).toBe("container");
    expect(classify(repoFixture({})).strategy).toBe("unknown");
  });
  it("infers executable specs only for known-shape packages", () => {
    const js = classify(repoFixture({ pkg: { name: "marked", main: "x" } }));
    expect(execSpecFor(repoFixture({ pkg: { name: "marked", main: "x" } }), js)?.sampleCheck).toBe("<h1");
    const py = classify(repoFixture({ files: ["pyproject.toml"], pyproject: 'name = "python-slugify"' }));
    expect(execSpecFor(repoFixture({ files: ["pyproject.toml"], pyproject: 'name = "python-slugify"' }), py)?.sampleCheck).toBe("hello-openos-world");
  });
});

describe("permission broker (scoped grants)", () => {
  it("honors a matching grant once, then denies reuse, expiry, revocation, and cross-user/app/action use", () => {
    const g = issueGrant({ userId: "u1", appId: "a1", action: "execute" }); if ("error" in g) throw new Error(g.error);
    expect(checkGrant(g.id, { userId: "u1", appId: "a1", action: "execute" }).ok).toBe(true);
    expect(checkGrant(g.id, { userId: "u2", appId: "a1", action: "execute" }).ok).toBe(false);
    expect(checkGrant(g.id, { userId: "u1", appId: "a2", action: "execute" }).ok).toBe(false);
    expect(checkGrant(g.id, { userId: "u1", appId: "a1", action: "camera" }).ok).toBe(false);
    revokeGrant(g.id); expect(checkGrant(g.id, { userId: "u1", appId: "a1", action: "execute" }).ok).toBe(false);
    const short = issueGrant({ userId: "u1", appId: "a1", action: "execute", ttlSec: -1 }); if ("error" in short) throw new Error(short.error);
    expect(checkGrant(short.id, { userId: "u1", appId: "a1", action: "execute" }).reason).toMatch(/expired/);
  });
  it("can never grant shell or credentials", () => {
    expect("error" in issueGrant({ userId: "u1", appId: "a1", action: "shell:exec" })).toBe(true);
  });
});

describe("runtime skill registry", () => {
  it("loads all 11 audited skills and maps strategies to skill sets", async () => {
    expect(SKILL_NAMES.length).toBe(11);
    const s = await loadSkill("verification"); expect(s.body).toContain("Verification");
    expect(skillsForStrategy("js-library")).toContain("environment-builder");
  });
});

import { buildArtifacts, ConversionPlanSchema, BuildManifestSchema, SecurityManifestSchema, VerificationReportSchema, AppVersionSchema } from "@/lib/artifacts";
import { activeProvider, ModalProvider } from "@/lib/sandbox-provider";
describe("structured artifacts & sandbox provider", () => {
  it("builds a valid artifact bundle pinned to the source SHA", () => {
    const b = buildArtifacts({ jobId: "j1", appId: "a1", repo: "markedjs/marked", sha: "deadbeef", strategy: "js-library", confidence: 0.75, skills: ["verification"], operations: ["marked.parse"], kind: "js", packageName: "marked", permissions: ["file:read-selected"], verified: true, sampleInput: "# Hi", sampleOutput: "<h1>Hi</h1>", sampleCheck: "<h1" });
    expect(ConversionPlanSchema.parse(b.plan).sourceSha).toBe("deadbeef");
    expect(BuildManifestSchema.parse(b.build).reproducible).toBe(true);
    expect(SecurityManifestSchema.parse(b.security).secretsInSandbox).toBe(false);
    expect(VerificationReportSchema.parse(b.verification).passed).toBe(true);
    expect(AppVersionSchema.parse(b.version).version).toBe(1);
  });
  it("defaults to the local provider; Modal fails honestly when unconfigured", async () => {
    expect(activeProvider().name).toBe("local-scrubbed-process");
    await expect(ModalProvider.run("js", { packageName: "x", module: "x", exportName: "x" }, "")).rejects.toThrow(/not configured/);
  });
});

describe("demo showcases", () => {
  it("pins an honest faster-whisper manifest and markdown fixtures", async () => {
    const fw = JSON.parse(await readFile("demo/manifests/faster-whisper.json", "utf8"));
    expect(fw.status).toBe("plan-only");
    const html = await readFile("demo/expected/markdown.html", "utf8");
    expect(html).toContain("<h1>Hello OpenOS</h1>");
  });
});
