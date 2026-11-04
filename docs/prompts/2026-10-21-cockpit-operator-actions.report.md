---
status: blocked
contract-version: 1.0.0-draft
e2e-request: required
---
# Cockpit operator actions — implementation report

Task: COC-OPERATOR-REPORT-20261021, prerequisite of COC-GOAL-WORKFLOW-20261021.
Date: 2026-10-21. Implementation is complete within the bounded repair scope;
browser verification is blocked by sandbox permissions. This is not a deployment
or live acceptance report. No goal workflow work was started.

## Sources and starting state

Read the entire local repair prompt and fetched both GitHub comments through the
connected GitHub read-only fetch tools, without reading credentials:

- User decisions: https://github.com/edge-robot/clawonshape/issues/17#issuecomment-6309818798
  (F6 English documentation, F7 accepted versioning).
- Full architect review: https://github.com/edge-robot/clawonshape/issues/17#issuecomment-6299525709
  (B1 and F2–F7, including the release gate).

Verified branch `demo/gateway-native-read-20261014`, HEAD
`b63a82b3fb7eac3241d16c18516db372fdf6a5aa`, single worktree at the assigned
repository. Existing cockpit implementation and tests were present. Operator
buttons were absent; package files still included all docs; cockpit documentation
was German; browser dependency requirements were undocumented. No previous
Operator-actions repair was claimed as completed.

Before edits, copied relevant source files and the status listing into
`/tmp/coc-operator-20261021/before/` and `status-before.txt`. These temporary
snapshots support attribution of this task's delta, rather than attributing the
entire pre-existing Git diff to this task. Temporary paths are not durable CI artifacts.

## Changes

- Added a separate warning-coloured, collapsed `details` section below the read-only
  overview. It lists every returned proposal, including its exact target, feature ID,
  source microversion, hash and body before the action buttons, and terminal reasons.
- Preserved the three action IDs and their existing payloads. Approval requires
  PROPOSED and OAuth write; reconciliation requires UNKNOWN; preparation requires
  OAuth write and a binding still assigned to Primary. All additionally require
  explicit admin capability. Backend scopes, binding checks and Primary protection
  remain unchanged. Preparing a separate Candidate does not modify Primary.
- Reused `call(...)` and the selected connection; no second fetch path. Actions are
  explicit single attempts, locked while pending. Approval/reconciliation reload
  status after success or failure. Preparation displays the response or a neutral
  failure and stays disabled until explicit refresh. No automatic retry.
- Old handlers are fenced by generation/connection and current proposal membership;
  missing or unknown admin capability fails closed. `host.connection.canAdmin` is
  declared in the locally installed development SDK's
  `node_modules/openclaw/dist/plugin-sdk/control-ui.d.ts` (OpenClaw 2026.9.9).
  This is local SDK evidence, not a fresh runtime/container check.
- Excluded `docs/product` from npm package files, translated the cockpit guide,
  corrected the README, and documented the manual browser dependency (F3 option b).
  German UI labels and the existing revision URL/token logic were preserved.

## Fresh checks

All commands below ran during this task, not copied from the 2026-10-20 checkpoint.
Logs: `/tmp/coc-operator-20261021/`.

| Check | Baseline before changes | Final after changes |
| --- | --- | --- |
| `npm run typecheck` | PASS, exit 0 (`typecheck-before.log`) | PASS, exit 0 (`typecheck-after.log`) |
| `npm test` (includes build) | PASS, 132/132, no failures/skips (`test-before.log`) | PASS, 139/139, no failures/skips (`test-after.log`) |
| Biome | `npx --no-install biome ci .`: PASS, 54 files, exit 0 (`biome-before.log`) | `npx biome ci .`: PASS, 54 files, exit 0 (`biome-after.log`) |
| `npm pack --dry-run --json --cache /tmp/clawonshape-npm-cache` | PASS, includes product docs (`pack-before.json`) | PASS, excludes product docs (`pack-after.json`) |
| `npm run test:cockpit` | Not run as baseline | BLOCKED, exit 1: `listen EPERM: operation not permitted 127.0.0.1` (`browser-after.log`) |
| `git diff --check` | Not recorded | PASS, exit 0 |

`/usr/bin/chromium` exists, but the existing loopback fixture server cannot bind
inside the sandbox. The failure occurs before Chromium launch. No additional
permission was requested or approved, as required by this handoff. Consequently
no new browser screenshot was created, no browser assertion is claimed passed,
and the extended browser script still requires an actual run in an authorized
environment. Its intended expanded screenshot output is
`/tmp/coc-operator-20261021/operator-actions-expanded.png` (NOT generated).
Existing screenshots elsewhere must not be treated as evidence for this repair.

