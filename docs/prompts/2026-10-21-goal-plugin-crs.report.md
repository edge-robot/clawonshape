---
prompt: docs/prompts/2026-10-21-goal-plugin-crs.md
branch: feat/18-goal-authorization
commits: ddbffdd..5d3403d
status: done
contract-version: 1.1.0-draft
e2e-request: required
---
# Report: Goal plugin follow-up: confirmation nonce, goal-close, fixture digest (#18)

## Summary

All three accepted change requests are implemented against the amended contract (`297512c`, fixture digest
`sha256:788b253f…`):

- **CR-1:** `GoalView.confirmation.nonce` is `null` in every projection. Only the dashboard `goal-status`
  view of the current goal carries it, and only while the goal is `AWAITING_CONFIRMATION`
  (`operatorNonceView`). A real dashboard end-to-end test runs propose → `goal-status` → `goal-confirm`
  against a stubbed Onshape REST `fetch`, with no network.
- **CR-3:** The new `goal-close` dashboard action (`operator.admin`) moves a goal from `STOPPED`,
  `EXPIRED` or `BLOCKED` to the terminal state `CLOSED` and resets the grant to `null`.
  - It is guarded by the journal summary: an unreconciled entry gives `goal_reconciliation_required`.
  - An unavailable summary fails closed with `mcp_discovery_failed`, the same code as §5 rule 2.
  - After `CLOSED`, a new goal for the same binding can be proposed and gets its own Candidate.
- **CR-2:** I reshaped the Lead receipt to the §7 step 3 wording: `{goalId, origin, resultDigest,
  deliveredAt | failure, via}`. It is returned as `goalResultDelivery`, now also on failure, together
  with `code` and `message`.

Two further changes:

- **Server error data (§12.3 CR-5).** I fixed a bug that the prompt asked me to check.
  - The unknown-outcome `data` merges the §6 object (`outcome`, `retryAllowed`, `reconciliationRequired`).
    onshape-mcp `goal_behaviour.rs` `uncertain` at `39815f8` asserts this shape.
  - `onshape_goal_reconcile` rejected that data with `invalid_arguments`, although the skill says to pass
    it unchanged.
  - It now accepts these three fields with exactly the values the server sends and ignores them. Any
    other value or key is still rejected.
- **Manifest version.** The `openclaw.plugin.json` version is now `0.2.10`, the same as `package.json`.
  This is in its own commit.

No new error codes were needed.

## Changed files

`git diff --stat dbba3a6..5d3403d`: 10 files, +530 / −31.

| File | Purpose |
|---|---|
| `src/goal-lifecycle.ts` | State `CLOSED` (terminal), event `close`, `confirmation.nonce: null` in `goalView`, `operatorNonceView` |
| `src/goal-service.ts` | `goalStatus(..., {operatorNonce})` and `closeGoal` (journal guard, record before grant `null`) |
| `src/dashboard.ts` | `goal-status` with the operator nonce; new action `goal-close` |
| `src/goal-delivery.ts` | §7 receipt shape; `DeliveryFailure` carries the recorded receipt |
| `src/goal-tools.ts` | `goalResultDelivery` on failure includes the receipt; `reconcileToolInput` accepts the server data unchanged |
| `openclaw.plugin.json` | `version` changed from `0.2.8` to `0.2.10` (no other change) |
| `tests/contract.test.mjs` | Fixture digest `788b253f…` (the GoalView fixture test now checks `nonce: null`) |
| `tests/mcp-readiness.test.mjs` | The action registry also contains `goal-close` |
| `tests/goal-workflow.test.mjs` | T11 asserts the §7 receipt fields |
| `tests/goal-crs.test.mjs` (new) | Tests for CR-1, CR-3, CR-5 and the manifest version |

## Checks

