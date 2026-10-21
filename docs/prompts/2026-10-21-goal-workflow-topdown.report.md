---
status: partial
phase: COC-GOAL-TOPDOWN-1-20261021
parent-task: COC-GOAL-WORKFLOW-20261021
browser-evidence: blocked
e2e-request: required
---
# Goal workflow: bounded top-down phase 1

Date: 2026-10-21. Workspace/CAD/3D Print navigation and independent current
workspace names are implemented and locally tested in the shared working tree.
Goal authorization/iteration and automated printing remain blocked. This phase is
not full goal-workflow acceptance, a deployment, or a real CAD/print demonstration.

## Entry state, ownership and capacity

Verified repository `/home/kaos/Projects/01_pib/02_sw/clawonshape`, branch
`demo/gateway-native-read-20261014`, HEAD
`b63a82b3fb7eac3241d16c18516db372fdf6a5aa`, one worktree. Preserved the existing
shared changes, including the completed Operator repair. Its report was read and
left byte-identical. No new branch/worktree/stash or Git mutation was performed.

Used the already-read `onshape-team-coordination` workflow. Checked applicable
instructions and README; inspected the full product assignment, all four confirmed
PNGs and their SVGs, and `docs/product/dashboard-cockpit.png`. The confirmed images
contain illustrative geometry, project names, authorization and print estimates;
none was copied into implementation as actual evidence. Existing role/inventory
context was read earlier in this session. No runtime inspection was performed.

The checkout was used serially for this phase only. No agents were started and
no Claude/PO/architect prompt was sent. Top-down work remains with this architect;
bottom-up goal contract/execution integration needs a later serial handoff.

No current developer usage/quota indicator is exposed in the available tools or
visible turn status. No architect usage/quota is visible. The previously reported
45% of a 5-hour allowance is historical user-supplied context, not a new observation.
No actual indicator below 10% was shown. Context capacity was not treated as usage
quota. If a later real indicator crosses the threshold, stop at a safe boundary;
this role cannot create the requested abort commit under the active prohibition.
An authorized role/operator would have to perform any commit. All work is retained
in files and this report, without relying on a commit.

## Implemented behavior

**Navigation.** One native plugin page, exactly three main destinations:
Workspace, CAD, 3D Print. Workspace is selected initially. Buttons change actual
view state, expose `aria-current`, support ordinary keyboard activation and move
focus to the view heading. Focus styling is visible in CSS. At narrow widths the
rail becomes a wrapping navigation row instead of disappearing. Existing technical
and operator sections remain beneath the active view and collapsed by default;
connection management opens its existing details section only on explicit request.
No configured project/team name is assumed; the hardcoded pib header is removed.

**Workspace.** Assigned document/workspace/Part Studio names or exact/short IDs,
connection state, current capability evidence, timestamps and next action. Missing
team/project branding is explicitly unavailable. Capabilities do not imply write
approval. Bambu is unavailable with a link-like navigation button to its actual
prerequisite view, not a fake connect/slice action.

**CAD.** A versions/branches column lists only the assigned Primary/Candidate
identities. Multiple payload proposals do not create multiple Candidates. No
ancestry edges are drawn because no verified ancestry is present in the current
view contract; the UI says so. A prominent goal panel reports iteration blocked,
explains the missing goal approval path, and distinguishes stored payloads from
goal authorization. It has no inert save/confirm/start/stop control. Aggregate
counts are explicitly counts of stored payload receipts, never goal success.
The large existing revision-pinned CAD viewer remains explicit-click only.
Detailed payload proposals and evidence are in a collapsed history below the
main goal/view area; legacy operator controls remain separately accessible.

**Independent names.** New read-only `workspace-context` action; optional
`connectionRef` is the only accepted input. It returns `status`, `connectionRef`,
exact `target` (document/workspace/Primary/element IDs), `observedAt`, and optional
safe `documentName`, `workspaceName`, `primaryWorkspaceName`, `elementName`.
These describe current metadata, never revision-pinned geometry or ancestry.
The render response and its historical/pinned metadata contract are unchanged;
the UI no longer uses PNG labels as its current workspace names.

The action shares the existing render read authorization scaffolding:
`operator.read`, `liveReads`, one exact binding, argument validation, OAuth read
access, authorization snapshot guards before each authenticated request and after
completion, plus final token consistency. It uses the existing RestClient metadata
paths only:

```text
GET /api/v10/documents/{assignedDocumentId}
GET /api/v10/documents/d/{assignedDocumentId}/workspaces
GET /api/v10/documents/d/{assignedDocumentId}/w/{assignedWorkspaceId}/elements
```

