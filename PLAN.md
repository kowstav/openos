# OpenOS — PLAN

## Vision
Paste any public GitHub URL → AI blueprint + interactive capability graph → launch a real app built on a vetted library, no local install.

## Milestones
- [x] M1 Scaffold: Next.js App Router + TS + Tailwind + React Flow. Acceptance: `npm run build` passes.
- [x] M2 GitHub ingestion: real REST API (repo, README, languages, tree). No invented stats. Acceptance: paste `Hopding/pdf-lib` returns live stars/forks.
- [x] M3 AI intelligence: Meta `muse-wonder-1.0` via `https://api.meta.ai/v1`, server-only key (`MODEL_API_KEY`|`META_API_KEY`), Zod-validated blueprint, SHA-keyed cache, stable system prompt first for caching. No key → clearly-labeled deterministic fallback (never faked as AI).
- [x] M4 Capability graph: React Flow diagram from blueprint (inputs→capabilities→outputs, permissions).
- [x] M5 PDF studio: real pdf-lib server adapter (merge, split, rotate, watermark, compress-metadata). Upload validated (type/size), no persistence. Acceptance: upload 2 PDFs → merged download opens.
- [x] M6 OCR studio: Tesseract.js in-browser (image never leaves device for OCR), honest progress.
- [x] M7 Permissions: deterministic allow/deny gateway (`lib/permissions.ts`) + interactive demo. Model never decides alone.
- [x] M8 Workspace: localStorage blueprint library, launch supported apps; unsupported repos show honest plan, never fake deploy.

## Phase 4 — Verification (done)
- [x] Tests: `npm test` — 16 Vitest tests (GitHub/analyze/PDF routes, permissions, schemas, Meta API wiring mocked at fetch boundary). PDF tests use real pdf-lib docs; network mocked at fetch boundary.
- [x] Lint clean (`npm run lint`, ESLint flat config), typecheck clean, production build passes.
- [x] Runtime verified: all 5 pages 200, live GitHub data, all 5 PDF ops return valid PDFs, error paths return 400.
- [ ] Headless-browser UI pass: no Chromium in this sandbox — pages verified over HTTP only.
- [x] Journey re-verified live: GitHub ingestion (pdf-lib 8,667 stars), analyze for supported + unsupported repos, all PDF ops, invalid URL 400 / missing repo 502, corrupt PDF 422, unknown PDF op 400 (fail closed).
- [x] Muse wiring verified by mocked-fetch tests (endpoint, model, Bearer key, prompt_cache_key, Zod parse, cached-token passthrough, invalid-response fallback). Live AI call NOT verified — no MODEL_API_KEY in this environment; with an invalid key the app degrades to the labeled deterministic fallback with HTTP 200.

- [x] M9 Discovery v2: search by paid tool/problem/capability (`lib/catalog.ts`, `/api/catalog`), covered vs missing features per entry, honest runnable badges.
- [x] M10 Personalization engine: `lib/engine.ts` + `/api/generate` turns plain-language prompts into validated multi-step workflows (PDF merge→watermark→metadata; photo remove-bg→resize→white-bg). Prompts requesting shell/credentials are blocked and reported.
- [x] M11 Photo Studio: AI background removal in-browser (`@imgly/background-removal`, image never uploaded) with chroma fallback, resize/white-bg/compress pipeline (`/studio/image`).
- [x] M12 PDF pipelines: `/api/pdf` `op=pipeline` executes ordered steps in one pass; unknown steps fail closed (400).
- [x] M13 Sandbox gateway: `lib/sandbox.ts` + `/api/sandbox` enforces allowlist + deterministic permissions server-side; adversarial tests cover shell/credentials/evil-host denials.
- [x] M14 Workspace v2: generated apps persist in `localStorage` (`openos-apps-v2`) with launch/customize/duplicate/remove.

- [x] M15 Skills: 11 audited skills in `.agents/skills/` (all `muse skills validate` → valid), loaded at runtime by `lib/skills.ts` and recorded per job step.
- [x] M16 General conversion engine: `lib/classify.ts` (evidence-based strategy from tree+manifests) → durable async jobs (`lib/convert.ts`, `.openos-data/`) → isolated install + fixed harness execution (`lib/runner.ts`, scrubbed env, timeouts, validated names, input via stdin only) → real sample verification → persisted app (`/app/[id]`, trusted `AppRenderer`).
- [x] M17 Permission broker v2: scoped single-use expiring revocable grants bound to user+app+action (`lib/broker.ts`); `/api/execute` refuses without a grant (403) and consumes it after one run.
- [x] M18 Generalization proof (live, not in /demo): markedjs/marked (JS) and un33k/python-slugify (Python) both converted end-to-end with validated sample outputs; `tests/eval.test.ts` re-proves this. Remaining limits: web-app/container/wasm/GPU repos get honest partial plans; sandbox is a scrubbed child process, Modal-grade isolation is next.

- [x] M19 Structured artifacts: every conversion persists a Zod-validated ConversionPlan, BuildManifest (reproducible install, source SHA), SecurityManifest, VerificationReport, and AppVersion (`lib/artifacts.ts`), surfaced on the app page as the build & security record.
- [x] M20 Modal Sandboxes: investigated and documented with a concrete 5-step wiring plan and a `SandboxProvider` seam (`docs/modal-sandboxes.md`, `lib/sandbox-provider.ts`). Not integrated — no Modal account/token exists; local provider remains default and is labeled honestly.
- [x] M21 Generalization measurement finalized: `demo/generalization.json` records the two live novel-repo conversions (marked JS, python-slugify Python), 2/2 succeeded, tracked separately from showcases.

## Security
No arbitrary repo execution. Only curated adapters. Explicit file pickers only. Size limits. Keys server-side only. Unsupported: arbitrary repo code, Python/GPU repos (faster-whisper, pandoc) — analysis and honest plans only until a real isolated runtime (e.g. Modal Sandboxes) is wired. Photo Studio's AI model loads from CDN on first use; offline it falls back to solid-background removal and says so.

## Env
`MODEL_API_KEY` (or `META_API_KEY`), optional `GITHUB_TOKEN` for higher rate limits. See `.env.example`.
