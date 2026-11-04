---
target-repo: edge-robot/clawonshape
branch: feat/18-goal-authorization
worktree: <workspace>/clawonshape (container: /workspaces/clawonshape)
issue: edge-robot/clawonshape#18
architecture-ref: clawonshape/docs/interface/goal-workflow.md#5-reconciliation
contract-version: 1.2.0-draft   # plugin-facing goal-1.1.0-draft
foreign-repo-commit: cc67472    # onshape-mcp feat/5-goal-grant, summary with unreconciledEntry accepted
base-commit: <this prompt's commit>
status: done
---
# Goal plugin: unreconciledEntry in GoalView and reconcile by goalId (goal-1.1.0-draft)

## Goal

Implement `goal-workflow.md` `goal-1.1.0-draft`:

- `GoalView.progress.unreconciledEntry` mirrors the server's journal-summary `unreconciledEntry`
  (server contract `1.2.0-draft` §12.7, already implemented in onshape-mcp `cc67472`);
- `goal-reconcile` (dashboard) and `onshape_goal_reconcile` (agent) accept `{goalId}` alone and take
  their input from `unreconciledEntry`.

## Context

- `docs/interface/goal-workflow.md`: changelog `goal-1.1.0-draft`, §4.1 and §4.2 rows, §5 first
  paragraph, §9 (`unreconciledEntry` is **not** operator-only; it is diagnostic data agents may pass
  on, GW5 / #20).
- `docs/interface/onshape-mcp.md` §12.7 journal summary row. A sample output is in
  `onshape-mcp/docs/prompts/2026-10-21-journal-summary-entry.report.md` (read-only mount).
- Fixtures: `tests/contract/VERSION` `1.2.0-draft` /
  `sha256:f60bfa0df9e3d76bb78f6a13e1231f64ac9c15c71d54465287b9ebd54e771cba`. New:
  `goal-grant/journal-summary/uncertain.json` (its `requestHash` is a placeholder). Changed:
  `goal-view/active.json` (`progress.unreconciledEntry: null`).
- Your code: `src/goal-mcp.ts` (summary probe), `src/goal-lifecycle.ts` (`goalView`, §5),
  `src/goal-service.ts`, `src/goal-tools.ts`, `src/dashboard.ts`.

## Binding constraints and prohibitions

- The constraints of `2026-10-21-goal-authorization-plugin.md` apply:
  - no contract or fixture edits;
  - no UI files: `ui/control-ui.js`, `tests/cockpit.test.mjs`, `tests/fixtures/cockpit.mjs`,
    `scripts/test-cockpit-browser.mjs` and `docs/engineering-cockpit.md` are being edited **right
    now** by the Codex team (COC-GOAL-UI);
  - no legacy changes;
  - branch only;
  - never push.
- Validate `unreconciledEntry` strictly (exact eight keys and types). A missing key from a 1.1.0
  server counts as `null`. A malformed entry makes the summary unavailable (fail closed, as today).
- Explicit reconcile input must equal `unreconciledEntry` when the summary provides one, otherwise
  `goal_state_invalid`. With only `goalId` and no entry → `goal_state_invalid` (nothing to reconcile).
- `unreconciledEntry` appears in every projection, including agent tools and the signed report part
  if `progress` is included there. The nonce stays operator-only.
- Never put request bodies, tokens or the nonce into the entry.

## Steps

1. Update `CONTRACT_DIGEST` and the `GoalView` exact-keys test. Add a parser test against
   `journal-summary/uncertain.json` (placeholder hash accepted as a string of the right type, or
   substituted), plus the missing-key and malformed cases.
2. Extend the summary probe and `goalView` (`progress.unreconciledEntry`).
3. Reconcile: add the `{goalId}`-only path in the service, the dashboard action and the agent tool.
   Check equality for explicit input. Keep the CR-5 tolerance for the raw MCP error data.
4. Update the skill `skills/onshape-goal-iteration/SKILL.md` with one line: if the error data is lost,
   call `onshape_goal_reconcile` with `goalId` only.
5. Tests:
   - the reconcile end to end from the summary alone (dashboard and tool);
   - mismatch → `goal_state_invalid`;
   - no entry → `goal_state_invalid`;
   - a 1.1.0 server without the key;
   - the projection test that agents see the entry and never the nonce.

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| A1 | `GoalView.progress.unreconciledEntry` mirrors the server entry; missing key = `null`; malformed = fail closed | tests |
| A2 | Reconcile by `goalId` alone works from dashboard and tool; explicit input must match | tests |
| A3 | Agents see the entry; the nonce stays operator-only | test |
| A4 | typecheck, `npm test` (≥ 183 + new), biome, `npm pack --dry-run` pass; no UI file touched | checks table + `git diff --stat` |

## Branch and worktree rules

Commit on `feat/18-goal-authorization` with the trailers `Refs: edge-robot/clawonshape#18`,
`Prompt: docs/prompts/2026-10-21-goal-unreconciled-entry.md`, `Agent: ts-plugin-dev` and
`Co-Authored-By`. Never push. Do not touch, stage or commit the uncommitted Codex files (UI files
above, `README.md`, `spec.md`, `docs/product/**`, `docs/prompts/2026-10-21-cockpit-goal-ui.report.md`).

## Expected report / handoff format

`docs/prompts/2026-10-21-goal-unreconciled-entry.report.md` with frontmatter `status`,
`contract-version: 1.2.0-draft` and `e2e-request: required`. It must contain:

- the checks table;
- A1–A4;
- the UI note for Codex: the `progress.unreconciledEntry` shape and `goal-reconcile` with only
  `goalId`;
- the commits.
