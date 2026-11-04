---
prompt: docs/prompts/2026-10-21-goal-authorization-plugin.md
branch: feat/18-goal-authorization
commits: 6ebbdef..af4c545
status: blocked
contract-version: 1.1.0-draft
e2e-request: required
---
# Report: Goal-scoped mutation authorization in the plugin (#18)

## Summary

I implemented the plugin side of ADR-2026-10-21 (`goal-workflow.md` `goal-1.0.0-draft`) and the producer
side of server contract §12, and tested it locally with fixtures and mocks. No live CAD was used.

- **Goal model.** The durable goal record has exactly one Candidate per goal. The scope model covers
  validation, canonical JSON, `goalHash` (it matches the T1 vector) and a canonical feature hash.
- **Lifecycle.** The §3 transition table is implemented. The pure verification core
  `verifyGoalConfirmation` compares the nonce in constant time. Reconciliation follows rules 1–5,
  verification follows §6 (including implicit preservation), and the `GoalView` projection matches the
  fixture exactly.
- **Grant writer.** It writes exactly the §12.2 schema. The goal record is always persisted before a
  grant revision is published, and STOPPED is persisted and published before a STOP is reported.
- **Server probes.** The capability and journal-summary probes use 2 000 ms timeouts and
  `redirect: 'error'`.
- **Dashboard actions.** `goal-status`, `goal-confirm`, `goal-stop` and `goal-reconcile`.
- **Agent tools.** Five tools, `workflow: "goal"` in `onshape_delegate_task`, and `goalId` in
  `onshape_complete_task`.
- **Result delivery.** The result goes out as the Lead's reply or through the outbound adapter. The
  delivery is recorded and never retried in a loop.
- **Exclusivity with the legacy path** is enforced in both directions, under the legacy store's lock.
- **Config and skill.** I added the `goals` config (off by default) and the
  `onshape-goal-iteration` skill.

**Status `blocked` because of CR-1.** The contract requires `goal-confirm` to receive the `nonce`, but no
contract channel delivers the nonce to the dashboard. `GoalView` §9 has no nonce field. The confirmation
therefore cannot be triggered through the contract as written, and the live E2E of the confirm path depends
on CR-1. Everything else is complete and does not depend on it. The verification core and the action take
the nonce exactly as the contract says. CR-2 and CR-3 are smaller gaps; see below.

## Changed files

`git diff --stat cc27dc0..af4c545` (base = prompt commit on top of `f937771`): 23 files, +5071 / −19.

| File | Purpose |
|---|---|
| `src/goal-scope.ts` (new) | Pure §2 scope validation, canonical JSON, `goalHash`, canonical feature hash (GW3 volatile keys) |
| `src/goal-lifecycle.ts` (new) | Pure parts: §3 transition table, §4.1 verification core, §5 rules 1–3 and classification, §6 evaluation, §12.2 grant builder/validator, §9 `GoalView`, bounded views, §7 result |
| `src/goal-store.ts` (new) | Durable private records (atomic replace, fsync of the file and its directory), non-waiting lock, store-wide exclusivity, grant writer, approval-file activity check |
| `src/goal-mcp.ts` (new) | `GET /capabilities` and `GET /goals/{id}/journal-summary` (2 000 ms, `redirect: 'error'`, bounded body, no retry) |
| `src/goal-service.ts` (new) | Transitions over store and writer: propose/revise/renew, status (expiry sweep), confirm (Candidate once), stop, reconcile, verify |
| `src/goal-tools.ts` (new) | Engineer and Lead goal tools (contextVersion 2 factories) and Lead-side delegation plus delivery |
| `src/goal-delivery.ts` (new) | §7 delivery: one attempt per Lead turn, recorded origin and delivery, failure recorded without provider text |
| `src/dashboard.ts` | Four goal gateway actions; legacy `mutation-approve` gets the `goal_active_conflict` check (the only allowed legacy change) |
| `src/mutation-workflow.ts` | `approve` gets an optional `assertNoGoalAuthority` hook that runs inside the store lock (default: no-op) |
| `src/index.ts` | `workflow: "goal"` and `goalId` for `onshape_delegate_task`, `goalId` for `onshape_complete_task`, outbound loader; goal tools registered last |
| `src/delegation.ts` | `workflow: "goal"`, `goalId`, signed `origin` in the envelope (GW1 fallback mechanism), `delegateGoalTask` |
| `src/rest.ts` | Read-only `goalFeatures` (v16), `goalWorkspaceMicroversion`, `goalCandidateExists` |
| `src/candidate-authorization.ts` | `operatorGoalCandidateAuthorization`: same operator authority; the binding may also be presented with `workspaceId = primaryWorkspaceId` (Candidate from Primary) |
| `src/config.ts`, `src/authorization-snapshot.ts`, `openclaw.plugin.json` | `goals {enabled, approvalDirectory}` config and schema, part of the authorization snapshot; five tools in `contracts.tools` and `toolMetadata` |
| `src/readiness.ts` | Operator texts for all goal plugin and server codes, plus the previously missing `mutation_approval_consumed` |
| `skills/onshape-goal-iteration/SKILL.md` (new) | The normative Engineer loop of §4.2 |
| `tests/contract.test.mjs` | Contract version `1.1.0-draft` plus digest, T1 vector, exact `GoalView` keys, types and values, T10 against the golden grant fixtures, capability fixtures, code coverage for the goal modules |
| `tests/goal-workflow.test.mjs`, `tests/fixtures/goal.mjs` (new) | T2–T11, exclusivity, GW3, probes against a 127.0.0.1 stub, bounded views |
| `tests/fixtures/features-response-goal-2026-10-21.json` (new) | GW3 features read with synthetic IDs, before and after |
| `tests/mcp-readiness.test.mjs` | The exact list of registered actions now also contains the four goal actions. This is an extension, not a weakening. |

