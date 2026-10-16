---
target-repo: edge-robot/clawonshape
branch: demo/gateway-native-read-20261014
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#5, edge-robot/clawonshape#10
architecture-ref: clawonshape/docs/ADR.md#adr-review-2026-10-15-candidate-mutation-runs-through-the-native-mcp-client-and-onshape-mcp-admission-not-a-plugin-side-mcp-factory
contract-version: 0.3.0-draft
foreign-repo-commit: c53d9c9dcda97da195a52ad223c431ae41100f98   # onshape-mcp, branch claw-onshape/external-token (unchanged; still implements 0.2.0-draft)
base-commit: 8d59a97
status: issued
---
# Fix the mutation execution context and the expired-approval deadlock

## Goal

The live acceptance of the Candidate mutation path on 2026-10-16 failed at two points.
Fix both in the plugin so that the path can be re-run end to end:

1. **G13 / #10 (high):** `onshape_mutation_context` must return a ready-to-send
   `apiCall` object that is a valid `onshape_api_call` input (contract §4.1).
2. **G5 / #5 (critical):** `reconcile` must be able to close an `UNKNOWN` receipt whose
   approval expired without any dispatch, as terminal `REJECTED` with reason
   `approval_expired_not_dispatched`, and reset the approval file (contract §4).

## Context

- Contract: `docs/interface/onshape-mcp.md` **0.3.0-draft**, read §4 (receipt lifecycle,
  reconcile rules 1–4, reset), §4.1 (execution context), §6, §7 (30 s server timeout),
  §10, §11 (G5, G13), changelog. Fixture copies: `tests/contract/` (VERSION
  `0.3.0-draft`), especially `tests/contract/mutation-context/valid/update-feature.json`,
  `tests/contract/approved-update/valid/update-feature.json`,
  `tests/contract/mcp-tools.json`, `tests/contract/error-codes.json`.
