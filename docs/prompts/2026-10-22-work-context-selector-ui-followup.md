---
target-repo: edge-robot/clawonshape
branch: feat/21-selection-ui
worktree: <workspace>/clawonshape-ui
issue: edge-robot/clawonshape#17 (UI), backend edge-robot/clawonshape#21
architecture-ref: clawonshape/docs/interface/work-context.md#accepted-interpretations-ts-plugin-dev-report-2026-10-22-cr-1cr-8
contract-version: work-context-1.0.0-draft (amended, CR-1–CR-8); goal-1.2.0-draft
base-commit: ca9d106   # your UI commit 7395e3d + merged, accepted backend 4a9f342
status: done   # accepted 2026-10-22 by onshape-architekt
addressee: Codex onshape-architekt (top-down). Delegate to openclaw-dev and review it yourself.
---
# Selector UI follow-up: review findings F1–F3

## How this prompt is used

Follow-up to `docs/prompts/2026-10-22-work-context-selector-ui.md`. The bottom-up architect has
reviewed your report and the diff. The work is committed as `7395e3d` on `feat/21-selection-ui`
(committed by the architect for you). The accepted backend is merged into the branch (`ca9d106`).
`npm test` passes (217), and `npm run test:cockpit` passes on the integrated tree. Task ID
`COC-CONTEXT-SELECTION-UI-FIX-20261022`, parent `COC-CONTEXT-SELECTION-UI-20261022`.

The contract was amended while you worked: read `docs/interface/work-context.md` →
"Accepted interpretations (… CR-1–CR-8)". The UI must follow it.

## Findings to fix

- **F1 (CR-2, must):** `Catalog.document.name`, `workspaces[].name` and `partStudios[].name` may be
  `null`. `ui/control-ui.js` interpolates them directly (around lines 546–563, 590, 600, 652–653),
  which renders `null · vorausgewählt` or `Part Studio: null` and breaks search. Render the same
  fallback as the compact card ("Name nicht verfügbar") plus the short ID; never treat `null` as text
  in search. Add browser cases with null names in an in-memory copy of `catalog.json`.
- **F2 (CR-7 and CR-4, must):**
  - `connection_busy_or_state_unavailable` from adopt must behave like
    `selection_revision_conflict`: reload status and show the current (winning) selection, with its
    own text ("Gerade belegt · Status neu geladen"). Never retry the write.
  - `target_not_part_studio` and `target_missing` need a distinct text ("Gebundenes Element ist kein
    Part Studio · Betreiber prüfen").
  - Add both to the U3 code assertions.
- **F3 (must):** `npm run test:cockpit` overwrites the committed evidence PNGs under
  `docs/product/onshape-selection-2026-10-21/implementation/` (byte drift on every run). Write the
  screenshots to a temporary directory by default. Add an explicit opt-in (for example the
  environment variable `COCKPIT_EVIDENCE_DIR`) for refreshing evidence. A normal test run must leave
  `git status` clean.
- **F4 (should):** the report says GoalView has no Part Studio label for `target.focus`. That is
  correct and accepted for increment 1; showing the element ID is fine. No change request is needed.

## Binding constraints

Same as the original prompt: only `ui/**`, `tests/cockpit*`, `scripts/test-cockpit-browser.mjs`,
`docs/engineering-cockpit.md`, `docs/product/**`. Do not touch `src/**`, the contracts, ADR or spec.
No live calls, no deployment, no GitHub writes, no push. Work only in this worktree on this branch.

## Acceptance

- F1–F3 fixed and covered by browser assertions.
- `npm run typecheck`, `npm test`, `npx biome ci .` and `npm run test:cockpit` pass.
- After `npm run test:cockpit`, `git status --short` is empty except for your intended edits.
- Regenerate only the screenshots whose content changed, via the opt-in, and list them.

## Handoff

If you can commit, commit on `feat/21-selection-ui` with the trailers `Refs: edge-robot/clawonshape#17`,
`Refs: edge-robot/clawonshape#21`, `Prompt: docs/prompts/2026-10-22-work-context-selector-ui-followup.md`,
`Agent: openclaw-dev`; author `Albert Kos <kickban3000@gmail.com>`. Otherwise leave the changes
uncommitted as before. Write the report to
`docs/prompts/2026-10-22-work-context-selector-ui-followup.report.md` with checks, F1–F3 evidence and
the changed files.
