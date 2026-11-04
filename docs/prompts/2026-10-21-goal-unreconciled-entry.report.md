---
prompt: docs/prompts/2026-10-21-goal-unreconciled-entry.md
branch: feat/18-goal-authorization
commits: 0fda725..478a83b
status: done
contract-version: 1.2.0-draft
e2e-request: required
---
# Report: Goal plugin: unreconciledEntry in GoalView and reconcile by goalId (goal-1.1.0-draft)

## Summary

`goal-1.1.0-draft` is implemented against server contract `1.2.0-draft` (fixture digest `f60bfa0d…1cba`).

**`GoalView.progress.unreconciledEntry`** mirrors the server's journal-summary entry in every projection:
dashboard, agent tools and history. It is not part of the signed report (`reportView`), because that report
carries no `progress`.

The summary parser checks the entry strictly:

- exactly the eight keys and their types;
- the same `sequence` as `unreconciledSequence`;
- `null` exactly when `unreconciledSequence` is `null`.

A 1.1.0 server that does not send the key gives `null`. A malformed entry makes the whole summary
unavailable (fail closed, as before).

**Reconcile by `goalId` alone.** `goal-reconcile` (dashboard) and `onshape_goal_reconcile` (agent) now
accept `{goalId}` alone and take the input from `unreconciledEntry`.

| Situation | Result | State change |
|---|---|---|
| No entry | `goal_state_invalid` | none |
| Summary unavailable | `mcp_discovery_failed` | none |
| Explicit input that differs from the entry | `goal_state_invalid` | as for stale data in §5 rule 2 (an `ACTIVE` goal goes to `RECONCILING` first) |

The CR-5 tolerance for the raw MCP error data stays.

**Skill.** The skill has one new instruction: if the error data is lost, call `onshape_goal_reconcile`
with `goalId` only.

**Fix in my own earlier test.** I found and fixed a bug in a test from the previous prompt (separate
commit `478a83b`). The CR-1 agent-tool test installed the `fetch` stub only after `plugin.register()`. The
tools take the MCP fetcher at registration, so the probe actually tried the network (DNS failure,
capability `BLOCKED`). The test passed anyway. It now stubs first and asserts `capability: 'AVAILABLE'`,
which fails with the old order.

## Changed files

`git diff --stat eff0e51..478a83b`: 10 files, +529 / −18 (the report commit follows). No UI or Codex file is
in the commits.

| File | Purpose |
|---|---|
| `src/goal-lifecycle.ts` | `UnreconciledEntry` type, `JournalSummary.unreconciledEntry`, `GoalView.progress.unreconciledEntry`, pure helpers `reconcileInputFromEntry` and `assertInputMatchesEntry` |
| `src/goal-mcp.ts` | Strict entry validation in `validateJournalSummary` |
| `src/goal-service.ts` | `reconcileGoal` accepts `{goalId}` alone or explicit input with the equality check |
| `src/goal-tools.ts` | `onshape_goal_reconcile`: `required: ['goalId']` and an updated description |
| `src/dashboard.ts` | `goal-reconcile` passes the input without `connectionRef`, so that `{goalId}` alone is recognized |
| `skills/onshape-goal-iteration/SKILL.md` | One instruction for the case where the error data is lost |
| `tests/contract.test.mjs` | Version and digest `1.2.0-draft`; parser test against `journal-summary/uncertain.json` (computed `requestHash`; the placeholder is rejected as not sha256), the missing key and 11 malformed variants |
| `tests/fixtures/goal.mjs` | The server stand-in serves the 1.2.0 summary, switchable to 1.1.0 and to a malformed entry; optional start clock |
| `tests/goal-unreconciled.test.mjs` (new) | 6 tests for A1–A3 |
| `tests/goal-crs.test.mjs` | `fetch` stub before registration, plus the `capability` assertion |

## Checks

From a clean `dist/`, on the working tree. The working tree contains the uncommitted Codex changes to
`tests/cockpit.test.mjs` and the other UI files; I did not touch them.

