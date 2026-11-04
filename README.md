# OpenOS

OpenOS turns open-source GitHub repositories into personalized, immediately usable cloud applications. Paste a public GitHub URL, get an AI-generated visual blueprint of what the repository does, and — for vetted libraries — launch a real working app in your browser. No local installation.

See [PLAN.md](/workspaces/openos/PLAN.md) for milestones and acceptance criteria.

## Features

- **Marketplace** — curated repositories with live GitHub stars, language, and license data.
- **AI repository intelligence** — paste any public GitHub URL for a structured blueprint: purpose, capabilities, architecture, inputs/outputs, permissions, risks, and commercial alternatives (verified vs. AI-suggested, never implying parity).
- **Interactive capability graph** — React Flow diagram generated from the blueprint.
- **PDF Studio** (`Hopding/pdf-lib`, trusted server adapter) — merge, split, rotate, watermark, and stamp metadata on real PDFs. Files are processed in memory and never stored. 15 MB limit per file.
- **OCR Reader** (`naptha/tesseract.js`) — text extraction runs entirely in the browser; images are never uploaded.
- **My Apps workspace** — launch supported apps, revisit blueprints saved in `localStorage`, and test the deterministic permission gateway.
- **Permission gateway** — allow/deny/ask rules in code (`lib/permissions.ts`). The AI model never grants access on its own. Shell execution, credential reads, and filesystem-wide access are always denied.

Unsupported repositories get an honest compatibility assessment and a saved implementation plan. OpenOS never pretends an untested repository was deployed, and never executes arbitrary repository code.

## Quick start

```bash
cp .env.example .env.local   # fill in MODEL_API_KEY (see below)
npm install
npm run dev -- -H 127.0.0.1 -p 3000
```

Open http://127.0.0.1:3000 in your browser.

Production:

```bash
npm run build
npm run start -- -H 127.0.0.1 -p 3000
```

## Environment variables

All keys are **server-side only**. Never expose them in client code, logs, or commits. `.env.local` is git-ignored.

| Variable | Required | Purpose |
|---|---|---|
| `MODEL_API_KEY` | For AI analysis | Meta Model API key, sent as `Authorization: Bearer …` to `https://api.meta.ai/v1` for model `muse-wonder-1.0`. |
| `META_API_KEY` | No | Fallback name, used only if `MODEL_API_KEY` is unset. Set one, not both. |
| `GITHUB_TOKEN` | No | GitHub personal access token. Raises REST API rate limits (60/hr unauthenticated → 5,000/hr). No scopes needed for public repos. |

Without a model key, repository analysis falls back to a deterministic summary built from README/metadata. The UI always labels which source produced a blueprint — fallback output is never presented as AI-generated.

Copy the template: [.env.example](/workspaces/openos/.env.example).

```bash
# .env.local
MODEL_API_KEY=your-key-here
GITHUB_TOKEN=ghp_optional
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Vitest: GitHub/analyze/PDF route + permission/schema tests (12 tests, network mocked at the fetch boundary; PDF tests use real pdf-lib documents) |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript) |
| `npm run typecheck` | `tsc --noEmit` |

## Deployment

OpenOS is a standard Next.js App Router app with no database. Any Node host works.

**Vercel (GitHub-connected, recommended)**

1. Push this repository to GitHub.
2. Import it in Vercel; framework preset: Next.js. No build overrides needed.
3. In Project Settings → Environment Variables, add `MODEL_API_KEY` (and optionally `GITHUB_TOKEN`) for Production.
4. Deploy. Every push to `main` redeploys automatically.

**Any Node host / container**

```bash
npm ci
npm run build
MODEL_API_KEY=… npm run start -- -p 3000   # behind your reverse proxy / TLS terminator
```

Notes:

- `/api/pdf` requires the Node.js runtime (declared in the route) — not Edge.
- The OCR studio loads Tesseract.js in the browser; no server resources needed.
- Blueprints are kept in an in-memory, commit-SHA-keyed cache and in the browser's `localStorage`. There is no database to provision or back up.
- Set `GITHUB_TOKEN` in production to avoid GitHub's 60-request/hour unauthenticated limit on the marketplace.

## Security model

- Only curated, vetted libraries run, through trusted server-side adapters. Arbitrary repositories are analyzed, never executed.
- Uploads are validated (type, 15 MB cap) and processed in memory; nothing is persisted.
- Only files a user explicitly selects are read. No gallery, filesystem-wide, credential, or shell access exists in the app.
- Deterministic permission rules (`lib/permissions.ts`) gate every capability; model output is Zod-validated before use.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS · React Flow (`@xyflow/react`) · GitHub REST API · Meta Model API (`muse-wonder-1.0`) · Zod · pdf-lib · Tesseract.js · Vitest