- ADR: `docs/ADR.md` → "ADR-review-2026-10-15", open-decisions table (rows for #5 and #10).
- Live evidence: `docs/evidence/2026-10-16-mutation-path-acceptance.md`, findings
  M15, M16 (read-only for you; do not edit).
- Code:
  - `src/mutation-workflow.ts`: `executionContext` (returns `operation`/`path_params`/`body`
    today), `reconcile` (throws `mutation_outcome_unknown` forever when the candidate
    microversion is unchanged; `REJECTED` unreachable), `approve`, `propose`.
  - `src/index.ts` ~L209–310: registration of `onshape_propose_update`,
    `onshape_mutation_context`, `onshape_reconcile_update`; result shape
    `{content: [{type: 'text', text: JSON}], details}`.
  - `src/dashboard.ts` `mutation-reconcile` action, `ui/control-ui.js` proposal cards
    (Reconcile button only enabled for `UNKNOWN`).
  - Skills: `skills/onshape-edit-feature-parameters/SKILL.md` (L35–75 describe the
    execution step with "operation/path_params/body"),
    `agents/mechanical-engineer/exports/workshop-skills/onshape-edit-feature-parameters/SKILL.md`,
    `agents/mechanical-engineer/workspace/AGENTS.md` L17.
- What happened live: the Engineer ran in OpenClaw code mode
  `onshape__onshape_api_call({endpoint: c.operation, path_params: c.path_params, body: c.body})`
  where `c` was the stored tool result; the server answered
  `invalid arguments: missing field \`endpoint\``. The approval then expired unused and
  `reconcile` could not leave `UNKNOWN`, which blocks every new proposal.

## Binding constraints and prohibitions

- Everything in your agent definition applies (MCP boundary, fail closed, no new
  dependencies, erasable TypeScript, Biome clean).
- **No MCP call from the plugin.** The plugin still never invokes `/mcp`; the context is
  data for the Engineer.
- **No automatic retry and no automatic re-approval.** `REJECTED` is terminal; a new
  proposal is required afterwards. Do not add a timer that rewrites receipts; the
  transition happens only inside `reconcile`.
- Reconcile rules MUST be implemented exactly in the contract order (§4 rules 1–4).
  Grace constant: `60_000` ms after `expiresAt`, named and commented with the contract
  reference. Use the injectable clock pattern already used in the repo (add a `now`
  parameter with `Date.now` default if none exists) so tests do not sleep.
- `REJECTED` receipts carry `reason: 'approval_expired_not_dispatched'` and
  `rejectedAt` (ISO). Keep all other receipt fields. A `REJECTED` receipt must not block
  `propose` or `approve` (the one-at-a-time rule only counts `UNKNOWN`).
- Write `null` to `approved-update.json` on both terminal transitions (`VERIFIED`,
  `REJECTED`) with the existing `writePrivateSecretFileAtomic` call. Persist the receipt
  **before** resetting the file, as today for `VERIFIED`.
- `executionContext` output MUST match §4.1 exactly: `status`, `proposalId`,
  `approvedRequestHash`, `payloadHash`, `expiresAt`, `apiCall {endpoint, path_params,
  body}`. Do **not** emit the old top-level `operation`, `path_params`, `body`.
- The dashboard must surface `REJECTED` with its reason in the proposal card
  (title/status text). Keep the change minimal; no other UI redesign (M14 is out of scope).
- Do not touch: contract, fixtures, `tests/contract/`, `spec.md`, `docs/ADR.md`,
  `docs/architecture*`, `docs/evidence/`, `deploy/`, `.claude/`, devcontainer files,
  `package.json` version (the architect bumps it to 0.2.9 for packaging).
- Foreign uncommitted changes in the checkout (`.gitignore`, `.codex/`, `deploy/team.json`,
  `docs/product/`, `docs/evidence/…`, `scripts/*product-owner*`, contract/ADR edits
  by the architect) are not yours: never stage or modify them. Stage by explicit path.

## Steps

1. Preconditions per your workflow: branch, `tests/contract/VERSION` line 1 =
   `0.3.0-draft`, foreign HEAD = `c53d9c9…`, `git log -1` = `8d59a97`. Baseline checks.
2. **Failing tests first** (commit them together with the fix, but run them red first and
   name them in the report):
   - `executionContext` for the paired fixture approval returns an object equal to
     `tests/contract/mutation-context/valid/update-feature.json` ignoring `expiresAt`.
   - `apiCall` validates against the `onshape_api_call` `inputSchema` from
     `tests/contract/mcp-tools.json`: implement a minimal, dependency-free check for the
     parts used (`type: object`, `required`, property types, `additionalProperties` for
     `path_params`) and assert that no property outside the schema's `properties` is
     present. Also assert `apiCall.body` deep-equals the approval file `body`.
   - Reconcile matrix with a fake client and injected clock:
     (a) Primary changed → `primary_revision_changed`, stays `UNKNOWN`, file untouched;
     (b) Candidate changed and matches → `VERIFIED`, file `null`;
     (c) Candidate changed and mismatches → `mutation_verification_mismatch`, stays `UNKNOWN`;
     (d) unchanged, `now = expiresAt + 59_999` → `mutation_outcome_unknown`, stays `UNKNOWN`,
     file untouched;
     (e) unchanged, `now = expiresAt + 60_000` → `REJECTED`, reason
     `approval_expired_not_dispatched`, file `null`;
     (f) after (e) a new `propose` succeeds and `approve` is not blocked by
     `mutation_reconciliation_required`;
     (g) `reconcile` on a `REJECTED` or `VERIFIED` receipt → `invalid_arguments`, no file write.
   - `tests/contract.test.mjs` (new): VERSION line 1 equals `0.3.0-draft`; every code the
     mutation workflow can emit is listed in `tests/contract/error-codes.json` `plugin`
     (or `server` for pass-through).
3. Implement `executionContext` (§4.1) and `reconcile` (§4 rules 1–4) in
   `src/mutation-workflow.ts`; extend the `MutationProposal` type with optional
   `reason` and `rejectedAt` for `REJECTED`. Map the new reason through `userError` /
   readiness messages with a short operator text ("Approval expired without execution.
   Create a new proposal.").
4. Update the tool descriptions in `src/index.ts`:
   `onshape_mutation_context` → "returns `apiCall`; pass it unchanged as the arguments
   of onshape__onshape_api_call; parse the text result if needed";
   `onshape_reconcile_update` → mention the terminal `REJECTED` outcome.
5. Update the execution step in `skills/onshape-edit-feature-parameters/SKILL.md`,
   its export copy under `agents/mechanical-engineer/exports/workshop-skills/` (keep them
   identical; if `manifest.json` carries a content hash, update it the way the existing
   tooling expects and explain how in the report), and
   `agents/mechanical-engineer/workspace/AGENTS.md` L17: parse the context result if it
   is text, call `onshape__onshape_api_call(context.apiCall)` unchanged, exactly once, then
   `onshape_reconcile_update`; on `REJECTED` report it and stop; on `UNKNOWN` stop and report.
6. Dashboard: show `REJECTED (approval_expired_not_dispatched)` on the card; Approve and
   Reconcile stay disabled for terminal states.
7. Run all mandatory checks including `npx biome ci .`.

## Acceptance criteria and tests

- All tests from step 2 exist, were red before the fix and are green after it.
- `npm ci`, `npm run typecheck`, `npm test`, `npm run test:native-files`,
  `npm pack --dry-run`, `npx biome ci .` pass. Test count = baseline + new tests.
- No new `biome-ignore`, `any`, `as` cast or `@ts-expect-error` without a reason listed
  in the report.
- `executionContext` output has exactly the §4.1 keys; old keys are gone (assert it).
- `REJECTED` is reachable only through `reconcile` rule 4; no timer, no other writer.
- Skill/AGENTS text matches the new sequence and names `apiCall`.
- `npm pack --dry-run` still lists `skills/` and the engineer definition files.

## Branch and worktree rules

- Work only on `demo/gateway-native-read-20261014` in `/workspaces/clawonshape`, on top of
  `8d59a97`. No new branches or worktrees, no switching, no push.
- Commits (each with `Refs: edge-robot/clawonshape#5` and/or `#10`,
  `Prompt: docs/prompts/2026-10-16-mutation-context-and-expired-approval.md`,
  `Agent: ts-plugin-dev`, `Co-Authored-By: …`):
  1. `test: 🧪 …` + `fix: 🐛 return apiCall from onshape_mutation_context` (Refs #10)
  2. `fix: 🔐 close expired, undispatched approvals as REJECTED in reconcile` (Refs #5)
  3. `docs: 📖 align engineer skill with apiCall execution context` (Refs #10)
  4. `feat: 🖥️ show REJECTED receipts in the dashboard` (Refs #5)
  5. `docs: 📖 report for mutation-context-and-expired-approval prompt` — the report and
     this prompt file, unchanged.
  Test-first commits may be squashed into their fix commit; say so in the report.
- Hand back the worktree clean except for the foreign changes listed above.

## Expected report / handoff format

`docs/prompts/2026-10-16-mutation-context-and-expired-approval.report.md` in the format of
your agent definition. Additionally:

- the red→green evidence per test (test name, failing assertion before the fix);
- the exact `executionContext` output for the fixture (JSON);
- the reconcile decision table as implemented, with file:line per rule;
- how the skill export/manifest was updated;
- `e2e-request: required` (receipts, approvals and fail-closed paths change). In
  *Live E2E request* describe: the stuck live receipt `51ee80be-05f5-4e7e-8c47-4061f12944cc`
  must reconcile to `REJECTED` after rollout; then a new proposal → approve → execute →
  `VERIFIED`; negative checks N1 (repeat after VERIFIED → `mutation_approval_unavailable`)
  and N2 (Primary target → `target_policy_denied`).
