---
target-repo: edge-robot/clawonshape
branch: feat/18-goal-authorization
worktree: <workspace>/clawonshape (container: /workspaces/clawonshape)
issue: edge-robot/clawonshape#18
architecture-ref: clawonshape/docs/interface/goal-workflow.md
contract-version: 1.1.0-draft   # server contract; plugin-facing contract goal-1.0.0-draft
foreign-repo-commit: c8beefe    # onshape-mcp, branch feat/5-goal-grant (read-only mount); server implementation runs in parallel
base-commit: f937771
status: done   # blocked report c4b2271 resolved by 2026-10-21-goal-plugin-crs.md (accepted)
---
# Goal-scoped mutation authorization in the plugin (#18)

## Goal

Implement the plugin side of ADR-2026-10-21 per `docs/interface/goal-workflow.md`
(`goal-1.0.0-draft`) and the producer side of server contract §12 (`docs/interface/onshape-mcp.md`).
In scope:

- a durable goal record with exactly one Candidate per goal;
- the interim dashboard "Verify Candidate" confirmation behind a pure verification core;
- the goal grant writer;
- STOP, reconciliation, independent verification and result delivery;
- the agent tools and the `GoalView` status model.

Everything is tested locally with fixtures and mocks. No live CAD.

## Context

- Normative: `docs/interface/goal-workflow.md` (all sections, tests T1–T11) and
  `docs/interface/onshape-mcp.md` §12 (grant schema §12.2, error data §12.4, capability and
  journal summary §12.7).
- ADR: `docs/ADR.md` → "ADR-2026-10-21" (accepted; D1 dashboard confirmation is an interim
  workaround until a Verifiable Credential verifier decides, so keep the verification core
  independent of the dashboard).
- Product: `docs/product/dashboard-workflow-2026-10-21/README.md` (A3–A6, A8).
- Fixtures (committed in `e305791`): `tests/contract/` with `VERSION` `1.1.0-draft` /
  `sha256:37aca6a4323ae2c26b5826539ef2d607e532773ae1f7caf44d7d92c8020ae341`. The copy jumps from
  `0.4.0-draft`:
  - `approved-update/invalid/version-2.json` became `version-3.json`;
  - the v2 approval fixtures are new;
  - new are `goal-grant/`, `capabilities/` and `goal-workflow/`.
- Existing code to build on:
  - `src/mutation-workflow.ts`: receipts, reconcile, private writes;
  - `src/candidate-attempts.ts` and `src/candidate-authorization.ts`: private state store, Candidate
    authority;
  - `src/rest.ts`: `RestClient`, candidate preparation, feature reads;
  - `src/dashboard.ts`: action registration, scopes, guards;
  - `src/index.ts`: tool registration;
  - `src/delegation.ts`: signed A2A context;
  - `src/mcp.ts`: `/health` probe;
  - `src/config.ts` and `openclaw.plugin.json`: config schema.
