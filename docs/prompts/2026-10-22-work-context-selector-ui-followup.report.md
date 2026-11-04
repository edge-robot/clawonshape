# Work-context selector UI follow-up report

Task: `COC-CONTEXT-SELECTION-UI-FIX-20261022`  
Parent: `COC-CONTEXT-SELECTION-UI-20261022`  
Date: 2026-10-22  
Status: implemented and offline verified; **architect review PENDING**.

## Repository, baseline and authority

Repository/worktree: `<workspace>/clawonshape-ui` only.  
Branch: `feat/21-selection-ui`.  
Base and final HEAD: `6691cfc50a4848911eff83d43a1d1566303924d3` (changes uncommitted).
Initial `git status --short` was empty; there were no user edits to preserve.
Worktree list and branch -vv confirmed the existing registered worktree. README,
the full follow-up prompt, amended contract including CR-1–CR-8 and applicable
ancestor/worktree AGENTS.md paths were checked (no applicable AGENTS.md present).
UI `7395e3d` and accepted backend `4a9f342` were already integrated via `ca9d106`;
no merge, branch or worktree recreation was requested or performed.
Existing node_modules was used; no installation or dependency/lockfile edits.
Main checkout, contracts, fixtures, src, backend tests, spec and ADR remain unchanged.
No live calls, runtime/service/CAD operations, GitHub writes, push or permission
changes. The normal approval mechanism was used only for offline browser/local-stub
execution that the sandbox cannot run.

## F1 — CR-2 nullable names

A single nameNodes helper renders document/workspace/studio labels as literal text.
Missing labels become "Name nicht verfügbar" followed by a separate `.coc-revision`
span with the existing short ID. The same rule is used by all catalog columns,
selected-Part provenance and compact card. Search joins only available labels and
actual IDs, so JSON null is never interpolated as a name or search term. Part names
remain strict; no Part-name fallback was added.

Browser assertions mutate in-memory copies of catalog.json and view-valid.json:
all nullable labels at once, three required viewports, separate ID/fallback spans,
null producing no search hits, ID-based recovery, unchanged strict Part names,
summary and compact card, and enabled adoption of the actual Part. New evidence:
`13-null-names-{1440x900,1366x768,390x844}{,-review}.png` (six files).

## F2 — CR-7 / CR-4 recovery

`connection_busy_or_state_unavailable` uses the same single status-reload path as
CAS conflict. Only a successful, current WorkContextView closes the dialog and
shows the current winner; the busy-specific notice is exactly
"Gerade belegt · Status neu geladen". A failed status read keeps the dialog
unavailable and explicitly says the status could not be reloaded; it never claims
to have loaded a winner. Neither path repeats adoption.

`target_not_part_studio` renders "Gebundenes Element ist kein Part Studio · Betreiber
prüfen."; `target_missing` renders "Gebundenes Element nicht vorhanden · Betreiber
prüfen.". The U3 code loop now includes all three codes. Assertions prove the
winner/its revision, distinct busy notice, failure-to-reload behavior, one write
attempt, and retention of a non-empty prior selection for both target failures.
New evidence: `12-busy-winner-{1440x900,1366x768,390x844}.png` (three files).

## Other accepted interpretations and F4

- CR-1: labels remain display data; no provider reads or identity policy changed.
- CR-3: preview strings must be below 65,000 characters; decoded PNG dimensions
  must be 256×256. The mock supplies per-Part 256px PNGs. Browser cases reject
  exactly 65,000 characters and an otherwise valid PNG with wrong dimensions.
- CR-5: R1 read codes retain their own outcome (added reconnect_required and
  target_missing preview cases); only unavailable image rendering uses its image
  fallback. Existing authorization/stale/membership fences remain covered.
- CR-6: provider studio order is rendered without sorting, and absence of a Candidate
  row is respected even when the separate goal fixture contains a Candidate.
- CR-8: a cleared selection with revision 9 is not reset to zero; explicit adoption
  sends expectedSelectionRevision 9 and renders revision 10. No clear UI was added.
- F4: the exact studio element ID remains sufficient for GoalView focus; no CR needed.

## F3 — explicit evidence refresh

Both browser suites use `tests/cockpit-evidence.mjs`. Unset
`COCKPIT_EVIDENCE_DIR` creates a unique temporary directory for each suite;
all screenshot paths now pass through this helper. Explicit opt-in writes selector
files directly into the supplied root and regression files in `regression/`.
`COCKPIT_EVIDENCE_FILES` accepts exact comma-separated relative filenames and
filters writes only, leaving assertions at every viewport active. No new dependency.

