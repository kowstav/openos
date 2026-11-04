---
name: verification
description: Prove converted apps work with real sample execution and output validation before claiming success.
---
# Verification
## Workflow
1. Run a representative sample input through the real operation in the sandbox.
2. Validate the output's shape/content (e.g. HTML contains `<h1`, slug equals expected, PDF page count matches).
3. Record a VerificationReport: sample, observed output excerpt, pass/fail.
4. Only verified apps may report "succeeded"; anything else is "partial" with the reason shown.
## Rules
- Exit code 0 is not verification. Validate the actual output.
- Never mark a plan-only conversion as deployed.
- Browser behavior claims require a browser run; otherwise state the limit.
## Verification of this skill
- Evaluation suite tracks showcase vs novel-repo conversion success separately.
## Example
python-slugify: "Hello OpenOS World!" → "hello-openos-world" (exact match) → verified.
