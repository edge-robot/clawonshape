---
prompt: docs/prompts/2026-10-16-proposal-codes-and-version-drift.md
branch: demo/gateway-native-read-20261014
commits: 38a79dc..c086633 (plus the report commit)
status: done
contract-version: 0.4.0-draft
e2e-request: required
---
# Report: Unblock proposals: drop the version-drift check and pass error codes through

## Summary

All three defects are fixed. The proof-based redesign was not started: no new tools, no approval request or
proof, and no dashboard changes.

- **M21:** `propose` no longer compares `serializationVersion`/`libraryVersion` with the plugin's own REST read.
  - Both fields must be present and well-formed. `serializationVersion` must be a string matching `^\d+\.\d+\.\d+$`.
    `libraryVersion` must be a positive safe integer. Otherwise `proposal_body_invalid`.
  - Structural body checks now run before any provider read.
  - All other checks are unchanged and covered by tests:
    - object body and size limit (`invalid_arguments`)
    - `feature.featureId` present exactly once in the live read (`feature_observation_mismatch`)
    - `sourceMicroversion` equal to the live Candidate microversion (`revision_policy_denied`)
    - `rejectMicroversionSkew === true` (`revision_policy_denied`)
- **M20:** The `invalid_arguments` text is now neutral. The new `proposal_body_invalid` text names the fix.
  Structural body defects use `proposal_body_invalid` instead of `invalid_arguments`.
- **CR-1 (pass-through):** All 37 codes in `tests/contract/error-codes.json` (`plugin` and `server`) have a
  `messages` entry and reach `details.code` unchanged. Only unlisted codes still fall back to `onshape_unavailable`.
  - `userError` now looks codes up as own keys only. Before, prototype names such as `toString` matched as codes.
  - `PENDING_CONTRACT_CODES` is removed. The contract test now asserts that no emitted code is unlisted.
- **Diagnostics:** The three mutation tools write one structured warning line through `api.logger.warn` for
  `provider_protocol_error`, `proposal_body_invalid`, `revision_policy_denied` and `provider_transport_error`.
  This is the same logger path as `claw_onshape.candidate_authorization_rejected`.
- **Skill:** One recovery sentence for `proposal_body_invalid` was added. The export copy is byte-identical to the
  source and the manifest hash is updated.

## Changed files

`git diff --stat 09f7b49..HEAD`, without the report commit:

| File | Lines | Purpose |
|---|---|---|
| `src/mutation-workflow.ts` | +131/−… | `proposalFeatureId` (structural checks); `validateUpdateBody` (baseline/skew only); version equality removed; `MutationStageError`/`staged` for diagnostic stages; `mutationToolFailure` (tool error result plus diagnostic line) |
| `src/readiness.ts` | +60 | texts for all §6 codes; new `invalid_arguments` and `proposal_body_invalid` texts; own-key lookup in `userError` |
| `src/index.ts` | +4/−3 | the mutation tools' `catch` uses `mutationToolFailure` with `api.logger.warn` |
| `tests/mutation-workflow.test.mjs` | +265 | M21, body validation, regression guard, pass-through and diagnostic tests |
| `tests/contract.test.mjs` | +22/−… | `CONTRACT_VERSION` 0.4.0-draft; `PENDING_CONTRACT_CODES` removed; every contract code passes through `userError` unchanged |
| `skills/onshape-edit-feature-parameters/SKILL.md` | +4/−1 | recovery from `proposal_body_invalid` |
| `agents/mechanical-engineer/exports/workshop-skills/onshape-edit-feature-parameters/SKILL.md` | +4/−1 | byte-identical export copy |
| `agents/mechanical-engineer/exports/workshop-skills/manifest.json` | 1 line | sha256 `94edffd5…074a` → `30c78758…ab4a7` |

Commits:

| Commit | Message |
|---|---|
| `38a79dc` | fix: 🐛 accept Onshape serializationVersion drift in proposals |
| `d127a01` | fix: 🧭 pass mutation error codes through with actionable texts |
| `1c66a40` | feat: 🔎 log bounded diagnostics for rejected mutation tool calls |
| `c086633` | docs: 📖 tell the engineer how to recover from proposal_body_invalid |
| report commit | docs: 📖 report for proposal-codes-and-version-drift prompt (this report and the prompt file) |

