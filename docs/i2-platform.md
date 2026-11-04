# I2 — Trusted platform & isolated execution

## Topology (local, credential-free → production)
| Concern | Local (this repo) | Production swap (same interfaces) |
|---|---|---|
| Control plane | Next.js app (`app/`, `lib/`) | same |
| Worker | `lib/job-worker.ts` `drainQueue()` — claimed with leases from the store; runs inline in dev, importable by any worker process | separate process/container running the same module on an interval |
| Relational storage | JSON collections behind `lib/store.ts` transactions (serialized read/modify/write, atomic tmp+rename) | Postgres/SQLite behind the same store functions |
| Object storage | `lib/storage.ts` scoped dirs `objects/<owner>/<key>` with TTL | S3-compatible bucket, same key scoping |
| Sign-in | `POST /api/auth/session` issues an opaque server session (SHA-256 hash stored, httpOnly cookie) | IdP/OIDC issuing the same session record |
| Sandbox | none by default — untrusted jobs **refuse** | Modal (`SANDBOX_PROVIDER=modal`) |

## Execution profiles — what is actually proven
- **Real sandbox:** only Modal, and only with credentials. No live Modal proof
  exists in this environment; the path is contract-tested (validation,
  fail-closed refusal, worker compiles) and labeled unrun.
- **Provider contract:** `tests/i2.test.ts` proves unset/misspelled provider
  config refuses untrusted execution (no host `npm`/`pip`/`node` spawn),
  lease recovery, idempotency, atomic grant consume, owner isolation,
  atomic publish, migration and TTL/backup behavior.
- **Trusted fixtures:** `OPENOS_ENABLE_LOCAL_FIXTURES=1` +
  `SANDBOX_PROVIDER=local-trusted-fixtures` enables the host runner for
  explicitly trusted test fixtures only. It is never selected by default and
  never for arbitrary repositories. `tests/eval.test.ts` host cases are
  quarantined behind `OPENOS_RUN_HOST_EVAL=1`.

## Jobs
Queued → claimed (lease 60 s + heartbeat) → running → succeeded/partial/
failed/cancelled. Duplicate submissions dedupe on `(owner, idempotencyKey)`.
Expired leases are reclaimed; attempts cap at `maxAttempts` (2). Only a
verified build calls `publishAppVersion` (new immutable version), so a failed
or cancelled rebuild leaves the last good version usable. Per-user fair
concurrency: 2 running jobs. Cost accounting records input/output chars and
execution count per job. Closing the browser loses nothing: `GET /api/jobs/:id`
(owner-scoped) resumes polling the same job.

## Permissions
Grants (`lib/broker.ts`) are persisted, high-entropy (`crypto.randomBytes`),
bound to user + app + app **version** + action + resource + purpose, TTL ≤
15 min, and consumed atomically before dispatch — concurrent replay dispatches
at most once; a timed-out dispatch stays consumed. Rebuilds invalidate old
grants (version mismatch). Legacy data never restores grants.

## Ops
- Health/metrics: `GET /api/health` (store health, job counts, provider status).
- Migrations: `runMigrations()` (001: owner fields; legacy records parked under
  `legacy-unmigrated`, claimable only via validated `POST /api/auth/migrate`).
- Backup/restore: `backupStore`/`restoreStore` in `lib/store.ts` (sessions and
  grants deliberately excluded from restore). Tested in `tests/i2.test.ts`.
- Audit: `lib/store.ts` `audit()` stores hashed actor/target ids only.
- TTL: jobs expire after 30 days; `purgeExpired()` removes expired jobs/sessions.

## Credentials (activation)
| Variable | Purpose | Healthy result |
|---|---|---|
| `SANDBOX_PROVIDER=modal` + `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET` | isolated execution | conversion verifies a real sample in Modal |
| `MODEL_API_KEY` or `META_API_KEY` | Muse analysis | `source: muse-wonder-1.0` |
| `GITHUB_TOKEN` (optional) | higher GitHub rate limits | fewer 403s from GitHub API |
