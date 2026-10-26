---
prompt: docs/prompts/2026-10-26-closure-call-cost-baseline.md
branch: feat/21-work-context-selection
commits: f1feac7..13dad5d
status: partial
contract-version: 1.2.0-draft (tests/contract/VERSION); work-context-1.2.0-draft (docs/interface/work-context.md)
e2e-request: none
---
# Report: Closure K2, call-cost baseline of the deployed behaviour (#22, narrowed)

## Summary

Every action in steps 2–3 is measured offline against the shared fake Onshape REST. The fake routes and logs
every request. Each action is measured cold (empty browsing cache) and warm (the same action again right after it
on the same plugin instance). Each count is asserted as an upper bound in `tests/rest-calls.test.mjs`, so a future
increase fails. There is no production change: `git diff --stat 667f01c -- src ui` is empty.

The status is **partial** for one reason only: B3 requires W1–W18 to be green, and **W11 and W14 are red**. They
were already red on the base commit `73b3469` without my changes. They turned red in `42f438d` (contract
`work-context-1.2.0-draft`), which updated `part-search.json` and `error-codes.json` to the deferred §12 shapes
(`failedStudios`, `scan`, `provider_response_too_large` and others). The deployed code does not emit these yet.
At `5d891ef`, the commit before `42f438d`, W1–W18 are 28/28 green. Making them green needs either the deferred §12
implementation or a contract or fixture change. Both are outside this prompt. See *Open points*.

Headline numbers:
- one short operator session costs **40 calls**: page load, selector open, three debounced part searches, one
  preview, adopt, CAD view and reload;
- the same session again with the adopted selection costs **46 calls**.

The reported 112 calls are therefore about 2.5 such sessions. That fits a session with several reloads and
selector opens.

## Changed files

`git diff --stat 73b3469..13dad5d`:

```
 tests/fixtures/work-context-rest.mjs | 298 +++++++++++++++++++++++++
 tests/rest-calls.test.mjs            | 421 +++++++++++++++++++++++++++++++++++
 tests/work-context.test.mjs          | 261 ++--------------------
```

- `tests/fixtures/work-context-rest.mjs` is the shared fake REST, moved out of `work-context.test.mjs` and
  extended:
  - routes for v16/v10 features, the render reads (`el@m`, 800 px shaded view) and the workspace-context element
    list;
  - a `failIf(kind, route)` hook for failing single requests;
  - `version` in the call log and `routeTemplate()`;
  - a stubbed `readMcp` in `dashboardActions`.
- `tests/work-context.test.mjs` is a pure move: its helpers now come from the fixture, and no W assertion changed.
- `tests/rest-calls.test.mjs` holds the call-cost measurement and the upper bounds (38 tests: 1 parent and 37
  rows).
- The report file is this file. The agent memory note is not part of these commits.

## Checks

| Command | Result |
|---|---|
| `npm ci` | pass (the install-scripts warning is known, see memory) |
| `npm run typecheck` | pass (exit 0) |
| `npm test` | **fail: 263/265 pass, 2 fail: W11, W14**. Both were red on the base `73b3469` before any change of mine; see Summary |
| `node --test tests/rest-calls.test.mjs` | pass, 38/38 |
| W1–W18 on a pristine `git archive 73b3469` copy (scratchpad) | 26/28, the same W11 and W14 failures |
| W1–W18 on `git archive 5d891ef` (before contract 1.2.0-draft) | 28/28 |
| `npm run test:native-files` | pass (`"status":"PASS"`) |
| `npm pack --dry-run` | pass: 214 files; top level `README.md agents dist docs openclaw.plugin.json package.json scripts skills spec.md`; no `state/`, `*.tgz`, `.env` or `tests/` |
| `npx biome ci .` | pass, 74 files, no errors |
| `git diff --stat 667f01c -- src ui` | empty |

Baseline in step 1, before any change: typecheck passed, `npm test` failed with the same W11 and W14 failures, and
`biome ci` passed.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| B1 | call-cost table complete (cold/warm, route templates) for steps 2–3 | met | table below; the goal paths are measured at service level (see *Not measurable*) |
| B2 | upper bounds asserted in tests and passing on the deployed code | met | `closure K2 call-cost baseline: measured provider calls per action stay within the deployed upper bounds`, with one subtest per row named after the action; each `max` equals the measured count |
| B3 | no production change; W1–W18 unchanged and green; typecheck, `npm test`, `biome ci` pass | **partial** | no production change; W assertions unchanged; typecheck and biome pass; **W11 and W14 red since `42f438d`**, so `npm test` fails |
| B4 | one paragraph per notable cost driver | met | *Cost drivers* below |

## Call-cost table

