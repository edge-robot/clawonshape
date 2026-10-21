---
name: onshape-goal-iteration
description: Iterate a confirmed Onshape goal in one Candidate via native MCP; reconcile uncertain outcomes, never retry blindly, verify independently.
---

# Iterate a confirmed goal in one Candidate

Use this skill for a signed engineering-request with `workflow: "goal"`. For such
requests it replaces the per-payload proposal and approval steps of
`onshape-edit-feature-parameters`: the operator confirms the whole goal once in
the dashboard ("Verify Candidate"), and the host publishes a goal grant that the
MCP server enforces. The grant is the execution context. This skill grants no
permissions and never confirms anything.

## 1. Propose (no goal yet, or a goal to revise or renew)

Read the Primary Part Studio features natively. Choose the smallest set of
feature IDs the goal needs (only `updatePartStudioFeature`, existing features).
Express the goal as machine-checkable conditions:

- `parameterEquals` (featureId, parameterId, exact expression such as `60 mm`),
- `featureState` (featureId, state `OK`),
- `featureUnchanged` (featureId) for features that must stay as they are,
- `note` only for what cannot be checked; notes are reported as open limits and
  never count as passed. At least one condition must be machine-checkable.

Call `onshape_goal_propose` with the signed request, `goalText`, the conditions,
`featureIds`, and optionally `maxDispatches` (default 10, at most 25) and
`lifetimeMinutes` (default 120, at most 480). Pass `goalId` to revise a goal
(changed scope) or to renew a stopped, expired or blocked goal (unchanged scope).
Then finish with `onshape_complete_task` (status `planned`, the `goalId`) and say
that the operator must review and confirm the goal in the dashboard. Do not wait
for the confirmation inside the same task.

## 2. Execute (goal ACTIVE)

Repeat, one update at a time:

1. `onshape_goal_status` with the `goalId`. Continue only if the state is
   `ACTIVE`; use `execution` for the Candidate workspace, the allowed feature IDs
   and the remaining budget. Never touch Primary or any other workspace.
2. Read the Candidate features natively (`getPartStudioFeatures` on the
   Candidate). Take the current `sourceMicroversion` from this read.
3. Build one complete native v16 feature update for one allowed feature, on that
   re-read `sourceMicroversion`, with `rejectMicroversionSkew: true` and the
   read's `serializationVersion` and `libraryVersion`. Change only what the goal
   needs.
4. Call `onshape__onshape_api_call` (`updatePartStudioFeature`) exactly once for
   this update.
5. On `mutation_outcome_unknown_reconcile_required` or
   `goal_reconciliation_required`: call `onshape_goal_reconcile` with the error
   `data` (`goalId`, `sequence`, `featureId`, `sourceMicroversion`,
   `admittedAt`) unchanged. If the error data is lost, call
   `onshape_goal_reconcile` with `goalId` only. Never resend the same update blindly. On
   `mutation_outcome_unknown` wait and reconcile again later. Continue only when
   the goal is `ACTIVE` again, and always build the next update on a fresh read.
6. On `revision_policy_denied` or `goal_dispatch_duplicate`: re-read and build a
   new update on the current revision.
7. On `goal_grant_stopped`, `goal_grant_invalid` or `goal_budget_exhausted`:
   stop immediately and report. Do not try to work around the grant.
8. On `goal_scope_denied` or `target_policy_denied`: the update is outside the
   confirmed scope. Correct it within the scope, or stop and report that the goal
   needs a revision.

## 3. Verify and report

When you believe the goal is reached, call `onshape_goal_verify`. Only this
independent verification can complete a goal; your own reads and tool success are
not evidence. If it is not passed, use the failed checks to plan the next update
(or stop if the goal is `BLOCKED`). On `goal_verification_incomplete` report what
could not be evaluated.

Finish with `onshape_complete_task` carrying the `goalId`: the signed report then
contains the goal state, the verification, the open limits and the Candidate
revision link. The Lead posts it in the original conversation.

If the Lead or the operator asks to stop, call `onshape_goal_stop` with the
`goalId` and the reason before anything else. Executed changes are not rolled
back.