## Acceptance evidence A1–A10

| Criterion | Result and concrete evidence |
| --- | --- |
| A1 | PASS at fixture DOM level: test `operator section is collapsed; exact payload precedes approval; no actions or render on load`; `details` has no open flag and contains all three controls. Actual browser appearance/screenshot remains BLOCKED. See DOM excerpt below. |
| A2 | PASS: `operator enablement covers status, OAuth write and missing or unknown admin; terminal reasons remain` covers six proposal states across admin/OAuth combinations. `explicit approval sends reviewed hash once, locks while pending and refreshes status` asserts exact connectionRef/proposalId/expectedPayloadHash and double-click fencing. `UNKNOWN reconcile sends only proposal identity and refreshes even on failure, without retry` asserts exact payload and one dispatch. Preparation tests cover both binding states, OAuth conditions, response/error and single dispatch. |
| A3 | PASS: equivalent restored REJECTED coverage asserts `fixture-REJECTED — REJECTED (approval_expired_not_dispatched)` and disabled approval/reconciliation for terminal states, including VERIFIED and FAILED. |
| A4 | PASS: initial mounted requests equal exactly `status`, `mutation-status`, with no approval, reconciliation, preparation or provider render. Existing image integrity/refresh tests also pass. |
| A5 | PASS for this task: byte comparisons against task-entry copies prove zero changes to `src/dashboard.ts`, `src/rest.ts`, `src/mutation-workflow.ts`, `src/readiness.ts`. The pre-existing HEAD diff in src is documented below and remains shared work. No backend guard or scope changed. |
| A6 | PASS: before/after dry-run manifests show 21 product paths removed, no product path remaining. `dist/`, `openclaw.plugin.json`, `README.md`, `spec.md`, `skills/` and all prior non-product docs remain. |
| A7 | PASS: F3 option b documented in `docs/engineering-cockpit.md`: manual host-only Chromium check using transitive playwright-core; separate from `npm test`. `package-lock.json` byte-identical to entry snapshot. |
| A8 | PASS for required typecheck, npm tests and Biome (139 >= 132). Conditional browser check attempted and BLOCKED by fixture server EPERM; no screenshot evidence. |
| A9 | PASS: README and cockpit guide describe the separate interim section and three existing actions until P3b; removed the blanket assertion that the cockpit does not invoke them. |
| A10 | PASS by documentation comparison: guide translated into English, existing structure/facts and historical live-acceptance caveats retained; German UI labels quoted with English glosses. Repair-specific operator explanation and F3 instructions added as required. |

Seven new unit tests in `tests/cockpit.test.mjs` cover the repair, including
stale handlers after refresh/target change/disposal and direct handler calls
without admin rights. All test actions use fixtures, with no provider access.

Fixture DOM serialization was actually generated from the mounted UI using the
same minimal Element double as the unit tests, at
`/tmp/coc-operator-20261021/operator-actions-dom.html`. It contains four proposal
sections and `open = false`. This is mock DOM evidence, not browser rendering:

```html
<details id="coc-operator-actions">
  <summary>Operator-Aktionen (Übergang bis Discord-Freigabe)</summary>
  <!-- admin/P3b/single-attempt notice and result status -->
  <div>
    <p>Exakten Payload vor der Freigabe prüfen. Primary bleibt geschützt.</p>
    <button disabled>Candidate vorbereiten</button>
    <section>
      <h3>fixture-PROPOSED — PROPOSED</h3>
      <!-- summary, then exact JSON payload in pre -->
      <pre>...</pre>
      <div>
        <button>Approve this Candidate update</button>
        <button disabled>Reconcile execution outcome</button>
      </div>
    </section>
    <!-- UNKNOWN / VERIFIED / REJECTED cards -->
  </div>
</details>
```

The excerpt is abbreviated from the generated fixture structure. Candidate
preparation is intentionally disabled for this already-assigned Candidate fixture;
its enabled Primary-binding case is covered by unit tests.

## F3 choice

Option **b** avoids changing the lockfile or dependency surface for a manual host
check. The guide explicitly records the transitive dependency and local Chromium
requirement. `test:cockpit` remains outside `npm test`. A future transitive dependency
change could require revisiting this choice; no browser portability is claimed.

## npm pack file-list delta (paths only)

Removed:

