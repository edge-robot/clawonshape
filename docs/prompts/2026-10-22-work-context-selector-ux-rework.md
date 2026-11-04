---
target-repo: edge-robot/clawonshape
branch: feat/21-selection-ui-v2
worktree: <workspace>/clawonshape-ui
issue: edge-robot/clawonshape#17 (UI), backend edge-robot/clawonshape#21
architecture-ref: clawonshape/docs/interface/work-context.md#11-browsing-documents-workspaces-and-part-search-work-context-110-draft
contract-version: work-context-1.1.0-draft
base-commit: the commit that adds this prompt (branch point of feat/21-selection-ui-v2)
status: done   # accepted 2026-10-23 (report 97b06a9, merged da9698e); CR-UI-1 resolved by the integration (227/227)
addressee: Codex onshape-architekt (top-down). Run your product/UX review first, delegate implementation to openclaw-dev, review it yourself.
---
# Selector UX rework: intuitive document → workspace → part flow with real browsing

## How this prompt is used

This is a handover from the bottom-up architect (Claude onshape-architekt) to the **Codex
onshape-architekt**.

- The backend for the new browsing methods is built in parallel by ts-plugin-dev on
  `feat/21-work-context-selection` (`docs/prompts/2026-10-22-work-context-browsing-backend.md`).
  The seam between the two is contract `work-context-1.1.0-draft` §11 and its fixtures.
- Task ID `COC-CONTEXT-SELECTION-UX-20261022`, parent `COC-CONTEXT-SELECTION-20261021`.
- You cannot commit in this repository. Leave the changes uncommitted in the worktree; the
  bottom-up architect reviews and commits them.

## Why: user verdict from the live acceptance (2026-10-22)

The selector is deployed (plugin 0.3.0-rc.2) and technically works against real Onshape:

- the catalog loads;
- the preview of the chosen part renders;
- part `Part 1 · JHD` in `wegwerf-document / Main / Part Studio 1` is listed.

The user rejected the workflow. Screenshot and evidence:
`docs/evidence/2026-10-22-work-context-live-acceptance.md` (L1). Verbatim feedback, translated:

1. "Schließen" sits at the top. It belongs at the very bottom.
2. "Auswahl übernehmen" must sit visually and logically close to the part choice. Today it is at the
   bottom, below the preview, next to "Abbrechen".
3. The workflow is not intuitive overall.
4. Document and part selection "do not work". The document column shows only one preselected entry
   (increment 1 had no listing), and part search only covers the bound Part Studio.

Observed problems in the current layout, which you may refine:

- Three equal columns with three empty search fields suggest a free choice that does not exist.
- Two close controls ("Schließen" at the top, "Abbrechen" at the bottom) compete with each other.
- "Katalog aktualisieren" and the revision line are technical noise in the main flow.
- The preview and the adopt button are far away from the list where the decision is made.

## Goal

Redesign and implement the selector so that a user can, without help:

1. find a document by name (real search, paged), with the bound document recognisable;
2. pick a workspace;
3. search parts across all Part Studios of that workspace;
4. see a preview;
5. adopt a part with one clearly placed action next to the part.

Everything outside the binding is browsable and previewable but clearly marked "nur ansehen", with
the reason. Adoption is possible only where the view says `selectable: true` (contract §1, §11.3).
The dialog has exactly one way out at the bottom.

## Context

- Contract: `docs/interface/work-context.md` §11:
  - methods `work-context-documents`, `-workspaces`, `-parts`, extended `-preview`;
  - views `DocumentPage`, `WorkspaceList`, `PartSearch`;
  - limits: document search from 2 characters, debounce ≥ 300 ms, pages of 20, `hasMore`;
  - reasons and codes of §11.5;
  - §1–§8 unchanged (adopt, status, interlock, validity, compact card).
- Fixtures (read in place, use as mocks): `docs/interface/work-context-fixtures/document-page.json`,
  `workspace-list.json`, `part-search.json`, plus the existing `catalog.json`, `view-*.json`,
  `error-codes.json`.
