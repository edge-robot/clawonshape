# Work-context selector UI implementation report

Task: `COC-CONTEXT-SELECTION-UI-20261022`  
Parent: `COC-CONTEXT-SELECTION-20261021`  
Date: 2026-10-22  
Status: implemented and offline verified; **architect review pending**; uncommitted.

## Workspace and authority

All implementation, dependency installation, builds and checks used only the existing
`<workspace>/clawonshape-ui` worktree on `feat/21-selection-ui`.
Initial and final HEAD: `613553c9dd1b5e1f9a6a92d5e22ae135cf68ac39`.
Implementation base: the same commit; prompt base `ae7a05f` is an ancestor.
Initial `git status --short` was empty; no user modifications were present or overwritten.
The worktree existed, was accessible and registered without a prunable annotation.
Applicable ancestor/worktree AGENTS.md paths were checked; none existed. README,
selector prompt, contracts/fixtures, spec S1–S9 and accepted ADR I1–I5 were read.
No worktree or branch was created. Main checkout files were not changed.

No src, backend tests, contract, fixtures, ADR, spec, package manifest or lockfile
changes. No new dependencies, live Onshape/CAD calls, messages, deployments, services,
GitHub writes or pushes. The coordination skill was used for the bounded handoff;
the result is returned in this conversation, without prompting the parent.

## Implemented behavior

The existing native page owns a compact context card shared by Workspace and CAD
and a native modal dialog with local drafts, per-column search and Part Studio groups.
Document is preselected, Primary is selectable, Candidate is inspection-only; hidden
solid Parts remain selectable. Secondary Part IDs distinguish same-name Parts.
`parts: null`, `[]`, unsupported kinds/configurations, unprovisioned studios and
truncation each have an explicit presentation.

Part previews use only `work-context-preview`. Request identity includes generation,
connection, request number, selected Part and observed microversion; mismatched or
late replies cannot return an old image. Decoder failure is also unavailable.
There is no whole-studio fallback and no compact-card preview cache.

Only explicit adoption sends `work-context-adopt`, using the catalog's expected
selection revision and the listed contract fields. Success closes the dialog.
Revision conflict reloads and shows the winning status. Stale adoption reloads status
and the catalog for review; a stale catalog read retries once. No write is retried.
Other codes explain their distinct recovery. Failed adoption preserves the confirmed
record; uncertain transport asks for status validation rather than write repetition.

Opening revalidates the status and restores only a valid confirmed selection.
Cancel/close/Escape discard drafts and restore focus. During a dispatched adoption,
dismissal is disabled until the outcome is known. Search edits preserve focus/caret;
the modal traps forward/backward Tab at its boundaries. WorkContextView alone supplies
validity and interlock; goal actions refresh this view rather than deriving an interlock
from goal state. Unknown status fails closed. Invalid/unverified views show their
reasons and never reuse an old preview.

`GoalView.target.focus` is shown before confirmation with literal Part name, exact
Part Studio element ID, Part ID and selection revision, plus the feature-based
condition/containment limitation. No current selection is substituted for historical
focus. The contract provides no Part Studio label in GoalView, so no name is invented.

## Checks

| Command/check | Actual result |
| --- | --- |
| `npm ci --cache /tmp/clawonshape-ui-npm-cache --no-audit --no-fund` | PASS; 346 packages, existing lockfile unchanged |
| `npm run typecheck` | PASS, exit 0 |
| `npm test` | PASS, 199/199, exit 0 |
| `npm run check` (local Biome 2.5.15) | PASS; 66 files, no fixes, exit 0 |
| `npm run test:cockpit` | PASS; existing cockpit regression plus 31 selector check groups, exit 0 |
| `git diff --check` | PASS |
| Protected-path / manifest / lockfile diff | Empty |

The sandbox-only installation failed with `EAI_AGAIN registry.npmjs.org`. The normal
approval mechanism allowed registry access and installation then passed. npm reported
five packages with unapproved install scripts; no extra script approvals were granted.
The sandbox-only suite had 198 passes and one pre-existing test-environment failure:
`tests/goal-workflow.test.mjs:716`, `listen EPERM 127.0.0.1`. The approved offline rerun
passed all 199 tests. Chromium initially failed before loading the page with
`setsockopt: Operation not permitted`, SIGTRAP; the approved run outside that sandbox
passed with every page/module and gateway response intercepted. These were sandbox
restrictions, not remaining product test failures. No unrelated failure remains.
Only the named changed JavaScript files were formatted, never the whole repository.

Actual check output: [checks.txt](../product/onshape-selection-2026-10-21/implementation/checks.txt).

## U1–U7 evidence

