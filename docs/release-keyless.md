# OpenOS release record — keyless candidate

Baseline reviewed: `fa599361c1da47b780008272d9617e49182c1867` (HEAD == baseline, clean tree at start; all work below is uncommitted on top of it — 50 files changed, 1555 insertions, 541 deletions per `git diff --stat HEAD`, plus new files listed in `git status`).

## Run it from a clean checkout

```bash
npm ci --ignore-scripts
npm run build
OPENOS_DATA_DIR=.openos-data npm run start -- -p 3100   # then open http://127.0.0.1:3100 in a browser
```

No keys are needed for the keyless journeys. Sign in from **My Apps** with any name or email — the same handle opens the same library in any browser or device (development identity; production swaps an IdP behind the same session record). The full local stack, including the separate worker:

```bash
docker compose -f deploy/docker-compose.yml up --build   # web :3000 + worker (scripts/worker.mjs)
```

## Browser-tested demo

```bash
npm run build
OPENOS_DATA_DIR=/tmp/openos-e2e-data npm run start -- -p 3100 &
npm run test:e2e        # scripts/e2e.mjs — required, credential-free
OPENOS_URL=http://localhost:3100 node scripts/smoke.mjs   # HTTP-level truth pass
OPENOS_URL=http://localhost:3100 node scripts/live-smoke.mjs  # BLOCKED without Modal+Muse keys (never proof)
```

## What is verified keyless (observed, this candidate)

- **Identity:** session issuance is idempotent (repeat/concurrent calls keep one owner); the same sign-in handle in a second browser opens the same library; a different account sees an empty library and gets 404 on the first account's app URL. Covered by `tests/release-gate1.test.ts` and the browser E2E.
- **Choices reach execution:** one canonical, revision-bound capability graph (`lib/capabilities.ts::buildCanonicalGraph`) feeds the analysis API, the builder UI and the worker. Selections persist (typed inputs, options, order, outputs on the job/app), unknown selections are rejected before any build, and the executor dispatches the actual ordered chain. Two orders of the same PDF steps produce measurably different files (parsed page counts); the PDF ordering regression (`extract→merge` = 2 pages vs `merge→extract` = 1 page) is preserved in the route pipeline.
- **Library durability:** each personalized app has its own identity (`appKey`) separate from repo and version; two apps from one repo keep independent histories; editing operations publishes a validated new version (the published manifest is never edited in place); rebuild continues the same app's line and a failed rebuild leaves the last good version usable; deleting app A removes only A's artifacts/objects/grants — B's files, versions and grants keep working; legacy imports are owner-namespaced so the same legacy id in two accounts never collides. All proven in `tests/release-gate1.test.ts`.
- **Engine:** the coordinator (`lib/model.ts::runCoordinator`) sends the reviewed skill procedures to the model, gateway-checks every tool request, dispatches only through the sandbox boundary, feeds observed results back, and stops at token/time/repair budgets. No-key, invalid-key, timeout, denial and repair paths are protocol-tested in `tests/release-gate2.test.ts`; nothing is called a genuine AI conversion without an observed model response plus observed tool results.
- **Trust boundary:** untrusted code never runs on the host — absent/misspelled provider config refuses, and even with the test-fixture flags enabled only the exact fixture packages (`marked`, `python-slugify`, `uuid`) may execute locally; any public submission is refused. The Modal worker builds per-job into `jobs/<jobId>/pkg`, publishes a SHA-256 digest, and `run` mode never reinstalls (exit 5 if the artifact is missing); runtime is `block_network=True` or the job refuses (exit 4). GitHub visibility is confirmed without credentials before any token is attached. Verification is capability-specific: two different inputs, input-sensitivity, repeat-consistency (pure transforms repeat; ID generators vary in a valid format), plus independent expectations (slug, Markdown HTML, UUID shape). A constant-output stub fails.
- **Studios (real operations, location stated on each page):** PDF (server adapter, in-memory), photo (IMG.LY browser model with a labelled solid-background fallback — never called rembg), OCR (browser Tesseract), transcription (upload + playback + cancellable job + editable timestamped transcript + SRT/VTT export; automatic transcription via the isolated faster-whisper CPU profile when configured, otherwise an honest `needs-runtime` state).
- **Frontend:** warm-paper workbench, one Discover field (a repo URL routes to analysis, anything else searches), outcome-led cards with family-specific previews (PDF invoices, same-object photo reveal, waveform, receipt OCR, outline→nodes, messy→clean table), canonical builder with draft persistence and cancel, typed generated-app renderer, thumbnails and version history in My Apps. Before/after screenshots and a contact sheet are under `docs/visual-evidence/`.