Setup: the deployed code (`667f01c` source), bound document D with Primary P and bound Part Studio E. The fake
returns 2 Part Studios unless stated otherwise, and the bound studio is last in R2 order. The token is fresh, so
there is no OAuth refresh. "with selection" means a valid adopted selection (JIF).

Route keys:

| Key | Route template |
|---|---|
| doc | `GET v10/documents/{d}` |
| ws | `GET v10/documents/d/{d}/workspaces` |
| el@w | `GET v10/documents/d/{d}/w/{w}/elements` |
| R1 | `GET v10/documents/d/{d}/w/{w}/currentmicroversion` |
| R2 | `GET v10/documents/d/{d}/m/{m}/elements?elementType` |
| R3 | `GET v10/elements/d/{d}/m/{m}/e/{e}/configuration` |
| R4 | `GET v10/parts/d/{d}/m/{m}/e/{e}` |
| R5 | `GET v10/parts/d/{d}/m/{m}/e/{e}/partid/{pid}/shadedviews?…` |
| R6 | `GET v10/documents?q&sortColumn&sortOrder&offset&limit` |
| shaded@m | `GET v10/partstudios/d/{d}/m/{m}/e/{e}/shadedviews?…` (R8 at 128 px, render at 800 px) |
| feat10 | `GET v10/partstudios/d/{d}/w/{w}/e/{e}/features` |
| feat16 | `GET v16/partstudios/d/{d}/w/{w}/e/{e}/features` |
| el@m | `GET v10/documents/d/{d}/m/{m}/elements` (unfiltered) |

The UI sequences are read from `ui/control-ui.js`:
- **Page load** (`load`): `status`, then `mutation-status`, then in parallel `workspace-context` (only when
  connected or ready), `goal-status` and `work-context-status`.
- **Selector open** (`open`): `work-context-status`, then `work-context-documents{query:'',offset:0}`, then
  `work-context-workspaces` for the bound or selected document, then `work-context-parts` (restore, empty query),
  then `work-context-preview` if the stored selection is still a selectable hit.
- **Typing in the part field** sends one `work-context-parts` per 300 ms debounce.
- **"Erneut laden"** repeats the failed read.
- `work-context-catalog` and `work-context-clear` are not called by the current UI.

| Action | Cold | Warm | Cold routes | Warm routes |
|---|---:|---:|---|---|
| dashboard load (no selection) | 3 | 3 | doc, ws, el@w | doc, ws, el@w |
| dashboard load (with selection) | 9 | 9 | doc×2, ws×2, el@w, R1, R2, R3, R4 | same |
| selector open (no selection) | 8 | 2 | R6, ws, R1×2, R2, R3, R4×2 | R1×2 |
| selector open (with selection) | 16 | 9 | doc, ws×2, R1×4, R2×2, R3×2, R4×3, R6, R5 | doc, ws, R1×4, R2, R3, R4 |
| work-context-status (no selection) | 0 | 0 | – | – |
| work-context-status (with selection) | 6 | 6 | doc, ws, R1, R2, R3, R4 | same |
| work-context-catalog | 7 | 7 | doc, ws, R1×2, R2, R3, R4 | same |
| document search page | 1 | 0 | R6 | – |
| workspace list (bound document) | 1 | 0 | ws | – |
| workspace list (other document) | 2 | 0 | ws, doc | – |
| part search (bound Primary, 1 studio) | 5 | 2 | R1×2, R2, R3, R4 | R1×2 |
| part search (bound Primary, 2 studios) | 6 | 2 | R1×2, R2, R3, R4×2 | R1×2 |
| part search (bound Primary, 5 studios) | 9 | 2 | R1×2, R2, R3, R4×5 | R1×2 |
| part search (bound Primary, 21 studios) | 23 | 2 | R1×2, R2, R4×20 (bound studio not scanned, no R3) | R1×2 |
| part search (21 studios, bound studio refined) | 5 | 2 | R1×2, R2, R3, R4 | R1×2 |
| part search (2 studios, new query each run) | 6 | 2 | R1×2, R2, R3, R4×2 | R1×2 |
| part search (5 studios, after a new Primary revision) | 9 | 2 | R1×2, R2, R3, R4×5 | R1×2 |
| part search (other document, 2 studios) | 5 | 2 | R1×2, R2, R4×2 | R1×2 |
| part search fails at studio 3 of 5, persistent; then "Erneut laden" | 5 | 2 | R1, R2, R4×3 | R1, R4 |
| part search fails at studio 3 of 5, transient; then "Erneut laden" | 5 | 6 | R1, R2, R4×3 | R1×2, R3, R4×3 |
| part preview | 3 | 1 | R1, R2, R5 | R1 |
| studio preview | 3 | 1 | R1, R2, shaded@m | R1 |
| adopt | 6 | 6 | doc, ws, R1, R2, R3, R4 | same |
| clear | 0 | 0 | – | – |
| example session (load, open, 3 searches, preview, adopt, CAD view, reload) | 40 | 46 | doc×5, ws×6, el@w×3, R6, R1×11, R2×3, R3×3, R4×4, R5, feat10, el@m, shaded@m | doc×7, ws×7, el@w×3, R1×14, R2×4, R3×4, R4×4, feat10, el@m, shaded@m |
| cockpit status (`status`) | 0 | 0 | – (native MCP status stubbed; not an Onshape call) | – |
| cockpit CAD view (`render`) | 6 | 6 | doc, ws, el@w, feat10, el@m, shaded@m | same |
| `onshape_status` (no selection) | 0 | 0 | – | – |
| `onshape_status` (with selection) | 6 | 6 | doc, ws, R1, R2, R3, R4 | same |
| `onshape_inspect` | 3 | 3 | doc, ws, el@w | same |
| `onshape_render` | 6 | 6 | doc, ws, el@w, feat10, el@m, shaded@m | same |
| goal propose (no selection) | 1 | n/a¹ | feat16 (Primary) | – |
| goal propose (with selection) | 4 | n/a¹ | feat16, R2, R3, R4 (focus at base mv) | – |
| goal confirm (Candidate creation stubbed) | 1 | n/a¹ | feat16 (Candidate baseline) | – |
| goal status (service) / `goal-status` (dashboard) | 0 | 0 | – (MCP `/capabilities` and journal-summary only) | – |
| goal verify (service) | 1 | n/a¹ | feat16 (Candidate) | – |