- The server implementation (onshape-mcp#5) runs in parallel against the same fixtures. Do not wait
  for it. Use mocks for `/capabilities`, `/goals/{goalId}/journal-summary` and the server error data.

## Binding constraints and prohibitions

- Contract-first. **Do not edit** `docs/interface/**`, `tests/contract/**` (except
  `tests/contract.test.mjs`), `docs/ADR.md` or `spec.md`. On a contract problem, stop, set
  `status: blocked` and write a change request (CR-n).
- **File ownership:** the Codex top-down team owns `ui/control-ui.js`, `docs/engineering-cockpit.md`,
  `scripts/test-cockpit-browser.mjs` and `docs/product/**`. Do not edit them. Add the dashboard
  **gateway actions** in `src/dashboard.ts` only. The UI wiring follows in a separate task.
- Do not change existing guards, scopes or the behaviour of the legacy actions (`mutation-approve`,
  `mutation-reconcile`, `candidate-prepare`, `status`, `render`, `workspace-context`). The only
  allowed change is the exclusivity rule of `goal-workflow.md` §1 (`goal_active_conflict`), tested
  in both directions.
- No automatic or batch confirmation or approval anywhere. `goal-confirm` acts only on an explicit
  operator call with the displayed `goalHash`.
- The plugin never executes MCP calls (contract §8.3). Verification and reconciliation use the REST
  client, read-only. Candidate creation reuses the existing REST path (`OAuth2Write`).
- Write the goal record before publishing a grant revision. Write `STOPPED` before reporting a STOP.
- No new runtime dependencies. Use `node:crypto` for hashes.
- Do not touch `Containerfile`, `.devcontainer/`, `scripts/dev.sh`, `.claude/` or `deploy/`.
- Work only on `feat/18-goal-authorization` in `/workspaces/clawonshape`. No new branches,
  worktrees or stashes. Never push.

## Steps

1. Verify the branch, HEAD (`f937771` or later) and `tests/contract/VERSION`. Record the baseline:
   `npm run typecheck`, `npm test` (count), `npx biome ci .`.
2. Update `tests/contract.test.mjs` to `1.1.0-draft`. Adjust it for the renamed and added approval
   fixtures without weakening any assertion. Add the T1 `goalHash` vector test and the `GoalView`
   key/type test.
3. **Verify open points GW1 and GW2 first** against the OpenClaw SDK types in `node_modules/openclaw`
   (version per `package-lock.json`):
   - GW1: can a tool context provide the conversation target for `origin`?
   - GW2: which confirmer identity does a gateway action see?
   Record file and line evidence in the report. If GW1 is not available in tool contexts, use the
   fallback from `goal-workflow.md` §12: the Lead's `onshape_delegate_task` puts `origin` into the
   signed delegation context.
4. `src/goal-scope.ts` (pure): scope validation per §2, canonical JSON, `goalHash`, condition
   checks, canonical feature hash (GW3: derive the volatile field list from a recorded features
   response fixture under `tests/fixtures/`, synthetic IDs only).
5. `src/goal-store.ts`: durable record per §1 in a private state directory (pattern of
   `candidate-attempts.ts`), atomic replace, reload after restart, at most one non-terminal goal per
   binding.
6. `src/goal-lifecycle.ts` (pure where possible):
   - the full transition table of §3;
   - the verification core `verifyGoalConfirmation` (§4.1; constant-time nonce compare);
   - reconciliation (§5);
   - verification evaluation (§6);
   - the grant revision builder that emits exactly the §12.2 schema (T10).
7. Grant writer: atomic private write of `<approvalDirectory>/goal-grant.json`, strictly increasing
   `grantRevision`, `null` only under the §3 rule (journal summary has no unreconciled sequence).
8. Capability client: `GET /capabilities` and `GET /goals/{goalId}/journal-summary` with the §5
   rules (2 000 ms, `redirect: 'error'`). `404` on `/capabilities` → `UNSUPPORTED`.
9. Dashboard actions in `src/dashboard.ts`:
   - `goal-status` (`operator.read`);
   - `goal-confirm`, `goal-stop`, `goal-reconcile` (`operator.admin`).

   Use the existing binding and authorization-snapshot guards. Every response is a `GoalView` (§9) or
   `{ok: false, code, message}`.
10. Agent tools in `src/index.ts`: `onshape_goal_propose`, `onshape_goal_status`,
    `onshape_goal_reconcile`, `onshape_goal_verify` (Engineer) and `onshape_goal_stop`
    (Lead and Engineer). Also:
    - `onshape_delegate_task` gets `workflow: "goal"` with an optional `goalId`;
    - `onshape_complete_task` gets an optional `goalId` and carries the goal `result`.
11. Result delivery (§7): Lead reply or the outbound adapter (mocked in tests), recorded in
    `result.delivery`; failure gives `goal_result_delivery_failed` without a loop.
12. Config: `goals: {enabled (default false), approvalDirectory}` in `src/config.ts` and the
    `openclaw.plugin.json` `configSchema`. Disabled or unsupported → `goal_unsupported`.
13. Skill: add `skills/onshape-goal-iteration/SKILL.md` with the normative Engineer loop of §4.2
    (never a blind retry; reconcile with the error `data`; stop on `goal_grant_stopped`,
    `goal_grant_invalid`, `goal_budget_exhausted`). Keep the existing skills unchanged unless they
    contradict the goal loop. List any such contradiction in the report.
14. Tests T1–T11 from `goal-workflow.md` §11, plus the exclusivity tests (T8). Use the
    `goal-grant/requests/update-depth` and `update-fillet-radius` fixtures for the two-change test
    (T2).
15. Update `spec.md`? **No.** Report the spec drift instead (G10 is tracked separately).

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| A1 | One confirmation, two different permitted updates, same Candidate, grant revision 1 written once | T2 |
| A2 | No second Candidate on refresh, plugin restart or resume after STOP + new confirmation | T3 |
| A3 | Confirmation rejects wrong nonce/hash, expired, stale binding and missing admin; no grant, no Candidate | T4 |
| A4 | STOP ordering and STOP during reconciliation | T5 |
| A5 | Reconciliation rules 1–5 | T6 |
| A6 | Verification: notes and unverifiable never pass; implicit preservation; unreconciled entry blocks success | T7 |
| A7 | Exclusivity with the legacy path in both directions; legacy suites unchanged | T8 + test counts |
| A8 | Grant output valid against §12.2 for every transition | T10 |
| A9 | GW1/GW2 evidence recorded; chosen origin mechanism tested | report + T11 |
| A10 | typecheck, `npm test`, `biome ci` pass; `npm pack --dry-run` lists the new skill and no test fixtures outside the existing patterns | checks table |

## Branch and worktree rules

Commit on `feat/18-goal-authorization` only, in small logical commits with the trailers
`Refs: edge-robot/clawonshape#18`, `Prompt: docs/prompts/2026-10-21-goal-authorization-plugin.md`,
`Agent: ts-plugin-dev` and `Co-Authored-By`. Never push. The checkout is shared with the Codex
top-down team: until you hand back with the report, nobody else edits `src/**`, `tests/**`,
`skills/**`, `openclaw.plugin.json` or `package.json`.

## Expected report / handoff format

`docs/prompts/2026-10-21-goal-authorization-plugin.report.md` in the agent-definition format
(frontmatter `status`, `contract-version: 1.1.0-draft`, `e2e-request: required`). It must contain:

- the checks table (baseline vs. after);
- A1–A10 with evidence and the T1–T11 test names;
- GW1/GW2/GW3 findings with SDK file and line references;
- the list of changed files;
- CRs, if any;
- the Clawake needs: config keys and mounts for the plugin;
- notes for the UI wiring task: action names, inputs and `GoalView` fields the cockpit must render;
- the commit list with trailers.
