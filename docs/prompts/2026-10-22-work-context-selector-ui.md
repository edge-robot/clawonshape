---
target-repo: edge-robot/clawonshape
branch: feat/21-selection-ui
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape-ui
issue: edge-robot/clawonshape#17 (UI), backend edge-robot/clawonshape#21
architecture-ref: clawonshape/docs/interface/work-context.md#6-normalized-views
contract-version: work-context-1.0.0-draft; goal-1.2.0-draft
base-commit: ae7a05f
status: done   # reviewed 2026-10-22 by onshape-architekt; findings F1–F3 in 2026-10-22-work-context-selector-ui-followup.md
addressee: Codex onshape-architekt (top-down). Delegate the implementation to openclaw-dev and review it yourself.
---
# Cockpit: work-context selector against the work-context contract (top-down)

## How this prompt is used

This is a handover from the bottom-up architect (Claude onshape-architekt) to the **Codex
onshape-architekt**. It runs **in parallel** with the backend task
`docs/prompts/2026-10-22-work-context-backend.md` (ts-plugin-dev, branch
`feat/21-work-context-selection`, main checkout). The contract is the seam between both.

- You own the selector UI and its technical review.
- Assign the implementation to **openclaw-dev** through your normal team workflow, task ID
  `COC-CONTEXT-SELECTION-UI-20261022`, parent `COC-CONTEXT-SELECTION-20261021`.
- Review openclaw-dev's result against the acceptance criteria below before you hand back.
- Hand back one report file (see the end). The bottom-up architect reviews it before integration.

## Goal

Implement the selector journey of `spec.md` → "Select an Onshape work context" (S1–S9) in the
cockpit, **bounded to increment 1** of the ADR, against the gateway methods and views of
`docs/interface/work-context.md`. Until the backend lands, the UI runs against the contract
fixtures as mocked responses.

## Context

- Normative: `docs/interface/work-context.md` (§1 increment-1 bounds, §4 methods, §5.2 validity,
  §6 views, §8 codes and S8 outcomes); goal-workflow `goal-1.2.0-draft` (`GoalView.target.focus`).
- ADR: `docs/ADR.md` → "ADR-2026-10-21: Task-scoped Onshape workspace and part selection",
  "Review outcome and increment 1" (I1–I5). Your proposed decisions 1–9 are accepted as the
  target design; I1–I5 bound this increment.
- Product: `spec.md` S1–S9 and your mockups `docs/product/onshape-selection-2026-10-21/`.
- Fixtures (read in place): `docs/interface/work-context-fixtures/` — `catalog.json`,
  `view-valid.json`, `view-invalid.json`, `view-none.json`, `adopt-request.json`, `error-codes.json`.
- Existing UI: `ui/control-ui.js` (work-context card, `workspace-context`, goal panel),
  `scripts/test-cockpit-browser.mjs`, `docs/engineering-cockpit.md`.

## What increment 1 means for the UI

- Document column: exactly one document, preselected (no account-wide search).
- Workspace column: Primary selectable; the goal Candidate visible but disabled with
  "nur Ansicht" (`candidate_inspection_only`).
- Part column grouped by Part Studio: only the goal-eligible studio has parts; others show the
  reason (`element_not_provisioned`, `configuration_unsupported`); `parts: null` means "nicht
  geladen", `[]` means "keine Bauteile". Same-name parts show `partId` as a secondary identifier.
- Preview via `work-context-preview` for the chosen part only; `preview_unavailable` shows an
  explicit unavailable state. Never substitute the whole Part Studio render.
- "Auswahl übernehmen" calls `work-context-adopt` with `expectedSelectionRevision` from the last
  status/catalog; on success the dialog closes and the compact card returns (S3); on
  `selection_revision_conflict` reload and show the winning selection; on
  `selection_observation_stale` refresh the catalog.
- `WorkContextView.interlock.blocked` disables "Auswahl ändern" with the reason and a pointer to the
  goal panel (close the goal first). The server enforces it regardless.
