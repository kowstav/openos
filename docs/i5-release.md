# I5 + S3 — Independent release verification

Release engineer pass over the integrated I2–I4 + S2 app. Attacker view: assume the earlier fixes are known; look for sibling paths, stale promises, and unproven isolation claims. Base commit `22c3ac3c0a6466d206ece5f41699d5b1954ce5b7`; candidate is the current working tree (nothing committed in these sessions).

## Release decision by execution profile

| Profile | Decision | Why |
|---|---|---|
| Trusted built-ins (pdf-lib server adapter, Tesseract OCR + IMG.LY in browser) | **Ship** | Real operations, ordered pipeline parsed in tests, processing location stated; now session + quota gated (S3 fix below) |
| General conversion without sandbox (`SANDBOX_PROVIDER` unset) | **Ship as analysis/planning only** | Jobs terminate `partial`/`failed-build` with the blocker recorded; unverified builds are never published as verified apps |
| Untrusted execution via Modal (`SANDBOX_PROVIDER=modal`) | **Disabled until credentials prove it** | Two-phase worker is packaged and contract-tested; live isolation/egress proof is unobserved in this environment, so the path refuses rather than downgrading to the host |
| Trusted-fixture host runner | **Tests only** | Requires exact `local-trusted-fixtures` + `OPENOS_ENABLE_LOCAL_FIXTURES=1`; never selected for arbitrary repos |

## S3 findings (fixed / false positive / open)

| ID | Finding | Verdict | Enforcement point / evidence |
|---|---|---|---|
| S3-1 | `/api/pdf` processed files anonymously with no quota — studios bypassed the gateway | **Fixed** | Session + `pdf` quota before parsing in `app/api/pdf/route.ts`; studio ensures a session first (`components/PdfStudio.tsx`); anon 401 asserted in `tests/i5-release.test.ts` |
| S3-2 | `/api/analyze` burned GitHub + model anonymously | **Fixed** | Session + `analyze` quota in `app/api/analyze/route.ts`; repo page ensures session before analyzing |
| S3-3 | `/api/generate` shaped apps anonymously | **Fixed** | Session + `generate` quota in `app/api/generate/route.ts` |
| S3-4 | `/api/github` + `/api/catalog` fan out to GitHub (shared token) with no bound | **Fixed (kept public by design)** | Per-client-IP quotas (`github`, `catalog`) via `clientSubject` in `lib/ratelimit.ts`; still returns only public catalog/GitHub data (S1) |
| S3-5 | `execute` quota existed but was never checked | **Fixed** | `checkQuota("execute")` runs BEFORE grant consumption in `app/api/execute/route.ts`, so a 429 never burns a single-use grant |
| S3-6 | `deploy/docker-compose.yml` dropped `META_API_KEY` + Modal tokens; `docs/modal-sandboxes.md` still promised a host default | **Fixed** | Compose forwards all five variables; modal doc now states fail-closed refusing |
| S3-7 | Health hid model activation state | **Fixed** | `GET /api/health` returns `model: { configured, mode }` (presence only, never values) |
| S3-8 | Original S1 host-fallback / anonymous enumeration / `demo-user` authority / in-memory grants | **Still fixed (regression-held)** | `tests/i2.test.ts` (16) + `tests/s2.test.ts` (5) + `tests/i5-release.test.ts` (12) all green; no sibling route reintroduces client-chosen identity (searched all `app/api/**/route.ts`) |
| S3-9 | “Green tests prove cloud isolation” | **False positive if claimed — not claimed** | Suite proves contracts, refusal and tenant logic. Network isolation, egress denial and tenant separation INSIDE Modal remain unproven without an account; the unproven path stays disabled |
| S3-10 | Browser journey (Playwright) as release proof | **Open — environment-limited** | `scripts/e2e.mjs` selectors are current, but Chromium cannot launch here (`libatk-1.0.so.0` missing, see `docs/u3-evidence.md`). API/store/route proof + live HTTP smoke substitute; screenshots/keyboard journey still need a Chromium-capable host |

Reproduction note: original failures were confirmed by code inspection at the lines above (pre-fix route bodies had no `requireUser`/`checkQuota`); each fix ships with a failing-before/passing-after route test (anon 401 cases in `tests/i5-release.test.ts`, authenticated upserts in `tests/api.test.ts` / `tests/engine.test.ts` / `tests/i4.test.ts` / `tests/s2.test.ts`). Baseline re-execution of the pre-I2 host fallback was NOT re-run on the host — deliberately: I1 forbids executing that path outside the quarantined fixture gate.

## Tested guarantees (this candidate)