All screenshot prefixes below expand to `1440x900`, `1366x768`, `390x844`, under
`docs/product/onshape-selection-2026-10-21/implementation/`.
Dialog screenshots additionally have a `-review.png` view of the lower summary.
The [evidence index and exact 78-image manifest](../product/onshape-selection-2026-10-21/implementation/README.md)
links every actual file.

| Criterion | Result and evidence |
| --- | --- |
| U1 | PASS: `02-dialog-*`, `02-empty-studio-*`, `02-configured-studio-*`; bounds, hidden/same-name IDs, search/no matches, null/empty, truncation and view reasons asserted |
| U2 | PASS: `01-before-*`, `02-dialog-*`, `03-adopted-*`; exact adopt fixture input with optional connectionRef, close/focus, compact card, Onshape URL and shared Workspace/CAD selection asserted |
| U3 | PASS: all 8 new and 8 reused codes independently asserted against expected user outcomes; all 5 view reasons; `04-*`, `05-*`, `06-*`, `11-*`. Includes explicit recovery, winner revision, no write retry and retention of non-empty prior selection |
| U4 | PASS: original `view-invalid.json` used in place; all three interlocks, invalid missing/unsupported/configured, unverified access/read/provider reasons, status failure and read-only operator; `07-*`, `08-*`, `09-*`; cached images absent |
| U5 | PASS within the published view: `10-goal-focus-*`; literal name, exact studio identity and conditions note occur before confirmation. Human-readable studio label is absent from GoalView (see limitations) |
| U6 | PASS: cancel, close, Escape, reopen, refresh retention, entry focus, visible keyboard focus, native modal plus explicit Tab-boundary handling, editable search caret; full choose/adopt/compact/reopen/cancel flow and backward focus wrapping at all three required viewports; pending adoption cannot falsely claim cancellation. Late preview/catalog replies, wrong Part/microversion, refresh/disposal fences asserted |
| U7 | PASS: all four required commands above; synthetic browser acceptance only |

Browser source: `tests/cockpit-selection-browser.mjs`, invoked by
`scripts/test-cockpit-browser.mjs`. It reads the actual contract JSON in place and
modifies only in-memory copies for error/empty/configuration/race scenarios. A configured
or empty studio variant uses the bound studio; it does not invent a second authorized
element. Each selected Part gets its own labeled schematic PNG and decoding/content
are checked. No remote requests escaped interception and no page errors occurred.

## Exact changed files

- `ui/control-ui.js`
- `tests/cockpit.test.mjs`
- `tests/cockpit-selection-browser.mjs` (new)
- `scripts/test-cockpit-browser.mjs`
- `docs/engineering-cockpit.md`
- `docs/prompts/2026-10-22-work-context-selector-ui.report.md` (this report, new)
- `docs/product/onshape-selection-2026-10-21/implementation/README.md` (new)
- `docs/product/onshape-selection-2026-10-21/implementation/checks.txt` (new)
- The 78 exact PNG paths listed in the linked evidence manifest (all new).

Existing goal-workflow screenshot files were restored to their initial bytes after
the first regression run; subsequent regression runs write to /tmp only.

## Limitations, contract requests and review

No blocking CR-UI-n: implementation uses only fields already defined in
`work-context-1.0.0-draft` and `goal-1.2.0-draft`. Goal focus's Part Studio is displayed
by exact element ID because the contract has no label; a label would need a later
architect-owned contract addition, not an inferred name from current metadata.
This is mock-only evidence, not backend integration, authorization enforcement,
provider endpoint support, CAD geometry validation, persistence/restart acceptance,
deployment verification or product acceptance. Backend integration and contract open
points WC1–WC6 remain with their owners. The backend at main has not been integrated.

Architect review: **PENDING**. No architect approval is claimed. Remaining decisions:
architect review of the actual diff/evidence, integration with the independently
implemented backend, and later product/live acceptance under separate authority.

## Commit list and operator action

Commit list: **none**. HEAD remains `613553c9dd1b5e1f9a6a92d5e22ae135cf68ac39`.
The linked worktree Git directory is
`<workspace>/clawonshape/.git/worktrees/clawonshape-ui`,
with common directory `<workspace>/clawonshape/.git`.
Those administrative paths are read-only under this session's configured permissions
and lie in the explicitly excluded main checkout. The handoff permits leaving changes
uncommitted when commit authority is unavailable. No Git write or permission expansion
was attempted. Changes are reviewable in the existing UI worktree.

After review, an authorized operator can commit on `feat/21-selection-ui` with author
`Albert Kos <kickban3000@gmail.com>` and the requested message/trailers:

```text
feat(ui): add bounded work-context selector

Refs: edge-robot/clawonshape#17
Refs: edge-robot/clawonshape#21
Prompt: docs/prompts/2026-10-22-work-context-selector-ui.md
Agent: openclaw-dev
```

Never push as part of this handoff.
