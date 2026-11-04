# OpenOS

Futuristic AI-powered open-source app platform. See PLAN.md.

## Run

```bash
cp .env.example .env.local  # add MODEL_API_KEY (server-side only)
npm install
npm run dev
```

Open http://localhost:3000

## Env
- `MODEL_API_KEY` (or `META_API_KEY`) — Meta Model API key for muse-wonder-1.0. Without it, analysis falls back to a clearly-labeled deterministic summary.
- `GITHUB_TOKEN` (optional) — raises GitHub API limits.