¹ A second propose fails with `goal_active_conflict`, a second confirm is not allowed, and verify ends the goal.
These rows are measured cold only, and their warm bound is 0.

In the failing part-search rows, "warm" is the repetition through "Erneut laden".

## Cost drivers

**Status revalidation is uncached, and so is every reload.** With a selection, `work-context-status`,
`onshape_status` and `adopt` each re-read doc, ws, R1, R2, R3 and R4. That is 6 calls every time, warm or cold.
These paths do not use the browsing cache. Page load runs `workspace-context` and `work-context-status` side by side
and reads doc and ws twice (9 calls). Every page reload, connection-select change and goal action re-runs these
reads. After a goal action, `readGoals` and `readStatus` run again.

**The selector does not reuse what status just read.** Opening the selector first calls `work-context-status`
(6 calls), then `work-context-parts` reads R1, R2, R3 and R4 again at the same microversion (cold 6). The
status-path reads never populate the browsing cache. With a selection, selector open costs 16 cold, and 9 for
every re-open within the TTL.

**Every part search costs 2 R1 calls, even fully warm.** A search reads R1 before and R1 after (the recheck).
Typing in the part field sends one search per 300 ms debounce, so each pause costs 2 calls. The query is not part
of the cache key; only R1 is uncached. A five-character query typed with pauses costs about 10 calls without
reading a single new part.

**A new revision triggers a full studio rescan.** R2, R3 and R4 are cached per microversion. Any edit anywhere in
the document gives the Primary a new microversion. The next search re-reads R2 and up to 20 × R4 (5 studios: 9
calls, the same as cold). In a document being actively edited, the cache barely helps across edits.

**Large documents scan 20 studios, and the bound studio can fall outside them.** Without `elementId`, the search
scans the first `STUDIO_SCAN_LIMIT = 20` studios in R2 order, which is 23 calls for 21 studios. If the bound studio
comes after position 20, it is not scanned and its parts are missing. The operator must then refine, which costs
another R1×2 and R3/R4. §12.4 (limit 10, bound studio first) is deferred.

**Failures are not cached, and one bad studio fails the whole search.** A failure in studio k of N aborts the
search: N=5, k=3 costs 5 calls and returns no hits. Studios before k stay cached, but the failure itself is not
cached. "Erneut laden" against a persistent failure costs R1 plus R4 of the same studio (2 calls) every time and
never succeeds. After a transient failure, the retry reads the remaining studios plus R3 and the recheck (6). The
search never returns partial results. §12.1 (per-studio status) and the §12.4 negative cache are deferred.

**Short TTLs and token-scoped partitions.** R6 is cached for 60 s and R7 for 30 s. The browsing cache partition is
keyed by the hash of the access token, so each token refresh and each reconnect empties the whole cache, including
the microversion-pinned R2/R3/R4/R5. The offline harness does not exercise this, because the token is fresh.

**Render and inspect re-read the same metadata.** `render` (cockpit CAD view and `onshape_render`) costs 6 calls:
the doc, ws and el@w snapshot, then features, el@m and the shaded view. `onshape_inspect` costs the same 3-call
snapshot. Nothing is shared with the page load, which already read doc, ws and el@w.