## Checks

| Command | Result |
|---|---|
| `npm ci` | **fail**, same as the baseline: `EUSAGE` because `package-lock.json` lacks the `openclaw` peer. Not caused by this change. `node_modules/openclaw` was backed up first and is still present. |
| `npm run typecheck` | pass |
| `npm test` | pass: 115 tests, 115 pass, 0 fail. The baseline at `09f7b49` had 107 tests and 2 failures, both contract tests that went red when the contract was bumped to 0.4.0-draft (see the table below). |
| `npm run test:native-files` | **fail**, same as the baseline: `"status":"UNAVAILABLE","reason":"native_private_file_sdk_unavailable"`. The container has no native SDK. |
| `npm pack --dry-run` | pass. 110 files including `dist/`, `openclaw.plugin.json` and `skills/`; no `state/`, `*.tgz` or `.env`. 110 instead of 105 because untracked foreign files under `docs/` are included (see Out-of-scope findings). |
| `npx biome ci .` | pass: 48 files, no errors, no warnings |

### Red → green

Every test was run against the code before its commit.

| Test | Red assertion before the fix | Commit that turned it green |
|---|---|---|
| `mutation-workflow` › propose accepts serializationVersion drift against the plugin REST read | `Error: provider_protocol_error`, thrown by `propose` | `38a79dc` |
| `mutation-workflow` › propose rejects structurally incomplete bodies with proposal_body_invalid before any read | `actual: Error: provider_protocol_error`, `expected: /^Error: proposal_body_invalid$/` | `38a79dc` |
| `mutation-workflow` › Primary and stale proposal revisions … (existing test; the assertion for `serializationVersion: 'v10'` was changed from `provider_protocol_error` to `proposal_body_invalid`) | `actual: Error: provider_protocol_error`, `expected: /proposal_body_invalid/` | `38a79dc` |
| `mutation-workflow` › propose keeps the baseline, skew, feature and argument checks | **green before and after.** This is a regression guard for the checks that must not weaken. It covers wrong or missing `sourceMicroversion`, `rejectMicroversionSkew: false` or `'true'`, `feature_observation_mismatch`, non-object and oversized bodies, and invalid summaries. | n/a |
| `contract` › every contract error code has a message and passes through userError unchanged | `missing message for mcp_execution_disabled` | `d127a01` |
| `mutation-workflow` › mutation tool errors keep their code in details.code with an actionable text | `actual: 'onshape_unavailable'`, `expected: 'mutation_outcome_unknown'` | `d127a01` |
| `contract` › contract fixture copy has the version this plugin implements | red in the baseline: VERSION `0.4.0-draft` ≠ `0.3.0-draft` | `d127a01` |
| `contract` › every code the mutation workflow can emit is listed in error-codes.json | red in the baseline: the contract now lists the 3 formerly pending codes, so the comparison with `PENDING_CONTRACT_CODES` failed. Now it asserts `[]` and that `proposal_body_invalid` is emitted. | `d127a01` |
| `mutation-workflow` › a rejected propose writes one bounded diagnostic line without token, body or provider text | `TypeError: mutationToolFailure is not a function` | `1c66a40` |
| `mutation-workflow` › diagnostics name the stage for body and policy rejections and skip other codes | `TypeError: mutationToolFailure is not a function` | `1c66a40` |
| `mutation-workflow` › a provider failure during reconcile is diagnosed at the reconcile_read stage | `TypeError: mutationToolFailure is not a function` | `1c66a40` |

The prototype-key hardening in `userError` (`toString`, `constructor`, `__proto__`, `hasOwnProperty` → `onshape_unavailable`) is asserted in the details.code test. That test was already red at its first assertion before the fix.

### `messages` coverage for all contract codes

All 37 codes map to themselves through `userError`. `mutation_approval_unavailable` appears in both lists.

