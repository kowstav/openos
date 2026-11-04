import { fetchRepo, parseGitHubUrl } from "./github";
import { analyzeWithModel, planCoordinator } from "./model";
import { extractCapabilities, specForCapability, verifySemantically } from "./capabilities";
import { validateWorkflow, outcomeFor } from "./contracts";
import { classify, execSpecFor } from "./classify";
import { generateApp } from "./engine";
import { loadSkills, skillsForStrategy, type SkillName } from "./skills";
import { activeProvider, providerStatus } from "./sandbox-provider";
import { claimQueuedJobs, getJob, listJobs, saveJob, publishAppVersion, saveArtifacts, audit, type Job, type JobStep } from "./store";
import { buildArtifacts } from "./artifacts";
// Durable worker (I2): jobs are queued in the store and claimed with a lease
// + heartbeat by any worker process. This module is the worker body; the
// Next.js route only enqueues and (for local dev) drains inline. A separate
// process can run drainQueue() on an interval — restart simply re-claims
// jobs whose lease expired (attempts capped by maxAttempts).
const WORKER_ID = `worker-${process.pid}`;
const MAX_CONCURRENT_PER_USER = 2;
let draining = false;
export async function drainQueue(limit = 3): Promise<number> {
  if (draining) return 0;
  draining = true;
  try {
    const jobs = await claimQueuedJobs(WORKER_ID, limit);
    await Promise.all(jobs.map((j) => runJob(j)));
    return jobs.length;
  } finally { draining = false; }
}
async function runJob(job: Job) {
  const step = async (name: string, skill: SkillName | undefined, status: JobStep["status"], detail: string) => {
    const fresh = await getJob(job.id); if (!fresh || fresh.status === "cancelled") throw new Error("__cancelled__");
    job.steps = [...job.steps.filter((s) => s.name !== name), { name, skill: skill as string, status, detail, at: Date.now() }];
    job.updatedAt = Date.now(); job.heartbeatAt = Date.now(); job.leaseExpiresAt = Date.now() + 60_000;
    job.events = [...(job.events || []), { at: Date.now(), type: `step:${status}`, detail: name }];
    await saveJob(job);
  };
  try {
    const running = await listJobs(job.ownerId);
    if (running.filter((j) => j.status === "running" && j.id !== job.id).length >= MAX_CONCURRENT_PER_USER) {
      job.status = "queued"; job.leaseExpiresAt = 0; await saveJob(job); return;
    }
    await step("Repository ingestion", "repository-intelligence", "running", "Fetching live metadata, README, file tree and manifests from GitHub…");
    const p = parseGitHubUrl(job.url)!; const repo = await fetchRepo(p.owner, p.repo);
    await step("Repository ingestion", "repository-intelligence", "done", `${repo.fullName} @ ${repo.sha || "HEAD"} · ★${repo.stars} · ${repo.files.length} files · ${repo.languages.join(", ") || repo.language}`);
    await step("Code intelligence", "repository-intelligence", "running", "Muse analyzes architecture, capabilities and constraints (SHA-cached)…");
    const { blueprint, source } = await analyzeWithModel(repo);
    const analysis = classify(repo);
    await step("Code intelligence", "repository-intelligence", "done", `Strategy: ${analysis.strategy} (confidence ${analysis.confidence}) · ${analysis.evidence.join("; ")} · analysis source: ${source}`);
    job.commitSha = repo.commitSha;
    const graph = extractCapabilities(repo);
    const loadedSkills = await loadSkills(skillsForStrategy(analysis.strategy));
    const coord = planCoordinator({ repo: repo.fullName, commitSha: repo.commitSha, prompt: job.prompt, skills: loadedSkills });
    await step("Coordinator plan", "workflow-composer", "done", `${coord.mode} · request ${coord.requestHash.slice(0, 12)} · budgets ${coord.budgets.maxTokens} tok/${coord.budgets.maxSeconds}s/${coord.budgets.maxRepairs} repairs · skills ${coord.skills.map((s) => s.name + "@" + s.version).join(", ")}`);
    const skills = skillsForStrategy(analysis.strategy);
    await step("Capability extraction", "appification", "done", `${blueprint.capabilities.length} capabilities · skills loaded: ${skills.join(", ")}`);
    const allSpecs = graph.capabilities.filter((c) => c.executable).map((c) => specForCapability(c)!).filter(Boolean);
    const selectedIds = job.selectedCapabilities?.length ? job.selectedCapabilities : graph.capabilities.filter((c) => c.executable).map((c) => c.id);
    let workflow = null; try { workflow = validateWorkflow(graph, selectedIds, job.workflowOrder); } catch (e) { await step("Workflow validation", "workflow-composer", "failed", String(e instanceof Error ? e.message : e)); }
    const spec = workflow ? allSpecs.find((s) => s.capabilityId && workflow.order.includes(s.capabilityId)) || null : null;
    void execSpecFor;
    const curated = generateApp({ repo: repo.fullName, prompt: job.prompt });
    const isCurated = curated.operations.length > 0 && analysis.strategy === "curated-adapter";
    await step("Application planning", "workflow-composer", "done", isCurated ? `Curated adapter workflow: ${curated.operations.join(" → ")}` : spec ? `Executable operation: ${spec.opLabel} via ${spec.kind === "python" ? "Python" : "JS"} sandbox (${providerStatus().configured})` : `No executable operation inferred — honest plan (${analysis.strategy})`);
    let verified = false; let verifyDetail = "Not executable in this environment — no fake verification claimed."; let sampleOut = "";
    if (spec && !isCurated) {
      await step("Environment construction", "environment-builder", "running", `Isolated build of ${spec.packageName} via ${providerStatus().configured} (no secrets, bounded streams)…`);
      try {
        const verdict = await verifySemantically((inp) => activeProvider().run(spec.kind, spec, inp), spec.sampleInput);
        const out = verdict.output; sampleOut = out; job.cost.executions += 2; job.cost.outputChars += out.length;
        verified = verdict.passed;
        await step("Environment construction", "environment-builder", "done", `Built ${spec.packageName} in isolated provider`);
        await step("Verification", "verification", verified ? "done" : "failed", verified ? `Semantic checks passed (typed, deterministic) for "${spec.sampleInput.slice(0, 40)}" → "${out.slice(0, 80)}"` : `Semantic verification failed: "${out.slice(0, 80)}"`);
        verifyDetail = verified ? "Real sample executed and output validated." : "Sample execution produced unexpected output.";
      } catch (e) {
        await step("Environment construction", "environment-builder", "failed", String(e instanceof Error ? e.message : e).slice(0, 300));
        await step("Verification", "verification", "failed", "Execution failed or provider unavailable — recorded honestly. Last good version (if any) remains usable.");
      }
    } else if (isCurated) { verified = true; await step("Verification", "verification", "done", "Curated adapter is covered by the OpenOS test suite (real PDF/image/OCR execution)."); }
    else await step("Verification", "verification", "skipped", verifyDetail);
    const appId = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const app = isCurated ? { ...curated, id: appId } : spec && verified ? {
      id: appId, title: `${spec.opLabel} — ${repo.fullName}`, repo: repo.fullName, prompt: job.prompt, studioUrl: `/app/${appId}`,
      operations: workflow ? workflow.order : [spec.capabilityId || spec.exportName], steps: [{ op: spec.capabilityId || spec.exportName, label: spec.opLabel }], permissions: ["file:read-selected"], blocked: curated.blocked, warnings: [] as string[], createdAt: Date.now(),
    } : null;
    if (app) {
      // Atomic publish: only a verified build becomes a new stored version.
      const stored = await publishAppVersion({
        id: app.id, ownerId: job.ownerId, title: app.title, repo: app.repo, prompt: app.prompt, studioUrl: app.studioUrl, operations: app.operations, steps: app.steps, permissions: app.permissions, blocked: app.blocked || [], warnings: (app as { warnings?: string[] }).warnings || [], createdAt: app.createdAt, sourceJobId: job.id,
        capabilityIds: workflow ? workflow.order : app.operations, workflow, commitSha: repo.commitSha, outcome: outcomeFor({ strategy: analysis.strategy, hasSpec: Boolean(spec), verified: true, attempted: Boolean(spec) }), exec: spec && !isCurated ? { kind: spec.kind, packageName: spec.packageName, module: spec.module, exportName: spec.exportName, opLabel: spec.opLabel, capabilityId: spec.capabilityId } : null,
        ui: { fields: [{ id: "input", label: spec && !isCurated ? "Your text" : "Input", type: "textarea", placeholder: spec?.sampleInput || "" }], outputType: "text" },
      });
      await saveArtifacts(stored.id, buildArtifacts({ jobId: job.id, appId: stored.id, repo: repo.fullName, sha: repo.sha, strategy: analysis.strategy, confidence: analysis.confidence, skills, operations: app.operations, kind: spec && !isCurated ? spec.kind : null, packageName: spec && !isCurated ? spec.packageName : null, permissions: app.permissions, verified, sampleInput: spec?.sampleInput || "(curated adapter test suite)", sampleOutput: sampleOut, sampleCheck: "semantic: typed+deterministic (see verification checks)" }));
      job.appId = stored.id; job.status = "succeeded";
      await step("Deployment", "deployment", "done", `App v${stored.version} (${stored.id}) published atomically. Open it from My Apps or /app/${stored.id}.`);
      await audit("job.succeeded", job.ownerId, job.id, `app v${stored.version}`);
        job.outcome = outcomeFor({ strategy: analysis.strategy, hasSpec: Boolean(spec), verified, attempted: Boolean(spec) });
    } else { job.status = "partial"; job.outcome = outcomeFor({ strategy: analysis.strategy, hasSpec: Boolean(spec), verified: false, attempted: Boolean(spec) }); await step("Deployment", "deployment", "skipped", `Conversion plan recorded. Blocker: ${analysis.risks.join(" ") || verifyDetail}`); }
  } catch (e) {
    if (String(e instanceof Error ? e.message : e) === "__cancelled__") { job.status = "cancelled"; }
    else { job.status = "failed"; job.error = String(e instanceof Error ? e.message : e); }
    await audit("job.ended", job.ownerId, job.id, job.status);
  } finally { job.updatedAt = Date.now(); job.leaseExpiresAt = 0; await saveJob(job); }
}