## Not measurable offline, or not measured

- **Agent calls through onshape-mcp** (`onshape__onshape_api_call` and the server's own Onshape requests) are not
  plugin requests. They are outside this harness. §12.5 also excludes them.
- **The goal tools through `plugin.register`.** `onshape_goal_propose` needs a signed Lead envelope. I measured
  the goal paths at service level instead (`proposeGoal`, `confirmGoal`, `goalStatus`, `verifyGoal`, each with a
  real `RestClient` over the fake REST). The tool wrappers in `goal-tools.ts` build one `RestClient` and call the
  same service functions. Their envelope checks make no provider call.
- **Candidate creation** (POST plus verification GETs in `prepareCandidateWorkspace`), `candidate-prepare/check`
  and `mutation-approve/reconcile` were not part of the action list. Confirm uses the goal harness creation stub.
  These paths can be measured offline with more fake routes and no production change.
- **OAuth token refresh** (`oauth.onshape.com`) does not happen with a fresh token. A refresh adds 1 token request
  per expiry and empties the browsing cache (see above).
- **`selection_observation_stale` races**: a changed R1 between read and recheck discards all reads of that search.
  This is not measured as a row; the W14 tests cover it functionally.
- **Parallelism**: the UI runs `workspace-context`, `goal-status` and `work-context-status` in parallel. The harness
  runs them in sequence. The count is the same.

## Contract deviations and change requests

None for this task. For the architect, regarding §12.6 and the W11/W14 state:
- The §12.6 table can be filled from the call-cost table above.
- W11 and W14 compare the deployed code with the 1.2.0-draft fixtures. Until the deferred §12 implementation
  lands, `npm test` on this branch stays red. Options:
  - (a) keep a 1.1.0 copy of `part-search.json` and `error-codes.json` for the deployed baseline;
  - (b) mark W11 and W14 as expected to fail until §12;
  - (c) accept the red state for the closure.

  Each option is an architect decision about the contract or fixtures. I changed nothing.

## Live E2E request

None. This change touches tests only and changes no behaviour. The live counterpart (WC13: per-action counts from
a live log) requires §12.5 accounting, which is deferred.

## Open points and risks

- **W11 and W14 are red** on the branch since `42f438d` (see Summary). This blocks a green `npm test` and B3.
- **`openclaw` was probably run during the step-1 baseline.** The interrupted session left
  `tests/rest-calls.test.mjs` uncommitted. In it, the cockpit `status` action ran through `dashboardActions`
  without a `readMcp` stub. `registerDashboard` then defaults to `mcpReadiness`, which runs
  `execFile('openclaw', ['mcp', 'status', '--json'])`, and under `npm test`, `node_modules/.bin/openclaw` is on
  PATH. My four baseline `npm test` runs therefore probably ran `openclaw mcp status --json` up to 16 times. That
  command is read-only. There is no host and there are no credentials in the container, and the result was
  projected to UNKNOWN. I fixed this before the first measurement: `dashboardActions` now always injects an
  offline stub. Other tests that call `status` (`mcp-readiness`, `product`, `mcp-token-owner`) already pass their
  own `readMcp`.
- **Foreign-repo state differs from the prompt.** onshape-mcp HEAD is `1226c6b`, but the prompt names `de4ad9d`.
  `de4ad9d` is an ancestor of HEAD, and the difference is only `Cargo.lock` (the rustls-webpki bump) and a new
  prompt doc. There is no server code change, and this tests-only task does not depend on onshape-mcp. I went
  ahead and record the difference here.
- The bounds are equal to the measured counts. Any change that lowers a count (for example §12.4) must lower the
  bound in the same commit, to keep the regression guard tight.

## Out-of-scope findings

- `src/dashboard.ts:47`: `registerDashboard(…, readMcp = mcpReadiness, …)`. A default that spawns a process makes
  every test that reaches `status` without a stub run the native CLI. An injected-only parameter, or a
  test-visible guard, would make this fail closed in tests. Not changed.
- `src/work-context.ts:471`: `STUDIO_SCAN_LIMIT = 20`, and the scan uses R2 order. A bound studio after position
  20 is never scanned without refinement (cost driver above; §12.4 fixes it).
- `src/work-context-service.ts:279–311` (`observe`, called by `workContextStatus` at :314) reads R2/R3/R4 without the browsing
  cache, although they are immutable at `mv`. This is a possible quota saving without a contract change to the
  view.

## Commits

```
f1feac7 test: 🧪 shared offline fake Onshape REST harness for call accounting
3d5d4c4 test: 🧪 work-context tests use the shared fake REST harness
13dad5d test: 🧪 call-cost baseline of the deployed dashboard, tool and goal paths
```

The report itself follows as a `docs:` commit.
