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

## Security
No arbitrary repo execution. Only curated adapters. Explicit file pickers only. Size limits. Keys server-side only.

## Env
`MODEL_API_KEY` (or `META_API_KEY`), optional `GITHUB_TOKEN` for higher rate limits. See `.env.example`.