## Implemented but unobserved (needs an external account/secret)

| Integration | State | How to activate |
|---|---|---|
| Meta Muse live conversion | Coordinator + analysis wired, protocol-tested with mocked transport | Set `MODEL_API_KEY` (or `META_API_KEY`), check `GET /api/health` shows `genuine-ai-conversion`, then `scripts/live-smoke.mjs` |
| Modal isolated execution (incl. faster-whisper transcription) | Two-phase + split build/run/destroy worker packaged (Python + Modal SDK in the image), contract-tested | Set `SANDBOX_PROVIDER=modal`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, then `scripts/live-smoke.mjs` |
| GitHub higher rate limits | Public-visibility check precedes any token use | Optional `GITHUB_TOKEN` (public read only) |

Secret **names only** (never values): `MODEL_API_KEY`, `META_API_KEY`, `GITHUB_TOKEN`, `SANDBOX_PROVIDER` (deployment config), `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `OPENOS_WORKER_TOKEN` (deployment config), `OPENOS_DATA_DIR` (deployment config). Validation commands and healthy/failure behavior: `docs/i5-release.md` § Credential activation.

## Exact residual blockers

1. **Live Muse + Modal proof is BLOCKED in this environment** (no keys/account): `node scripts/live-smoke.mjs` prints `BLOCKED` per missing dependency and records every attempt to `/tmp/openos-live-smoke.json`. The unproven execution profile stays disabled; this is not release proof.
2. **Held-out live denominator:** the four frozen held-out repos and their independent expectations live in `scripts/live-smoke.mjs`; they have not been observed live (see #1). Protocol, expectations and the incompatible case are frozen and ready.
3. **GitHub unauthenticated quota** in this sandbox was exhausted during verification (60/hr, shared egress); repository analysis returns an honest retry message until the window resets or `GITHUB_TOKEN` is set.
4. Storage/quotas run on the transactional file store behind the `lib/store` API (single-instance); multi-instance deployments swap Postgres/S3 behind the same functions. No hosted URL is claimed — nothing was deployed.

## Final verification snapshot (this candidate)

- Unit/integration: 103 passed, 4 skipped (host-eval quarantine), 11 files passed / 1 skipped — `npm test`.
- Lint: 0 errors (1 pre-existing `<img>` warning). Typecheck: clean. Production build: clean. Worker: `python3 -m py_compile workers/modal_runner.py` OK. Compose: `docker compose config` valid.
- Browser E2E (`scripts/e2e.mjs`, production build, clean data): **32/32 checks passed** — sign-in, one-field search, builder with reload-safe draft, ordered merge+watermark download (parsed: 4 pages from 2+2), second input without rebuild, My Apps reopen, second-browser same library, cross-account denial, real photo processing, zero overflow at 360/375/768/1440, service worker, no console errors, no failed/5xx requests. During this work the E2E caught and we fixed: a draft save/restore race, and three CSP gaps (IMG.LY CDN, blob scripts/fetches, WASM) that had silently forced the photo fallback.
- HTTP smoke (`scripts/smoke.mjs`): all applicable checks pass (1 credential-dependent Muse check skipped with a label).
- Live smoke: `BLOCKED` (Modal + Muse keys absent) with all attempts recorded — correctly not counted as proof.
- A `GITHUB_TOKEN` was provided for this verification (read by the app as `GITHUB_TOKEN`); authenticated quota verified (49k+ remaining). GitHub visibility is still confirmed before any token-bearing source fetch, and private repositories are refused.
