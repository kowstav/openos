---
name: interface-design
description: Generate polished, declarative UI schemas for converted apps that trusted OpenOS components render.
---
# Interface design
## Workflow
1. Choose fields from the blueprint: textarea/file input for inputs, select/number for options, preview/download for outputs.
2. Write labels in the user's words. No function names, flags, or stack traces in the UI.
3. One primary action per app. Show progress and plain-language errors.
4. Layout follows the task: editors get wide inputs, converters get before/after, document tools get download-first results.
## Rules
- Only declarative schema ships to the client. Untrusted code never renders HTML/JS.
- Mobile-first: controls stack, tap targets ≥ 40px, no hover-only actions.
- Avoid generic AI styling tells: no purple gradients, no identical card grids, hierarchy through type and spacing.
## Verification
- Schema validates; every field maps to an operation input.
- Rendered app works at 375px width without horizontal scroll.
## Example
Markdown app: one labelled textarea ("Your Markdown"), one Run button, result panel with Download.