| Command | Before (`dbba3a6`, with the new digest) | After (`5d3403d`) |
|---|---|---|
| `npm ci` | pass | pass |
| `npm run typecheck` | pass | pass |
| `npm test` | 174 tests, 173 pass, 1 fail (GoalView fixture without `confirmation.nonce`, expected) | **183 tests, 183 pass** |
| `npm run test:native-files` | — | `"status":"PASS"` |
| `npm pack --dry-run` | — | pass, 173 files, including `skills/onshape-goal-iteration/SKILL.md`. No `tests/`, `state/` or `.env`. |
| `npx biome ci .` | — | pass (64 files, no fixes) |

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| A1 | The nonce is reachable for the operator and never for agents | met | `CR-1 the nonce is in the operator goal-status view only while AWAITING_CONFIRMATION` covers: AWAITING visible; ACTIVE, STOPPED and goal-stop responses `null`; a renew gives a new nonce; the signed report part has no `confirmation`. `CR-1 agent tools never see the nonce (Engineer onshape_goal_status through the registered plugin)` covers the agent tool. `GoalView … exactly the fixture keys and types` checks `nonce: null`. |
| A2 | Confirm path end to end through `goal-status` → `goal-confirm` | met | `CR-1 end to end: propose → dashboard goal-status nonce → dashboard goal-confirm creates the Candidate once`. It runs the real dashboard actions, the existing candidate path and goal reads against a stubbed REST `fetch`; it checks exactly one POST and grant revision 1, and that a replay gives `goal_state_invalid` without provider I/O. |
| A3 | `goal-close` rules and the new-goal-after-close behaviour | met | `CR-3 goal-close from STOPPED, EXPIRED and BLOCKED ends the goal and resets the grant to null`; `CR-3 goal-close is rejected from ACTIVE, RECONCILING, AWAITING_CONFIRMATION and every terminal state`; `CR-3 goal-close waits for reconciliation and fails closed without a journal summary`; `CR-3 after CLOSED a new goal for the same binding can be proposed and gets a new Candidate` (also covers dashboard admin-only and strict input); registry: `operator scope is checked before native reads; …` |
| A4 | Lead-side receipt matches §7 | met | `T11 result delivery: lead-reply, outbound with a mocked adapter, failure code without a loop` asserts the receipt keys `{deliveredAt, goalId, origin, resultDigest, via}` and the `failure: {failedAt, code}` record. Code: `DeliveryReceipt` in `src/goal-delivery.ts` and `goalResultDelivery` in `src/goal-tools.ts`. |
| A5 | typecheck, `npm test` (≥ 174), `biome ci` and `npm pack --dry-run` pass | met | Checks table (183 tests) |

The fix started with a failing test: `§12.3 CR-5: the unknown-outcome error data is accepted unchanged by
onshape_goal_reconcile`.

## Review of possible foreign changes (architect note, Codex openclaw-dev 12:20–12:45)

The architect's note arrived after I had committed `ddbffdd..287feb8`. I therefore reviewed the whole
committed range `dbba3a6..HEAD` hunk by hunk.

**Commits.** All five commits in the range are mine, with the trailers of this prompt. There is no
foreign commit.

**Hunks.** I could trace every hunk in `src/`, `openclaw.plugin.json` and `tests/` to one of my own edit
steps in this session:

| File | Hunks | Traced to | Decision |
|---|---|---|---|
| `src/goal-lifecycle.ts` | `CLOSED` state, `close` event, `confirmation.nonce`, `operatorNonceView` | my CR-1/CR-3 edit | kept |
| `src/goal-service.ts` | `operatorNonce` option, `closeGoal` | my edit | kept |
| `src/dashboard.ts` | `goal-close` action, operator nonce in `goal-status` | my edit | kept |
| `src/goal-delivery.ts` | §7 receipt, `DeliveryFailure` | my edit | kept |
| `src/goal-tools.ts` | receipt on failure, `reconcileToolInput` | my edit | kept |
| `tests/contract.test.mjs` | digest line only | my edit | kept |
| `tests/goal-workflow.test.mjs` | T11 receipt assertions | my edit | kept |
| `tests/mcp-readiness.test.mjs` | `goal-close` registry entry | my edit | kept |
| `openclaw.plugin.json` | `version` → `0.2.10` only | my edit | kept |

The only formatting difference is that Biome put the `GoalEvent` union on one line.

**`tests/goal-crs.test.mjs`.** When I wrote this file, it did not exist; the Write tool reported it as
newly created. The committed file contains exactly my 9 tests.

