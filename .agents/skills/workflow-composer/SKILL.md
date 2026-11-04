---
name: workflow-composer
description: Compose multiple repository operations into safe, ordered, user-customizable workflows.
---
# Workflow composer
## Workflow
1. Map prompt verbs to operations ("merge", "watermark", "resize", "transcribe").
2. Order steps safely regardless of word order (merge before watermark; remove-bg before resize/export).
3. Expose steps as toggles the user can change before running; re-validate after every change.
4. Record steps in the app manifest so rebuilds reproduce the same workflow.
## Rules
- Unknown or incompatible steps fail closed with a 400-style error — never silently substituted.
- A workflow is real only if each step executes in the run path (e.g. PDF pipeline executes all steps in one pass).
## Verification
- Pipeline test: merge(2+1 pages) + metadata → 3 pages and the stamped title, in one execution.
- Removing a step changes the output measurably.
## Example
"removes backgrounds, centers on white, exports for Etsy" → [remove-bg, resize 1200px, white-bg].
