---
task-id: COC-GOAL-UI-20261021
parent: COC-GOAL-WORKFLOW-20261021
status: implemented-awaiting-review-contract-drift
contract-version: goal-1.0.0-draft (amended); server 1.1.0-draft (assigned backend)
e2e-request: required
base-commit: 99e1591cb122fabb12073d06905c15c7f1cb28b6
---
# Cockpit goal UI implementation report

## Outcome and review boundary

The CAD panel now reads goal-status and offers explicit goal-confirm, goal-stop and
second-step goal-close. It displays the complete request before confirmation, journal
progress, verification and open limits. Terminal history is collapsed and read-only.
F8 is fixed in the UI. No backend implementation or API was added.

Implementation was based on the assigned accepted backend and amended goal-1.0.0 contract.
During final verification another writer committed `68dfbc698612db84a3e5c57c410301672ddb6a0c`,
which introduces goal-1.1.0/server-1.2.0 and new contract fixtures. None of its files overlap
this task's edited files. Its backend changes are not present: the complete suite now has
two contract failures. U7 is therefore **not fully satisfied at the final HEAD**.
The new contract is recorded as an input change, not silently adopted as an implementation.

## Checks actually run

| Check | Baseline at 99e1591 | After implementation | Final at 68dfbc6 |
|---|---|---|---|
| npm run typecheck | PASS | PASS | PASS |
| npm test | 183 total; 182 pass, local stub listen EPERM | Human-approved host run: 192/192 PASS | Host: 192 total, 190 pass, 2 contract failures |
| npm run check (local biome ci) | PASS, 64 files | PASS, 64 files | PASS, 64 files |
| Focused cockpit tests | Existing tests included above | PASS | 26/26 PASS |
| npm run test:cockpit | Chromium sandbox SIGTRAP before fixture | Host PASS | Host PASS, 27 new screenshots |
| git diff --check | — | PASS | PASS |

The final sandbox suite has three failures: the two contract failures plus the existing
127.0.0.1 listen EPERM. Chromium also cannot start inside the sandbox (setsockopt denied,
SIGTRAP). Normal human-approved host execution was used for these local checks; no browser
permission flags or runtime permissions were changed. The harness intercepts fixture.test
requests and rejects unexpected requests; no Gateway, provider or external network is used.

Final contract failures, left unchanged because they are outside UI ownership:

- tests/contract.test.mjs:51: expected 1.1.0-draft, fixture VERSION now 1.2.0-draft.
- tests/contract.test.mjs:328: fixture progress has unreconciledEntry, backend projection does not.

Local logs: `/tmp/cockpit-goal-baseline-{typecheck,test,biome,browser}.log`,
`/tmp/cockpit-goal-after-test-host.log` (192/192),
`/tmp/cockpit-goal-final-{focused,test,test-host,browser}.log`.
These logs are local review evidence, not packaged repository artifacts.

## U1–U7 evidence

| Criterion | Evidence and result |
|---|---|
| U1 | PASS: tests/cockpit.test.mjs:588, F8 selection regression; browser harness:148 verifies the selected VERIFIED proof is visible and its enclosing details remains open. Final host harness passes. |
| U2 | PASS: tests:607 exact displayed hash/nonce and full review; :661 admin/capability/nonce/expiry/incomplete-review matrix. One pending token fences repeated handlers. UI:405 enablement, :436 action dispatch, :538 review. |
| U3 | PASS: tests:710 covers all nine states, null progress, missing verification and note limits. Only GoalView.progress supplies counters and success; result revision links must match the goal target. |
| U4 | PASS for assigned contract: tests:766 STOP state/admin matrix and no invented reconcile; :813 close paused-state/journal matrix, second confirmation/cancel and inert history. Missing counts or absent sequence cannot mean clear journal. |
| U5 | PASS: tests:213 and :149 retain no-action/no-render-on-load checks, now allowing goal-status reads. Legacy operator rendering/handlers are byte-identical to assigned HEAD and collapsed. |
| U6 | PASS for synthetic evidence: confirm/active/completed at both requested sizes plus 390×844; full-page copies show all review fields and result limits. Comparison below. Live acceptance remains open. |
| U7 | PARTIAL: typecheck, Biome, focused tests and browser pass; full suite passed 192/192 before concurrent contract commit, now 190/192. Own edits remain within ownership. |