**Duplicates.** There is exactly one implementation each of `closeGoal`, `operatorNonceView`, `goal-close`,
`reconcileToolInput` and `DeliveryFailure`, and no test name occurs twice across `tests/*.mjs`.

**Working tree.** No uncommitted changes remain in `src/`, `tests/`, `skills/`, `package.json` or
`openclaw.plugin.json`.

**Result.**
- **Kept:** all hunks above. I could not identify any of them as foreign.
- **Changed:** none.
- **Dropped:** none.

If foreign edits happened in the window, they were either overwritten or matched mine. Note that I
staged whole files, so my commits contain the working-tree state of each file at commit time. The diff
review above is the evidence that nothing beyond my own changes is in them.

**Fresh checks after the review**, from a clean `dist/`:

| Command | Result |
|---|---|
| `npm ci` | pass |
| `npm run typecheck` | pass |
| `npm test` | 183 tests, 183 pass |
| `npm run test:native-files` | `PASS` |
| `npm pack --dry-run` | pass, 174 files |
| `npx biome ci .` | pass |

I did not touch, stage or commit `README.md`, `spec.md` or `docs/product/**`.

## Foreign hunks

Per-file findings on the parallel work by Codex openclaw-dev (about 12:20–12:45).

**Limits of my evidence.** I did not take a snapshot of the working tree when this task started; the
preflight command that would have shown `git status` was denied. I therefore cannot see foreign changes
directly. My evidence is indirect and has three parts:

1. Each of my scripted edits replaced an exact baseline text and aborts if that text is missing. A
   successful edit proves that this part of the file still matched `dbba3a6` at that moment.
2. The tool reported "modified on disk since you last read it" in some cases.
3. The final diff `dbba3a6..HEAD` contains only hunks that match my edits.

| File | What I found | Decision |
|---|---|---|
| `tests/goal-crs.test.mjs` | When I wrote the file, the Write tool reported it as newly *created*. So no file existed at that moment; a foreign copy would have made the tool refuse to write, because I had not read it. The committed file contains exactly my 9 tests. I cannot tell whether a foreign version existed earlier and was deleted, or whether one was written later and then replaced by mine. | Committed content is mine; nothing foreign kept. A foreign version, if any, was not used: dropped. |
| `src/goal-lifecycle.ts` | My edit script found all six baseline texts it replaces, so those parts were unchanged when I edited. The later "modified" notice came from my own `biome format` run (the tool named that command as the cause). The final diff contains only my CR-1/CR-3 hunks. I cannot tell whether a foreign edit elsewhere in the file was overwritten before my edit or never existed; none is in the result. | Mine kept; no foreign hunk present: nothing kept, nothing rewritten. |
| `tests/contract.test.mjs` | When I edited the digest, the Edit tool reported that the file had been modified on disk since my last read (last read in the previous session, before my own Biome formatting run). The old digest was still present, so nobody had changed the digest yet. The final diff against `dbba3a6` is only the digest line. **I cannot tell** whether the disk change was foreign or my own earlier formatting. Either way, nothing beyond the digest line is in the result. | Digest line (mine) kept; any other change is not present: dropped or never existed. |
| `openclaw.plugin.json` | My version script replaces `"version": "0.2.8"` and aborts if that text is missing. It succeeded, so the file still said `0.2.8` when I edited it, and the `0.2.10` the architect mentions was not on disk at that moment. The final diff is only the version line. I cannot tell whether a foreign `0.2.10` edit came earlier and was reverted, or came later and matched mine. | Version line identical to the prompt's requirement; kept as my commit `080b8d9`. |
| `src/dashboard.ts`, `src/goal-service.ts`, `src/goal-delivery.ts`, `src/goal-tools.ts`, `tests/mcp-readiness.test.mjs`, `tests/goal-workflow.test.mjs` | All my scripted replacements found their exact baseline texts, and the final diff contains only my hunks. I saw no "modified on disk" notice for these files in this task. | No foreign hunk found: nothing kept, rewritten or dropped. |
| `README.md`, `spec.md`, `docs/product/**` | Uncommitted changes owned by Codex. | Not touched, staged or committed. |

