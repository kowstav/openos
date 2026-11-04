import { z } from "zod";
// Section 21: twelve versioned contracts (I3). Every contract carries `v`
// and is validated at each boundary; migrateContract upgrades older shapes.
export const CONTRACT_VERSION = 1;
const v = z.literal(CONTRACT_VERSION);
export const CompatibilityOutcomeSchema = z.enum(["compatible", "partially-compatible", "requires-infrastructure", "unsupported", "failed-build", "unsafe"]);
export type CompatibilityOutcome = z.infer<typeof CompatibilityOutcomeSchema>;
export const SourceRefSchema = z.object({ path: z.string(), line: z.number().int().positive().optional(), commitSha: z.string() });
export const RepositoryRecordSchema = z.object({ v, url: z.string(), host: z.string(), owner: z.string(), name: z.string(), commitSha: z.string().regex(/^[0-9a-f]{7,64}$/i), defaultBranch: z.string(), license: z.string(), licenseEvidence: z.string().nullable(), languages: z.array(z.string()), fetchedAt: z.number() });
export const CapabilitySchema = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/), label: z.string(), description: z.string(), inputType: z.enum(["text", "file", "json", "none"]), outputType: z.enum(["text", "file", "json", "none"]), sourceRef: SourceRefSchema, limitations: z.array(z.string()), resourceNeeds: z.array(z.string()), confidence: z.number().min(0).max(1), executable: z.boolean(), exec: z.object({ kind: z.enum(["js", "js-cli", "python"]), packageName: z.string(), module: z.string(), exportName: z.string() }).nullable() });
export type Capability = z.infer<typeof CapabilitySchema>;
export const CapabilityGraphSchema = z.object({ v, repo: z.string(), commitSha: z.string(), capabilities: z.array(CapabilitySchema), edges: z.array(z.object({ from: z.string(), to: z.string(), via: z.string() })), conflicts: z.array(z.string()) });
export type CapabilityGraph = z.infer<typeof CapabilityGraphSchema>;
export const RepositoryAnalysisContractSchema = z.object({ v, repo: z.string(), commitSha: z.string(), strategy: z.string(), confidence: z.number(), evidence: z.array(z.string()), entryPoints: z.array(z.string()), risks: z.array(z.string()), outcome: CompatibilityOutcomeSchema });
export const ConversionPlanSchema = z.object({ v, repo: z.string(), commitSha: z.string(), strategy: z.string(), stages: z.array(z.string()), selectedCapabilities: z.array(z.string()), estimatedResources: z.object({ tokens: z.number(), seconds: z.number(), repairs: z.number() }), outcome: CompatibilityOutcomeSchema.nullable() });
export const WorkflowNodeSchema = z.object({ id: z.string(), capabilityId: z.string(), inputType: CapabilitySchema.shape.inputType, outputType: CapabilitySchema.shape.outputType });
export const WorkflowGraphSchema = z.object({ v, nodes: z.array(WorkflowNodeSchema).max(20), order: z.array(z.string()) });
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export const AppBlueprintContractSchema = z.object({ v, title: z.string(), goal: z.string(), capabilityIds: z.array(z.string()), workflow: WorkflowGraphSchema, inputs: z.array(z.string()), outputs: z.array(z.string()), permissions: z.array(z.string()) });
export const BuildManifestContractSchema = z.object({ v, commitSha: z.string(), packageName: z.string().nullable(), installCommand: z.string(), artifact: z.string(), reproducible: z.boolean() });
export const SecurityManifestContractSchema = z.object({ v, permissions: z.array(z.string()), networkPolicy: z.string(), isolationProfile: z.string(), deniedCapabilities: z.array(z.string()) });
export const VerificationReportContractSchema = z.object({ v, passed: z.boolean(), checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string() })), sampleInput: z.string(), sampleOutputExcerpt: z.string(), checkedAt: z.number() });
export const ApplicationContractSchema = z.object({ v, id: z.string(), ownerId: z.string(), title: z.string(), currentVersion: z.number(), state: z.string() });
export const ApplicationVersionContractSchema = z.object({ v, appId: z.string(), version: z.number(), commitSha: z.string(), verification: z.enum(["verified", "partial", "failed"]), deployedAt: z.number() });
export const ConversionJobContractSchema = z.object({ v, id: z.string(), ownerId: z.string(), status: z.string(), selectedCapabilities: z.array(z.string()), attempts: z.number(), outcome: CompatibilityOutcomeSchema.nullable() });
export const PermissionGrantContractSchema = z.object({ v, id: z.string(), userId: z.string(), appId: z.string(), appVersion: z.number(), action: z.string(), resource: z.string(), purpose: z.string(), expiresAt: z.number(), revoked: z.boolean() });
export const CONTRACTS = { RepositoryRecord: RepositoryRecordSchema, RepositoryAnalysis: RepositoryAnalysisContractSchema, CapabilityGraph: CapabilityGraphSchema, ConversionPlan: ConversionPlanSchema, AppBlueprint: AppBlueprintContractSchema, BuildManifest: BuildManifestContractSchema, SecurityManifest: SecurityManifestContractSchema, VerificationReport: VerificationReportContractSchema, Application: ApplicationContractSchema, ApplicationVersion: ApplicationVersionContractSchema, ConversionJob: ConversionJobContractSchema, PermissionGrant: PermissionGrantContractSchema } as const;
export function migrateContract(name: keyof typeof CONTRACTS, raw: unknown): unknown {
  if (raw && typeof raw === "object" && !("v" in raw)) return { ...(raw as object), v: CONTRACT_VERSION };
  return raw;
}
export function validateContract(name: keyof typeof CONTRACTS, raw: unknown) { return CONTRACTS[name].parse(migrateContract(name, raw)); }
// Typed operation graph: bounded size, known capabilities only, declared
// order must cover exactly the nodes, adjacent types must be compatible.
export function validateWorkflow(graph: CapabilityGraph, selectedIds: string[], order?: string[]): WorkflowGraph {
  if (!selectedIds.length) throw new Error("At least one capability must be selected");
  if (selectedIds.length > 20) throw new Error("Workflow exceeds the 20-operation bound");
  const byId = new Map(graph.capabilities.map((c) => [c.id, c]));
  const ord = order?.length ? order : selectedIds;
  if (ord.length !== selectedIds.length || new Set(ord).size !== ord.length || ord.some((id) => !selectedIds.includes(id))) throw new Error("Workflow order must list each selected capability exactly once");
  const nodes = ord.map((id) => { const c = byId.get(id); if (!c) throw new Error(`Unknown capability "${id}" — not in the capability graph for ${graph.repo}@${graph.commitSha.slice(0, 7)}`); return { id: `n-${id}`, capabilityId: id, inputType: c.inputType, outputType: c.outputType }; });
  for (let i = 1; i < nodes.length; i++) { const prev = nodes[i - 1], cur = nodes[i]; if (prev.outputType !== "none" && cur.inputType !== "none" && prev.outputType !== cur.inputType) throw new Error(`Type mismatch: ${prev.capabilityId} outputs ${prev.outputType} but ${cur.capabilityId} needs ${cur.inputType}`); }
  return WorkflowGraphSchema.parse({ v: CONTRACT_VERSION, nodes, order: ord });
}
export function outcomeFor(input: { strategy: string; hasSpec: boolean; verified: boolean; attempted: boolean; unsafe?: boolean }): CompatibilityOutcome {
  if (input.unsafe) return "unsafe";
  if (input.verified) return "compatible";
  if (input.attempted) return "failed-build";
  if (["web-app", "http-api", "container", "wasm"].includes(input.strategy)) return "requires-infrastructure";
  if (input.hasSpec) return "partially-compatible";
  return "unsupported";
}
