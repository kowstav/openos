---
name: deployment
description: Persist converted apps with versions, lifecycle management, and cleanup.
---
# Deployment
## Workflow
1. On verified conversion, persist the app manifest (operations, UI schema, permissions, exec spec, source repo + SHA, job id) to the app store.
2. Serve it at a stable URL (/app/[id]); list it in the owner's workspace.
3. Support lifecycle: launch, customize (regenerate from a new prompt), duplicate, remove.
4. Clean up sandbox directories and job records on removal; cap stored jobs.
## Rules
- Deployment ≠ hosting untrusted code: apps run through trusted renderers and the isolated runner.
- Deleting an app deletes its stored manifest; no orphan execution remains possible (execute returns 404).
- Record what is NOT deployed (plan-only conversions) distinctly.
## Verification
- Create → launch → execute → remove journey passes in tests; removed app cannot execute.
- Rebuild from the same SHA reproduces the same manifest.
## Example
marked conversion persists as an app; workspace launch opens /app/<id> and Run converts Markdown for real.