## Checks

| Command | Baseline (`cc27dc0`) | After (`af4c545`) |
|---|---|---|
| `npm ci` | pass | pass |
| `npm run typecheck` | pass | pass |
| `npm test` | 149 tests, 147 pass, **2 fail** (contract version `0.4.0-draft` against the copy `1.1.0-draft`; missing text for `goal_not_found`). Expected after the fixture jump. | **174 tests, 174 pass, 0 fail** |
| `npm run test:native-files` | not run | `"status":"PASS"` (`powerLossDurability: UNVERIFIED`, unchanged) |
| `npm pack --dry-run` | not run | pass, 171 files. Contains `dist/goal-*.js` and `skills/onshape-goal-iteration/SKILL.md`. No `tests/`, `state/`, `.env` or `*.tgz`. The new test fixtures are under `tests/fixtures/` and are not packed. `docs/interface/fixtures/**` is packed as before. |
| `npx biome ci .` | pass (54 files) | pass (63 files, no fixes) |

- No `any` and no `@ts-ignore`.
- New `as` casts exist only at deserialization and API boundaries, each with a comment:
  - the private record in `validateRecord` and in the delivery entry;
  - validated payload objects in the dashboard and the tools;
  - the provider features array in `rest.ts`;
  - the JSON-Schema tool parameters.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| A1 | One confirmation, two different permitted updates, same Candidate, grant revision 1 written once | met | `T2 one confirmation, two different permitted updates in the same Candidate, grant revision 1 written once` (fixtures `update-depth` and `update-fillet-radius`; after COMPLETED the grant goes to revision 2 STOPPED, then `null`) |
