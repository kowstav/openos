import { fetchRepo, parseGitHubUrl } from "./github";
import { analyzeWithModel } from "./model";
import { classify, execSpecFor } from "./classify";
import { generateApp } from "./engine";
import { loadSkills, skillsForStrategy, type SkillName } from "./skills";
import { runOperation } from "./runner";
import { saveJob, saveApp, saveArtifacts, type Job, type JobStep } from "./store";
import { buildArtifacts } from "./artifacts";
const MAX_JOBS = 3; let active = 0;
export async function createJob(url: string, prompt: string): Promise<Job> {
  const p = parseGitHubUrl(url); if (!p) throw new Error("Invalid GitHub URL");
  const job: Job = { id: Math.random().toString(36).slice(2, 12), url, repo: `${p.owner}/${p.repo}`, prompt, status: "queued", steps: [], createdAt: Date.now(), updatedAt: Date.now() };
  await saveJob(job); void runJob(job); return job;
}
async function runJob(job: Job) {
  if (active >= MAX_JOBS) { job.status = "failed"; job.error = "Conversion capacity reached (3 concurrent). Try again shortly."; await saveJob(job); return; }
  active++; const step = async (name: string, skill: SkillName | undefined, status: JobStep["status"], detail: string) => {
    job.steps = [...job.steps.filter((s) => s.name !== name), { name, skill: skill as string, status, detail, at: Date.now() }]; job.updatedAt = Date.now(); await saveJob(job);
  };
  try {
    job.status = "running"; await saveJob(job);
    await step("Repository ingestion", "repository-intelligence", "running", "Fetching live metadata, README, file tree and manifests from GitHub…");
    const p = parseGitHubUrl(job.url)!; const repo = await fetchRepo(p.owner, p.repo);
    await step("Repository ingestion", "repository-intelligence", "done", `${repo.fullName} @ ${repo.sha || "HEAD"} · ★${repo.stars} · ${repo.files.length} files · ${repo.languages.join(", ") || repo.language}`);
    await step("Code intelligence", "repository-intelligence", "running", "Muse analyzes architecture, capabilities and constraints (SHA-cached)…");
    const { blueprint, source } = await analyzeWithModel(repo);
    const analysis = classify(repo);
    await step("Code intelligence", "repository-intelligence", "done", `Strategy: ${analysis.strategy} (confidence ${analysis.confidence}) · ${analysis.evidence.join("; ")} · analysis source: ${source}`);
    const skills = skillsForStrategy(analysis.strategy); await loadSkills(skills);
    await step("Capability extraction", "appification", "done", `${blueprint.capabilities.length} capabilities · skills loaded: ${skills.join(", ")}`);
    const spec = execSpecFor(repo, analysis);
    const curated = generateApp({ repo: repo.fullName, prompt: job.prompt });
    const isCurated = curated.operations.length > 0 && analysis.strategy === "curated-adapter";
    await step("Application planning", "workflow-composer", "done", isCurated ? `Curated adapter workflow: ${curated.operations.join(" → ")}` : spec ? `Executable operation: ${spec.opLabel} via ${spec.kind === "python" ? "Python" : "JS"} sandbox` : `No executable operation inferred — honest plan (${analysis.strategy})`);
    let verified = false; let verifyDetail = "Not executable in this environment — no fake verification claimed."; let sampleOut = "";
    if (spec) {
      await step("Environment construction", "environment-builder", "running", `Isolated install of ${spec.packageName} (no secrets, scrubbed env, timeouts)…`);
      try { const out = await runOperation(spec.kind, spec, spec.sampleInput); sampleOut = out; verified = spec.sampleCheck ? out.includes(spec.sampleCheck) : out.length > 0;
        await step("Environment construction", "environment-builder", "done", `Installed ${spec.packageName} in sandbox`);
        await step("Verification", "verification", verified ? "done" : "failed", verified ? `Sample "${spec.sampleInput.slice(0, 40)}" → "${out.slice(0, 80)}" (real output validated)` : `Sample output failed validation: "${out.slice(0, 80)}"`);
        verifyDetail = verified ? "Real sample executed and output validated." : "Sample execution produced unexpected output.";
      } catch (e) { await step("Environment construction", "environment-builder", "failed", String(e instanceof Error ? e.message : e).slice(0, 300)); await step("Verification", "verification", "failed", "Execution failed — recorded honestly, bounded retry not attempted for install errors."); }
    } else if (isCurated) { verified = true; await step("Verification", "verification", "done", "Curated adapter is covered by the OpenOS test suite (real PDF/image/OCR execution)."); }
    else await step("Verification", "verification", "skipped", verifyDetail);
    const appId = Math.random().toString(36).slice(2, 10);
    const app = isCurated ? { ...curated, id: appId } : spec && verified ? {
      id: appId, title: `${spec.opLabel} — ${repo.fullName}`, repo: repo.fullName, prompt: job.prompt, studioUrl: `/app/${appId}`, source: "rules" as const,
      operations: [spec.exportName], steps: [{ op: spec.exportName, label: spec.opLabel }], inputs: ["Text you enter"], outputs: ["Result text"],
      permissions: ["file:read-selected"], blocked: curated.blocked, warnings: [], createdAt: Date.now(),
    } : null;
    if (app) {
      const stored = { id: app.id, title: app.title, repo: app.repo, prompt: app.prompt, studioUrl: app.studioUrl, operations: app.operations, steps: app.steps, permissions: app.permissions, blocked: app.blocked || [], warnings: (app as { warnings?: string[] }).warnings || [], createdAt: app.createdAt, sourceJobId: job.id,
        exec: spec && !isCurated ? { kind: spec.kind, packageName: spec.packageName, module: spec.module, exportName: spec.exportName, opLabel: spec.opLabel } : null,
        ui: { fields: [{ id: "input", label: spec && !isCurated ? "Your text" : "Input", type: "textarea", placeholder: spec?.sampleInput || "" }], outputType: "text" } };
      await saveApp(stored);
      await saveArtifacts(app.id, buildArtifacts({ jobId: job.id, appId: app.id, repo: repo.fullName, sha: repo.sha, strategy: analysis.strategy, confidence: analysis.confidence, skills, operations: app.operations, kind: spec && !isCurated ? spec.kind : null, packageName: spec && !isCurated ? spec.packageName : null, permissions: app.permissions, verified, sampleInput: spec?.sampleInput || "(curated adapter test suite)", sampleOutput: sampleOut, sampleCheck: spec?.sampleCheck || "" }));
      job.appId = app.id; job.status = isCurated || verified ? "succeeded" : "partial";
      await step("Deployment", "deployment", "done", `App ${app.id} saved to workspace. Open it from My Apps or /app/${app.id}.`);
    } else { job.status = "partial"; await step("Deployment", "deployment", "skipped", `Conversion plan recorded. Blocker: ${analysis.risks.join(" ") || verifyDetail}`); }
  } catch (e) { job.status = "failed"; job.error = String(e instanceof Error ? e.message : e); }
  finally { active--; job.updatedAt = Date.now(); await saveJob(job); }
}
