---
prompt: docs/prompts/2026-10-16-mutation-context-and-expired-approval.md
branch: demo/gateway-native-read-20261014
commits: d850b33..2aa5264
status: partial
contract-version: 0.3.0-draft
e2e-request: required
---
# Report: Fix the mutation execution context and the expired-approval deadlock

## Summary

Both live failures are fixed in the plugin.

- **G13 / #10:** `onshape_mutation_context` now returns the contract §4.1 object. Its `apiCall`
  `{endpoint, path_params, body}` validates against the `onshape_api_call` input schema. The
  0.2.x fields `operation`/`path_params`/`body` are gone.
- **G5 / #5:** `reconcile` implements contract §4 rules 1–4 in order. An `UNKNOWN` receipt
  with an unchanged Candidate is closed as terminal `REJECTED`
  (`reason: approval_expired_not_dispatched`, `rejectedAt`) once
  `now ≥ expiresAt + 60 000 ms`. The approval file is then reset to `null`. A `REJECTED`
  receipt no longer blocks `propose` or `approve`.
- The skill text, `AGENTS.md` and the dashboard follow the new behaviour.

Status is `partial` for one reason. The workflow can emit three generic codes that
`error-codes.json` does not list: `invalid_arguments`, `authorization_changed`,
`provider_protocol_error`. Making that acceptance criterion fully true needs a contract
change, which is requested below. The contract test pins exactly these three codes, so it
fails as soon as the list changes in either direction. Everything else is done.

The report commit (`docs: 📖 report for mutation-context-and-expired-approval prompt`) follows
the range above. The `test: 🧪` commits were squashed into their fix and feat commits. Each
test was run red before the change it covers (evidence below).

## Changed files

`git diff --stat 8d59a97..2aa5264`: 12 files changed, 592 insertions(+), 76 deletions(-).

| File | Purpose |
|---|---|
| `src/mutation-workflow.ts` | injectable clock `now` (default `Date.now`); `ExecutionContext` type and §4.1 output; reconcile rules 1–4 with `APPROVAL_DISPATCH_GRACE_MS`; shared terminal `finish` (persist receipt, then reset the file); `reason`/`rejectedAt` on `MutationProposal` |
| `src/index.ts` | tool descriptions for `onshape_mutation_context` (apiCall usage) and `onshape_reconcile_update` (terminal REJECTED) |
| `src/readiness.ts` | operator text `approval_expired_not_dispatched` |
| `src/dashboard.ts` | `mutation-reconcile` answers REJECTED with `status: 'rejected'` and the operator text (was always `'verified'`) |
| `ui/control-ui.js` | card title `… — REJECTED (approval_expired_not_dispatched)` |
| `tests/contract.test.mjs` | new contract tests (VERSION, error codes, §4.1 fixture equality, apiCall schema) |
| `tests/mutation-workflow.test.mjs` | existing test moved to `apiCall`; reconcile matrix a–g; context expiry |
| `tests/mcp-readiness.test.mjs` | dashboard card test for REJECTED and terminal button states |
| `skills/onshape-edit-feature-parameters/SKILL.md` | execution steps 3–4 use `context.apiCall`, REJECTED and UNKNOWN handling |
| `agents/mechanical-engineer/exports/workshop-skills/onshape-edit-feature-parameters/SKILL.md` | byte-identical copy of the packaged skill |
| `agents/mechanical-engineer/exports/workshop-skills/manifest.json` | `sha256` of the exported SKILL.md |
| `agents/mechanical-engineer/workspace/AGENTS.md` | line 17: new execution sequence naming `apiCall` |

## Checks

| Command | Result |
|---|---|
| `npm ci` | **fail**, the same pre-existing `EUSAGE` as in the baseline: the lock file lacks the peer `openclaw@2026.9.9` (biome-linter report, Open points 1). `node_modules/openclaw` was unaffected |
| `npm run typecheck` | pass |
| `npm test` | pass: **107** tests, 107 pass, 0 fail. Baseline was 93 (+14 new) |
| `npm run test:native-files` | exit 1, `UNAVAILABLE` / `native_private_file_sdk_unavailable`. Identical to the baseline (no native SDK in the container) |
| `npm pack --dry-run` | pass: 105 files. `skills/` (3 SKILL.md) and `agents/mechanical-engineer/definition` are still listed. The 5 extra files compared with the last report are all under `docs/` (see Open points) |
| `npx biome ci .` | pass: 48 files, no diagnostics |