| A2 | No second Candidate on refresh, plugin restart, or resume after STOP plus new confirmation | met | `T3 refresh, plugin restart and resume after STOP + new confirmation create no second Candidate`; `T3 an interrupted confirmation adopts its own Candidate attempt instead of creating a second one` |
| A3 | Confirmation rejects a wrong nonce or hash, an expired confirmation, a stale binding and missing admin; no grant and no Candidate | met | `T4 wrong nonce, wrong goalHash, expired confirmation, stale binding, missing operator.admin: no grant, no Candidate`; `T4 dashboard goal-confirm requires operator.admin before touching state` |
| A4 | STOP ordering, and STOP during reconciliation | met | `T5 STOP in each non-terminal state persists STOPPED and the grant before it is reported`; `T5 the record is persisted before the grant publish: a failing grant write leaves a STOPPED record`; `T5 STOP during RECONCILING writes STOPPED at once; reconciliation still completes and the goal ends STOPPED` |
| A5 | Reconciliation rules 1–5 | met | `T6 reconciliation rules 1–5: stale sequence, grace period, NOT_APPLIED and APPLIED_OR_SUPERSEDED` |
| A6 | Verification: notes and unverifiable checks never pass; implicit preservation; an unreconciled entry blocks success | met | `T7 verification: pass, fail, note never passes, implicit preservation, unverifiable and unreconciled entry`; `T7 a failed verification with the budget used up blocks the goal and narrows the grant` |
| A7 | Exclusivity with the legacy path in both directions; legacy suites unchanged | met (one test list extended) | `T8 exclusivity: one non-terminal goal; legacy UNKNOWN receipt or active approval file blocks confirmation`; `T8 legacy mutation-approve fails with goal_active_conflict while a goal is ACTIVE (dashboard wiring)` (with `fetch` stubbed to fail, so no network). All 149 baseline tests still pass. The only legacy test change is the extended action list in `mcp-readiness.test.mjs`. |
| A8 | Grant output valid against §12.2 for every transition | met | `T10 grant documents match the valid golden fixtures; invalid structural fixtures are rejected`. In addition, `grantTracker` validates every revision on disk and checks that revisions strictly increase in T2 and T3. The writer validates every document before writing it (`writeGoalGrant`). |
| A9 | GW1/GW2 evidence recorded; chosen origin mechanism tested | met | See *GW findings*. `T11/GW1 origin: Lead tool delivery context → signed goal request → goal record origin; tampering is rejected` |
| A10 | typecheck, `npm test` and `biome ci` pass; `npm pack --dry-run` lists the new skill and no test fixtures outside the existing patterns | met | Checks table |

Further tests:
- `T9 goal_unsupported when goals are disabled, the capability is missing or 404; status reports the capability`
- `T9 capability and journal-summary probes on a 127.0.0.1 stub: 200, 404, 503, redirect, reset, timeout`
- `GW3 canonical feature hash ignores the volatile keys of a recorded features read and nothing else`
- `T11 result delivery: lead-reply, outbound with a mocked adapter, failure code without a loop`
- `propose validates scope and Part Studio membership before writing; revise rules follow §3`
- `bounded projections: a large verification fits the A2A report, dashboard and tool limits`
- `T1 goalHash and canonical JSON equal the goal-hash vector; any scope field change changes the hash`
- `GoalView of an ACTIVE goal after two OK dispatches has exactly the fixture keys and types (§9)`

Two fixes started from a failing test:
- `37e3b0f`: failing test T3 (resume). A renew was taken for a revise, and the resume rejected the
  Candidate that the same scope had created.
- `af4c545`: failing test "bounded projections". A large verification exceeded the 32 768-character
  limit of the A2A result.

### GW findings (openclaw@2026.9.9, `node_modules/openclaw/dist`)

**GW1: the conversation target in the tool context is available.**
- `agent-harness-runtime-R8dTs5zl.d.ts:23217` defines `OpenClawPluginToolContextBase`, which carries
  `deliveryContext?: DeliveryContext` at `:23254`. The comment there reads "Trusted ambient delivery route
  for the active agent/session".
- The same type carries `delivery?: OpenClawPluginToolDelivery` at `:23256` and `getRuntimeConfig?` at
  `:23222`.
- `DeliveryContext` is defined in `reply-payload-DRFubeid.d.ts:486` as `{channel?, to?, accountId?,
  threadId?, deliveryIntent?}`.

The Engineer runs in an A2A context, so its own route is the A2A channel and not the user's conversation.
I therefore chose the combination the contract allows:
- **The Lead's tool context** provides `origin = {channel, target: deliveryContext.to, accountId}`
  (`leadOrigin`). This is host-provided and never taken from tool arguments.
- **The signed delegation envelope** carries it to the Engineer (§12 fallback mechanism). A goal request
  without an origin is rejected (`delegation_denied`), and a tampered origin fails the signature.

Outbound delivery uses:
- `PluginRuntimeChannel.outbound.loadAdapter` (`agent-harness-runtime-R8dTs5zl.d.ts:32165–32166`;
  `channel-core-5mS6rc1E.d.ts:49621`);
- `ChannelOutboundAdapter.sendText` (`outbound.types-DjHzlueC.d.ts:303`), with context
  `ChannelMessageSendTextContext {cfg, to, text, accountId?}` (`channel-core-5mS6rc1E.d.ts:9203`);
