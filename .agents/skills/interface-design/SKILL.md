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
## U1 visual language (apply through the trusted renderer)
- Quiet neutral surfaces, one accent (#e8ff47), readable body type, restrained display face; monospace only for filenames/code in details. Tokens: type, spacing, surfaces, focus (:focus-visible 2px accent), state, motion (respect prefers-reduced-motion).
- Widest area is the work itself. Narrow screens keep example+task+next action together; desktop allows side-by-side compare.
- Previews: classify input/transform/output via lib/preview.ts + components/ToolPreview.tsx. Illustrations are labelled, locally authored, with provenance/rights/alt/dimensions in the asset record. Never pass an illustration off as a verified result; never fetch README assets or send uploads to a thumbnail service. Before/after uses a keyboard-operable range control.
- No decorative gradients, glass panels, repeated eyebrows, fake feeds, or identical dashboards.
## U2 copy and screens
- One primary action per decision. Every line names the object, explains a consequential choice, or aids recovery. No unsupported ownership/savings/privacy/isolation claims; limitations sit beside the affected action. License/provenance/provider detail stays discoverable in Technical details; blocking requirements never hide there.
- Status vocabulary from lib/status.ts (Ready to use / Needs a runtime / Build failed / Blocked for safety…). Derive copy from backend reason codes; specific messages only for observed causes. Implement loading/empty/partial/offline/failure/denied/retry/success where applicable; remove dead controls.
- Permissions are asked at the moment of use (Allow once / Cancel, app+action+retention), revoked in a permission center grouped by app. No padlock-as-consent, no raw grant IDs or "sandbox" in consumer copy.
- Graph and keyboard list share capability IDs and one selection; small screens must not require canvas panning. Reordering is drag-free (move buttons).
## Rules
- Only declarative schema ships to the client. Untrusted code never renders HTML/JS.
- Mobile-first: controls stack, tap targets ≥ 40px, no hover-only actions.
- Avoid generic AI styling tells: no purple gradients, no identical card grids, hierarchy through type and spacing.
## Verification
- Schema validates; every field maps to an operation input.
- Rendered app works at 375px width without horizontal scroll.
- WCAG 2.2 AA spot checks: focus order/visible focus, accessible names, contrast, target size, status announcements, graph/list equivalence.
## Example
Markdown app: one labelled textarea ("Your Markdown"), one Run button, result panel with Download.
