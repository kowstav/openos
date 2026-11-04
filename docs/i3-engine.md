# I3 — General conversion engine

Path: `app/repo/page.tsx` (selected capability IDs + prompt) → `POST /api/convert`
(`selectedCapabilities`, `workflowOrder`, `options`) → durable job → `lib/job-worker.ts`
→ pinned fetch → capability graph → validated workflow → semantic verification →
atomically published version → `components/AppRenderer.tsx` → `POST /api/execute`
(operation must be in the app's selected `capabilityIds`, else 403).

## Provenance
`lib/github.ts` resolves the default branch to a commit once (`resolveCommit`),
then fetches tree, manifests, LICENSE evidence and ≤8 bounded source files **at
that commit**. `sha` is the commit SHA (previously `pushed_at`, removed). Tests
stub a moving branch and assert tree/content URLs carry the pinned SHA.

## Contracts (§21)
`lib/contracts.ts`: all twelve versioned (`v:1`) contracts with Zod validation
and `migrateContract`/`validateContract` at boundaries, the six machine-readable
compatibility outcomes, and `validateWorkflow` (≤20 ops, order-exact, typed
input/output compatibility, unknown/unselected rejected).

## Capabilities & strategies
`lib/capabilities.ts` extracts source-linked capabilities from manifest shape
(`main`, `bin`, `[project.scripts]`) and exported symbols in pinned source files
— never from package/repository names (renaming regression in tests). JS/Python
library+CLI execute via the I2 fail-closed provider; web/API/container/WASM and
GPU/native analyses terminate as `requires-infrastructure`/`unsupported` rather
than fake deploys or iframes (cloud-only boundary preserved).

## Muse coordinator
`planCoordinator`/`buildModelRequest` in `lib/model.ts`: typed tools each checked
against the deterministic gateway (sandbox tools denied on the host, sandbox-only),
skill name+SHA-256 version+excerpt in the hashed request (changing a skill body
changes `requestHash`, tested), budgets (tokens/time/repairs), and honest modes:
`genuine-ai-conversion` only with a configured key, else `analysis-only-fallback`.

## Verification
Semantic, not substring/exit-zero: typed non-empty output, not an error dump,
and deterministic across two runs (`verifySemantically`). Unverified builds are
never published as verified apps; outcomes are recorded on job and app.

## Acceptance status
Proven by `tests/i3.test.ts` (contracts, pinned provenance, workflow bounds,
skill-hash sensitivity, unselected-operation 403, differing selections). The
browser-level same-repo/two-prompts run and real-sandbox execution remain
credential-gated (Modal unconfigured here, provider refuses) — not claimed.
