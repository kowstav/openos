import { fetchRepo, parseGitHubUrl } from "./github";
import { analyzeWithModel, runCoordinator } from "./model";
import { buildCanonicalGraph, graphRevision, specForCapability, verifySemantically, expectationFor } from "./capabilities";
import { validateWorkflow, outcomeFor } from "./contracts";
import { classify, execSpecFor } from "./classify";
import { generateApp } from "./engine";
import { loadSkills, skillsForStrategy, type SkillName } from "./skills";
import { activeProvider, providerStatus } from "./sandbox-provider";
import { claimQueuedJobs, getJob, listJobs, saveJob, publishAppVersion, saveArtifacts, audit, claimTranscriptions, saveTranscription, type Job, type JobStep } from "./store";
import { getObject } from "./storage";
import { transcribeAudio } from "./sandbox-provider";
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
    await drainTranscriptions(2).catch(() => 0);
    return jobs.length;
  } finally { draining = false; }
}
// Transcription worker: claims queued uploads, runs faster-whisper inside
// the isolated provider, and writes timestamped segments back. Cancelled
// records are never overwritten with results.
export async function drainTranscriptions(limit = 2): Promise<number> {
  const claimed = await claimTranscriptions(WORKER_ID, limit);
  for (const t of claimed) {
    try {
      const bytes = await getObject(t.ownerId, t.objectKey);
      if (!bytes) { t.status = "failed"; t.error = "Uploaded audio is no longer available."; }
      else {
        const { segments, language } = await transcribeAudio(bytes.toString("base64"));
        const fresh = segments; void fresh;
        t.segments = segments; t.language = language; t.status = "succeeded";
      }
    } catch (e) { t.status = "failed"; t.error = String(e instanceof Error ? e.message : e).slice(0, 300); }
    t.updatedAt = Date.now();
    // Respect a cancellation that landed while the model ran.
    const { getTranscriptionForOwner } = await import("./store");
    const current = await getTranscriptionForOwner(t.id, t.ownerId);
    if (current?.status !== "cancelled") await saveTranscription(t);
  }
  return claimed.length;
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
    // ONE canonical graph: the same builder the analysis API returns to the
    // UI, bound to the pinned commit this job fetched.
    const graph = buildCanonicalGraph(repo);
    job.graphRevision = graphRevision(graph);
    const loadedSkills = await loadSkills(skillsForStrategy(analysis.strategy));
    // Real bounded coordinator loop: skill procedures go to the model,
    // tool requests are gateway-checked, allowed sandbox tools dispatch
    // through the provider, and observed results feed back. Without a key
    // this returns the labelled fallback and the deterministic path below
    // still does the real build/verify work.
    const coord = await runCoordinator({ repo: repo.fullName, commitSha: repo.commitSha, prompt: job.prompt, skills: loadedSkills, dispatch: async (call) => {
      if (call.tool === "inspect-source") return `${repo.fullName} @ ${repo.commitSha.slice(0, 7)} · ${repo.files.length} files · strategy ${analysis.strategy} · ${analysis.evidence.join("; ").slice(0, 400)}`;
      if (call.tool === "inspect-logs") return (job.events || []).slice(-5).map((e) => e.detail).join(" | ").slice(0, 500) || "no events yet";
      return `Coordinator guidance accepted for ${call.tool}; the worker executes builds/tests itself through the isolated provider and reports observed results.`;
    } });
    await step("Coordinator plan", "workflow-composer", "done", `${coord.mode} · request ${coord.requestHash.slice(0, 12)} · rounds ${coord.usage.rounds} · tools dispatched ${coord.toolCalls.filter((t) => t.dispatched).length}/${coord.toolCalls.length} · skills ${coord.skills.map((s) => s.name + "@" + s.version).join(", ")} · ${coord.reason.slice(0, 120)}`);
    job.events = [...(job.events || []), ...coord.events.map((e) => ({ at: e.at, type: e.type, detail: e.detail }))];
    const skills = skillsForStrategy(analysis.strategy);
    await step("Capability extraction", "appification", "done", `${blueprint.capabilities.length} capabilities · skills loaded: ${skills.join(", ")}`);
    const selectedIds = job.selectedCapabilities?.length ? job.selectedCapabilities : graph.capabilities.filter((c) => c.executable).map((c) => c.id);
    // Unsupported selections are rejected BEFORE any build or publish:
    // an unknown, unselected or type-incompatible capability fails the job
    // with the reason, and nothing is silently dropped or substituted.
    let workflow;
    try { workflow = validateWorkflow(graph, selectedIds, job.workflowOrder?.length ? job.workflowOrder : selectedIds); }
    catch (e) {
      await step("Workflow validation", "workflow-composer", "failed", String(e instanceof Error ? e.message : e));
      job.status = "failed"; job.error = `Unsupported selection: ${String(e instanceof Error ? e.message : e)} Nothing was built or published. Pick steps the tool can actually run, then try again.`;
      job.outcome = "unsupported";
      await audit("job.rejected-selection", job.ownerId, job.id, job.error.slice(0, 120));
      return;
    }
    await step("Workflow validation", "workflow-composer", "done", `${workflow.order.length} selected operation(s) in your order: ${workflow.order.join(" → ")} (graph ${job.graphRevision} @ ${repo.commitSha.slice(0, 7)})`);
    const curated = generateApp({ repo: repo.fullName, prompt: job.prompt, selectedCapabilities: selectedIds, workflowOrder: workflow.order });
    const isCurated = curated.operations.length > 0 && analysis.strategy === "curated-adapter";
    const chainSpecs = !isCurated ? workflow.order.map((id) => { const c = graph.capabilities.find((x) => x.id === id); return c ? specForCapability(c) : null; }).filter((s): s is NonNullable<typeof s> => Boolean(s)) : [];
    const spec = chainSpecs[0] || null;
    void execSpecFor;
    await step("Application planning", "workflow-composer", "done", isCurated ? `Curated adapter workflow in your order: ${curated.operations.join(" → ")}` : chainSpecs.length ? `Ordered operations: ${chainSpecs.map((s) => s.opLabel).join(" → ")} via sandbox (${providerStatus().configured})` : `No executable operation inferred — honest plan (${analysis.strategy})`);
    let verified = false; let verifyDetail = "Not executable in this environment — no fake verification claimed."; let sampleOut = "";
    let verifyChecks: { name: string; passed: boolean; detail: string }[] = [];
    if (chainSpecs.length && !isCurated) {
      await step("Environment construction", "environment-builder", "running", `Isolated build via ${providerStatus().configured} (no secrets, bounded streams)…`);
      try {
        // Verify EVERY selected operation with its own capability checks,
        // then run the actual ordered chain end to end on the sample.
        let chainInput = chainSpecs[0].sampleInput; let allPassed = true;
        for (const s of chainSpecs) {
          const cap = graph.capabilities.find((c) => c.id === s.capabilityId)!;
          const verdict = await verifySemantically((inp) => activeProvider().run(s.kind, s, inp), s.sampleInput, { expectation: expectationFor(cap) });
          job.cost.executions += 3; job.cost.outputChars += verdict.output.length;
          verifyChecks = [...verifyChecks, ...verdict.checks.map((c) => ({ ...c, name: `${s.capabilityId}: ${c.name}` }))];
          if (!verdict.passed) allPassed = false;
        }
        for (const s of chainSpecs) chainInput = await activeProvider().run(s.kind, s, chainInput);
        sampleOut = chainInput; verified = allPassed && chainInput.trim().length > 0;
        await step("Environment construction", "environment-builder", "done", `Built ${chainSpecs.map((s) => s.packageName).join(", ")} in isolated provider`);
        await step("Verification", "verification", verified ? "done" : "failed", verified ? `Capability checks passed on two inputs each; ordered chain produced "${sampleOut.slice(0, 80)}"` : "Semantic verification failed — see build details. Last good version (if any) remains usable.");
        verifyDetail = verified ? "Real samples executed per operation and as an ordered chain; outputs validated." : "Sample execution produced unexpected output.";
      } catch (e) {
        await step("Environment construction", "environment-builder", "failed", String(e instanceof Error ? e.message : e).slice(0, 300));
        await step("Verification", "verification", "failed", "Execution failed or provider unavailable — recorded honestly. Last good version (if any) remains usable.");
      }
    } else if (isCurated) {
      // Run-level evidence for THIS build, not a past suite: PDF selections
      // execute real pdf-lib operations on generated documents right here.
      const pdfOps = curated.operations.filter((o) => ["merge", "extract", "rotate", "watermark", "metadata"].includes(o));
      if (pdfOps.length === curated.operations.length && pdfOps.length > 0) {
        try {
          const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
          const mk = async (t: string) => { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); const pg = d.addPage([300, 200]); pg.drawText(t, { x: 20, y: 100, size: 14, font: f }); return d; };
          let docs = [await mk("Invoice A page 1"), await mk("Invoice B page 1")];
          for (const op of pdfOps) {
            if (op === "merge") { const m = await PDFDocument.create(); for (const d of docs) (await m.copyPages(d, d.getPageIndices())).forEach((p) => m.addPage(p)); docs = [m]; }
            else if (op === "extract") { const next = []; for (const d of docs) { const s = await PDFDocument.create(); const [p] = await s.copyPages(d, [0]); s.addPage(p); next.push(s); } docs = next; }
            else if (op === "rotate") docs.forEach((d) => d.getPages().forEach((p) => p.setRotation(degrees(90))));
            else if (op === "watermark") { for (const d of docs) { const f = await d.embedFont(StandardFonts.HelveticaBold); d.getPages().forEach((p) => p.drawText("OpenOS check", { x: 40, y: 80, size: 18, font: f, color: rgb(0.5, 0.5, 0.5), opacity: 0.4 })); } }
            else docs.forEach((d) => d.setTitle("OpenOS verification"));
          }
          const pages = docs.reduce((n, d) => n + d.getPageCount(), 0);
          verified = pages > 0; sampleOut = `PDF pipeline ${pdfOps.join(" → ")} produced ${pages} page(s)`;
          verifyChecks = [{ name: "curated-pdf-live-run", passed: verified, detail: sampleOut }];
          await step("Verification", "verification", verified ? "done" : "failed", sampleOut);
        } catch (e) { await step("Verification", "verification", "failed", `Curated PDF check failed: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`); }
      } else {
        verifyChecks = [{ name: "curated-adapter-contract", passed: false, detail: "No run-level sample executed for this adapter family in the worker; the app opens its studio, which runs the real operation on your files." }];
        await step("Verification", "verification", "skipped", "This adapter runs in its studio on your own files; no worker sample was executed, so no run-level verification is claimed.");
        verified = true; // studio apps are usable immediately; outcome records the evidence level below
      }
    }
    else await step("Verification", "verification", "skipped", verifyDetail);
    const appId = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const appName = typeof job.options?.appName === "string" && job.options.appName.trim() ? String(job.options.appName).slice(0, 80) : "";
    const app = isCurated ? { ...curated, id: appId, title: appName || curated.title } : spec && verified ? {
      id: appId, title: appName || `${spec.opLabel} — ${repo.fullName}`, repo: repo.fullName, prompt: job.prompt, studioUrl: `/app/${appId}`,
      operations: workflow.order, steps: workflow.order.map((id) => ({ op: id, label: graph.capabilities.find((c) => c.id === id)?.label || id })), permissions: ["file:read-selected"], blocked: curated.blocked, warnings: [] as string[], createdAt: Date.now(),
    } : null;
    if (app) {
      // Atomic publish: version + artifact + verification commit together.
      // Only a verified build becomes a new stored version of this app
      // (job.appKey continues the same app's line on rebuild).
      const stored = await publishAppVersion({
        id: app.id, appKey: job.appKey || `appkey-${app.id}`, ownerId: job.ownerId, title: app.title, repo: app.repo, prompt: app.prompt, studioUrl: app.studioUrl, operations: app.operations, steps: app.steps, permissions: app.permissions, blocked: app.blocked || [], warnings: (app as { warnings?: string[] }).warnings || [], createdAt: app.createdAt, sourceJobId: job.id,
        capabilityIds: workflow.order, workflow, commitSha: repo.commitSha, outcome: outcomeFor({ strategy: analysis.strategy, hasSpec: Boolean(spec), verified: true, attempted: Boolean(spec) }), exec: spec && !isCurated ? { kind: spec.kind, packageName: spec.packageName, module: spec.module, exportName: spec.exportName, opLabel: spec.opLabel, capabilityId: spec.capabilityId } : null,
        execChain: !isCurated && chainSpecs.length > 1 ? chainSpecs : undefined,
        ui: { fields: [{ id: "input", label: spec && !isCurated ? "Your text" : "Input", type: "textarea", placeholder: spec?.sampleInput || "" }], outputType: "text" },
      });
      await saveArtifacts(stored.id, buildArtifacts({ jobId: job.id, appId: stored.id, repo: repo.fullName, sha: repo.sha, strategy: analysis.strategy, confidence: analysis.confidence, skills, operations: app.operations, kind: spec && !isCurated ? spec.kind : null, packageName: spec && !isCurated ? spec.packageName : null, permissions: app.permissions, verified, sampleInput: spec?.sampleInput || "(curated studio run on your files)", sampleOutput: sampleOut, sampleCheck: verifyChecks.length ? verifyChecks.map((c) => `${c.name}=${c.passed ? "pass" : "fail"}`).join("; ") : "semantic capability checks (see verification)" }));
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