The 14 new tests:
- contract: 5 (VERSION, error codes, schema negative test, fixture equality, apiCall schema)
- workflow: 8 (reconcile a–g, context expiry)
- UI: 1

Every commit passed typecheck, tests and Biome on its own. The held-back tests were added in
the commit that makes them pass.

### Red → green evidence

| Test | Failing assertion before the fix | Green in |
|---|---|---|
| `executionContext for the paired approval equals the mutation-context fixture (§4.1)` | `Expected values to be strictly deep-equal` (`operation`/`path_params`/`body` instead of `status`/`apiCall`) | d850b33 |
| `executionContext apiCall is a valid onshape_api_call input carrying the approved body` | `Expected values to be strictly deep-equal` (missing `endpoint`, `apiCall` undefined) | d850b33 |
| `Candidate approval binds the exact payload …` (existing, updated) | `execution.status`: expected `'ok'`, actual `undefined` | d850b33 |
| `executionContext is unavailable once the approval has expired` | `approved.expiresAt`: expected `1800000300000`, actual wall clock (no injectable clock) | d850b33 |
| `every code the mutation workflow can emit is listed in error-codes.json` | `'REJECTED reason must be emitted by the workflow'` | fd412e9 |
| `reconcile (e) … closes as REJECTED and resets the approval file` | rejected with `mutation_outcome_unknown` (the M16 deadlock) | fd412e9 |
| `reconcile (f) a REJECTED receipt does not block a new proposal and approval` | rejected with `mutation_outcome_unknown` | fd412e9 |
| `reconcile (g) terminal REJECTED and VERIFIED receipts are refused without a file write` | rejected with `mutation_outcome_unknown` | fd412e9 |
| `reconcile (a)`–`(d)` | before the clock existed: `expiresAt` expected `1800000300000`, actual wall clock. After d850b33 they pass against the old reconcile, because rules 1–3 already behaved this way. They are regression guards | fd412e9 |
| `dashboard proposal cards show REJECTED with its reason …` | expected `'rejected-id — REJECTED (approval_expired_not_dispatched)'`, actual `'rejected-id — REJECTED'` | 2aa5264 |

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| step-2 tests exist, red before, green after | met | table above |
| ci/typecheck/test/native-files/pack/biome pass, count = baseline + new | partial | all pass except `npm ci` and `test:native-files`, which fail exactly as in the baseline (environment, not this change). Tests: 93 + 14 = 107 |
| no new `biome-ignore`, `any`, `as` cast or `@ts-expect-error` without a reason | met | none added. The two `as` casts in reconcile rule 2 (`record.body.feature as …`, `current.feature as …`) existed before and were only re-indented into the rule-2 branch |
| `executionContext` has exactly the §4.1 keys; old keys asserted absent | met | `contract.test.mjs` asserts key-set equality with the fixture and the absence of `operation`/`path_params`/`body`. The workflow test asserts `execution.operation === undefined` |
| `REJECTED` reachable only through reconcile rule 4; no timer, no other writer | met | `status: 'REJECTED'` is written only at `src/mutation-workflow.ts:342`. No timer was added; `setInterval`/`setTimeout` do not appear in `mutation-workflow.ts`, `dashboard.ts` or `index.ts` |
| skill and AGENTS text match the new sequence and name `apiCall` | met | SKILL.md steps 3–4 and AGENTS.md line 17 |
| `npm pack --dry-run` lists `skills/` and the engineer definition | met | 4 matching entries |
| every emitted mutation-workflow code is listed in `error-codes.json` | **partial** | 3 generic codes are unlisted; change request below |

### `executionContext` output for the fixture

The receipt was built from `approved-update/valid/update-feature.json` and the
`expectations.json` target. The output is byte-identical to
`mutation-context/valid/update-feature.json`; `expiresAt` comes from the receipt:

```json
{
  "status": "ok",
  "proposalId": "3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b",
  "approvedRequestHash": "request-hash-fixture",
  "payloadHash": "e0e0760379e951a4e954cea16300de4f1b0ae85e97a2a229492e06703e00fdd2",
  "expiresAt": 4102444800000,
  "apiCall": {
    "endpoint": "updatePartStudioFeature",
    "path_params": {
      "did": "0123456789abcdef01234567",
      "wid": "89abcdef0123456789abcdef",
      "eid": "fedcba9876543210fedcba98",
      "fid": "FabcDEF123_0"
    },
    "body": {
      "feature": {
        "featureId": "FabcDEF123_0",
        "featureType": "extrude",
        "suppressed": false,
        "parameters": [{"parameterId": "depth", "expression": "60 mm"}]
      },
      "sourceMicroversion": "aaaaaaaaaaaaaaaaaaaaaaaa",
      "rejectMicroversionSkew": true,
      "serializationVersion": "1.2.3",
      "libraryVersion": 2000
    }
  }
}
```

