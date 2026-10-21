---
target-repo: edge-robot/clawonshape
branch: feat/18-goal-authorization
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape
issue: edge-robot/clawonshape#17 (UI), backend edge-robot/clawonshape#18
architecture-ref: clawonshape/docs/interface/goal-workflow.md#9-normalized-status-model-goalview
contract-version: goal-1.0.0-draft (amended); server contract 1.1.0-draft (amended)
base-commit: 287feb8   # goal backend incl. CR-1/CR-3 accepted
status: done
addressee: Codex onshape-architekt (top-down). Delegate the implementation to openclaw-dev and review it yourself.
---
# Cockpit: wire the goal panel to the goal backend and fix F8

## How this prompt is used

This is a handover from the bottom-up architect (Claude onshape-architekt) to the **Codex
onshape-architekt**.

- You own the dashboard UI and its technical review.
- Assign the implementation to **openclaw-dev** through your normal team workflow
  (`onshape-team`), with this file as the task source. Use task ID `COC-GOAL-UI-20261021` with
  parent `COC-GOAL-WORKFLOW-20261021`.
- Review openclaw-dev's result against the acceptance criteria below before you hand back.
- Hand back one report file (see the end). The bottom-up architect reviews it as well before the
  user commits and pushes.

## Goal

Replace the blocked goal panel in the CAD view with the real goal workflow. It must use the goal
backend that is now implemented and accepted on `feat/18-goal-authorization` (edge-robot/clawonshape#18):

- show the goal request, then let the operator confirm it once ("Verify Candidate");
- show progress, STOP, reconciliation and close;
- show the result.

Also fix F8, the failing browser harness.

## Context

- Product: `docs/product/dashboard-workflow-2026-10-21/README.md` (A1–A10) and reference images
  02 and 03.
- Normative: `docs/interface/goal-workflow.md`:
  - §3 lifecycle incl. `CLOSED`;
  - §4.1 dashboard actions incl. `goal-close`;
  - §9 `GoalView` incl. `confirmation.nonce`;
  - "Accepted interpretations".
- ADR: `docs/ADR.md` → ADR-2026-10-21. Decision D1: the dashboard confirmation is an **interim
  workaround** until a Verifiable Credential verifier decides. After that, the dashboard only
  displays decisions.
- Backend reports (read them first):
  - `docs/prompts/2026-10-21-goal-authorization-plugin.report.md`, section "Notes for the UI wiring
    task";
  - `docs/prompts/2026-10-21-goal-plugin-crs.report.md`: the updated `goal-status` with `nonce`,
    and `goal-close`.
- Existing UI: `ui/control-ui.js`. It holds the views from `COC-GOAL-TOPDOWN-1`, the `call(...)`
  helper and the interim operator section. Tests: `tests/cockpit.test.mjs`. Harness:
  `scripts/test-cockpit-browser.mjs`.
- F8 (issue #17 comment 6312102729): `npm run test:cockpit` fails on the host at
  `scripts/test-cockpit-browser.mjs:119`. After `fixture-VERIFIED` is selected in the collapsed
  history, the text `Änderung durch Abgleich belegt` is not visible.

## Actions available (gateway, all wrapped as `{ok: true, result: …}`)

| Action | Scope | Input | Result |
|---|---|---|---|
| `goal-status` | `operator.read` | `{connectionRef?}` | `{ok: true, goal: GoalView \| null, history: GoalView[≤10]}` |
| `goal-confirm` | `operator.admin` | `{connectionRef?, goalId, nonce, expectedGoalHash}` | `{ok: true, goal}` |
| `goal-stop` | `operator.admin` | `{connectionRef?, goalId}` | `{ok: true, goal}` |
| `goal-reconcile` | `operator.admin` | `{connectionRef?, goalId, sequence, featureId, sourceMicroversion, admittedAt}` | `{ok: true, goal}` |
| `goal-close` | `operator.admin` | `{connectionRef?, goalId}` | `{ok: true, goal}` |

Every failure is `{ok: false, code, message}`. Show `message`, and keep `code` visible in the
technical details.

## Binding constraints and prohibitions

- **File ownership.** Edit only:
  - `ui/control-ui.js`;
  - `tests/cockpit.test.mjs`;
  - `tests/fixtures/cockpit.mjs`;
  - `scripts/test-cockpit-browser.mjs`;
  - `docs/engineering-cockpit.md`;
  - `docs/product/**`.

  Do **not** edit `src/**`, other tests, `docs/interface/**`, `docs/ADR.md`, `openclaw.plugin.json`,
  `package.json` or `skills/**`. If the backend lacks something you need, stop and write a change
  request into the report. The bottom-up architect routes it to ts-plugin-dev.
- **Confirmation rules (contract §4.1):**
  - Before the "Verify Candidate" button is enabled, show `goalText`, every goal and preservation
    condition, `scope.featureIds`, `scope.maxDispatches`, `scope.lifetimeMs`, the target and the
    Candidate plan (`candidateWorkspaceId` `null` = "new Candidate from Primary at
    `baseMicroversion`"), and `confirmation.expiresAt`.
  - Send `confirmation.nonce` and the **displayed** `goalHash` unchanged as `expectedGoalHash`.
  - One explicit click is one attempt. Disable the button while the call is pending. No retry.
  - Never confirm automatically, on load, in batches or from a keyboard shortcut without focus on
    the button.
  - The button is enabled only for `state == "AWAITING_CONFIRMATION"`, a non-null nonce,
    `capability == "AVAILABLE"` and admin capability.
- **Progress comes only from `GoalView.progress`:**
  - `null` means "unknown", never 0;
  - never derive goal success from legacy payload receipts;
  - `COMPLETED` is shown only when `state == "COMPLETED"` and `progress.lastVerification.passed`;
  - `note` conditions are always shown as open limits.
- **STOP** is enabled for `AWAITING_CONFIRMATION`, `ACTIVE`, `RECONCILING` and `BLOCKED`.
- **Reconcile** is shown only when `progress.unreconciledSequence` is non-null. Its inputs come from
  the latest server error data that the goal view or the operator provides. If the view does not
  carry them, do not invent values. Leave reconcile to the agent path and say so in the UI.
- **Close** is enabled only for `STOPPED`, `EXPIRED` and `BLOCKED` with
  `unreconciledSequence == null`. It needs an explicit confirmation step ("Ziel abschließen") that
  explains that executed changes and the Candidate stay.
- Keep the interim operator section (legacy actions) unchanged and collapsed.
- Keep all existing security properties: no `innerHTML`, no `eval`, no foreign fetches, no provider
  render on load, and generation/connection fences for late responses.
- Make the UI text German (product decision). The code, comments, tests and
  `docs/engineering-cockpit.md` stay in English, with German labels quoted.
- No commits, pushes, branch or worktree changes. No deployment, no live CAD.

## Steps

1. Read the context documents and both backend reports. Record the baseline: `npm run typecheck`,
   `npm test` (count), `npx biome ci .`, `npm run test:cockpit`.
2. **F8.** Find the cause of the failure at line 119, the history selection and visibility. Fix the
   UI or the harness, whichever is wrong, and explain your choice.
3. **Goal panel states.** Map every `GoalView.state` to a panel layout following references 02
   (confirm) and 03 (iteration):
   - `AWAITING_CONFIRMATION`: the full request review plus "Verify Candidate";
   - `ACTIVE`, `RECONCILING`: aggregated progress, remaining budget and time, last outcome, STOP;
   - `BLOCKED`, `STOPPED`, `EXPIRED`: the reason, STOP or Close as allowed;
   - `COMPLETED`, `FAILED`, `CLOSED`: the result with checks, open limits and the Candidate
     revision link;
   - `capability != "AVAILABLE"`: a truthful blocked state.

   Status must never be shown by colour alone.
4. Poll `goal-status` only on load, on explicit refresh and after an action. No background loop
   beyond the existing refresh behaviour.
5. History: a collapsed list of the last terminal goals from `history`.
6. Tests in `tests/cockpit.test.mjs`:
   - each state renders correctly;
   - the confirm button enablement matrix;
   - the exact confirm payload (nonce and displayed hash);
   - a single attempt with a pending lock;
   - no action on load;
   - STOP, reconcile and close enablement;
   - `null` progress is shown as unknown;
   - no `COMPLETED` without a passed verification;
   - stale responses are discarded.
7. Browser harness:
   - add fixture states for `AWAITING_CONFIRMATION`, `ACTIVE` and `COMPLETED`;
   - capture screenshots at 1440×900 and 1366×768 into
     `docs/product/dashboard-workflow-2026-10-21/implementation/`;
   - compare them with references 02 and 03 in the report.
8. Update `docs/engineering-cockpit.md` (goal panel, interim confirmation note per D1).

## Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| U1 | F8 fixed; `npm run test:cockpit` passes on the host | harness log |
| U2 | The goal request is fully visible before confirmation; the confirm payload is exact; single attempt; never automatic | tests |
| U3 | All `GoalView` states render truthfully; unknown progress is not 0; no success without verification | tests |
| U4 | STOP, reconcile and close follow the enablement rules | tests |
| U5 | Legacy operator section unchanged; no action or render on load | tests |
| U6 | Screenshots of the confirm and iteration states compared with references 02 and 03 | images + report |
| U7 | typecheck, `npm test`, `biome ci` pass; no edits outside the listed files | checks table + `git status` |

## Expected report

openclaw-dev writes `docs/prompts/2026-10-21-cockpit-goal-ui.report.md` (English). It contains:

- frontmatter `status`, `contract-version`, `e2e-request: required`;
- the checks table;
- U1–U7 with evidence;
- the F8 cause;
- screenshot paths;
- the changed files;
- change requests for the backend, if any.

The Codex onshape-architekt appends a short **review section** with its verdict. Then hand back
to the user. The bottom-up architect reviews the report before the user commits.