- `validity` `invalid` / `unverified` is shown on the card; no cached preview is shown then.
- The goal panel shows `target.focus` (part name and Part Studio) before "Verify Candidate" when
  present, with the note that the focus is intent and the conditions remain feature-based.
- Late replies: discard catalog/preview responses that do not belong to the latest request or
  whose `observedMicroversion` differs from the current draft.

## Binding constraints and prohibitions

- Contract-first. Do **not** edit `docs/interface/**`, `docs/ADR.md`, `spec.md`, `src/**` or
  `tests/**` except `tests/cockpit*` and `scripts/test-cockpit-browser.mjs`. If the contract is
  insufficient, stop and write a change request (CR-UI-n) in the report; the bottom-up architect
  decides and versions the contract.
- Your files: `ui/**`, `docs/engineering-cockpit.md`, `scripts/test-cockpit-browser.mjs`,
  `docs/product/**`. The backend team does not touch them.
- The UI never derives state the views do not carry, never confirms or adopts automatically or on
  load, and never sends ownership or binding fields the contract does not list.
- No live Onshape, no deployment, no cluster access. Mocked responses only.
- No new runtime dependencies.
- No issues or comments in `edge-robot/onshape-mcp`; that repository is outside your team's scope.
  New issues in `edge-robot/clawonshape` only after agreement with the bottom-up architect via the
  user.

## Steps

1. Verify the worktree `/home/kaos/Projects/01_pib/02_sw/clawonshape-ui` is on
   `feat/21-selection-ui` at `base-commit` or later and clean.
2. Add a mock gateway for the five `work-context-*` methods backed by the fixtures.
3. Implement the selector dialog and the compact card per the bullets above.
4. Extend `scripts/test-cockpit-browser.mjs` for S1–S3, S8, S9 at 1440×900, 1366×768 and 390×844:
   open, choose, adopt, compact card, reopen restores selection, cancel/Escape discards, focus
   return, interlock disabled, invalid/unverified card, preview unavailable, revision conflict.
5. Update `docs/engineering-cockpit.md` for the new card and dialog.

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| U1 | S1/S2: three columns with the increment-1 bounds; same-name parts distinguishable | screenshots + browser test |
| U2 | S3: adopt closes the dialog; compact card with part, document, workspace, Part Studio, revision/freshness, Onshape link, "Auswahl ändern" | screenshots before/during/after |
| U3 | S8: every §8 code and view reason has its distinct outcome | browser test per code |
| U4 | Interlock and validity rendered from the view only | browser test with `view-invalid.json` |
| U5 | `target.focus` shown in the goal panel before confirmation | browser test |
| U6 | Cancel/Escape/close discard; reopen restores; keyboard and focus | browser test |
| U7 | `npm run typecheck`, `npm test`, `biome ci`, `npm run test:cockpit` pass | checks table |

## Branch and worktree rules

Commit on `feat/21-selection-ui` in the worktree `/home/kaos/Projects/01_pib/02_sw/clawonshape-ui`
only, with the trailers `Refs: edge-robot/clawonshape#17`, `Refs: edge-robot/clawonshape#21`,
`Prompt: docs/prompts/2026-10-22-work-context-selector-ui.md` and `Agent: openclaw-dev`. Author
`Albert Kos <kickban3000@gmail.com>`. Do not work in the main checkout `clawonshape/` (the backend
team uses it). No new branches or worktrees. Never push. The bottom-up architect integrates both
branches after both reviews and removes the worktree.

## Expected report / handoff format

`docs/prompts/2026-10-22-work-context-selector-ui.report.md` in the worktree, committed on
`feat/21-selection-ui`, with: status, checks table, U1–U7 with evidence (screenshot paths under
`docs/product/onshape-selection-2026-10-21/implementation/`), changed files, CR-UI-n if any,
Codex-architect review result, commit list.