The tool layer wraps it as `details = {status: 'ok', ...context}` (`src/index.ts`). That
produces the same keys and values, and `content[0].text` is its JSON.

### Reconcile decision table as implemented (`src/mutation-workflow.ts`)

| Precondition / rule | Condition | Outcome | Approval file | Line |
|---|---|---|---|---|
| guard | receipt not `UNKNOWN` (incl. `VERIFIED`, `REJECTED`) | `invalid_arguments` | untouched | 294–296 |
| rule 1 | `primaryMicroversionId` changed | `primary_revision_changed`, stays `UNKNOWN` | untouched | 298–301 |
| rule 2 | Candidate `sourceMicroversion` changed; identity, state and expressions match | `VERIFIED` (+`resultMicroversion`) | `null` after receipt save | 302–328 |
| rule 2 | Candidate changed, mismatch | `mutation_verification_mismatch`, stays `UNKNOWN` | untouched | 311–324 |
| rule 3 | Candidate unchanged and `now < expiresAt + 60 000`, or no valid `expiresAt` | `mutation_outcome_unknown`, stays `UNKNOWN` | untouched | 329–338 |
| rule 4 | Candidate unchanged and `now ≥ expiresAt + 60 000` | `REJECTED`, `reason: approval_expired_not_dispatched`, `rejectedAt` | `null` after receipt save | 339–345 |
| constant | `APPROVAL_DISPATCH_GRACE_MS = 60_000`, commented with §4 rule 4 and §7 | | | 37–39 |
| terminal writer | `finish`: `save(receipt)`, then `writePrivateSecretFileAtomic(…, 'null')` | | | 282–291 |

- Rule order is enforced by tests: a changed Primary after the grace still gives
  `primary_revision_changed` (a), and a landed dispatch after the grace gives `VERIFIED` (b).
- A receipt without a valid `expiresAt` is treated fail-closed as rule 3. It can only arise
  from a corrupt or hand-edited receipt, because `approve` always sets `expiresAt`.

### Skill export and manifest

- `scripts/workshop-skills.mjs export` writes the native Workshop content to
  `<dir>/<name>/SKILL.md` and records `sha256 = SHA-256(SKILL.md bytes)` in `manifest.json`.
  `import` re-reads the file and compares hashes against the installed skill.
- I made the export copy byte-identical to `skills/onshape-edit-feature-parameters/SKILL.md`
  (`cmp` passes) and set the manifest `sha256` to
  `94edffd52118aa6c9d4025f94eebc46326cd50c8990f3b2c8ee7bf1cb963074a` (was `a1725508…`). The
  description is unchanged and equal to the source frontmatter.
- **Discarded export-only content.** The old export copy was not identical to the source
  before this change. It had quoted YAML frontmatter, a "Current deployment is read-only"
  paragraph and a section "Signed free engineering task and implemented Candidate execution".
  That section contained the old `operation/path_params/body` wording. The
  byte-identical copy drops all of this.
- **Rollout:** `scripts/sync-engineer-workshop-skills.mjs` preserves existing installed
  skills, so the live Engineer keeps the old text until the operator imports it.
  1. Run `node scripts/workshop-skills.mjs import --agent clawcad-mechanical-engineer
     --container <engineer> --directory agents/mechanical-engineer/exports/workshop-skills`
     (preview).
  2. Then run it again with `--execute --expected-current-sha256 <installed hash>`. The
     preview prints the installed hash; it was `a1725508…` if the live skill still equals the
     old export.

## Contract deviations and change requests

**CR-1, channel: error codes (`fixtures/error-codes.json`, §6). Additive.**

- **Current:** `mutation-workflow.ts` emits `invalid_arguments` (bad proposal ID, body,
  summary; reconcile on a terminal receipt), `authorization_changed` (receipt binding or
  payload-hash mismatch, wrong approve hash) and `provider_protocol_error` (serialization or
  library version drift at propose). None of them is in `plugin`. The test step requires
  "every code the mutation workflow can emit is listed".