- `cfg` from `ctx.getRuntimeConfig?.() ?? ctx.runtimeConfig ?? ctx.config`.

Caveat: the ADR-2026-10-16 spike proved `sendText` to the command context's `ctx.from`. The same proof for
the tool context's `deliveryContext.to` is still open; see the E2E request.

**GW2: the confirmer identity is minimal.**
- `agent-harness-runtime-R8dTs5zl.d.ts:6798` defines `PluginSessionActionContext.client?: {connId?:
  string; scopes: string[]}` (`connId` at `:6805`).
- There is no user or operator identity, only the connection ID and the scopes.
- `confirmedBy = {kind: "dashboard-operator", clientId: connId}`. `clientId` is set only when `connId` is a
  bounded string.
- Authority is `operator.admin` in `scopes`. The action also checks it itself, in addition to the gateway's
  `requiredScopes`.

**GW3: volatile feature keys.**
- `VOLATILE_FEATURE_KEYS = ['nodeId', 'microversionSkew']`, plus every key that starts with `_`.
- They are fixed by `tests/fixtures/features-response-goal-2026-10-21.json` (synthetic IDs). The object
  shape is taken from the recorded live read in `docs/evidence/camera-mount-mcp-live-sprint-2026-10-12.json`
  (`BTMFeature-134`, `BTMParameterQuantity-147` with `nodeId`).
- **No complete recorded v16 response is available in the container.** The live E2E must therefore confirm
  that two reads of an unchanged feature yield the same hash. A typical risk would be other re-issued IDs
  in queries or sub-features.

## Contract deviations and change requests

There are no deviations in the code. Three change requests:

**CR-1 (blocking): the nonce never reaches the dashboard.**
- Channel and element: goal-workflow §4.1 `goal-confirm` input `nonce`, §9 `GoalView`.
- Current: `goal-confirm` requires `{goalId, nonce, expectedGoalHash}`, but neither `goal-status` nor any
  other channel delivers the nonce. `GoalView.confirmation` is `{expiresAt, confirmedAt, confirmedBy}`.
- Proposed diff (additive): §9, `confirmation: {"expiresAt", "confirmedAt", "confirmedBy", "nonce":
  "32-hex | null"}`, with this rule: "`nonce` is non-null only in `goal-status` (operator.read) while the
  state is `AWAITING_CONFIRMATION`; agent tools and signed reports always project `null`." The fixture
  `goal-view/active.json` would get `"nonce": null`.
- Rationale: the nonce binds the confirmation to exactly one proposal instance. It is not a secret against
  the operator, but it must not reach the agent, so that a VC verifier can later sign it.
- Assessment: additive for the plugin-facing contract `goal-1.0.0-draft` (a new field). The fixture copy
  changes. onshape-mcp is not affected.
- Implementing it is about five lines in `goalView` and the dashboard. I left it out until you decide.

**CR-2: write-back of `result.delivery`.**
- Channel and element: §7 step 3, "recorded in `result.delivery`".
- Current: the goal record lives in the Engineer plugin, but delivery happens in the Lead gateway, which is a
  separate process. No path for the write-back is specified.
- Implemented now: a Lead-side durable delivery receipt (`<stateDir>/claw-onshape/goal-deliveries/<goalId>.json`
  with origin, result digest, delivery or failure). The Lead tool result carries `goalResultDelivery`.
- The Engineer `GoalView.result.delivery` therefore stays empty.
- Proposal: either (a) state in the contract that `result.delivery` is recorded on the Lead side and
  appears in the Lead's tool result, or (b) add an optional signed `goalDelivery` field to the next
  `workflow: "goal"` delegation, which the Engineer records.
- Additive. onshape-mcp is not affected.

**CR-3: no way to close a STOPPED, EXPIRED or BLOCKED goal.**
- §1/§3: these states are non-terminal, and there is no transition to a terminal state except a lost
  binding or Candidate (FAILED).
- Consequence: after a STOP, no new goal can ever be started for this binding (`goal_active_conflict`). Only
  `revise` of the same goal, with the same Candidate, is possible.
- Proposal: an operator action `goal-close` (operator.admin) from STOPPED, EXPIRED or BLOCKED to FAILED or a
  new terminal `CLOSED`. The grant is released to `null` when the journal reports no unreconciled entry.
