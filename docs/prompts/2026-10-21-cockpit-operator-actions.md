---
target-repo: edge-robot/clawonshape
branch: demo/gateway-native-read-20261014
worktree: <workspace>/clawonshape
issue: edge-robot/clawonshape#17
architecture-ref: clawonshape/docs/ADR.md#adr-2026-10-16-proof-based-mutation-release-prepared-for-verifiable-presentations
contract-version: 1.0.0-draft   # unchanged; this task does not touch the MCP contract
foreign-repo-commit: a4d9842    # onshape-mcp, branch claw-onshape/external-token (reference only)
base-commit: b63a82b            # plus the uncommitted cockpit working tree from the first #17 pass
status: done
---
# Cockpit follow-up: restore the operator actions (B1), fix packaging (F2, F3), English cockpit doc (F6)

## Goal

Resolve the deployment blocker **B1** and the findings **F2**, **F3** and **F6** from the architect
review of the engineering cockpit:
https://github.com/edge-robot/clawonshape/issues/17 (comment "Architect review of the cockpit
implementation (2026-10-20 …)").

After this task, the cockpit stays a read-only overview. In addition, it contains a clearly
separated, collapsible **Operator actions** section that offers the three existing operator
actions unchanged: `mutation-approve`, `mutation-reconcile` and `candidate-prepare`.

This is a follow-up to your own uncommitted first pass. Continue on that working tree. Do not
start over.

## Context