Additional regressions: tests:863 verifies human failure message, technical code and no retry;
:883 discards stale status/action responses across refresh and connection switches;
:953 ensures safe text and target-bound result links. Existing PNG identity and generation
fences remain covered. Status reads occur on load, explicit refresh and after an action;
there is no new polling loop. No innerHTML, eval or foreign fetch was added.

## F8 cause and reproduction

Selecting a payload triggered a full UI render that recreated the history details closed.
The selected proof existed in the DOM but was hidden. This was a UI state-loss defect,
not a reason to weaken the harness visibility assertion. The UI now preserves the history
open state across renders and explicitly keeps it open after selection. Detached old details
cannot overwrite the retained state through a late toggle event.

The new focused F8 test was replayed against the original UI loaded from git show 99e1591
in /tmp: it failed with “selected proof stays visible, not merely present in a collapsed
subtree”. The same regression passes with the implementation, as does Chromium's real
visibility assertion. Log: `/tmp/cockpit-f8-reproduction.log`.
The harness uses keyboard Tab before testing focus-visible and activating confirm with Enter.

## Screenshots and comparison with references 02/03

All images are prominently labelled synthetic demonstrations. The fixture's escaped HTML
label is intentional safety evidence. The dark cyan cockpit, navigation, branch column and
main goal hierarchy follow references 02/03. Confirmation shows the actual bounded request
instead of the blocked placeholder. Active iteration shows counters, time and STOP; the
confirmed scope is collapsible. Completed shows verification checks and unresolved note limits.

Differences: real contract review includes IDs, conditions, hash, expiry and scope, so it is
longer than the visual mockup. Desktop top-of-page captures do not fit the whole review or
all controls above the fold; the full-page companions show the remainder. Scrolling is required.
No invented plate geometry or branch ancestry was added. Existing payload evidence remains
separate from goal evidence. This is synthetic layout/accessibility evidence, not live CAD
acceptance or a claim of pixel-identical mockup reproduction.

Screenshot directory: `../product/dashboard-workflow-2026-10-21/implementation/`.
Each file below is new; original screenshots are untouched.

- [goal-ui-active-1366x768-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-active-1366x768-full.png)
- [goal-ui-active-1366x768.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-active-1366x768.png)
- [goal-ui-active-1440x900-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-active-1440x900-full.png)
- [goal-ui-active-1440x900.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-active-1440x900.png)
- [goal-ui-active-390x844-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-active-390x844-full.png)
- [goal-ui-active-390x844.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-active-390x844.png)
- [goal-ui-cad-payload-evidence-1366x768.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-cad-payload-evidence-1366x768.png)
- [goal-ui-cad-payload-evidence-1440x900.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-cad-payload-evidence-1440x900.png)
- [goal-ui-cad-payload-evidence-390x844.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-cad-payload-evidence-390x844.png)
- [goal-ui-completed-1366x768-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-completed-1366x768-full.png)
- [goal-ui-completed-1366x768.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-completed-1366x768.png)
- [goal-ui-completed-1440x900-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-completed-1440x900-full.png)
- [goal-ui-completed-1440x900.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-completed-1440x900.png)
- [goal-ui-completed-390x844-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-completed-390x844-full.png)
- [goal-ui-completed-390x844.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-completed-390x844.png)
- [goal-ui-confirm-1366x768-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-confirm-1366x768-full.png)
- [goal-ui-confirm-1366x768.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-confirm-1366x768.png)
- [goal-ui-confirm-1440x900-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-confirm-1440x900-full.png)
- [goal-ui-confirm-1440x900.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-confirm-1440x900.png)
- [goal-ui-confirm-390x844-full.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-confirm-390x844-full.png)
- [goal-ui-confirm-390x844.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-confirm-390x844.png)
- [goal-ui-print-blocked-1366x768.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-print-blocked-1366x768.png)
- [goal-ui-print-blocked-1440x900.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-print-blocked-1440x900.png)
- [goal-ui-print-blocked-390x844.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-print-blocked-390x844.png)
- [goal-ui-workspace-1366x768.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-workspace-1366x768.png)
- [goal-ui-workspace-1440x900.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-workspace-1440x900.png)
- [goal-ui-workspace-390x844.png](../product/dashboard-workflow-2026-10-21/implementation/goal-ui-workspace-390x844.png)

## Changed files and preservation

Own tracked edits (five):

