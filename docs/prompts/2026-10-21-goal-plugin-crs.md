---
target-repo: edge-robot/clawonshape
branch: feat/18-goal-authorization
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape (container: /workspaces/clawonshape)
issue: edge-robot/clawonshape#18
architecture-ref: clawonshape/docs/interface/goal-workflow.md
contract-version: 1.1.0-draft   # amended 297512c; plugin-facing goal-1.0.0-draft amended
foreign-repo-commit: 39815f8    # onshape-mcp, branch feat/5-goal-grant (server accepted at 7182e7a)
base-commit: 297512c
status: issued
---
# Goal plugin follow-up: confirmation nonce, goal-close, fixture digest (#18)

## Goal

Close the change requests from your report `docs/prompts/2026-10-21-goal-authorization-plugin.report.md`.
The architect accepted all of them, and they are now part of the amended contract (`297512c`):

- **CR-1 (blocking):** `GoalView.confirmation.nonce`.
- **CR-3:** the `goal-close` action and the terminal state `CLOSED`.
- **CR-2:** the Lead-side delivery receipt is now the contract. Your implementation already does
  this; only verify that it matches the wording.

## Context

- `docs/interface/goal-workflow.md` (amended):
  - §3: `CLOSED` state and the `close` transition;
  - §4.1: `goal-close`;
  - §7 step 3: Lead-side receipt;
  - §9: the `confirmation.nonce` rule;
  - §8: `goal_state_invalid` also covers a mismatching nonce;
  - section "Accepted interpretations": your interpretations, all confirmed.
- Fixtures: `tests/contract/VERSION` is now `1.1.0-draft` /
  `sha256:788b253f9f44fba37d97302933f356655ed0b53539007593982da8432502a68d`. The only change is
  `goal-workflow/goal-view/active.json`, which has `confirmation.nonce: null`.
- Server contract §12 gained the clarifications CR-1..CR-7 from onshape-mcp#5. They have no plugin
  impact except the error `data` shapes in §12.3. Check that your reconcile input mapping accepts them.

## Binding constraints and prohibitions

The constraints of `2026-10-21-goal-authorization-plugin.md` apply unchanged. In particular:

- no contract or fixture edits;
- no UI files (`ui/control-ui.js` and the cockpit docs belong to the Codex team);
- no changes to legacy behaviour;
- branch `feat/18-goal-authorization` only;
- never push.

## Steps

1. Update `CONTRACT_DIGEST` in `tests/contract.test.mjs`. The `GoalView` exact-keys test must accept
   `confirmation.nonce`.
2. **CR-1.**
   - Project `confirmation.nonce` in the dashboard `goal-status` response only, and only while the
     state is `AWAITING_CONFIRMATION`.
   - Every agent tool, signed report and history entry emits `null`.
   - Tests:
     - the nonce is visible in `goal-status` for `AWAITING_CONFIRMATION`;
     - it is `null` in every other state;
     - it is `null` in all agent tool results and in the signed `onshape_complete_task` report;
     - a confirm with the nonce from `goal-status` succeeds end to end (propose → status → confirm).
3. **CR-3.**
   - Add the `goal-close` dashboard action (`operator.admin`, input `{connectionRef?, goalId}`): from
     `STOPPED`, `EXPIRED` or `BLOCKED` to `CLOSED`, grant to `null`.
   - It is guarded by the journal summary: `unreconciledSequence` must be `null`, otherwise it fails
     with `goal_reconciliation_required`. A summary that is unavailable fails closed.
   - `CLOSED` is terminal and frees the binding for a new goal.
   - Tests:
     - close from each allowed state;
     - rejection from `ACTIVE`, `RECONCILING`, `AWAITING_CONFIRMATION` and the terminal states;
     - rejection while an entry is unreconciled;
     - after `CLOSED`, a new `propose` for the same binding succeeds and creates a new Candidate on
       confirmation;
     - the action registry test lists `goal-close`.
4. **CR-2.** Check §7 step 3 against your implementation and adjust names if they differ
   (`goalResultDelivery`, receipt fields).
5. Add readiness/operator texts for any new code path.
6. Out-of-scope finding from your report: align the `version` in `openclaw.plugin.json` with
   `package.json` (`0.2.10`). One commit. No other manifest change.

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| A1 | The nonce is reachable for the operator and never for agents | CR-1 tests |
| A2 | Confirm path end to end through `goal-status` → `goal-confirm` | test |
| A3 | `goal-close` rules and the new-goal-after-close behaviour | CR-3 tests |
| A4 | Lead-side receipt matches §7 | test or code reference |
| A5 | typecheck, `npm test` (≥ 174), `biome ci`, `npm pack --dry-run` pass | checks table |

## Branch and worktree rules

Commit on `feat/18-goal-authorization` with the trailers `Refs: edge-robot/clawonshape#18`,
`Prompt: docs/prompts/2026-10-21-goal-plugin-crs.md`, `Agent: ts-plugin-dev` and `Co-Authored-By`.
Never push. The uncommitted `README.md`, `spec.md` and `docs/product/**` changes in the working tree
belong to the Codex team. Do not touch, stage or commit them.

## Expected report / handoff format

`docs/prompts/2026-10-21-goal-plugin-crs.report.md` in the agent-definition format (frontmatter
`status`, `contract-version: 1.1.0-draft`, `e2e-request: required`). It must contain:

- the checks table;
- A1–A5 with evidence and test names;
- the changed files;
- the updated UI notes: the `goal-status` response with `nonce`, and the `goal-close` input and response;
- the commit list.