**Summary.** I could not identify any foreign hunk in the committed result. For `tests/contract.test.mjs`
(the disk-change notice) and for the possible earlier or later foreign versions of `tests/goal-crs.test.mjs`
and `openclaw.plugin.json`, I cannot tell whether foreign content ever existed. If it did, it was replaced
by or identical to my changes.

## Contract deviations and change requests

None. Interpretations within the amended text:

- **`goal-close` on a missing summary** returns `mcp_discovery_failed`, as in §5 rule 2. The prompt only
  says "fails closed".
- **`CLOSED` keeps the existing `result`** of the stop, expiry or block. §7 does not list `CLOSED`, so no
  new result is created for delivery.
- **The dashboard `goal-reconcile` input stays strict** (the contract §4.1 field list). The tolerance for
  the §6 fields applies only to the agent tool, which receives the raw MCP error data.

## Live E2E request

Same preconditions as in `2026-10-21-goal-authorization-plugin.report.md`. CR-1 no longer blocks.

1. `goal-status` shows `confirmation.nonce` while the goal is `AWAITING_CONFIRMATION`. The cockpit sends it
   together with the displayed `goalHash` to `goal-confirm`. Expected: exactly one Candidate and
   grant revision 1. Then `nonce` is `null`.
2. Engineer `onshape_goal_status` and the Lead report never contain the nonce. Check the session logs.
3. An unknown outcome (for example a provider timeout): the Engineer passes the MCP error `data` unchanged
   to `onshape_goal_reconcile`. Expected: accepted, with no `invalid_arguments`.
4. STOP, then `goal-close`. Expected: `goal-grant.json` is `null`, and a new goal can be proposed. Its
   confirmation creates a new Candidate.
5. Result delivery from another conversation. Expected: the Lead tool result contains
   `goalResultDelivery` with `via: "outbound"`, and the receipt file is in the Lead state under
   `claw-onshape/goal-deliveries/`.

## Updated UI notes (cockpit, #17)

- **`goal-status`** (`operator.read`, `{connectionRef?}`): returns `{ok: true, goal: GoalView | null,
  history: GoalView[≤10]}`.
  - New: `goal.confirmation.nonce` (32 hex characters) while `goal.state === "AWAITING_CONFIRMATION"`,
    otherwise `null`.
  - History entries always have `null`.
- **`goal-confirm`** (`operator.admin`): input `{connectionRef?, goalId, nonce, expectedGoalHash}`.
  - `nonce` and `expectedGoalHash` must be the values shown by `goal-status`.
  - A newer `goal-status` (after a renew or revise) has a new nonce, and the old one gives
    `goal_state_invalid`.
- **`goal-close`** (`operator.admin`): input `{connectionRef?, goalId}`, response `{ok: true, goal}` with
  `goal.state === "CLOSED"` and `goal.grant === null`.
  - Offer it only for `STOPPED`, `EXPIRED` or `BLOCKED`.
  - Errors: `goal_state_invalid` (wrong state), `goal_reconciliation_required` (show "reconcile first"),
    `mcp_discovery_failed` (journal summary unavailable).
  - After closing, the goal appears in `history` and the current slot is free.
- The new state `CLOSED` is terminal. Render it like `COMPLETED` and `FAILED` in the history.

## Open points and risks

- `CLOSED` keeps the Candidate workspace. Cleaning up Candidates is not part of the contract.
- The live E2E items from the previous report still apply (GW3, GW4, the `sendText` target from the tool
  context).
- The working tree still contains foreign uncommitted changes (`README.md`, `spec.md`,
  `docs/product/**`). I did not touch them.

## Out-of-scope findings

None new.

## Commits (trailers `Refs: edge-robot/clawonshape#18`, `Prompt: docs/prompts/2026-10-21-goal-plugin-crs.md`, `Agent: ts-plugin-dev`, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)

- `ddbffdd` feat: ✨ confirmation nonce in the operator goal-status view and goal-close with CLOSED
- `095a955` fix: 🐛 Lead delivery receipt in the §7 shape and reconcile accepts the server error data
- `080b8d9` fix: 🔧 manifest version 0.2.10 to match package.json
- `5d3403d` test: 🧪 CR-1 nonce visibility, dashboard confirm end to end, CR-3 goal-close rules
- followed by the commit of this report