| Command | Baseline (`eff0e51`) | After (`478a83b`) |
|---|---|---|
| `npm ci` | pass | pass |
| `npm run typecheck` | pass | pass |
| `npm test` | 192 tests, 190 pass, 2 fail (contract version and GoalView fixture after the bump; expected) | **199 tests, 199 pass**. Without `tests/cockpit.test.mjs` (Codex, being edited): 173/173. |
| `npm run test:native-files` | — | `PASS` |
| `npm pack --dry-run` | — | pass, 177 files. No `tests/`, `state/` or `.env`. |
| `npx biome ci .` | — | pass (65 files) |

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| A1 | `progress.unreconciledEntry` mirrors the server entry; a missing key gives `null`; a malformed entry fails closed | met | `journal summary parser: uncertain fixture, 1.1.0 server without the key, malformed entries fail closed`; `A1 GoalView.progress.unreconciledEntry mirrors the server entry and clears after reconciliation`; `A1 a 1.1.0 server without the key yields null; a malformed entry makes the summary unavailable`; `GoalView of an ACTIVE goal … exactly the fixture keys and types` (now including `unreconciledEntry: null`) |
| A2 | Reconcile by `goalId` alone works from the dashboard and the tool; explicit input must match | met | `A2 reconcile by goalId alone (service); explicit input must equal the entry; no entry → goal_state_invalid`; `A2 dashboard goal-reconcile with only goalId reconciles from the summary entry end to end`; `A2/A3 onshape_goal_reconcile with only goalId; agents see the entry and never the nonce` (the registered plugin with MCP and REST routed to the harness; the CR-5 raw data still works) |
| A3 | Agents see the entry; the nonce stays operator-only | met | `A2/A3 …` (the agent `onshape_goal_status` carries the entry and `nonce: null`, and the nonce is not in the text); `A3 the operator view of an uncertain goal carries the entry; the nonce stays null outside AWAITING_CONFIRMATION` (the entry contains no body, path or token); the CR-1 tests are unchanged |
| A4 | typecheck, `npm test` (≥ 183 + new), biome and `npm pack --dry-run` pass; no UI file touched | met | Checks table. `git diff --name-only eff0e51..HEAD` contains no UI, cockpit, `README.md`, `spec.md` or `docs/product` file. |

Review of foreign changes: I reviewed every changed line in my files against `eff0e51` before committing.
All of them come from my edit steps in this task. The "modified on disk" notices came from my own
scripts and Biome runs. I found no foreign hunk.

## Contract deviations and change requests

None. Interpretations:

- **Explicit input with a mismatching entry → `goal_state_invalid`.** This also applies when rule 1
  (idempotent) would otherwise match, because §5 requires equality "when the summary provides one". After a
  reconciliation the entry is `null`, so a repeated old input is still idempotent.
- **A `{goalId}`-only call with an unavailable summary → `mcp_discovery_failed`**, as in §5 rule 2.
- **A 1.1.0 server.** Entry `null`, so `{goalId}` alone gives `goal_state_invalid`. Explicit input works
  as before.
- **"Only `goalId`"** means: none of `sequence`, `featureId`, `sourceMicroversion` or `admittedAt` is
  given. Partial explicit input is `invalid_arguments`.

## Live E2E request

Precondition: onshape-mcp `cc67472` or later (1.2.0 summary) and this plugin state.

1. Provoke an uncertain dispatch (for example a provider timeout). Expected:
   - `goal-status` and the Engineer `onshape_goal_status` show `progress.unreconciledEntry` with the eight
     fields, equal to `GET /goals/{id}/journal-summary`;
   - `confirmation.nonce` is `null`.
2. Dashboard `goal-reconcile` with `{goalId}` only. Expected: the goal returns to `ACTIVE`, the new grant
   revision has `reconciledThrough = sequence`, and the entry is `null`.
3. Repeat with the Engineer `onshape_goal_reconcile({goalId})`.
4. Explicit input with a wrong `admittedAt` gives `goal_state_invalid`.

## UI note for Codex (COC-GOAL-UI)

**`progress.unreconciledEntry`** is `null` or:

```json
{"sequence": 1, "grantRevision": 1, "requestHash": "<64 hex>", "featureId": "FabcDEF123_0",
 "sourceMicroversion": "<24 hex>", "admittedAt": 4102444600000, "outcome": "UNCERTAIN" | "PENDING",
 "httpStatus": 503 | null}
```

- It is not secret. It may be shown and handed on (GW5, #20).
- `null` also covers "unknown" with a 1.1.0 server. In that case `progress.unreconciledSequence` can still
  be set.
- If `progress.dispatches` is `null`, the summary is unavailable. Show "unknown".

**`goal-reconcile`** (`operator.admin`) takes `{connectionRef?, goalId}` and needs nothing else. This is
the cockpit's normal case: offer it when `progress.unreconciledEntry !== null`.

- The explicit form `{connectionRef?, goalId, sequence, featureId, sourceMicroversion, admittedAt}` remains
  valid, but must equal the entry.
- Response: `{ok: true, goal}`, or `{ok: false, code}`:
  - `goal_state_invalid`: nothing to reconcile, or a mismatch;
  - `mcp_discovery_failed`: summary unavailable;
  - `mutation_outcome_unknown`: still inside the 60 s grace, so try again later.

## Open points and risks

- **The `onshape_goal_reconcile` description now also tells the LLM about `{goalId}` alone.** Watch in the
  live E2E that the Engineer still prefers the error data when it has it. Both paths give the same result.
- **GW5 (#20)** is untouched.

## Commits (trailers `Refs: edge-robot/clawonshape#18`, `Prompt: docs/prompts/2026-10-21-goal-unreconciled-entry.md`, `Agent: ts-plugin-dev`, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`)

- `0fda725` feat: ✨ journal summary unreconciledEntry and GoalView.progress.unreconciledEntry
- `994a6b1` feat: ✨ reconcile by goalId alone from the summary entry; explicit input must match it
- `0e266f0` test: 🧪 unreconciledEntry projection and reconcile by goalId (service, dashboard, tool)
- `478a83b` test: 🐛 CR-1 agent tool test routes fetch before plugin registration
- followed by the commit of this report
