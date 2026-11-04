# I4 — Discovery, studios, library and operations (+ S2 hardening)

## Journey
Search (problem / capability / paid product / project name / pasted URL, one
ranking layer in `lib/discovery.ts` with reasons) → tool page (graph and
keyboard list share capability IDs) → builder → verified app → reopened from
My Apps (`/api/library`: apps + plans + build history + permission center).
The catalog carries feature-level comparisons, omissions, processing
location, running costs and a dated evidence note. Prices and parity claims
were removed from `lib/catalog.ts` and the browser.

## Studios (section 16)
- PDF: `app/api/pdf/route.ts` runs steps in declared order with explicit
  file-list (`extract` per file) vs combining (`merge`) semantics; invalid
  combos are rejected before processing. Proven in `tests/i4.test.ts`:
  extract-then-merge on two PDFs = 2 pages, merge-then-extract = 1 page,
  both outputs parsed back. The studio reorders files and steps with
  keyboard-usable move buttons and shows page counts.
- Photo: browser IMG.LY adapter with its own identity (never labelled a
  rembg conversion unless pinned rembg code ran in the sandbox). Batch (12),
  centering, margins, canvas size, background colour, grouped download.
- Transcription: `/studio/audio` validates uploads, edits timestamped
  segments and exports real SRT/VTT (`lib/subtitles.ts`). Automatic
  transcription requires the faster-whisper sandbox and is honestly blocked
  without it; CPU profiles are attempted before GPU is declared essential.
- OCR: Tesseract.js in the browser; the image is never uploaded.

## Library
Rename, duplicate, customize/reorder steps, versions with diffs, rebuild
(intent recorded; only a verified build publishes), rollback (publishes the
old configuration as a new version), suspension, execution history,
permission center with revocation, and deletion with associated data
cleanup — all owner-scoped on the server. PWA shell (`public/sw.js`) caches
only public pages, never `/api/` or private data.

## S2 controls (each with its enforcement point)
- S2-1 Runtime/supply chain: two-phase `workers/modal_runner.py`, structured
  argv, runtime network denied, bounded output (I2, still credential-gated).
- S2-2 Source/tool trust: strict `parseGitHubUrl` (github.com only, no
  userinfo/look-alikes), pinned-commit fetch, skill hashes in model requests.
- S2-3 Tenant boundaries: sessions + owner checks on apps/library/jobs/
  grants/execute; cross-owner = 404; grants atomic and version-bound.
- S2-4 Browser/uploads/privacy: CSP and security headers in
  `next.config.ts`, `Cache-Control: no-store` on APIs, PDF magic-byte/size
  validation before parsing, no private content in the service-worker cache.
- S2-5 Platform/ops: per-user quotas (`lib/ratelimit.ts`), health/metrics,
  backups, audit, TTLs; `scripts/smoke.mjs` is the live entry point.

## Deployment
`deploy/Dockerfile` + `deploy/docker-compose.yml` (control plane + data
volume, healthcheck). Local start: `npm run dev`. Production: `npm run
build && npm start`, or the compose stack. The engine runs with `/demo`
absent — demos are fixtures, not dependencies.

## Credential activation
| Variable | Purpose | Healthy result | Without it |
|---|---|---|---|
| `SANDBOX_PROVIDER=modal` + `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET` | isolated execution | real sample verified in Modal | untrusted jobs refuse |
| `MODEL_API_KEY` or `META_API_KEY` | Muse analysis | `source: muse-wonder-1.0` | labelled deterministic fallback |
| `GITHUB_TOKEN` (optional) | GitHub rate limits | fewer 403s | public rate limits |

## Hackathon evidence (genuine runs in this environment)
Comparison (catalog feature tables), personalization (PDF step order
changes the parsed output), real output (merged/extracted PDFs in tests),
one allowed and one denied operation (selected vs unselected execute,
suspended app), and an unfamiliar conversion path (general engine, I3).
A hosted URL and browser recording remain credential-dependent and are
labelled pending, not claimed.