Normal run 1: before/after `git status --short --untracked-files=all` identical;
SHA-256 identical for **all 120 tracked PNGs**. No extra tracked/untracked repository
artifacts. Source/test edits were the only entries in both snapshots.
Final normal run after targeted refresh: before/after status identical and SHA-256
identical for **all 129 PNGs**, including the six refreshed and nine new images.
Both normal runs and the targeted opt-in passed with 38 selector check groups.
Build output remains the existing ignored dist output required by test:cockpit.

The explicit opt-in used exactly the 15 filenames below: six existing preview
review images changed semantically (256px PNG plus actual workspace label in the
selected-Part provenance), nine new F1/F2 images. The other 114 existing PNGs
remain byte-identical to the baseline. No regression screenshots or timestamp-only
refreshes were written. The old original checks.txt remains historical.

[Exact before/after statuses, all PNG SHA-256 values and refresh list](../product/onshape-selection-2026-10-21/implementation/followup-evidence-audit.json).

## Checks

| Check | Result |
| --- | --- |
| npm run typecheck | PASS, exit 0 |
| npm test | PASS, 217/217, exit 0 (integrated backend included) |
| npm run check (local Biome ci) | PASS, 71 files, exit 0 |
| npm run test:cockpit, normal | PASS; original U1–U7 plus 38 selector check groups |
| npm run test:cockpit, targeted opt-in | PASS; same 38 groups and exact 15-file capture filter |
| git diff --check | PASS |
| Protected paths / manifest / lockfile diff | Empty |

In the sandbox, the existing local HTTP-stub test fails with listen EPERM on
127.0.0.1 and Chromium fails before page load with setsockopt EPERM/SIGTRAP.
The approved offline reruns pass; no remaining product or unrelated failure.
No network npx downloads, generic repository formatter or install step used.
Screenshots and functional keyboard/adopt/cancel flows retain all three viewports:
1440×900, 1366×768 and 390×844. All browser requests are intercepted, no page errors
or escaping remote requests. This remains mock-only, not live/integration acceptance.

## Exact changed files

Text/source:
- `ui/control-ui.js`
- `tests/cockpit-selection-browser.mjs`
- `tests/cockpit-evidence.mjs` (new)
- `scripts/test-cockpit-browser.mjs`
- `docs/engineering-cockpit.md`
- `docs/product/onshape-selection-2026-10-21/implementation/README.md`
- `docs/product/onshape-selection-2026-10-21/implementation/followup-evidence-audit.json` (new)
- `docs/prompts/2026-10-22-work-context-selector-ui-followup.report.md` (this report, new)

Exact refreshed/new PNGs (all below
`docs/product/onshape-selection-2026-10-21/implementation/`):

- `02-dialog-1440x900-review.png`
- `02-dialog-1366x768-review.png`
- `02-dialog-390x844-review.png`
- `06-stale-reviewed-1440x900-review.png`
- `06-stale-reviewed-1366x768-review.png`
- `06-stale-reviewed-390x844-review.png`
- `12-busy-winner-1440x900.png`
- `12-busy-winner-1366x768.png`
- `12-busy-winner-390x844.png`
- `13-null-names-1440x900.png`
- `13-null-names-1366x768.png`
- `13-null-names-390x844.png`
- `13-null-names-1440x900-review.png`
- `13-null-names-1366x768-review.png`
- `13-null-names-390x844-review.png`

## Review, limitations and commit list

Architect review **PENDING**; no architect/product approval claimed. No new contract
gaps or CR requests. The accepted backend is present and its offline tests pass;
this consumer mock suite does not establish live provider behavior, auth enforcement,
deployment or CAD correctness. Later live/product acceptance remains separate.

Commit list: **none**. This session's Git administrative paths are still read-only:
`<workspace>/clawonshape/.git/worktrees/clawonshape-ui` and
common `<workspace>/clawonshape/.git`. They are under the excluded
main checkout. As allowed by the handoff, the reviewed changes remain uncommitted;
no Git write or permission expansion was attempted. An authorized operator can
commit on feat/21-selection-ui after review, using author Albert Kos
<kickban3000@gmail.com> and the requested trailers:

```text
Refs: edge-robot/clawonshape#17
Refs: edge-robot/clawonshape#21
Prompt: docs/prompts/2026-10-22-work-context-selector-ui-followup.md
Agent: openclaw-dev
```

Actual text diffs and numbered excerpts can be returned in this conversation for
broker review; no parent prompt is sent. Never push under this handoff.
