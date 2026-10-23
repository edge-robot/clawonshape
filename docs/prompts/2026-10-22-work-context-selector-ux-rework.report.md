# Selector V2 implementation handoff

Task: `COC-CONTEXT-SELECTION-UX-20261022`  
Parent: `COC-CONTEXT-SELECTION-20261021`  
Date: 2026-10-22  
Status: implementation and synthetic browser acceptance complete; X7 PARTIAL due
to unchanged backend integration failure CR-UI-1. Architect review **PENDING**.

## Scope, baseline and X1

Only the existing `/home/kaos/Projects/01_pib/02_sw/clawonshape-ui` worktree was used
for installation, implementation, build and tests. Initial/final branch:
`feat/21-selection-ui-v2`. Initial/final HEAD:
`b34ad5d35cfac6c13c72ddce9bc1ac51efe24dbb` (changes uncommitted).
Initial status was empty, and no overlapping user edits existed. Worktree registration,
branch, HEAD, README and applicable AGENTS.md paths were checked. The only AGENTS.md
files are the unrelated runtime agent workspaces. Spec S1–S9, ADR I1–I5, local §11
and its document/workspace/Part fixtures, and read-only main §11.8 were read.
No branch/worktree/Git mutation or main checkout write was performed.

X1 is fulfilled by the explicit handoff: date **2026-10-22**, channel **PO chat
(reported by onshape-product-owner through onshape-architekt)**, exact wording
**"OK"**, after implementation was announced. This developer did not directly
observe the PO chat. No new confirmation or replacement design was requested.
Actual approved design-review-v2.md and all three PNG/SVG pairs in main were read
and visually inspected. Their SHA-256 values are in audit.json. Main's untracked
PO artifacts and approval-writer prompt were preserved.

## Implementation and ownership

The native dialog now implements V2, replacing the V1 three-column selector. Desktop
keeps document/workspace context together on the left and places grouped Part cards
next to a preview. Mobile uses steps, compact parent/change links and preview/adopt
inside the selected card. A non-overlapping bottom footer has exactly one Schließen;
there is no top close or second Cancel. Escape discards drafts and returns focus.
Only the selected selectable Part offers the primary adoption action.

Browsing uses work-context-documents/workspaces/parts and extended preview directly.
Documents have a two-character minimum, 300ms debounce, empty initial page, pinned
bound marker, offset increments of 20 and hasMore. No bound-studio local filtering
stands in for browsing. Workspaces render view roles/readOnly; choosing parents
clears descendants. Part hits stay grouped in provider studio order. Truncation
explains that studio refinement is necessary for unscanned studios; all returned
studios remain available. Configured bound studios can still enumerate inspection
hits. All six inspection reasons stay clickable, with no adoption.

Part and studio preview targets are separate from adoption identity. Both carry
full document/workspace/element and observed microversion. Studio replies require
partId:null and a 128px PNG, Part replies the exact Part ID and 256px PNG; both stay
below 65,000 base64 characters. Studio viewing does not change the selected Part;
Bauteilvorschau returns to it, and focus moves to the explicitly labelled preview.
A studio is never substituted for an unavailable Part. Nullable/long labels retain
short IDs and all text is rendered literally. Technical identity/revision/refresh
are under Stand & technische Details.

Region/session/request/parent/query/page/connection/target/microversion fences reject
late responses. Per-connection browsing queues skip obsolete queued reads and retain
no result payload in their queue tails. Invalid/unverified status has no cached
preview. Access failures invalidate old readiness/images. Adoption requires the
hit's selectable:true, known view readiness, clear view interlock and admin; neither
goalEligible nor browsing visibility grants it. Pending adoption blocks duplicates
and dismissal. One explicit payload includes status.selectionRevision and the exact
hit target/revision. CAS/Busy reload the actual winner with distinct explanations;
unknown status cannot show local success. Ordinary errors stay at the attempted
card; stale observations require a new choice. No write or rate-limit retry loop.
The compact Workspace/CAD card, protected Primary, unchanged goal source and literal
GoalView.target.focus with feature-based condition note remain intact.

## Integration base and CR-UI-1

Local contract: work-context-1.1.0-draft §11 and goal-1.2.0-draft, fixtures read in
place, never modified. The accepted browsing backend is reported at and its
clarifications read from main `e275f1a11d103677a39169c40c90b777c9d5d6dd`.
Its CR-15–CR-22 were followed without copying/amending the local contract or merging
branches. In particular: all studios on truncated results (CR-18), configured
studio hits (CR-19), explicit foreign workspace and studio partId:null (CR-20),
and distinct provider/access errors (CR-22).

The browsing backend is not integrated into this UI branch: its existing dashboard
has no registrations for the three new browsing methods. This task therefore uses
the authorized fixture gateway, not a running gateway. Backend integration belongs
to the bottom-up architect; this developer must not merge or edit src.

**CR-UI-1 — backend readiness-message integration (ClawOnshape backend owner).**
At this unchanged UI baseline, error-codes.json lists document_not_accessible and
provider_quota_exhausted, while src/readiness.ts/messages lacks them. W11 in
`tests/work-context.test.mjs:901` fails at line 932 with
`missing message for document_not_accessible`. The UI's German texts cover both,
but changing them cannot satisfy a backend messages import. Protected input files
are byte-identical to HEAD; W11 imports dist/readiness.js, not this UI. A full clean
baseline suite was not checked out/run; unchanged inputs and the isolated lookup
establish this specific failure independently of the UI. An authorized integration
step must reconcile the accepted backend/messages and rerun W11/full tests.
No backend test was skipped or weakened and no contract/source edit was made.
No additional view fields or contract capability requests were needed.

