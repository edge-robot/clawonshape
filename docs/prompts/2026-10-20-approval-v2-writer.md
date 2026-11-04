---
target-repo: edge-robot/clawonshape
branch: feat/11-approval-v2-writer   # created by the architect from demo/gateway-native-read-20261014 @ bdc93f6 before issuing
worktree: <workspace>/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#14
epic: edge-robot/clawonshape#11 (work package P3a)
architecture-ref: clawonshape/docs/interface/onshape-mcp.md#4-channel-c-mutation-approval-approved-updatejson
contract-version: 1.0.0-draft
foreign-repo-commit: acceacd   # onshape-mcp, branch claw-onshape/external-token (expand: accepts v1 and v2)
base-commit: <architect fills in: the commit that copies the 1.0.0-draft fixtures to tests/contract/>
status: superseded   # never issued; P3a deferred at project closure 2026-10-26 (goal-grant path took precedence, #18). Kept as the starting point for #14.
---
# P3a: Publish the mutation approval as contract v2 (migrate step)

## Goal

This prompt covers step 2 (*migrate*) of the 1.0.0 migration in contract §9: the plugin
stops writing approval file v1 and writes **v2 with target claims**.

The operator approval flow is unchanged:
- the same `approve` path (dashboard and CLI);
- the same receipt lifecycle;
- the same 5-minute lifetime.

Only the wire format of `approved-update.json` changes, and the plugin learns the new
server code `mutation_approval_consumed`.

These are explicitly **not** part of this prompt:
- P3b, the Discord approval request and proof;
- P3c, dynamic Candidate creation;
- any change to `Binding`.

## Context

- Contract: `docs/interface/onshape-mcp.md`, version 1.0.0-draft. It is read-only for you.
  - §2.5: mutation admission, steps 1–10.
  - §4: Channel C, schema v2, lifetime and reset.
  - §4.1: execution context. Unchanged.
  - §6: error codes, now including `mutation_approval_consumed`.
  - §9: versioning, the four-step migration.
- Fixtures: `tests/contract/` now holds the 1.0.0-draft copy (`VERSION` line 1 =
  `1.0.0-draft`). These are new:
  - `approved-update/valid/update-feature-v2.json`;
  - `approved-update/invalid/v2-*.json`;
  - `expectations.json` → `boundsV2`, `replay`, `readsV2`;
  - `error-codes.json` → `mutation_approval_consumed`.
- Issues and ADR:
  - edge-robot/clawonshape#14 (P1 contract);
  - edge-robot/clawonshape#11 (epic);
  - `docs/ADR.md` → ADR-2026-10-16 (proof-based mutation release).
- Code:
  - `src/mutation-workflow.ts` `approve()` writes v1 today (`version: 1`, `proposalId`,
    `expiresAt`, `requestHash`, `payloadHash`, `body`);
  - the receipt `MutationProposal` already holds every claim value: `documentId`,
    `workspaceId`, `elementId`, `featureId`, `sourceMicroversion`;
  - `src/readiness.ts` `messages` maps every contract code to an operator text;
  - `tests/contract.test.mjs` has `CONTRACT_VERSION = '0.4.0-draft'` and pairs
    `approved-update/valid/update-feature.json` with `mutation-context/valid/update-feature.json`;
  - `tests/mutation-workflow.test.mjs` reads the written `approved-update.json`.
- Server side: onshape-mcp `acceacd` (read-only mount) admits v1 and v2. In the deployed
  expand configuration the static pins `workspace_id`, `feature_id` and
  `expected_microversion` are still set. A v2 claim must therefore equal those pins; it
  does, because the receipt is built from the same binding.

## Binding constraints and prohibitions

1. **Wire format.** `approve()` writes exactly this object:
   ```
   {version: 2, proposalId, issuedAt, expiresAt,
    target: {documentId, workspaceId, elementId}, featureId,
    expectedMicroversion, operation: "updatePartStudioFeature",
    requestHash, payloadHash, body}
   ```
   - Values:
     - `issuedAt` = `approvedAt` (Unix ms);
     - `expiresAt` = `issuedAt + 300000`, unchanged; the 15-minute maximum is a bound,
       not a target;
     - `target.*` and `featureId` come from the receipt;
     - `expectedMicroversion` = receipt `sourceMicroversion`;
     - `body` stays the receipt body, byte-identical to today.
   - No other fields. The plugin never writes v1 again.
2. **Fail closed before publishing.** If any claim is not a 24-hex ID where the contract
   requires one, or `featureId` ≠ `body.feature.featureId`, or
   `expectedMicroversion` ≠ `body.sourceMicroversion`, then `approve()` throws
   `authorization_changed`.
   - This check runs **before** the receipt is saved as `UNKNOWN` and before any file is
     written.
   - Pick the exact check order and say it in the report.