```text
docs/product/architect-codex-handoff.md
docs/product/dashboard-cockpit.png
docs/product/dashboard-cockpit.svg
docs/product/dashboard-issue-draft.md
docs/product/dashboard-workflow-2026-10-21/01-workspace.png
docs/product/dashboard-workflow-2026-10-21/01-workspace.svg
docs/product/dashboard-workflow-2026-10-21/02-cad-ziel.png
docs/product/dashboard-workflow-2026-10-21/02-cad-ziel.svg
docs/product/dashboard-workflow-2026-10-21/03-cad-iteration.png
docs/product/dashboard-workflow-2026-10-21/03-cad-iteration.svg
docs/product/dashboard-workflow-2026-10-21/04-3d-print.png
docs/product/dashboard-workflow-2026-10-21/04-3d-print.svg
docs/product/dashboard-workflow-2026-10-21/README.md
docs/product/feature-trace.md
docs/product/github-board-review-2026-10-20.md
docs/product/github-read-access.md
docs/product/mutation_user_journey.png
docs/product/pib-user-journey.md
docs/product/pib_user_journey.png
docs/product/vision-and-features.md
docs/product/weekly-execution-2026-10-25.md
```

Added by this report (verified by the final dry-run after report creation):

```text
docs/prompts/2026-10-21-cockpit-operator-actions.report.md
```

All other prior paths remain present, including the translated guide and the
existing non-product documentation. This is a working-tree package dry-run, not
an actual release archive or deployment.

## File attribution

Files changed by this task, all already modified/untracked on entry except report:

- `ui/control-ui.js`: interim operator section, enablement, exact payload review,
  action handling and refresh/connection fences.
- `tests/cockpit.test.mjs`: DOM test double updated and seven repair tests added;
  existing read-only assertion adjusted to permit visible collapsed actions.
- `scripts/test-cockpit-browser.mjs`: added admin/OAuth fixture state, local action
  responses, expanded-section screenshot and action assertions. Browser run blocked.
- `package.json`: only new delta is `!docs/product` in files.
- `README.md`: only new delta is the status bullet describing interim actions.
- `docs/engineering-cockpit.md`: English translation and required operator/F3 text.
- `docs/prompts/2026-10-21-cockpit-operator-actions.report.md`: this new report.

Other pre-existing work was preserved, including `.gitignore`, `.codex/`,
`docs/development-team.md`, `docs/product/`, both existing prompt files,
`docs/reviews/`, `scripts/codex-team/`, `scripts/__pycache__/`,
`skills/onshape-team-coordination/`, `src/dashboard.ts`, `src/rest.ts`,
`tests/mcp-readiness.test.mjs`, `tests/dashboard-render.test.mjs` and fixture files.
No cleanup or reconstruction was performed; no pycache was created/deleted by this task.

Final `git status --short`:

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

The full HEAD-based src diff remains pre-existing:

```text
 src/dashboard.ts | 109 +++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/rest.ts      |  39 +++++++++++++++++---
 2 files changed, 138 insertions(+), 10 deletions(-)
```

Task-entry/final SHA-256 (identical):

```text
src/dashboard.ts 3dd89b3a9a1009d21aacbee793115db17c86b4fa06a4cd18c625a3b600d3b16b
src/rest.ts 945d4b4a8a71a295c967327e866e57376282e5f05d3cad7334b3827580dbaef9
src/mutation-workflow.ts 28b86d4829c09964570166ecb6614643491ba6c8564ace481264f1e98845717d
src/readiness.ts 7253054a6f9089bc193af0bc1b97ea0e5f465f6e7a6564a949f3963af54e5f3c
package-lock.json da6bba36aab734d5037066eb61be09f7b6ce6ff63edf86b69d70330744b2ce87
```

## Remaining gates and decisions

No backend change request. No commit, push, PR, branch/worktree/stash change,
deployment, service/container operation, live CAD write, Discord message, real
provider render or credential read occurred. No permission boundary was changed.

1. Run the isolated `npm run test:cockpit` in an environment already authorized to
   bind loopback and launch Chromium; collect the expanded-section screenshot and
   resolve any actual browser failures. This handoff does not authorize escalation.
2. Architect reviews the actual incremental repair and this blocked browser evidence.
3. Any subsequent commit/rollout remains an operator decision, outside this task.
4. Required live user acceptance after an authorized rollout: explicit approval and
   reconciliation via the section, F4 exact microversion navigation, empty/error
   states, distinct approval/execution/verification evidence and refresh. F5 token
   comparison is unchanged. Historical comparison images and name/refresh usability
   remain open as documented; full user acceptance has not passed.
5. Goal workflow development was not started and needs a separate bounded assignment.