Responses retain existing HTTP size bounds. The context method also bounds the
workspace list to 1000, checks exact IDs/duplicates/document membership and a unique
assigned PARTSTUDIO. Labels reuse existing trimming, 256-code-point limit and
control/format/surrogate rejection. Returned labels are text only. No arbitrary
provider target, geometry read, shaded view, MCP data call or CAD mutation is added.
The existing `status` readiness implementation remains unchanged.

The UI requests metadata on initial load/explicit refresh for a connected/ready
connection; navigation and workspace/proposal selection do not make provider calls.
Names survive ordinary PNG transport/decoder/integrity errors for the same valid
metadata target. Refresh clears images, refreshes names independently, and marks
retained same-target labels stale on metadata retrieval failure. Target/connection
changes, invalid response identity and authorization failures invalidate names.
Generation checks discard late metadata/images. Primary never inherits the
Candidate element name. Names age independently after five minutes and do not
claim current geometry.

**Existing authority.** Approval requires the reviewed payload hash and PROPOSED
plus OAuth write; UNKNOWN reconciliation, one explicit preparation attempt and
stale-handler fences are preserved. No new goal/mutation action, automatic approval,
batch approval, retry, Primary write, merge, print, or local-only authorization.

## Bambu evidence and missing dependencies

Read-only source/definition searches found only Onshape tools in tracked
`src/index.ts` and the existing Engineer definition. `src/dashboard.ts` registers
Onshape connection/Candidate/read actions, and `src/capabilities.ts` has no Bambu
adapter. No supported STL/slicing/print API is evidenced by these sources.
`spec.md` describes the existing read/render slice, not a functioning slicer.

The pre-existing, untracked research document
`docs/reviews/bambu-h2c-integration-2026-10-20.md` was also read as historical
research, not current hardware/runtime evidence. Its "Slicing investigation"
records a synthetic raw-profile H2C CLI SIGABRT and the absence of a validated
GUI-prepared project. This phase did not rerun it, inspect Studio configuration,
read credentials, install skills or probe a printer.

The 3D Print view therefore blocks import/profile/slicing/preview and states:
no assigned file, no validated profile, no time/material/quantity evidence.
It preserves manual Bambu Studio preparation as the next practical step.
Concrete missing dependencies before a functional integration:

- A supported, reviewed slicer adapter with reproducible error reporting and
  file/unit mapping, including immutable output/provenance and preview association.
- Complete printer/nozzle, material and process profiles, a validated project
  and logical tool mapping; an accepted H2C pilot slice with preview evidence.
- A reviewed target/artifact/access contract. For any future physical printer
  connection: separately provisioned access and verified device trust plus
  actual compatibility evidence. No such access is required or added in this phase.

No fake STL upload success, connect/slice action, schematic production geometry,
estimate or printer control is shown.

## Fresh verification

Logs and task-entry copies: `/tmp/coc-topdown-20261021/`. These are temporary
review aids, not durable CI evidence. The earlier Operator task's 139 tests are
not represented as a fresh baseline rerun for this phase.

| Command/check | Actual result |
| --- | --- |
| Build and focused tests: `node --test --test-isolation=none tests/cockpit.test.mjs tests/dashboard-render.test.mjs tests/mcp-readiness.test.mjs` | PASS, 39/39 (`focused.log`). Initial metadata tests exposed missing JSON response headers in new mocks; corrected the fixtures and reran successfully. |
| `npm run typecheck` | PASS, exit 0 (`typecheck.log`) |
| `npm test` including build | PASS, 149/149, zero failed/skipped (`tests.log`) |
| `npx biome ci .` | Final PASS, 54 files (`biome-final.log`). Earlier run found a missing block in the test helper; corrected, then reran Biome and the affected cockpit tests. |
| Final affected cockpit tests | PASS, 17/17 (`cockpit-final.log`), after the brace-only test-helper fix; no implementation changed after the 149-test run. |
| `node --check scripts/test-cockpit-browser.mjs` | PASS syntax only; does not execute embedded page JS or browser assertions. |
| `npm run test:cockpit` | BLOCKED, exit 1 (`browser.log`): Chromium launch fails with `Target page, context or browser has been closed`, crashpad `setsockopt: Operation not permitted (1)`, process signal SIGTRAP. |
| `git diff --check` | PASS |
| Preservation comparisons | PASS: see below. |