- Additive. onshape-mcp is not affected.

Interpretations within the contract (please confirm):
- **Wrong nonce → `goal_state_invalid`.** The contract has no dedicated code. Stale confirmation data
  matches "stale … data".
- **Exclusivity is store-wide**, not per binding: all bindings of one plugin instance share one
  `goal-grant.json`. This is stricter than §1.
- **Capability probe.** A 5xx, timeout, redirect, reset or malformed body gives `BLOCKED`, and `404` or a
  missing `goal-grant-v1` gives `UNSUPPORTED`.
  - `propose`, `confirm`, `reconcile` and `verify` then return `goal_unsupported`.
  - `goal-status` returns the view with `capability`.
  - `stop` works without the probe, because it only narrows authority.
- **Incomplete verification.** When a non-note check is `unverifiable` or the summary is unavailable, the
  verification is recorded and the action returns `goal_verification_incomplete`. A definitive failure
  returns `ok`, with `passed: false`.
- **A changed binding** is rejected with `authorization_changed` or `goal_not_found`. It does not drive the
  foreign goal into FAILED. FAILED is set only for a lost Candidate during `verify` (`provider_not_found`
  and the Candidate is missing from the workspace list).
- **Renew and revise.** A renew from `AWAITING_CONFIRMATION` is `goal_state_invalid`, as in the §3 table. A
  revise is also possible from `AWAITING_CONFIRMATION`.
- **Implicit checks** use `kind: "featureUnchanged"` with `conditionId: "implicit:<featureId>"`.
- **Response shapes.**
  - `goal-status` returns `{ok, goal, history}`.
  - The `onshape_complete_task` report carries `goal` as the §7 part (`reportView`: `goalId`,
    `scopeRevision`, `state`, `goalHash`, `result`, `capability`) and not the full `GoalView`, because of
    the 32 768-character A2A limit.
  - Views keep their keys and drop passing checks first when they are too large.
- **Two plugin-internal record fields not listed in §1:**
  - `lastGrantRevision` keeps revisions strictly increasing across a `null` reset;
  - `candidatePreparation` lets an interrupted creation be adopted.
  - In addition, a new grant carries over `reconciledThrough = max(reconciled)`. Otherwise the server would
    block an UNCERTAIN entry that was already reconciled.
- **Candidate creation.**
  - It reuses `RestClient.prepareCandidateWorkspace` with the binding presented as Primary
    (`operatorGoalCandidateAuthorization`).
  - A previously completed attempt in the shared candidate-attempt slot is acknowledged by the operator's
    confirmation (`replaceCompletedAttemptId`).
  - An unresolved attempt blocks the confirmation (`candidate_creation_unknown` or
    `candidate_verification_pending`).

## Live E2E request

Preconditions:
- **Plugin.** Build from `af4c545` or later.
- **Plugin config on the Engineer.** `goals: {enabled: true, approvalDirectory: <the plugin-side path of
  the directory that onshape-mcp mounts read-only as /run/onshape-approval>}`. This should be the same
  directory as `<localMcp.credentialDirectory>/mutation-approvals`.
- **Server.** onshape-mcp with §12: `goal_grant_file` set to `/run/onshape-approval/goal-grant.json`, and
  `dispatch_journal_dir` as a private rw directory owned by the server only.
- **Engineer binding.** It needs an `elementId`. `workspaceId` may be Primary or the legacy Candidate.
- **Skill.** The skill `onshape-goal-iteration` must be provisioned in the Engineer Workshop.
  `scripts/sync-engineer-workshop-skills.mjs` only lists the three old skills, so the rollout must add the
  new skill.
- **CR-1.** The confirm step needs CR-1, or a temporary operator path to read the nonce.

Verify and expected results:
1. `GET /capabilities` lists `goal-grant-v1`. `goal-status` shows `capability: AVAILABLE`.
2. Lead `onshape_delegate_task` with `workflow: "goal"`:
   - the Engineer calls `onshape_goal_propose`;
   - the record has `origin` equal to the Lead's Discord channel target (GW1 live).
3. Dashboard `goal-confirm` with the displayed `goalHash`:
   - exactly one new Candidate from Primary at `baseMicroversion`;
   - `goal-grant.json` revision 1 ACTIVE with the target equal to the Candidate.