- Issue and review: edge-robot/clawonshape#17. Read the full review comment first.
- Why the actions must stay: until P3b ships Discord-based approval proofs (epic
  edge-robot/clawonshape#11), these dashboard actions are the **only** operator paths for:
  - the interim approval of a proposal (ADR-2026-10-16 in `docs/ADR.md`; used in the live E2E
    on 2026-10-20, step E5);
  - reconciling an `UNKNOWN` or expired execution (live R1 on 2026-10-16);
  - preparing a Candidate workspace (REST-gated, `OAuth2Write`).
  The non-goal in #17 forbids *new* dashboard approvals. It does not allow removing the
  existing ones.
- Backend: `src/dashboard.ts` still registers all three actions with their guards
  (`operator.admin`, binding checks, Primary-workspace exclusion for `candidate-prepare`,
  `expectedPayloadHash` for `mutation-approve`). **Do not change these guards.**
- Previous UI (reference for behaviour, not for layout): `git show HEAD:ui/control-ui.js`,
  roughly lines 220–285. Behaviour to keep:
  - Every proposal card shows the exact payload review (target document/workspace/element,
    `featureId`, `sourceMicroversion`, `payloadHash`, `body`) **before** the Approve button.
  - Approve is enabled only when `status === 'PROPOSED'` and `oauthWrite === true`. It sends
    `{proposalId, expectedPayloadHash: proposal.payloadHash}`, disables itself while running and
    refreshes the mutation status afterwards.
  - Reconcile is enabled only when `status === 'UNKNOWN'` and sends `{proposalId}`.
  - Candidate prepare runs once per click, does not retry automatically, and shows the response
    or a neutral error text.
  - Terminal states (`REJECTED`, `VERIFIED`, `FAILED`, …) keep both buttons disabled and show
    the reason, for example `rejected-id — REJECTED (approval_expired_not_dispatched)`.
- Removed test (restore it or an equivalent): `git show HEAD:tests/mcp-readiness.test.mjs`,
  test `dashboard proposal cards show REJECTED with its reason and keep terminal actions
  disabled` (around line 333).
- Current UI: `ui/control-ui.js` (the `call(actionId, connectionRef, extra)` helper around line
  221 and the existing `details` pattern). Current tests: `tests/cockpit.test.mjs`,
  `tests/dashboard-render.test.mjs`, `tests/mcp-readiness.test.mjs`.
- Packaging: `package.json` `files` currently lists all of `docs`. Rollouts are packed from a
  clean `git archive`, so only committed files matter, but `docs/product/` (PNGs > 500 kB in
  total, board reviews, handoffs) is about to be committed.

## Binding constraints and prohibitions

- Work only in `<workspace>/clawonshape` on branch
  `demo/gateway-native-read-20261014`. Do not create branches, worktrees or stashes.
- **Do not commit, push or open PRs.** Leave all changes in the working tree. The user commits
  after the architect accepts your report (`Refs: edge-robot/clawonshape#17`).
- Do not change backend action semantics, scopes or guards in `src/dashboard.ts`,
  `src/mutation-workflow.ts` or `src/readiness.ts`. A UI-only change is expected. If you think a
  backend change is unavoidable, stop and describe it in the report as a change request.
- No new approval paths, no new action IDs, and no automatic or batch approval. The dashboard
  is never the decision source; it only relays the operator's explicit click.
- Keep the security properties the review confirmed: no `innerHTML`, no `eval`, no foreign
  fetches, and no provider render on page load.
- User decisions (2026-10-21):
  - F6: `docs/engineering-cockpit.md` must be in **English**. German UI labels stay German and
    are quoted verbatim where the doc refers to them (for example "CAD-Ansicht laden /
    erneuern"). See step 5.
  - F7: versioning `.codex/roles/onshape-product-owner/…` is accepted. Leave `.gitignore` as it
    is.
- Do not touch F4 (revision URL) or F5 (token comparison). They are handled during the live
  acceptance.
- Leave the user's untracked files alone: `.codex/`, `docs/product/`, `docs/reviews/`,
  `scripts/*product-owner*`, `scripts/product-owner-bin/`, `result.json`, and
  `docs/prompts/2026-10-20-approval-v2-writer.md`. Delete `scripts/__pycache__/` only if your
  own tooling created it, and say so in the report.

## Steps

1. Read the review comment on #17 and this prompt completely. Record the baseline: run
   `npm run typecheck`, `npm test` (count) and `npx biome ci .` on the current working tree.
2. **B1 – Operator actions section.**
   - Add a collapsible section (`<details>`, collapsed by default) titled
     **"Operator-Aktionen (Übergang bis Discord-Freigabe)"**, placed below the read-only cockpit
     content. Style it visibly differently from the cockpit, for example with the existing
     `coc-notice` warning colours.
   - Show a short notice inside it. The actions require `operator.admin`, they are the interim
     path until edge-robot/clawonshape#11 (P3b), and each click is a single attempt.
   - Render one card per proposal from `mutation-status`, with the exact payload review, the
     Approve button and the Reconcile button, following the behaviour listed in *Context*.
   - Add the "Candidate vorbereiten" button with the previous behaviour.
   - Reuse the existing `call(...)` helper and the selected connection. Do not add a second
     fetch path.
   - If the client lacks `operator.admin`, the actions stay visible but disabled, with a short
     explanation. The backend stays the enforcement point.
3. **B1 – Tests.** Restore the removed `REJECTED … keep terminal actions disabled` test, or an
   equivalent adapted to the new DOM. Add tests that prove:
   - the section exists and is collapsed by default;
   - Approve is enabled only for `PROPOSED` with `oauthWrite === true` and sends
     `expectedPayloadHash`;
   - Reconcile is enabled only for `UNKNOWN`;
   - Candidate prepare calls `candidate-prepare` exactly once per click;
   - the read-only cockpit part still does not call any of the three actions on load.
4. **B1 – Docs.** Correct `README.md` line 9 and the matching passage in
   `docs/engineering-cockpit.md`. The cockpit is read-only, and the separate Operator actions
   section keeps the three existing actions until P3b.
5. **F6 – English cockpit doc.** Translate `docs/engineering-cockpit.md` into English. Keep the
   structure and every factual statement. Quote German UI labels verbatim, and add an English
   gloss on first use. Do not add new claims. Do not touch the UI labels in
   `ui/control-ui.js`.
6. **F2 – Packaging.** Make sure `docs/product/` is not part of the npm package, either by
   narrowing `files` or by adding a `!docs/product` exclusion. Verify with
   `npm pack --dry-run --json` that no `docs/product/` path is listed and that `dist`,
   `openclaw.plugin.json`, `README.md`, `spec.md`, `skills` and the other docs are still
   included.
7. **F3 – playwright-core.** Choose one option and justify it in the report:
   - (a) add `playwright-core` as an exact-version devDependency that matches the version
     already resolved in `package-lock.json`, so the lockfile does not churn; or
   - (b) keep it transitive and document `npm run test:cockpit` as a manual, host-only check
     that needs a local Chromium, in `README.md` or `docs/engineering-cockpit.md`.
   `test:cockpit` must stay out of `npm test`.
8. Rerun all checks (see below). Run `npm run test:cockpit` if a Chromium is available on your
   host, and attach a screenshot path of the expanded Operator actions section in your report.

## Acceptance criteria and tests

| # | Criterion | Evidence |
|---|---|---|
| A1 | Approve, Reconcile and Candidate prepare are reachable from the UI in a separate, collapsed-by-default section | test + screenshot or DOM excerpt |
| A2 | Button enablement and payloads match the previous behaviour exactly | tests from step 3 |
| A3 | Terminal states keep the actions disabled and show the reason | restored test |
| A4 | The read-only cockpit triggers none of the three actions and no provider render on load | test |
| A5 | No backend guard or scope changed | `git diff --stat src/` limited to UI-relevant files, or explicitly none |
| A6 | `docs/product/` is not in the package | `npm pack --dry-run --json` file list excerpt |
| A7 | F3 resolved according to option (a) or (b) | diff, plus lockfile delta if (a) |
| A8 | `npm run typecheck`, `npm test`, `npx biome ci .` pass; the test count is ≥ the baseline from step 1 | checks table |
| A9 | README and cockpit doc no longer claim that the actions are not invoked | diff |
| A10 | `docs/engineering-cockpit.md` is English; German UI labels are quoted verbatim; no new claims | diff |

## Branch and worktree rules

- Branch `demo/gateway-native-read-20261014`, main checkout
  `<workspace>/clawonshape`. No other branch or worktree.
- No commits. The working tree is handed back to the user and architect once the report file
  exists.
- If you find the branch HEAD is not `b63a82b`, or the first-pass cockpit changes are missing
  from the working tree, stop and report it. Do not reconstruct anything.

## Expected report / handoff format

Write `docs/prompts/2026-10-21-cockpit-operator-actions.report.md` (English) with this
frontmatter:

```yaml
status: done | blocked
contract-version: 1.0.0-draft
e2e-request: required   # live acceptance with the user: approve/reconcile via Operator actions, F4 link, empty/error state
```

Body:

- a checks table with baseline vs. after (typecheck, test count, biome, test:cockpit if run);
- one line per acceptance criterion A1–A10 with its evidence;
- the F3 option chosen and why;
- the `npm pack --dry-run` file-list diff (before/after, paths only);
- the list of changed files (`git status --short`), separating your files from the
  pre-existing user files;
- any change request, if you hit a backend limitation;
- open points for the live acceptance.