| Code | List | Unchanged | Text |
|---|---|---|---|
| `mcp_execution_disabled` | plugin | yes | Native MCP execution is disabled for this plugin. Ask the operator to review the setup. |
| `mcp_discovery_failed` | plugin | yes | The native MCP server could not be discovered. Ask the operator to inspect the MCP status. |
| `invalid_mcp_server` | plugin | yes | The native MCP server configuration is invalid. Ask the operator to fix it. |
| `native_mcp_status_unavailable` | plugin | yes | The native MCP status is unavailable or could not be parsed. Ask the operator to inspect it. |
| `mutation_reconciliation_required` | plugin | yes | An earlier approved update has an unknown outcome. Reconcile it with onshape_reconcile_update first. |
| `mutation_approval_unavailable` | plugin | yes | No current approval exists for this proposal. Ask the operator to approve it, or create a new proposal. |
| `source_revision_conflict` | plugin | yes | The selected source revision changed before workspace preparation. Refresh and retry from the current revision. |
| `primary_revision_changed` | plugin | yes | The Primary workspace changed during the update. Stop and escalate to the operator; do not retry. |
| `mutation_outcome_unknown` | plugin | yes | The update outcome is not known yet. Do not repeat the update; reconcile again later or ask the operator. |
| `mutation_verification_mismatch` | plugin | yes | The Candidate changed but does not match the approved update. Stop and escalate to the operator. |
| `protected_primary_workspace` | plugin | yes | The Primary workspace is protected. Only the Candidate workspace can be changed. |
| `mcp_credential_unavailable` | plugin | yes | The Onshape credential for the native MCP server is unavailable. Ask the operator to reconnect Onshape. |
| `mcp_credential_handoff_unavailable` | plugin | yes | The credential handoff to the native MCP server is unavailable. Ask the operator to check its private directory. |
| `approval_expired_not_dispatched` | plugin | yes | Approval expired without execution. Create a new proposal. |
| `invalid_arguments` | plugin | yes | The tool arguments are malformed. Check the tool schema. |
| `authorization_changed` | plugin | yes | The authorization for this request has changed. Retry from your original authenticated session. |
| `provider_protocol_error` | plugin | yes | Onshape returned an unexpected response. The operator can inspect the diagnostic code. |
| `proposal_body_invalid` | plugin | yes | Submit the complete native v16 feature from getPartStudioFeatures for the bound feature, with serializationVersion, libraryVersion, sourceMicroversion and rejectMicroversionSkew: true. |
| `external_token_tool_denied` | server | yes | This MCP tool is not available in external-token mode. Choose a different tool. |
| `external_token_read_policy_denied` | server | yes | This read is outside the allowed MCP read set. Correct the request shape; new consent will not help. |
| `target_policy_denied` | server | yes | This update is outside the MCP target policy. Escalate to the operator. |
| `revision_policy_denied` | server | yes | The update does not match the current Candidate baseline. Re-read the feature natively and create a new proposal with the current sourceMicroversion and rejectMicroversionSkew: true. |
| `target_configuration_invalid` | server | yes | The MCP target configuration is invalid. Ask the operator to fix it. |
| `external_token_configuration_invalid` | server | yes | The MCP external-token configuration is invalid. Ask the operator to fix it. |
| `mutation_approval_unavailable` | server | yes | (same entry as plugin) |
| `mutation_approval_mismatch` | server | yes | The approval expired or does not match the submitted update. Create a new proposal and approval. |
| `external_private_file_unavailable` | server | yes | A private MCP handoff file failed its ownership or mode checks. Ask the operator to fix it. |
| `external_token_unavailable` | server | yes | The MCP server has no valid Onshape access token. Ask the operator to check the plugin connection. |
| `external_token_expired` | server | yes | The MCP access token has expired. Wait for the plugin to refresh it, then try again. |
| `external_token_write_scope_missing` | server | yes | REST write access has not been granted. Ask the operator to reconnect Onshape with write consent. |
| `external_token_client_unavailable` | server | yes | The MCP server could not build its Onshape client. Ask the operator. |
| `external_token_request_failed` | server | yes | The MCP read request failed. You may retry the read. |
| `mutation_outcome_unknown_reconcile_required` | server | yes | The update outcome is unknown. Never retry it; call onshape_reconcile_update first. |
| `external_token_auth_owned_externally` | server | yes | MCP authentication is managed by the plugin. No login is needed. |
| `external_token_local_url_required` | server | yes | The MCP server requires a local URL. Ask the operator to fix the setup. |
| `external_token_local_url_invalid` | server | yes | The MCP server local URL is invalid. Ask the operator to fix the setup. |
| `external_token_validation_unavailable` | server | yes | The MCP server could not validate its token setup. Ask the operator to fix the setup. |