4. Two different updates through native MCP in the same Candidate: both are admitted, and the journal
   summary shows `counted: 2`. There is no second confirmation and no new grant revision.
5. `onshape_goal_verify` gives COMPLETED, and the grant becomes STOPPED and then `null`. Primary is unchanged.
6. GW3 live: two features reads of the unchanged Candidate give the same canonical feature hashes, and
   implicit preservation passes.
7. Result delivery:
   - in the same conversation via `lead-reply`;
   - from another conversation via `outbound` `sendText` to `deliveryContext.to`, which is the live proof of
     the tool-context target.
8. STOP from the dashboard while the goal is ACTIVE: the next `onshape_api_call` returns `goal_grant_stopped`.
9. Legacy `mutation-approve` while a goal is ACTIVE returns `goal_active_conflict`.
10. GW4: measure the A2A timeout against long iterations. A resume with the same `goalId` works.

## Open points and risks

- **CR-1, CR-2 and CR-3** (above).
- **Lead STOP and Lead status run through the Engineer LLM.** The Lead tools `onshape_goal_stop` and
  `onshape_goal_status` delegate a fixed instruction over A2A, because the goal store lives in the Engineer
  gateway. That makes a Lead STOP best effort. The dashboard `goal-stop` and the Engineer's own
  `onshape_goal_stop` are the deterministic paths.
- **Lead tools are not tested end to end.** There is no full end-to-end test of the Lead tools with the A2A
  stub, because the A2A fetcher of `leadDelegate` cannot be injected. `delegateGoalTask` is tested with an
  injected fetcher.
- **Cross-lock race.** The goal confirmation holds the goal lock and, for the final check plus publish, the
  legacy store's lock (`mutationStore.exclusive`). The legacy `approve` runs inside that same lock and checks
  goal authority there. Both locks are non-waiting, so a parallel action fails with
  `connection_busy_or_state_unavailable` instead of waiting.
- **Shared candidate-attempt slot.** The goal confirmation and the legacy `candidate-prepare` share the slot
  per (owner, document). A legacy preparation that is `UNKNOWN` blocks the goal confirmation (fail closed).
- **Stale legacy receipts.** The legacy receipt reader rejects receipts whose binding `workspaceId` differs
  with `authorization_changed`. After the operator changes the `workspaceId`, old receipts also block the
  goal confirmation. This is fail closed and is existing behaviour.
- **Spec drift (G10, not changed):**
  - `spec.md:39` says "Agent tools accept an empty object only".
  - The tool table at `spec.md:41ff.` does not list the five goal tools, the extended
    `onshape_delegate_task`/`onshape_complete_task` parameters, or the four goal gateway actions.
  - `goals` config is missing.
  - Candidate creation from Primary on goal confirmation (`spec.md:31`, `:77`) is not described.
- **Skill contradiction (existing skill left unchanged).** `skills/onshape-edit-feature-parameters/SKILL.md`
  requires, before any write, a host context with an "approved payload/attempt", and otherwise the report
  "missing execution gate". This contradicts the goal loop, where the goal grant is the execution context.
  The new skill states that it replaces these steps for `workflow: "goal"`. I did not change the existing
  skill, because `agents/mechanical-engineer/exports/workshop-skills/` is the live Workshop snapshot with a
  manifest hash; a change belongs in the Workshop rollout. Proposal: one scope sentence in the edit skill
  that points to `onshape-goal-iteration`.
- **Foreign repo.** onshape-mcp is at `5d9af7a` on `feat/5-goal-grant`, which is `c8beefe` plus one
  docs-only commit (`docs/prompts/2026-10-21-goal-grant-admission.md`). The code state equals the state the
  prompt names.
- **Shared checkout.** The working tree contains uncommitted changes to `README.md`, `spec.md` and
  `docs/product/**` that are not mine (presumably from the Codex top-down team). I did not touch or commit
  them.

### Clawake needs

- Plugin (Engineer): `goals.enabled: true` and `goals.approvalDirectory`. Use an absolute path to the
  approval directory, which must be private (0700, plugin UID) and mounted read-only into onshape-mcp. This
  is the same directory as `approved-update.json`.
