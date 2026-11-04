# I5 — Held-out generalization protocol

## Engine freeze

- Frozen base commit: `22c3ac3c0a6466d206ece5f41699d5b1954ce5b7` (recorded before I2–I5 work).
- Engine under test: that commit plus the uncommitted I2–I5 working-tree diff in this checkout. The freeze rule is: no held-out-specific code, manifest, prompt or expectation may be added after selection. Selection below was made from upstream documentation only.
- Regression examples (NOT held-out, never counted in this denominator): `markedjs/marked`, `un33k/python-slugify`, `uuidjs/uuid` (`tests/eval.test.ts`, quarantined host run; `demo/generalization.json`).

## Inclusion criteria (all must hold)

1. Public repository with a OSI-approved license permitting test execution.
2. Absent from `lib/catalog.ts`, `CURATED` in `lib/github.ts`, `demo/manifests/`, and every name-based special case (`lib/classify.ts` curated-adapter match, `lib/engine.ts` studio tables).
3. Across two ecosystems (JavaScript/TypeScript and Python) and multiple strategies (library and CLI on each side where feasible).
4. Small, CPU-only sample that finishes inside sandbox budgets; no GPU, no private data, no credentials beyond the public GitHub API.
5. Independent semantic expectation written from upstream docs BEFORE any run — shape/parse checks, never an exact model-generated string.

## Selected set (denominator = 4, plus 1 separate incompatible case)

| # | Repository | Ecosystem / expected strategy | Sample input | Independent semantic expectation |
|---|---|---|---|---|
| H1 | `nanoid/nanoid` | JS / js-library | `"order-42"` (seed text) | Output is a non-empty ID matching `/^[A-Za-z0-9_-]{10,}$/`; two runs differ or are explicitly seeded — never an empty/error dump |
| H2 | `piuccio/cowsay` | JS / js-cli | `hello openos` | Output contains `hello openos` inside a speech frame and a cow figure (substring + structure, parsed as text) |
| H3 | `theskumar/python-dotenv` | Python / python-library | `KEY=heldout\n` parsed via the library API | Result exposes `KEY == "heldout"` (typed value, not stdout substring alone) |
| H4 | `psf/black` | Python / python-cli | `x=1\n` | Output parses as Python and equals `x = 1\n` after formatting (AST-equivalent, whitespace-normalized) |
| X1 | `AUTOMATIC1111/stable-diffusion-webui` | Native/GPU web UI / incompatible (separate) | n/a | Terminal outcome is `requires-infrastructure` or `unsupported` — never `compatible`, never an iframe/fake deploy |

Pinned commits are NOT invented here: at submission time `lib/github.ts:resolveCommit` resolves the default branch once and every fetch carries that 40-char SHA. The runner records the observed SHA in the job (`commitSha`) and in this file's run log. A branch name or `pushed_at` never counts as provenance.

## Submission path (same as users)

Browser/API: sign in (`POST /api/auth/session`) → analyze (`POST /api/analyze`) → convert (`POST /api/convert` with selected capability IDs) → poll (`GET /api/jobs/:id`) → open (`GET /api/apps/:id`) → grant + execute (`POST /api/grants`, `POST /api/execute`) with a second input, no rebuild. Personalization check: repeat one repo with a different selection/prompt and assert workflow + output differ; an unselected operation must return 403.

## First-pass results in THIS environment (honest denominator)

- Live attempts: **0/4 executed** — no Modal credentials and no `MODEL_API_KEY` here, so the provider correctly refuses and the coordinator runs as `analysis-only-fallback`. Claiming sandbox success from the fixture runner or a stubbed fetch would violate I5 and is not done.
- Credential-free checks that DID run: selection hygiene (absence from catalog/curated/demos/special cases), six-outcome mapping, fail-closed refusal, and tenant/grant denials — `tests/i5-release.test.ts` (12 tests, all passing at handoff). Engine runs with `/demo` absent (no engine module imports `demo/`; asserted in the same file).
- To execute the live denominator: configure credentials per [the release report](i5-release.md#credential-activation), start the server, then run `OPENOS_URL=http://localhost:3000 node scripts/live-smoke.mjs` per repo (substituting each held-out URL) and append: date, pinned SHA, provider, outcome, app reopen result, personalization diff, and failure reason for EVERY attempt — including failures. Later engine improvements never rewrite this first-pass record; they get a new dated section.