### Example diagnostic line

Fake binding, generated from `dist/`:

```
WARNING: Claw-Onshape mutation tool rejected. {"event":"claw_onshape.mutation_tool_rejected","schemaVersion":1,"timestamp":"2026-10-16T10:23:55.096Z","severity":"WARNING","tool":"onshape_propose_update","code":"provider_protocol_error","stage":"baseline_read","ownerHash":"da28d61ce5858eff3d37c33eb5d5bc7f9615e317958d74bb2dfa610486c74ebf","documentId":"aaaaaaaaaaaaaaaaaaaaaaaa"}
```

`stage` takes these values:

| Value | Where it is set |
|---|---|
| `body_validation` | `proposalFeatureId`, `validateUpdateBody` |
| `baseline_read` | `featureUpdateBaseline` in `propose` |
| `reconcile_read` | `featureUpdateBaseline` in `reconcile` |
| `tool` | a code thrown outside these stages, for example in the tool wrapper |

`httpStatus` is added only when the underlying error is a `ProviderHttpError`.

## Acceptance criteria

- **All step-2 tests exist, were red first and are green now: met.** See the red → green table. The exception is
  the "still rejects" regression guard: by design it was green before and after, because the prompt requires
  these checks to stay unchanged.
- **`typecheck`, `test`, `biome ci .` and `pack --dry-run` pass; `npm ci` and `test:native-files` fail exactly as
  in the baseline: met.** See *Checks*.
- **No new `any`, casts or suppressions without a listed reason: met.**
  - No new `any` or `@ts-*`, and no new `biome-ignore`.
  - The old `body as {feature?: …}` cast in `propose` and the `b.feature as …` cast in `validateUpdateBody` were
    removed and replaced by the `isRecord` checks.
  - There is one new empty `catch` in `mutationToolFailure`, with a comment: logging is best effort, the tool
    result already carries the code, and the logger's own error text must not reach the agent. It is not a
    security path.
- **The removed check is gone and all other propose checks are still covered by tests: met.**
  - The `serializationVersion`/`libraryVersion` equality is removed (`src/mutation-workflow.ts:243–249`).
  - The structural checks are in `proposalFeatureId` (`:125`).
  - The baseline and skew checks are in `validateUpdateBody` (`:147`).
  - The primary-workspace guard, the `mutation_reconciliation_required` lock and the size limit are unchanged.
- **Pass-through of every listed code: met.** See `tests/contract.test.mjs:67` and the coverage table.
- **Diagnostics without body, token or provider text: met.**
  - The test sends a real `RestClient` request with the fake token `fixture-access-DO-NOT-LOG` and a provider
    reply containing `PROVIDER-TEXT-DO-NOT-LOG`. The body contains `BODY-DO-NOT-LOG`.
  - It asserts that none of these strings, nor `Bearer` or `holeDiameter`, appear in the line, and that the line
    is a single line.
- **Skill sentence, byte-identical export and manifest hash: met.**

New OpenClaw API usage: none. `api.logger.warn` was already used in `src/index.ts` for the Lead and candidate
warnings.

## Contract deviations and change requests

None. CR-1 from the previous report is resolved by contract 0.4.0-draft.

Proposal for the architect (no change made): §6 does not define the shape or event name of plugin diagnostic log
lines. If `claw_onshape.mutation_tool_rejected` should be relied on by Clawake or operators, consider recording it
in the contract or in `docs/architecture*`.

## Live E2E request

**Preconditions:**
- A plugin build from this branch at `c086633` or later. `package.json` is still `0.2.9`; the contract
  compatibility table expects `0.2.10`, and the architect does the version bump and packaging.
