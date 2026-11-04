---
name: environment-builder
description: Build isolated, reproducible execution environments for converted repositories without secrets or host contamination.
---
# Environment builder
## Workflow
1. Create a throwaway sandbox directory per package under the project-local sandbox root (never the system interpreter, never shared dirs).
2. JS: `npm install --ignore-scripts <pkg>`. Python: project-local `venv` + `pip install <pkg>`.
3. Pin by source SHA where the source is a repo; record package name and version evidence.
4. Execute through one fixed harness; package/module/export names are validated data, user input travels via stdin JSON only.
## Rules
- Scrubbed environment (PATH/HOME/TMPDIR only). API keys and credentials never enter the sandbox.
- Bounded: install 120–180s, execution 20s, output capped. Kill on timeout.
- Install failure is evidence: record it, do not retry blindly more than once.
## Verification
- A sample invocation runs and its output is validated by the verification skill before any app is marked succeeded.
## Example
`marked` installs into `sandbox/js-marked/`; harness requires it and converts a sample heading.