- ui/control-ui.js
- tests/cockpit.test.mjs
- tests/fixtures/cockpit.mjs
- scripts/test-cockpit-browser.mjs
- docs/engineering-cockpit.md

Own new files: this report and the 27 screenshot files listed above.
No other intentional changes. Build output is ignored and not part of the source diff.

A SHA-256 baseline of 323 existing files is stored in
`/tmp/cockpit-goal-ui-baseline.json`. Final comparison confirms byte-for-byte preservation
of README.md, spec.md, all seven preexisting modified product/spec documentation files,
the original six screenshots, and the untracked approval-v2 prompt. Source, manifests,
agent/skill/deployment files and unrelated tests are unchanged by this task.
The only baseline hash differences outside the five owned edits are the seven existing
contract files changed by committed 68dfbc6; that commit also introduces two uncertain-journal
fixtures. They are not UI-task edits. No overlapping UI writer was observed.

No Git mutation was performed. All UI changes remain uncommitted; the base revision and
current diff replace a commit list. No runtime, deployment, live channel, CAD or printer
operation was performed.

## Backend change requests and limitations

CR-UI-1: The assigned GoalView provides only unreconciledSequence, not the complete
reconcile tuple. The UI truthfully disables reconcile and directs the user to the Engineer
with complete server error data. It never fabricates sequence inputs or retries writes.
Concurrent contract 68dfbc6 specifies unreconciledEntry and goalId-only reconcile, but the
accepted backend does not implement that new projection yet (confirmed by the failing
fixture test). Backend owner must implement and validate that contract in its own scope;
a separately bounded UI follow-up can then enable reconcile using accepted capability/data.
This report does not authorize that work or replace the assigned contract.

Operator confirmation remains ADR D1's interim dashboard authority. Browser evidence is
synthetic; live E2E and human usefulness/visual acceptance are required. No deployment is
requested or performed here.

## Architect review

Reviewed by Codex onshape-architekt for COC-GOAL-UI-20261021. Repository: clawonshape; branch: feat/18-goal-authorization; assigned base: 99e1591cb122fabb12073d06905c15c7f1cb28b6; examined final HEAD: 68dfbc698612db84a3e5c57c410301672ddb6a0c plus the uncommitted UI diff.

Verdict: the bounded UI implementation satisfies U1-U6 against the assigned goal-1.0.0-draft/server-1.1.0-draft contract. No blocking defect was identified in that UI diff. U7 is PARTIAL at the final HEAD: the integration must not be reported as fully green.

Finding (blocking complete integration acceptance; backend/contract owner): concurrent commit 68dfbc6 changes tests/contract/VERSION to 1.2.0-draft and requires progress.unreconciledEntry, while tests/contract.test.mjs:51 and :328 and the existing GoalView producer remain on the assigned earlier contract. The report records the resulting two failures (190/192 at final HEAD, compared with 192/192 before that commit). The new goalId-only reconciliation contract requires a separately bounded backend implementation and subsequent UI reconciliation task. Do not weaken the tests, change the backend in this UI task, or infer support from the new document alone. User impact: the present UI intentionally directs uncertain outcomes to the Engineer and does not offer a fabricated reconcile request.

Evidence per criterion: U1, F8 open-state preservation and its regression assertion, plus the reported passing real Chromium fixture; U2, complete visible review, unchanged displayed hash/nonce, admin/capability/state gates and pending token; U3, state and null-progress tests plus independent passed-verification requirement and note limits; U4, STOP matrix, no invented reconcile tuple, and explicit two-step close with known-clear journal; U5, unchanged legacy operator functions, collapsed history/operator controls and read-only load actions; U6, confirm/active screenshots inspected against references 02/03, with desktop/mobile and full-page evidence supplied; U7, reported typecheck/Biome/26 cockpit tests/browser passes, current full-suite failures explicitly retained. The architect did not rerun the developer's tests.

The visual structure is consistent with the references, with an acknowledged longer confirmation review and substantial inherited payload/model sections below the goal panel. This is fixture evidence, not human visual/usefulness acceptance or live CAD acceptance. The separate spec-consolidation documents were independently verified byte-identical by hash; no local backend, contract, manifest or unrelated-test edits were introduced by this UI task. Changes remain uncommitted. Bottom-up architect review, resolution of the current contract/backend mismatch, and separately authorized live acceptance remain outstanding.