- **Proposed diff:**
  ```diff
     "plugin": [
  +    "invalid_arguments",
  +    "authorization_changed",
  +    "provider_protocol_error",
       "mcp_execution_disabled",
  ```
  plus one §6 table row:
  "`invalid_arguments`, `authorization_changed`, `provider_protocol_error` | plugin |
  generic argument, binding-drift and provider-shape errors of the mutation workflow | no |
  fix the arguments or re-read; new proposal".
- **Rationale:** these codes reach the Engineer through `onshape_*_update` and
  `onshape_mutation_context`. In particular, `invalid_arguments` is now the defined answer
  to reconciling a terminal receipt (rule (g)).
- **Assessment:** additive, plugin-side only; minor version bump. **Impact on onshape-mcp:**
  none (the server neither emits nor consumes them).
- **Follow-up:** `tests/contract.test.mjs` `PENDING_CONTRACT_CODES` must be emptied when the
  fixture copy is updated.

No other deviation. The code implements §4 and §4.1 as written.

## Live E2E request

Preconditions: plugin 0.2.9 built from `2aa5264` or later (architect bumps the version),
contract 0.3.0-draft, `liveReads` and `localMcp` configured as in the 2026-10-16 acceptance.
The Workshop skill must be imported as described above.

1. **Stuck receipt:** in the dashboard, reconcile receipt
   `51ee80be-05f5-4e7e-8c47-4061f12944cc`.
   - Expected: the Candidate is unchanged and expiry is long past, so the receipt becomes
     `REJECTED (approval_expired_not_dispatched)`.
   - The action answers `status: rejected` with the text "Approval expired without
     execution. Create a new proposal."
   - `approved-update.json` is `null`.
   - Approve and Reconcile are disabled on that card.
2. **Happy path:** new proposal → approve → Engineer calls `onshape_mutation_context` →
   `onshape__onshape_api_call(context.apiCall)` exactly once → `onshape_reconcile_update` →
   `VERIFIED`.
   - Expected: the server accepts the input (no `missing field endpoint`).
   - Reconcile returns `VERIFIED`, and `approved-update.json` is `null`.
3. **N1:** repeat the same `apiCall` after `VERIFIED` → `mutation_approval_unavailable`
   (file `null`).
4. **N2:** an `apiCall` with the Primary workspace as `wid` → `target_policy_denied`, no
   provider I/O.
5. Optional: let a fresh approval expire unused and reconcile. It gives
   `mutation_outcome_unknown` until `expiresAt + 60 s`, then `REJECTED`.

## Open points and risks

1. **`npm pack` includes whatever is under `docs/`, tracked or not.** In this worktree that
   adds the architect's untracked `docs/evidence/…`, `docs/product/…` and
   `docs/interface/fixtures/mutation-context/…`. Package from a clean tree or narrow `files`.
2. **The agent never sees the specific mutation codes.** `userError` maps any code missing
   from `readiness.messages` to `onshape_unavailable`. That includes `mutation_outcome_unknown`,
   `primary_revision_changed`, `mutation_reconciliation_required`,
   `mutation_approval_unavailable`, `mutation_verification_mismatch` and
   `protected_primary_workspace`. The plugin tools therefore report these as
   `onshape_unavailable` in tool results and dashboard actions. The live E2E should not
   expect those codes from plugin tools; server codes such as N1/N2 are unaffected. I did not
   change this because it alters externally visible tool results beyond the prompt
   (see Out-of-scope findings).
3. `REJECTED` closes only after the grace, so an operator must wait up to 6 min after
   approval (5 min lifetime + 60 s) before an unused approval can be cleared. This is
   intended by §4.
4. The dashboard `mutation-reconcile` REJECTED branch has no action-level unit test (it
   needs the full operator, credential and OAuth setup). It is covered by the UI test and
   the store tests, and by E2E step 1.

## Out-of-scope findings

- `src/readiness.ts:1–87` (`messages`) together with `userError` (`src/readiness.ts:92–96`):
  the mutation and contract codes listed in Open points 2 are absent, so they collapse to
  `onshape_unavailable` in tool results. This contradicts §6 ("the code string is the
  contract"). Proposed follow-up: add messages for all §6 plugin codes, behind a
  contract-test assertion.
- `src/mutation-workflow.ts:181–182` (`elementId: binding.elementId!` in `propose`) is
  still a `TODO(#9)` from the Biome prompt.