- The same onshape-mcp image `f27613e`, `liveReads` and `localMcp` configured, and a connected owner with
  `OAuth2Write`.
- Update the Workshop skill with `workshop-skills.mjs import --execute --expected-current-sha256 <currently
  installed sha>`. The new export sha256 is `30c7875871c2616c701ef213f21dbebf41971033f30609f3839414cbecaab4a7`.

**Verify:**
1. **R2/R3 repeat:**
   - The Engineer reads the bound feature through onshape-mcp `getPartStudioFeatures`. Its `serializationVersion`
     is `1.2.23`, while the plugin's REST read reports `1.2.21`.
   - Submit the complete feature with `sourceMicroversion` and `rejectMicroversionSkew: true` to
     `onshape_propose_update`.
   - **Expected:** `status: ok`, receipt `PROPOSED`, payload hash present. No `provider_protocol_error`.
2. **Abstract body:** call `onshape_propose_update` with `{parameterChanges: [...]}`.
   - **Expected:** `isError`, `details.code: proposal_body_invalid` and the new text naming `getPartStudioFeatures`.
   - **Expected:** exactly one gateway log line `claw_onshape.mutation_tool_rejected` with
     `stage: body_validation`, containing no body or token.
   - **Expected:** no Onshape request from the plugin for this call.
3. **Pass-through check:** call `onshape_reconcile_update` while the receipt is `UNKNOWN` and within the grace
   period.
   - **Expected:** `details.code: mutation_outcome_unknown`, not `onshape_unavailable`.
4. **Optional continuation:** approve → `onshape_mutation_context` → `onshape__onshape_api_call(context.apiCall)` →
   reconcile → `VERIFIED`, as in the previous report.

## Open points and risks

- **The contract tests depend on uncommitted foreign changes.** At `da83b54`, the committed `tests/contract/`
  is still 0.3.0-draft. The 0.4.0-draft copies (`VERSION`, `error-codes.json`, `expectations.json`) exist only
  in the worktree.
  - On a clean checkout of this branch, two contract tests fail: the version test, and the `proposal_body_invalid`
    entry in the emitted-codes test.
  - The pass-through test fails for the same reason.
  - The architect's contract commit has to land before or together with these commits.

- **Global pass-through.** `userError` is shared, so the change affects more than the mutation tools. Every tool
  and the dashboard now show listed codes such as `protected_primary_workspace` or `invalid_arguments` with their
  own text instead of `onshape_unavailable`. This is what §6 (0.4.0) requires. The full suite stays green.
- **`httpStatus` is effectively never present for the four diagnosed codes.**
  - `jsonRequest` (`src/http.ts:20–72`) raises `provider_protocol_error` only after a 2xx response, and
    `provider_transport_error` only without an HTTP status.
  - HTTP failures are `ProviderHttpError` with other codes, which are not diagnosed.
  - The field is wired in so a later protocol-level status can be added without changing the format.
- **Non-object or oversized bodies stay `invalid_arguments`.** A non-object body violates the tool schema.
  Re-reading cannot fix an oversized body, so these are not `proposal_body_invalid`. Please confirm this split.
- **No end-to-end test through the registered tool.** `mutationToolFailure` is tested directly. The `index.ts`
  catch is a one-line delegation, checked only by the type checker.
  - A full tool-level test would need a delegation key, an A2A context and the credential store; the prompt
    allowed the smaller seam.
  - Live E2E step 2 covers this path.
- **Server-code texts are new.** They paraphrase the §6 "Consumer action" column. Please review the wording.
- **Dead field.** `featureUpdateBaseline().body` (`src/rest.ts:373–379`) is no longer used by `propose`. It was
  left unchanged because it is out of scope.

## Out-of-scope findings

- **`package.json` (`files`/`docs/`).** `npm pack` includes untracked foreign files: `docs/product/*` and
  `docs/evidence/2026-10-16-mutation-path-acceptance.md` with uncommitted changes. Build the release from a clean
  checkout.
- **`package-lock.json`.** It still lacks the `openclaw` peer, so `npm ci` fails with `EUSAGE`. This is unchanged
  from the baseline.
