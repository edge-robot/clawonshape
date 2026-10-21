# Interface contract: goal workflow (ClawOnshape plugin-facing)

| | |
|---|---|
| Contract-Version | `goal-1.0.0-draft` (requires server contract `onshape-mcp.md` ≥ `1.1.0-draft`, §12) |
| Status | **draft**: contract-first, not implemented |
| Owner | onshape-architekt (only the architect edits this file and `fixtures/goal-workflow/`) |
| ADR | [`docs/ADR.md`](../ADR.md) → "ADR-2026-10-21: Goal-scoped mutation authorization" |
| Issues | [edge-robot/clawonshape#18](https://github.com/edge-robot/clawonshape/issues/18) (this contract, plugin), [edge-robot/onshape-mcp#5](https://github.com/edge-robot/onshape-mcp/issues/5) (server), [#17](https://github.com/edge-robot/clawonshape/issues/17) (dashboard views, consumer) |
| Product source | `docs/product/dashboard-workflow-2026-10-21/README.md` (COC-GOAL-WORKFLOW-20261021, A3–A6, A8) |

Consumers: the dashboard (Codex top-down team, #17), the Lead and Engineer agents through plugin
tools, and the plugin's own grant writer (server contract §12). Normative words: **MUST**,
**MUST NOT**, **SHOULD**, **MAY**. Unverified runtime assumptions are marked ⚠️ and listed in §12.

---

## 1. Goal record (durable, plugin state)

Stored in a private state directory of the Engineer plugin (same rules as the candidate-attempt
store, `src/candidate-attempts.ts`), one file per goal, atomic replace. The record is the only
source of goal truth in the plugin; the dashboard and the agents read projections of it (§9).

| Field | Type | Rule |
|---|---|---|
| `goalId` | uuid-v4 | stable for the life of the goal, across scope revisions and resumes |
| `scopeRevision` | integer ≥ 1 | +1 on every scope change (§3 `revise`) |
| `scope` | object (§2) | immutable per `scopeRevision` |
| `goalHash` | sha256-hex | §2, over `scope` |
| `state` | enum (§3) | |
| `binding` | `{agentId, documentId, elementId, primaryWorkspaceId}` | the bound Engineer target; MUST equal the plugin binding at every transition, else `authorization_changed` |
| `candidateWorkspaceId` | 24-hex \| null | set once on the first confirmation, then never changed (one goal ↔ one Candidate) |
| `baseline` | `{microversionId, features: {[featureId]: sha256-hex}}` \| null | canonical-feature hashes of the Candidate at its first confirmation (§6) |
| `confirmation` | `{nonce, issuedAt, expiresAt, confirmedAt?, confirmedBy?}` | nonce 32 hex chars; `expiresAt = issuedAt + 1 800 000` (30 min) |
| `grant` | `{grantRevision, state, issuedAt, expiresAt, maxDispatches, reconciledThrough}` \| null | mirror of the last published `goal-grant.json` (server §12.2) |
| `reconciliations` | array of `{sequence, featureId, sourceMicroversion, admittedAt, observedMicroversion, outcome: "NOT_APPLIED" \| "APPLIED_OR_SUPERSEDED", reconciledAt}` | append-only |
| `verifications` | array of verification results (§6) | append-only, ≤ 50 kept |
| `result` | `{state, summary, verificationIndex, revisionUrl, openLimits[], delivery?}` \| null | set on a terminal state (§7) |
| `origin` | `{channel, target, accountId?}` | conversation target of the request that created the goal (§7) ⚠️ GW1 |
| `requester` | `{channel, senderId}` | from the signed delegation context |
| `createdAt`, `updatedAt` | Unix ms | |

**Exclusivity.** At most one non-terminal goal per binding (`goal_active_conflict`). A goal cannot
be confirmed while a legacy payload receipt is `UNKNOWN` or an approval v2 file is active
(`mutation_reconciliation_required`), and the legacy `mutation-approve` fails while a goal is
`ACTIVE` or `RECONCILING` (`goal_active_conflict`). This keeps "one authority at a time" (server §12.2)
true on the plugin side as well.

## 2. Scope and `goalHash`

```json
{
  "version": 1,
  "goalText": "string, 1..2000",
  "goalConditions": [Condition, "1..20, at least one non-note"],
  "preservationConditions": [Condition, "0..20"],
  "target": {"documentId": "24-hex", "elementId": "24-hex", "primaryWorkspaceId": "24-hex", "baseMicroversion": "24-hex"},
  "candidate": {"mode": "create" | "reuse", "workspaceId": "24-hex | null"},
  "operations": ["updatePartStudioFeature"],
  "featureIds": ["1..32 unique, sorted ascending, [A-Za-z0-9_]{1,64}"],
  "maxDispatches": "integer 1..25, default 10",
  "lifetimeMs": "integer 60000..28800000, default 7200000",
  "requester": {"channel": "string", "senderId": "string"},
  "origin": {"channel": "string", "target": "string"}
}
```

`Condition` = `{"id": "[a-z0-9-]{1,32}, unique per list", "kind": "parameterEquals" | "featureState" | "featureUnchanged" | "note", "featureId"?: string, "parameterId"?: string, "expression"?: string (1..200), "state"?: "OK", "text": string (1..500)}`

| `kind` | Required fields | Checked by (§6) |
|---|---|---|
| `parameterEquals` | `featureId`, `parameterId`, `expression` | trimmed expression of the parameter equals `expression` exactly |
| `featureState` | `featureId`, `state` | feature status reported by the features read equals `state` |
| `featureUnchanged` | `featureId` | canonical feature hash equals the baseline hash |
| `note` | — | not machine-checkable; always reported as an open limit, never as passed |

`goalHash` = lowercase SHA-256 hex of the canonical JSON of `scope`: keys sorted lexicographically
at every level, no insignificant whitespace, UTF-8, arrays in the given order (`featureIds` sorted
before hashing). Test vector: `fixtures/goal-workflow/goal-hash/vector.json`.

`candidate.mode = "reuse"` only for a revision or resume of the same `goalId`, with its
`candidateWorkspaceId`. A new goal always uses `"create"`.

## 3. Lifecycle

States: `AWAITING_CONFIRMATION`, `ACTIVE`, `RECONCILING`, `BLOCKED`, `STOPPED`, `EXPIRED`,
`COMPLETED`, `FAILED`. Terminal: `COMPLETED`, `FAILED`. `STOPPED` and `EXPIRED` are resumable only
through a new confirmation (D4).

| From | Event (actor) | Guard | To | Grant effect |
|---|---|---|---|---|
| — | `propose` (Engineer tool) | binding valid; no other non-terminal goal; scope valid | `AWAITING_CONFIRMATION` | none |
| `AWAITING_CONFIRMATION`, `STOPPED`, `EXPIRED`, `BLOCKED` | `revise` (Engineer tool, new scope) | same `goalId`; `candidate.mode = "reuse"` if a Candidate exists | `AWAITING_CONFIRMATION` (`scopeRevision`+1, new nonce) | `STOPPED` or `null` stays |
| `STOPPED`, `EXPIRED`, `BLOCKED` | `renew` (Engineer tool, unchanged scope) | scope revision unchanged | `AWAITING_CONFIRMATION` (new nonce) | stays |
| `AWAITING_CONFIRMATION` | `confirm` (dashboard "Verify Candidate") | §4.1 verification core passes | `ACTIVE` | new revision `ACTIVE`, fresh `issuedAt`/`expiresAt`/`maxDispatches` |
| `AWAITING_CONFIRMATION` | confirmation expiry | `now ≥ confirmation.expiresAt` | `EXPIRED` | none |
| `ACTIVE` | uncertain outcome reported (`reconcile` with data) or `goal_reconciliation_required` seen | — | `RECONCILING` | none |
| `RECONCILING` | `reconcile` completes (§5) | — | `ACTIVE` (or the pending STOP target) | new revision, `reconciledThrough = sequence` |
| `ACTIVE` | `verify` passes (§6) | journal has no unreconciled entry | `COMPLETED` | revision `STOPPED`, then `null` |
| `ACTIVE` | `verify` fails and `counted ≥ maxDispatches` | — | `BLOCKED` | revision `STOPPED` |
| `ACTIVE`, `RECONCILING`, `AWAITING_CONFIRMATION`, `BLOCKED` | `stop` (dashboard or any bound agent) | — | `STOPPED` | revision `STOPPED` (written **before** the record state changes to `STOPPED` is reported) |
| `ACTIVE`, `RECONCILING` | grant expiry | `now ≥ grant.expiresAt` | `EXPIRED` | revision `STOPPED` |
| any non-terminal | binding/Candidate lost (Candidate deleted, binding changed, Primary target changed) | — | `FAILED` | `null` |

`stop` during `RECONCILING` writes `STOPPED` immediately; reconciliation still completes and is
recorded, and the goal ends in `STOPPED`. Executed changes are never rolled back.
`grant` is set to `null` only when the goal is terminal or `STOPPED`/`EXPIRED`/`BLOCKED` **and**
`GET /goals/{goalId}/journal-summary` reports `unreconciledSequence: null`.

## 4. Actions

All actions return `{ok: true, goal: GoalView}` (§9) or `{ok: false, code, message}` with the code
from §8 or server §6 unchanged. No action retries a provider write.

### 4.1 Dashboard gateway methods (Engineer gateway)

| Action | Scope | Input | Effect |
|---|---|---|---|
| `goal-status` | `operator.read` | `{connectionRef?}` | current goal (or `null`) and the last 10 terminal goals as `GoalView`; reads the journal summary (server §12.7); no provider write |
| `goal-confirm` ("Verify Candidate") | `operator.admin` | `{connectionRef?, goalId, nonce, expectedGoalHash}` | runs the **verification core** `verifyGoalConfirmation({record, nonce, expectedGoalHash, confirmer, now})` (pure function: nonce equal in constant time, `now < confirmation.expiresAt`, `goalHash` recomputed from `scope` equals `expectedGoalHash` and the record, state `AWAITING_CONFIRMATION`, binding current, confirmer has authority); then creates the Candidate from Primary at `scope.target.baseMicroversion` (mode `create`, REST `OAuth2Write`, existing candidate path) or checks the reused Candidate; records `baseline` on first confirmation; writes the grant `ACTIVE`; state `ACTIVE`. `confirmedBy = {kind: "dashboard-operator", clientId?}` ⚠️ GW2 |
| `goal-stop` | `operator.admin` | `{connectionRef?, goalId}` | §3 `stop` |
| `goal-reconcile` | `operator.admin` | `{connectionRef?, goalId, sequence, featureId, sourceMicroversion, admittedAt}` | §5 |

The dashboard MUST show `goalText`, every condition, `featureIds`, budget, lifetime, target and
Candidate plan **before** offering `goal-confirm`, and MUST send the `goalHash` it displayed. It MUST
NOT confirm automatically, in batches, or on load. The verification core is the seam that a
Verifiable Credential verifier replaces later (ADR-2026-10-21 D1); its inputs and outputs MUST NOT
depend on the dashboard.

### 4.2 Agent tools

| Tool | Agent | Input | Effect |
|---|---|---|---|
| `onshape_goal_propose` | Engineer | `{request (signed Lead context), goalText, goalConditions, preservationConditions?, featureIds, maxDispatches?, lifetimeMinutes?, goalId? (revise/renew)}` | reads Primary `baseMicroversion` and the features (REST, read); every `featureId` MUST exist in the Part Studio, else `invalid_arguments`; builds `scope`, `goalHash`, nonce; state `AWAITING_CONFIRMATION`; returns `GoalView` with `confirmationRequired: true`. Never confirms. |
| `onshape_goal_status` | Lead, Engineer | `{goalId?}` | `GoalView`; for the Engineer also `execution: {candidateWorkspaceId, featureIds, operation, remaining, grantExpiresAt}` when `ACTIVE` |
| `onshape_goal_reconcile` | Engineer | `{goalId, sequence, featureId, sourceMicroversion, admittedAt}` (copied from the server error `data`) | §5 |
| `onshape_goal_verify` | Engineer | `{goalId}` | §6; may transition to `COMPLETED` or `BLOCKED` |
| `onshape_goal_stop` | Lead, Engineer | `{goalId, reason (1..500)}` | §3 `stop`; STOP is always permitted for the bound agents because it only narrows authority |

The Lead delegates goal work with `onshape_delegate_task` `workflow: "goal"` (new enum value) and
`goalId` (optional on the first, proposing delegation). Engineer loop, normative for the skill:
`onshape_goal_status` → read features through MCP → one `onshape__onshape_api_call` built on the
re-read `sourceMicroversion` → on `mutation_outcome_unknown_reconcile_required` or
`goal_reconciliation_required`: `onshape_goal_reconcile` with the error `data`, never a blind retry →
repeat → `onshape_goal_verify` → `onshape_complete_task` with `goalId`. On `goal_grant_stopped`,
`goal_grant_invalid` or `goal_budget_exhausted`: stop and report.

## 5. Reconciliation

Input from the server error data (server §12.4). In this order:

1. `sequence` ≤ the current `grant.reconciledThrough` → idempotent success, no grant change.
2. Journal summary `unreconciledSequence` ≠ `sequence` → `goal_state_invalid` (the agent passed stale
   data). If the summary is unavailable → `mcp_discovery_failed`, state stays `RECONCILING`.
3. `now < admittedAt + 60 000` → `mutation_outcome_unknown`, stays `RECONCILING` (covers the 30 s
   server timeout, as approval v2 rule 4).
4. Read the Candidate's current microversion (REST). Equal to `sourceMicroversion` →
   `NOT_APPLIED`; different → `APPLIED_OR_SUPERSEDED`. Read failure → stays `RECONCILING`.
5. Append the reconciliation, publish a new grant revision with `reconciledThrough = sequence`
   (`state` `ACTIVE`, or `STOPPED` if a STOP is pending), set the goal state.

Reconciliation never judges whether the change was right; the goal verification (§6) does.

## 6. Independent goal verification

`onshape_goal_verify` reads the Candidate features at its current microversion through the
plugin's REST client (read-only, never MCP) and evaluates:

- every goal condition and preservation condition per §2;
- **implicit preservation:** every feature whose ID is not in `featureIds` and that existed in the
  baseline has an unchanged canonical feature hash; a removed baseline feature fails.

Canonical feature hash = SHA-256 of the canonical JSON (as §2) of the feature object from the
features read, without volatile fields (`nodeId`, `microversionSkew`, any key starting with `_`).
⚠️ GW3: the exact volatile field list is fixed by the plugin tests against a recorded features
response.

Result `{verifiedAt, microversionId, passed, checks: [{conditionId | "implicit:<featureId>", kind, result: "pass" | "fail" | "unverifiable", observed}], openLimits: [note texts]}`.
`passed` is true only if every non-note check is `pass` **and** the journal summary reports no
unreconciled entry. `unverifiable` never counts as `pass`. Tool success and legacy `VERIFIED`
receipts are never used as goal evidence.

## 7. Result in the original channel

On `COMPLETED`, `BLOCKED`, `STOPPED`, `EXPIRED` or `FAILED` the goal gets a `result` with summary,
the last verification, open limits and the Candidate revision URL
(`https://cad.onshape.com/documents/{d}/w/{candidate}/m/{microversion}/e/{e}`, F4 check pending).
Delivery:

1. The Engineer returns the result in its signed `onshape_complete_task` report (`goalId` field).
2. The Lead posts it in the conversation that delegated the goal. If the Lead's current
   conversation is not `origin`, the Lead plugin sends it to `origin` through
   `api.runtime.channel.outbound.loadAdapter(origin.channel)` → `sendText`, as proven in the
   ADR-2026-10-16 spike (target = the host-provided conversation target, never self-built).
3. The delivery is recorded in `result.delivery = {deliveredAt, via: "lead-reply" | "outbound", channel, target}`;
   failure → `goal_result_delivery_failed`, retried only on the next Lead turn, never as a loop.

⚠️ GW1: whether a tool context (not a command context) exposes the conversation target needed for
`origin` is unverified; the plugin task verifies it against the SDK types first.

## 8. Plugin error codes (added to `fixtures/error-codes.json` `plugin`)

| Code | Meaning |
|---|---|
| `goal_unsupported` | server capability lacks `goal-grant-v1` or goals disabled in config |
| `goal_not_found` | unknown `goalId` for this binding |
| `goal_active_conflict` | another non-terminal goal exists, or legacy approval attempted while a goal is active |
| `goal_hash_mismatch` | displayed/expected `goalHash` differs from the record |
| `goal_confirmation_expired` | `now ≥ confirmation.expiresAt` |
| `goal_state_invalid` | event not allowed in the current state, or stale reconciliation data |
| `goal_candidate_mismatch` | reused Candidate missing or not derived from the binding's document |
| `goal_verification_incomplete` | verification could not evaluate a required check |
| `goal_result_delivery_failed` | result could not be posted to `origin` |

Server codes (`goal_*`, `mutation_authority_conflict`, `dispatch_journal_unavailable`) pass through
unchanged (server §6, 0.4.0 rule).

## 9. Normalized status model `GoalView`

One projection for the dashboard and the agents (MVC, #2). The dashboard renders it; it never
derives state itself.

```json
{
  "goalId": "uuid", "scopeRevision": 1, "state": "ACTIVE",
  "goalText": "…", "goalConditions": [], "preservationConditions": [],
  "goalHash": "sha256", "confirmationRequired": false,
  "target": {"documentId": "…", "elementId": "…", "primaryWorkspaceId": "…", "candidateWorkspaceId": "… | null", "baseMicroversion": "…"},
  "scope": {"featureIds": [], "operations": ["updatePartStudioFeature"], "maxDispatches": 10, "lifetimeMs": 7200000},
  "progress": {"dispatches": 0, "remaining": 10, "unreconciledSequence": null, "lastOutcome": null, "lastVerification": null},
  "grant": {"revision": 1, "state": "ACTIVE", "expiresAt": 0} ,
  "confirmation": {"expiresAt": 0, "confirmedAt": null, "confirmedBy": null},
  "result": null,
  "capability": "AVAILABLE | UNSUPPORTED | BLOCKED",
  "observedAt": 0
}
```

`progress` comes from the server journal summary (authoritative), never from agent claims. If the
summary is unavailable, `progress.dispatches` is `null` and the dashboard shows "unknown".
Fixture: `fixtures/goal-workflow/goal-view/active.json`.

## 10. Configuration and capability

Plugin config `goals: {enabled: boolean (default false), approvalDirectory}` (the grant lives next
to `approved-update.json`). The goal path is `AVAILABLE` only if enabled and the server lists
`goal-grant-v1` (server §12.7); otherwise every goal action returns `goal_unsupported` and the
dashboard keeps the goal panel blocked. Clawake provisions `goal_grant_file` and
`dispatch_journal_dir` for the server and `goals.enabled` for the plugin (follow-up issue in
edge-robot/clawake).

## 11. Migration and tests

- Additive: the payload approval path, its dashboard operator actions and their tests stay unchanged
  until the goal path is live-accepted; removing them is a later major step (contract §9 four steps).
- No automatic or batch payload approval is introduced anywhere.

Required local tests (plugin, fixtures and mocked REST/MCP; mapped to product A3–A6):

| # | Test |
|---|---|
| T1 | `goalHash` equals `fixtures/goal-workflow/goal-hash/vector.json`; any scope field change changes it |
| T2 | propose → confirm → two different permitted feature updates (fixture requests `update-depth`, `update-fillet-radius`) in the same Candidate with one confirmation; grant written once (`grantRevision` 1); `candidateWorkspaceId` unchanged |
| T3 | refresh, restart of the plugin (reload the store) and resume after STOP + new confirmation create no second Candidate |
| T4 | confirm with wrong nonce, wrong `goalHash`, expired confirmation, stale binding, missing `operator.admin` → rejected, no grant written, no Candidate created |
| T5 | STOP in each non-terminal state writes `STOPPED` before reporting; STOP during `RECONCILING` ends in `STOPPED` after reconciliation |
| T6 | reconciliation rules 1–5 incl. stale sequence, grace period, `NOT_APPLIED` / `APPLIED_OR_SUPERSEDED` |
| T7 | verification: pass, fail, `note` never passes, implicit preservation failure, unverifiable → not passed, unreconciled entry → not passed |
| T8 | exclusivity with the legacy path (both directions) |
| T9 | `goal_unsupported` when the capability is missing or `404` |
| T10 | grant writer output validates against the server contract §12.2 for every transition (structure, caps, revisions strictly increasing) |
| T11 | result delivery record for lead-reply and outbound (mocked adapter), failure code without loop |

Server-side negative tests (scope, Primary, budget, duplicate, uncertain, restart, STOP race) are in
`onshape-mcp` against `expectations.json` `goal-grant`.

## 12. Open points

| ID | Point | Resolution path |
|---|---|---|
| GW1 | Conversation target (`origin`) availability in the tool context | ts-plugin-dev verifies against `node_modules/openclaw` SDK types; fallback: origin from the signed delegation context set by the Lead's `onshape_delegate_task` |
| GW2 | Dashboard confirmer identity: which client identity the gateway exposes to plugin actions | verify in the SDK; record whatever is available, at minimum `kind` |
| GW3 | Volatile fields of the features response for the canonical feature hash | fixed by a recorded response in plugin tests |
| GW4 | A2A delegation timeout vs. long goal iterations | measure in the live E2E; the goal state is durable, so a timed-out delegation can be resumed with `workflow: "goal"` and the same `goalId` |

## Changelog

- `goal-1.0.0-draft` (2026-10-21): initial contract-first draft (ADR-2026-10-21, #18).