## Checks and evidence

| Check | Actual result |
| --- | --- |
| npm ci, existing lockfile | PASS, 346 packages; node_modules was actually absent |
| npm run typecheck | PASS, exit 0 |
| npm run check, local Biome ci | PASS, 71 files, exit 0 |
| npm test | 216/217 PASS; exit 1 solely W11/CR-UI-1 after local-stub approval |
| focused tests/cockpit.test.mjs | PASS, 26/26, exit 0 |
| npm run test:cockpit | PASS, native regression plus 37 V2 check groups, exit 0 |
| explicit V2 evidence opt-in | PASS, 36 groups; exactly 27 new V2 PNGs, no old image refresh |
| git diff --check | PASS |
| protected src/backend tests/contracts/spec/ADR/manifest/lockfile | No changes |
| final normal browser status/PNG comparison | PASS: identical status and all 156 PNG hashes; audit.json |

The first installation attempt failed with registry EAI_AGAIN; the normal approval
mechanism allowed npm ci. No dependency or lockfile additions and no additional
install-script approvals. Sandbox-only tests additionally hit listen EPERM on the
existing 127.0.0.1 stub, and Chromium setsockopt EPERM/SIGTRAP before page load.
Approved offline reruns remove those sandbox failures; W11 remains a real,
separately reported integration failure. No live API, runtime/lifecycle, CAD,
cluster, deployment, GitHub writes, new permissions, commits or push.

| Criterion | Result / evidence |
| --- | --- |
| X1 | Fulfilled from reported PO approval above; actual approved design files read, hashes in audit |
| X2 | Implemented/tested; v2-part and v2-documents at all three sizes; one bottom exit, in-card adoption, footer/content separation and keyboard focus |
| X3 | Implemented/tested; real document query/debounce/page/hasMore, parent clearing and primary/candidate/default/other roles; v2-documents, v2-inspection-document |
| X4 | Implemented/tested; server queries, part number, all studios, refinement/truncation, configured/unsupported and all six inspection reasons; v2-refinement |
| X5 | Implemented/tested; full-target Part/studio preview, explicit null identity, return/focus, decoder/size/mv failures and no substitute; v2-part, v2-studio, v2-preview-unavailable |
| X6 | Implemented/tested; U1–U6 behaviors re-expressed for V2, CAS/Busy winner, interlock/validity, focus-before-confirmation, pending/unknown outcomes, compact synchronized card; v2-compact |
| X7 | PARTIAL: typecheck, Biome, focused UI and browser pass; full npm test blocked by CR-UI-1. Normal runs preserve status/evidence (audit) |

The complete browse/page/foreign-parent/refinement/Part+studio-preview/adopt/compact/
keyboard journey runs functionally at **1440×900, 1366×768 and 390×844** in addition
to layout assertions/screenshots. Browser requests are all intercepted; no escaping
remote requests or page errors. Previous U7 cannot be called green while W11 fails.
Synthetic previews prove image/request identity and decoding, not CAD geometry.

[Evidence index and exact PNG manifest](../product/onshape-selection-2026-10-21/implementation-v2/README.md),
[exact source diff](../product/onshape-selection-2026-10-21/implementation-v2/review.patch),
[numbered source excerpts](../product/onshape-selection-2026-10-21/implementation-v2/source-review.md),
[checks](../product/onshape-selection-2026-10-21/implementation-v2/checks.txt),
[hash/status audit](../product/onshape-selection-2026-10-21/implementation-v2/audit.json).

## Exact changed files and remaining decisions

- ui/control-ui.js
- tests/cockpit-selection-browser.mjs
- docs/engineering-cockpit.md
- docs/prompts/2026-10-22-work-context-selector-ux-rework.report.md
- docs/product/onshape-selection-2026-10-21/implementation-v2/README.md
- docs/product/onshape-selection-2026-10-21/implementation-v2/checks.txt
- docs/product/onshape-selection-2026-10-21/implementation-v2/review.patch
- docs/product/onshape-selection-2026-10-21/implementation-v2/source-review.md
- docs/product/onshape-selection-2026-10-21/implementation-v2/audit.json
- The 27 exact new PNG paths in the linked manifest (all in implementation-v2/).

Initial status was clean; final status contains only the above intended edits.
All 129 pre-existing tracked PNGs remain byte-identical. Normal tests retain their
temporary default; only the explicit 27-file opt-in created repository images.
No foreign edits were overwritten. Commit list: **none**, as explicitly required.
Branch/HEAD unchanged. No ff-only/integration request or Git mutation was repeated.

Architect review: **PENDING**. Product/live acceptance is not claimed. Remaining:
bottom-up review of actual diff and approved-design comparison; authorized backend
integration/CR-UI-1 resolution and full suite; later product/live acceptance under
separate authority. This report and its review.patch/numbered excerpts/PNGs can be
returned in small broker-readable sections on request; no parent prompt was sent.