- Product source: `spec.md` S1–S9; previous mockups `docs/product/onshape-selection-2026-10-21/`;
  your implementation `ui/control-ui.js` (selector since `7395e3d`, `1b0061d`).
- Your earlier accepted rules stay valid:
  - late-reply fences;
  - no write retry;
  - the compact card after adoption;
  - the view-only interlock and validity;
  - `target.focus` in the goal panel;
  - evidence-safe `test:cockpit` (`COCKPIT_EVIDENCE_DIR`).

## Binding constraints and prohibitions

- Contract-first. Do not edit `docs/interface/**`, `docs/ADR.md`, `spec.md`, `src/**` or `tests/**`
  except `tests/cockpit*`. Your files are `ui/**`, `tests/cockpit*`, `scripts/test-cockpit-browser.mjs`,
  `docs/engineering-cockpit.md` and `docs/product/**`. If the contract is insufficient for the UX
  you want, write CR-UI-n; the bottom-up architect decides.
- The UI never offers adoption for `selectable: false` rows and never hides that goals stay bound
  to the provisioned target. It never sends ownership or binding fields the contract does not list.
- No live Onshape, no deployment, no GitHub writes, no push. Work only in this worktree.
- No new runtime dependencies.

## Steps

1. **UX proposal first.** Produce an updated mockup (SVG + PNG at 1440×900 and 390×844) in
   `docs/product/onshape-selection-2026-10-21/` (new files with a `v2` suffix). It must address
   points 1–4 above, and show:
   - document search with the bound document marked;
   - workspace choice;
   - part search with hits grouped by Part Studio;
   - preview next to the list;
   - the adopt action at the selected part;
   - "nur ansehen" rows;
   - a single bottom exit.

   Hand the mockup to the user through your normal channel and get the confirmation **before**
   implementing. Record the confirmation in the report.
2. Implement the confirmed design in `ui/control-ui.js` against mocked §11 methods backed by the
   fixtures.
3. Browser tests for:
   - document search (debounce, paging, `hasMore`, bound document first);
   - workspace roles;
   - part search across studios, with truncation;
   - "nur ansehen" with each reason;
   - previews of a part and of a Part Studio;
   - adopt from the part row;
   - single exit, Escape and focus;
   - the codes of §11.5;
   - the existing U1–U7 behaviour.

   Run them at 1440×900, 1366×768 and 390×844.
4. Update `docs/engineering-cockpit.md`.

## Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| X1 | User confirmed the v2 mockup before implementation | report (date, channel, wording) |
| X2 | One exit at the bottom; adopt sits at the selected part; no duplicate close controls | screenshots + browser test |
| X3 | Real document search and workspace list per §11; bound document marked | browser test with `document-page.json`, `workspace-list.json` |
| X4 | Part search across studios with grouping, truncation and "nur ansehen" reasons | browser test with `part-search.json` |
| X5 | Previews: part and Part Studio, unavailable state, no whole-studio substitute for a part | browser test |
| X6 | §1–§8 behaviour unchanged (adopt CAS recovery, interlock, validity, compact card, focus) | existing U-tests green |
| X7 | `npm run typecheck`, `npm test`, `npx biome ci .`, `npm run test:cockpit` pass; `git status` unchanged by a test run | checks table |

## Branch and worktree rules

Work in `<workspace>/clawonshape-ui` on `feat/21-selection-ui-v2` only. Leave
the changes uncommitted; the bottom-up architect commits them after review with:

- the trailers `Refs: edge-robot/clawonshape#17`, `Refs: edge-robot/clawonshape#21`,
  `Prompt: docs/prompts/2026-10-22-work-context-selector-ux-rework.md`, `Agent: openclaw-dev`;
- author `Albert Kos <kickban3000@gmail.com>`.

Do not work in the main checkout. No new branches or worktrees.

## Expected report / handoff format

Write `docs/prompts/2026-10-22-work-context-selector-ux-rework.report.md` in the worktree, with:

- status;
- the mockup confirmation (X1);
- the checks table;
- X1–X7 with evidence (screenshot paths);
- changed files;
- CR-UI-n, if any;
- your Codex-architect review result.
