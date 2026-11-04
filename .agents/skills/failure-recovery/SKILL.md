---
name: failure-recovery
description: Classify conversion failures, attempt bounded repair, and report honest outcomes.
---
# Failure recovery
## Failure classes
ingest (repo missing/rate-limited), classify (no manifest), install (deps/native build), execute (runtime error), verify (output mismatch), policy (permission denied).
## Workflow
1. Record the failing step, class, and the real error excerpt in the job log.
2. Bounded repair: at most one targeted retry for transient install/network failures. Never loop.
3. If repair fails, finish as "partial" or "failed" with the blocker in user language plus technical detail.
4. Suggest the smallest next step (different repo shape, missing runtime, GPU need).
## Rules
- No silent fallbacks that fake success. A fallback (e.g. chroma key when the AI model can't load) must announce itself.
- Concurrency and budget caps stop runaway repair.
## Example
faster-whisper: classified python-library, but execution needs GPU/model weights → partial, plan recorded, no fake transcript.