- Server: `goal_grant_file` (in that mount) and `dispatch_journal_dir` (rw, 0700, server UID, mounted into
  no other container).
- Lead: no new config. Its state dir must be persistent, because delivery receipts live under
  `claw-onshape/goal-deliveries/`.
- Skill rollout: `onshape-goal-iteration` must be added to the Workshop. The names list in
  `scripts/sync-engineer-workshop-skills.mjs` and the export manifest belong to the rollout.

### Notes for the UI wiring task (cockpit, #17)

Actions and their inputs:

| Action | Scope | Input | Response |
|---|---|---|---|
| `goal-status` | `operator.read` | `{connectionRef?}` | `{ok: true, goal: GoalView \| null, history: GoalView[≤10]}` |
| `goal-confirm` | `operator.admin` | `{connectionRef?, goalId, nonce, expectedGoalHash}` (nonce only with CR-1) | `{ok: true, goal}` |
| `goal-stop` | `operator.admin` | `{connectionRef?, goalId}` | `{ok: true, goal}` |
| `goal-reconcile` | `operator.admin` | `{connectionRef?, goalId, sequence, featureId, sourceMicroversion, admittedAt}` | `{ok: true, goal}` |

Every failure is `{ok: false, code, message}`. All of these are wrapped in the gateway result `{ok: true,
result: …}`.

`GoalView` fields the cockpit must render before offering confirm:
- `goalText`, `goalConditions[]` and `preservationConditions[]` (`id`, `kind`, `featureId`,
  `parameterId`, `expression`, `state`, `text`);
- `scope.featureIds`, `scope.maxDispatches`, `scope.lifetimeMs`;
- `target` (`documentId`, `elementId`, `primaryWorkspaceId`, `baseMicroversion`,
  `candidateWorkspaceId`, which is `null` while the plan is "create");
- `goalHash`, which must be sent unchanged as `expectedGoalHash`;
- `confirmation.expiresAt`.

Fields for ongoing goals:
- `state`, `confirmationRequired`, `capability`;
- `progress.dispatches` and `progress.remaining` (`null` means "unknown", never 0),
  `progress.unreconciledSequence`, `progress.lastOutcome`;
- `progress.lastVerification` (`passed`, `checks[]` with results `pass`, `fail` or `unverifiable`,
  `openLimits[]`);
- `grant` (`revision`, `state`, `expiresAt`) or `null`;
- `confirmation.confirmedAt` and `confirmedBy`;
- `result` (`state`, `summary`, `revisionUrl`, `openLimits`);
- `observedAt`.

The cockpit must never confirm automatically, in batches or on load.

### Commits (all with the trailers `Refs: edge-robot/clawonshape#18`, `Prompt: docs/prompts/2026-10-21-goal-authorization-plugin.md`, `Agent: ts-plugin-dev`, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)

- `6ebbdef` feat: ✨ pure goal scope, goalHash, lifecycle core and contract 1.1.0-draft tests
- `648f52c` feat: ✨ durable goal store, goal grant writer, goals config and goal REST reads
- `ba2e86d` feat: ✨ goal transitions and dashboard goal-status/confirm/stop/reconcile actions
- `5a27f1a` feat: ✨ goal agent tools, goal delegation with signed origin and result delivery
- `526b9b0` test: 🧪 goal workflow T2–T11, GW3 feature-hash fixture and exclusivity tests
- `37e3b0f` fix: 🐛 renew after STOP keeps the confirmed scope and resumes its own Candidate
- `fa877b9` docs: 📖 onshape-goal-iteration skill with the normative Engineer goal loop
- `af4c545` fix: 🐛 bound goal projections for the signed A2A report, dashboard and tool results
- followed by the commit of this report

## Out-of-scope findings

- `openclaw.plugin.json:4`: manifest `version` is `0.2.8`, but `package.json:3` is `0.2.10`.
- `scripts/sync-engineer-workshop-skills.mjs:10`: the fixed names list does not contain the new skill
  (rollout).
- `src/mutation-workflow.ts:176-187`: receipts become unreadable after the binding `workspaceId` changes
  (`authorization_changed`). This is fail closed, but an operator must clean up manually. Existing behaviour.
- `src/dashboard.ts:180`: the legacy `status`/`connect`/`disconnect` actions cast `action.payload` without a
  key check. Existing behaviour, not changed.
