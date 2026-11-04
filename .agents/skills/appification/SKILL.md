---
name: appification
description: Turn a library or CLI capability set into a consumer application blueprint with real operations, inputs, and outputs.
---
# Appification
## Workflow
1. Start from extracted capabilities (name, description, input/output types).
2. Pick the subset a non-developer can operate: file/text in → visible result out.
3. Name operations in user language ("Convert Markdown to HTML", not "call parse()").
4. Emit an AppBlueprint: operations, steps, inputs, outputs, permissions, UI fields.
## Rules
- Every operation must map to a real, executable function or adapter step. No decorative buttons.
- If no executable mapping exists, say so and produce an honest plan instead of a mock app.
- Personalization changes operations and defaults — never just the title.
## Verification
- Blueprint validates against its Zod schema.
- Each operation traces to a capability found during analysis.
## Example
Prompt "invoice processor that merges and watermarks" on pdf-lib → operations [merge, watermark, metadata] in that safe order.