- Commands: `npm run lint` (0 errors, 1 pre-existing `<img>` warning), `npm run typecheck` (clean), `npm test` (84 passed, 4 quarantined-skipped), `npm run build` (succeeds), `python3 -m py_compile workers/modal_runner.py` (OK), live `node scripts/smoke.mjs` against the production build (see handoff numbers).
- Matrix in `tests/i5-release.test.ts`: all six compatibility outcomes; session issue/revoke/expire + second-tenant isolation; expired/revoked/cross-user grant denials; owner-only job cancellation; v1→v2 upgrade and rollback-as-new-version; app reopen with a second PDF input (output title/pages parsed); engine with `/demo` absent; held-out selection hygiene; health secrecy.
- One allowed artifact end-to-end at HTTP level: session → PDF merge → downloaded file parsed (2 pages). Denied controls at the same boundary: anonymous 401s, invalid pipeline 400, cross-tenant 404, suspended/unselected 403, grant replay at most once.

## Credential activation

Deployment config (`SANDBOX_PROVIDER`, `OPENOS_DATA_DIR`, ports) is separate from secrets below. Set secrets in the host/CI secret store (Vercel/host env, GitHub Actions secrets, `.env.local` locally — git-ignored); never commit values.

| Provider | Exact variable(s) | Minimum scope | Validation command | Healthy result | Failure behavior |
|---|---|---|---|---|---|
| Meta Muse (analysis + coordinator) | `MODEL_API_KEY` (fallback name: `META_API_KEY` — set one, not both) | Model API key for `muse-wonder-1.0` chat completions | `curl -s http://localhost:3000/api/health` then `POST /api/analyze` with a session | Health shows `model: { configured: true, mode: "genuine-ai-conversion" }`; analyze returns `source: "muse-wonder-1.0"` | Without a key: `analysis-only-fallback` + deterministic blueprint, always labelled — never presented as AI output |
| Modal Sandboxes (untrusted execution) | `SANDBOX_PROVIDER=modal` + `MODAL_TOKEN_ID` + `MODAL_TOKEN_SECRET` | Workspace token able to create/terminate Sandboxes + the `openos-build-artifacts` Volume; billing enabled | `curl -s http://localhost:3000/api/health` (`provider.isolated: true`), then `OPENOS_URL=http://localhost:3000 node scripts/live-smoke.mjs` | Conversion verifies a real sample in Modal; runtime runs the exact built artifact with network denied; sandboxes terminate | Missing/misspelled provider or missing tokens: untrusted jobs refuse (`ProviderNotConfiguredError`) — never a host fallback. If the SDK cannot enforce `block_network`, the worker exits 4 and refuses |
| GitHub (optional) | `GITHUB_TOKEN` | Public-repo read only; no scopes needed for public data (fine-grained: Contents read on public repos) | Convert/analyze twice and watch for GitHub 403s; `GET /api/health` stays `ok` | Rate limit rises (≈60/hr → 5,000/hr); fewer 403s | Without it: public rate limits apply; strict `parseGitHubUrl` still refuses userinfo/look-alike/other hosts so the token cannot be steered |

Live smoke entry points: `node scripts/smoke.mjs` (credential-free truth: denials, real PDF output, isolation of libraries, honest terminal conversion) and `node scripts/live-smoke.mjs` (credential-gated, disposable: held-out conversion, reopen, cross-tenant denial, cleanup). Both exit nonzero on observed failure; the live script prints explicit `SKIP` lines and exits 0 only when a credential is absent.

## Incident shutdown (repeatable)

1. Stop untrusted work: unset `SANDBOX_PROVIDER` (or set it to any non-exact value) and restart — `activeProvider()` refuses every untrusted job; trusted PDF/OCR studios keep working for signed-in users.
2. Stop all execution: suspend affected apps (`PATCH /api/apps/:id { state: "suspended" }` — execute returns 403) and revoke grants (`DELETE /api/grants?id=…`).
3. Stop identity issuance if sessions are suspect: existing sessions expire within 7 days (`SESSION_TTL_MS`); purge immediately by clearing `sessions.json` in `OPENOS_DATA_DIR` and restarting (all users sign in again).
4. Preserve evidence: copy `audit.json` (hashed ids only) + job records before cleanup; `backupStore` snapshots exclude sessions/grants by design.
5. Re-enable only after the live smoke passes in a disposable environment.

## Remaining limitations (not blockers for the profiles marked Ship)

- No live Modal/Muse proof, no hosted URL, no browser recording in this environment (Chromium libs + credentials absent) — labelled pending, never claimed. Held-out live denominator is 0/4 observed; protocol + expectations are frozen in [the held-out record](i5-heldout.md).
- Storage is the transactional JSON store behind the relational API (single-instance); multi-instance deploys swap Postgres/S3 behind the same functions. Quotas are in-memory fixed windows (same swap note in `lib/ratelimit.ts`).
- Audio transcription still needs the Python sandbox (subtitle editor/export ship and are tested); hosted web/API/container/WASM strategies terminate as honest outcomes, not adapters.