3. **Receipt store.** `MutationProposal.version` stays `1` (internal format, not contract);
   existing receipts on disk must keep loading. Do not add stored fields unless a test
   needs them. If you do, explain why.
4. **Unchanged:**
   - persist `UNKNOWN` before publishing;
   - the `null` reset on a terminal status;
   - one-at-a-time;
   - the reconcile rules;
   - `onshape_mutation_context` (§4.1);
   - `APPROVAL_DISPATCH_GRACE_MS`.
5. **New code `mutation_approval_consumed`.**
   - Add an operator message to `messages`: the approval was already used, the
     Engineer must not retry and must run `onshape_reconcile_update`.
   - Make sure `userError` passes the code through unchanged.
   - No retry logic.
6. **Contract tests.**
   - Bump `CONTRACT_VERSION` to `1.0.0-draft`.
   - Assert that the written file deep-equals `approved-update/valid/update-feature-v2.json`
     when the receipt is built from that fixture's values with a fixed clock. Derive the
     clock from the fixture's `issuedAt`.
   - Assert that the written file passes the v2 structural rules that the
     `approved-update/invalid/v2-*.json` cases violate, where those rules are
     plugin-checkable. These are: missing target, lifetime over 15 min, and version ≠ 2.
     Bounds and claim-equality cases are server-side; list them in the report as
     *server-only*.
   - Keep the §4.1 `apiCall` pairing test green.
7. **Scope.** Change only:
   - `src/mutation-workflow.ts`, `src/readiness.ts`;
   - `tests/*.test.mjs`;
   - the prompt and its report.

   Never touch:
   - `docs/interface/`, `tests/contract/`, `spec.md`, `docs/ADR.md`, `deploy/`, `.claude/`;
   - `Containerfile`, `.devcontainer/`, `scripts/dev.sh`;
   - `package.json` versions (the architect bumps the plugin version at rollout).

   No new dependencies.
8. **User-owned working-tree files.** Never stage these and leave them untouched:
   - `.gitignore`, `.codex/`, `docs/product/`, `docs/reviews/`, `scripts/*product-owner*`,
     `scripts/__pycache__/`, `result.json`;
   - the operator's uncommitted `deploy/team.json`, `docs/interface/onshape-mcp.md` and
     `docs/prompts/2026-10-19-team-onboarding.md`.

   Stage by explicit path only. Never use `git add -A`, `git add .` or `git commit -a`.

## Steps

1. Preconditions:
   - branch `feat/11-approval-v2-writer`;
   - HEAD = `base-commit`;
   - `tests/contract/VERSION` line 1 = `1.0.0-draft`;
   - `/workspaces/onshape-mcp` at `acceacd`.

   Record a baseline: on the base commit, `npm test` fails **only** in the contract version
   test (the fixtures are newer than the code). Record every failing test name.
2. Write the failing tests first:
   - the wire-format equality against the v2 fixture;
   - the plugin-checkable v2 rules;
   - the fail-closed claim check (`authorization_changed`, no `UNKNOWN` receipt, no file
     written);
   - the message and pass-through for `mutation_approval_consumed`.
3. Implement.
4. Run the checks. Commit with `Refs: edge-robot/clawonshape#14` and
   `Refs: edge-robot/clawonshape#11`.
5. Write the report.

## Acceptance criteria and tests

- [ ] `npm ci`, `npm run typecheck`, `npm test`, `npm run check`, `npm run test:native-files`
      (expected green since clawonshape#15) and `npm pack --dry-run` all pass.
- [ ] Test count = baseline + new tests.
- [ ] Mutation checks; each must make a test fail:
  - write `version: 1` again → the wire-format test fails;
  - drop `target` → the wire-format test fails;
  - remove the claim check → the fail-closed test fails;
  - remove the `mutation_approval_consumed` message → the message test fails.
- [ ] No string `version: 1` remains in the published approval path.
- [ ] `git show --stat` of every commit lists only allowed paths.

## Branch and worktree rules

- Commit only to `feat/11-approval-v2-writer` in this checkout.
- No push, no rebase, no other branches or worktrees.
- Commit this prompt unchanged together with your report.
- Afterwards, `git status` shows only the user-owned and operator files listed above.

## Expected report / handoff format

`docs/prompts/2026-10-20-approval-v2-writer.report.md` in the agent-definition format, with:

- the checks table, baseline vs. after;
- tests before and after;
- the mutation results;
- one example of the written v2 JSON with synthetic values;
- the check order from constraint 2;
- the list of `v2-*` fixtures classified as plugin-checked vs. server-only;
- *Contract deviations*: expected none;
- the commit list with trailers.

Set `e2e-request: required`. The architect runs the live E2E with the expand image
`acceacd-approval-v2-expand` and the static pins still configured:
- a v2 approval → `VERIFIED`;
- a replay → `mutation_approval_consumed`.