Five added backend tests cover exactly three metadata GETs/no geometry, exact
scope/config/OAuth/target gates, revocation at each GET, malformed/foreign/duplicate
metadata, safe labels and grant revocation on the final GET. Five added UI tests
cover initial/navigation state, independent names/failure/staleness, auth/target
races, unsafe/mismatched responses/disposal, valid PNG/decoder/hash failures and
late image delivery after a target switch. Existing interim action tests pass.

## Browser evidence and screenshot gate

The original loopback fixture could not bind under sandbox policy. It was replaced
with serverless Playwright page routing: all document/module requests are fulfilled
in memory at an isolated synthetic HTTPS origin, all other requests are aborted,
and there is no local service, Gateway or provider connection. The harness retains
CSP, explicit action/payload regression checks and synthetic data labelling.

A direct serverless Chromium launch probe and the final harness both fail before
mounting any UI because Chromium itself is denied. No permission escalation,
production service or alternate permission bypass was attempted. No screenshot
was generated. Consequently keyboard execution, focus, clipping, visual hierarchy
and actual mounted browser appearance remain unverified, despite unit/CSS checks.

On an already-authorized browser host, the harness is intended to produce:

```text
docs/product/dashboard-workflow-2026-10-21/implementation/workspace-{1440x900,1366x768,390x844}.png
docs/product/dashboard-workflow-2026-10-21/implementation/cad-goal-blocked-{1440x900,1366x768,390x844}.png
docs/product/dashboard-workflow-2026-10-21/implementation/cad-payload-evidence-{1440x900,1366x768,390x844}.png
docs/product/dashboard-workflow-2026-10-21/implementation/print-blocked-{1440x900,1366x768,390x844}.png
```

These paths are intended outputs, NOT existing artifacts. They remain under the
already-excluded `docs/product` package subtree. The CAD evidence state still
shows a blocked goal; it must not be relabelled as the reference's running goal
iteration. Compare Workspace against reference 01, the goal panel/branch/view
hierarchy against 02, aggregate evidence against 03 (with the explicit blocked
goal limitation), and the unavailable print path against 04. Confirmed reference
PNGs/SVGs and the earlier operator report were not edited.

## Product criteria A1–A10

| ID | Status | Evidence / remaining work |
| --- | --- | --- |
| A1 | partial | Three actual destinations, dark/turquoise style, responsive reachable nav implemented; initial Workspace and state verified in unit tests. Browser/reference comparison blocked. |
| A2 | completed (local phase) | Assigned context, unknown team/project branding, actual connection/capability values, current/stale metadata and next action; print capability unavailable. No runtime/live acceptance claim. |
| A3 | partial | One assigned Candidate plus Primary; payload proposals never become separate Candidates, no fabricated ancestry. Goal-to-Candidate persistence/reuse and verified ancestry require bottom-up contract. |
| A4 | blocked | No goal approval/iteration actions registered or faked. Needs reviewed authorization and evidence of at least two admitted changes within the same bound Candidate. |
| A5 | blocked | Legacy protections preserved, but goal boundary/revocation/STOP/UNKNOWN server semantics and negative tests need bottom-up implementation. Legacy tests do not prove goal enforcement. |
| A6 | partial | Aggregate legacy receipt counts and next step, explicit goal block and no fabricated success/delivery. Goal progress/completion and original-channel result need bottom-up evidence. |
| A7 | blocked | Truthful unavailable 3D Print view and prerequisites implemented; no functional STL/profile/slice/preview adapter is evidenced. No estimates or print control. |
| A8 | completed (local phase) | All interim UI/action tests pass; scopes, exact hash, UNKNOWN reconciliation, preparation and stale-handler fences preserved. Server handler tail is byte-identical. Live browser remains unverified. |
| A9 | completed (local phase) | Independent current-name action and race/gate/image-error tests pass. Current names and pinned geometry separated. Opening/selecting/refreshing triggers no render or mutation; metadata GETs only beyond unchanged status readiness. |
| A10 | blocked | Required full checks pass and serverless harness is prepared, but Chromium is denied before mount; no screenshots, actual keyboard/browser comparison or technical/product acceptance claimed. |

## Exact incremental attribution

All following implementation files already existed as shared modified/untracked
work on entry. The new delta is measured against task-entry copies, not HEAD:

| File | Added lines | Removed lines | This phase's delta |
| --- | ---: | ---: | --- |
| `README.md` | 1 | 0 | Working-tree navigation/metadata status and blocked capabilities. |
| `docs/engineering-cockpit.md` | 52 | 20 | Three views, names independent of PNGs, blocked goals/print and serverless check. |
| `scripts/test-cockpit-browser.mjs` | 137 | 198 | Serverless routed fixture, new states/sizes, retained interim action checks. |
| `src/dashboard.ts` | 105 | 79 | Read-only workspace-context branch sharing existing render read guards; existing action tail unchanged. |
| `src/rest.ts` | 32 | 0 | workspaceContext using three existing metadata GET paths; no shared read/write semantics changed. |
| `tests/cockpit.test.mjs` | 219 | 10 | Metadata-aware harness/navigation and five focused UI tests; existing repair regressions retained. |
| `tests/dashboard-render.test.mjs` | 147 | 2 | Selectable read-action harness and five new metadata tests. |
| `tests/fixtures/cockpit.mjs` | 12 | 0 | Synthetic current metadata fixture, separate from PNG/revision. |
| `tests/mcp-readiness.test.mjs` | 1 | 0 | Expected action registry includes read-only workspace-context. |
| `ui/control-ui.js` | 298 | 52 | Three views, branch/goal hierarchy, truthful print block, independent labels and races. |

New file: `docs/prompts/2026-10-21-goal-workflow-topdown.report.md` (this report).
No other files are attributed to this phase. Incremental patches are saved in
`/tmp/coc-topdown-20261021/delta/` for serial integration review.

Preservation verified:

- `src/dashboard.ts` from the existing status/connect/disconnect registration
  through all existing candidate/mutation handlers and lifecycle code is
  byte-identical to entry; read-only changes are confined above that boundary.
- `src/config.ts`, `src/authorization.ts`, `src/authorization-snapshot.ts`,
  `src/candidate-authorization.ts`, `src/mutation-workflow.ts` equal HEAD; they
  were unmodified on entry and remain unmodified.
- `package.json`, `package-lock.json` and the earlier Operator report match entry.
- Other existing shared modifications/untracked material, including `.gitignore`,
  `.codex/`, team scripts, product/reference/review files, fixtures and pycache,
  were not cleaned up, reconstructed, committed or overwritten.

Final report-excluded `git status --short` (the report itself is an additional new file):

```text
 M .gitignore
 M README.md
 M package.json
 M src/dashboard.ts
 M src/rest.ts
 M tests/mcp-readiness.test.mjs
 M ui/control-ui.js
?? .codex/
?? docs/development-team.md
?? docs/engineering-cockpit.md
?? docs/product/
?? docs/prompts/2026-10-20-approval-v2-writer.md
?? docs/prompts/2026-10-21-cockpit-operator-actions.md
?? docs/prompts/2026-10-21-cockpit-operator-actions.report.md
?? docs/reviews/
?? scripts/__pycache__/
?? scripts/codex-team/
?? scripts/test-cockpit-browser.mjs
?? skills/onshape-team-coordination/
?? tests/cockpit.test.mjs
?? tests/dashboard-render.test.mjs
?? tests/fixtures/cockpit.mjs
?? tests/fixtures/png.mjs
```

## Bottom-up interface dependencies and next serial handoff

No guessed goal API is implemented. Before replacing the visible block, the
bottom-up owner must supply and review:

1. A durable goal-to-exact-team/document/element/Candidate association and stable
   goal identity, including reuse across refresh/resume and explicit source of
   verified ancestry. Several payloads must not imply several goal branches.
2. Authenticated human goal confirmation bound to target, allowed changes,
   preservation conditions and versioned goal scope; server enforcement and
   separation from the existing payload approval contract. Scope changes need a
   renewed confirmation; no local UI state or auto-approval can supply authority.
3. Bounded iteration admission, expiry/budget/recovery rules, durable attempt
   identity, revoke/STOP semantics, in-flight UNKNOWN reconciliation and prevention
   of duplicate writes. Test Primary/foreign-team/target/scope rejection and
   unauthorized/revoked admission before activation.
4. Readable goal progress/blocker/result evidence with explicit verification
   limits, current/pinned identity distinctions and original-channel delivery
   proof. A payload VERIFIED count is not the goal completion signal.

These are required semantics for the next review, not invented endpoint names
or an assumed MCP schema. Integrate serially into this same shared checkout only
after a bounded assignment. This phase stops here; no follow-on goal backend,
printer adapter, new services or permission changes were started.

The operator/architect must resolve the browser execution environment and review
the actual mounted UI before visual acceptance. Any deployment, runtime/provider
operation, real CAD mutation, original-channel delivery or physical printing needs
its own authorized operator process. No GitHub issue/board write, credential read,
container lifecycle action, external service or cost was introduced. `archiv/`,
`pip_os/` and onshape-mcp were not accessed.
