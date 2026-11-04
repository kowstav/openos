# U3 evaluation evidence (heuristic review — no participants, no invented study)

Browser automation was attempted with the repo's Playwright harness (`scripts/e2e.mjs`, fixed to role-based selectors) but Chromium cannot launch in this sandbox (`libatk-1.0.so.0` missing for both headless-shell and full builds). Screenshots and the keyboard/touch journey are therefore **unverified here**; the harness now captures `home-{360,768,1440}.png` to `SHOT_DIR` wherever Chromium works. Flows below were verified over HTTP against the built server plus unit tests.

| Page | Primary action | Real backend outcome |
|---|---|---|
| `/` Discover | Find a tool (search) | `GET /api/catalog?q=&collection=` ranked results; cards show illustration preview, outcome title, `Ready to use`/`Needs a runtime` (lib/status.ts) |
| `/repo` Tool details | Create my app | `POST /api/convert` with selected capability IDs in order; steps reorder/remove/undo inline; merge-needs-2-files noted beside the action |
| `/app/[id]` Generated app | Allow once → Run | Consent first (app, action, one run, revoke pointer), then `POST /api/grants` + `POST /api/execute`; suspended apps blocked server-side |
| `/studio/pdf` | Run workflow → Download PDF | `POST /api/pdf` in declared step order (extract-then-merge ≠ merge-then-extract, covered by tests/i4.test.ts) |
| `/studio/image` | Run my workflow | On-device IMG.LY cutout + canvas; engine named per file, never labelled rembg |
| `/studio/audio` | Export subtitles | Real SRT/VTT from edited segments; auto-transcription honestly blocked (needs Python sandbox) |
| `/workspace` My Apps | Open | Server library (`/api/library`); rename/reorder are inline labelled forms (no `prompt()`); permission center revokes grants |

## WCAG 2.2 AA spot checks (code-level)
Visible `:focus-visible` accent outline; labelled search/textarea/file inputs; `aria-pressed` toggles; `role=status`/`alert` announcements; drag-free move buttons in graph list, PDF studio and builder; range-based before/after with keyboard operation; reduced-motion media query. Contrast of accent-on-black and body text was not measured with a tool — unmeasured, not claimed.

## Remaining limitations
- No screenshots or participant/task testing in this environment (see above).
- Five-second comprehension and PDF task tests not run with people; heuristic review only.
