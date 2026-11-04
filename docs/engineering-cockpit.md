# Engineering Cockpit

Open the authenticated **Mechanical Engineer dashboard** at `http://localhost:19489`
and select **Claw-Onshape**. The native page has exactly three destinations:
**Workspace** (initial view), **CAD** and **3D Print**. The navigation remains visible
on narrow screens and supports keyboard activation and visible focus. The cockpit
provides an overview with explicit goal actions. Team/project names are not assumed;
only the assigned Onshape context is shown.
The separate, collapsed **"Operator-Aktionen (Übergang bis Discord-Freigabe)"**
(Operator actions, interim path until Discord approval) section preserves the existing
`mutation-approve`, `mutation-reconcile` and `candidate-prepare` actions until P3b
(edge-robot/clawonshape#11). These require `operator.admin`; missing or unknown admin
access keeps the controls disabled. Review the exact payload before approving.
Each click is a single attempt, with no automatic retry. Engineer executes approved
updates through native MCP. Primary promotion and print starts are not triggered here.

**Select a work context (V2, work-context-1.1.0-draft).** The compact
**"Arbeitskontext"** card is shared by Workspace and CAD. It reads
`work-context-status`, shows the confirmed Part and provenance, revision/freshness,
and a checked Onshape link. Missing names have a separate short ID. A legacy
binding has no inferred Part. **"Weiter zu CAD"** only navigates.

**"Auswahl ändern"** opens the approved V2 selector. Desktop groups Document and
Workspace on the left, with grouped Parts and an adjacent preview on the right.
Mobile uses sequential steps and compact context/change links; preview and adoption
sit inside the selected Part card. Exactly one **"Schließen"** button stays in a
bottom footer outside the scrolling content, with no top X or second Cancel.
Escape discards the local draft and returns focus; an in-flight adoption disables
dismissal and duplicate dispatch. Successful adoption closes the dialog.

Document search is a real `work-context-documents` request, not local filtering:
empty initial listing, at least two characters for a query, 300ms debounce, offset
increments of 20 and "Weitere Dokumente laden" only when hasMore. The bound document
is first on page zero and explicitly marked **"Zugeordnet"**. Choosing a document
reads `work-context-workspaces` and clears descendants. Workspaces show the view's
Primary/Candidate/default/other role and read-only label; choosing one clears Part
and preview and reads `work-context-parts` for that exact document/workspace.

Part queries and studio refinement use the gateway. Hits are grouped by the
returned studios in provider order. When truncated, refine by studio, then query:
a query alone cannot reach studios the backend has not scanned. All returned
studios remain available, including those without hits in this bounded result;
no hits does not assert an empty studio. Configured bound studios may still return
inspection-only hits. Short Part IDs, Part Studio, part number and hidden status
help distinguish same-name Parts. Long/missing names wrap and retain identity.

Inspection-only rows are clickable for preview. They explain the actual reason:
foreign document, non-Primary workspace, existing Candidate, unprovisioned studio,
unsupported configuration or unsupported Part kind. Browsing is not adoption
authority. Only **selectable:true** plus current view readiness and operator.admin
can enable **"Dieses Bauteil übernehmen"** inside the selected card; goalEligible
alone never enables it. Goals remain bound to the provisioned Primary source.

Part previews carry the full target and observed microversion. **"Studio ansehen"**
uses the same preview region, labels it **"Part-Studio-Vorschau · kein Einzelbauteil"**
and accepts partId:null in the reply. **"Bauteilvorschau"** returns to the selected
Part without moving adoption identity. Studio/return actions focus the new preview
region so its identity is visible. A studio image never substitutes for a failed
Part image. Valid PNGs are below 65,000 base64 characters: 256px square for a Part,
128px square for a studio. Decoder/size/identity/microversion failures suppress the
image. An optional unavailable image is distinct from unknown adoption readiness.

Loading, errors and empty results stay in their document/workspace/Part/preview
region. Quota, access and rate-limit codes remain distinct; there is no automatic
429 retry. Adoption makes one explicit attempt using status.selectionRevision and
the selected hit's full target/revision. Ordinary failures retain the previous
server record and explain the error at the attempted Part. CAS/Busy reload status,
show the actual winner and ask for review; unknown status cannot claim success.
Stale observations refresh results for a new choice, never an automatic write.
Transport uncertainty asks for status validation rather than blind repetition.

The server view owns interlock and validity. Unknown/unverified status disables
adoption; a blocked view disables context change and points to the goal panel.
STOP/expiry alone is not clearance. Invalid/unverified records expose no cached
preview. Access failures suppress old selection readiness/images. Request fences
cover session, connection, region request, query/page/parent, full target and
microversion; per-connection read queues drop obsolete queued work. No drafts or
preview cache are persisted. **"Stand & technische Details"** contains revision,
observation time, full preview identity and explicit status/result refresh.

This UI branch uses contract fixtures for offline acceptance. The accepted browsing
backend at e275f1a is not integrated into the UI branch; deploying this UI before
backend integration would not establish working browsing. The current UI baseline
also has a backend readiness-message integration failure (CR-UI-1 in the V2 report).
No contract/src changes or live acceptance are part of this UI task.

Current inspection names still load separately through `workspace-context` and do
not replace selected-Part identity or a historical GoalView focus.

CAD has a **"Versionen & Branches"** (versions and branches) column with the
assigned Candidate and Primary. Several payload proposals in one workspace do
not become several Candidates. No ancestry edges are drawn without evidence;
the missing ancestry is stated explicitly. Select the workspace card, then open
**"Payload-Vorschläge & technische Nachweise"** (payload proposals and technical
evidence) to select a stored payload proposal. Only configured workspaces appear,
not a complete Onshape directory.

**Goal iteration.** The panel reads `goal-status` on load, explicit refresh and
following an action; there is no background goal polling. Ask the Robotics Lead
to prepare a goal. Before **"Ziel bestätigen & Iteration erlauben"**, review every
goal/preservation condition, allowed features/operations, target, Candidate plan,
budget, lifetime, confirmation deadline and displayed goal hash. The explicit
operator confirmation sends that hash and its nonce unchanged. When `GoalView.target.focus`
is present, its Part name, exact Part Studio element ID, Part ID and selection
revision appear before confirmation. The goal contract has no studio-name field;
the UI does not borrow a label from a newer selection. Focus expresses intent:
goal and preservation conditions remain feature-based, and success does not prove
that only the focused Part changed. It requires admin
rights, an available capability and an awaiting, unexpired confirmation. Pending
calls disable goal actions; each click makes one attempt, with no automatic retry.

Per [ADR D1](ADR.md#adr-2026-10-21-goal-scoped-mutation-authorization), dashboard
confirmation is the interim "Verify Candidate" act until a credential verifier
provides the decision. It permits only the displayed bounded goal. The UI creates
no proposals and performs no CAD writes itself.

Progress uses the server's goal counters; missing counters mean unknown. A
completed state needs a passed goal verification before displaying success.
Checks, observed values, open limits and a target-validated Candidate revision
link remain visible; `note` conditions always remain open limits. Payload receipts
do not establish goal success. **"Abgeschlossene Ziele & Nachweise"** is a collapsed,
read-only terminal-goal history and cannot supply actions for the current goal.

**"Iteration stoppen"** is available to admins in awaiting, active, reconciling
and blocked states. An uncertain step shows reconciliation guidance: the Engineer
must use the complete server error data. The current `GoalView` lacks the full
tuple, so the UI does not manufacture a `goal-reconcile` request.

**"Ziel abschließen …"** requires a paused state (stopped, expired or blocked),
admin rights, available capability and a known clear journal. Null counters or a
missing sequence field block closure; a null sequence alone is insufficient.
A second explicit **"Ziel abschließen"** confirms that executed changes and the
Candidate stay. Cancel makes no request. Resume after stop/expiry needs renewed
confirmation via the Lead. Errors show the human message and a code under
**"Technische Zieldiagnose"**; refresh before deciding on another action.

**Load and compare views.** Use **"CAD-Ansicht laden / erneuern"** to explicitly
load the current configured Part Studio state. Image, revision and render time
belong together. A view does not prove geometric dimensions. A notice appears if
it differs from the proposal. **"Vergleich"** (comparison) shows the evidenced
Primary / Candidate revisions with direct Onshape links. Historical images still
require a separate interface contract; missing views are explicitly indicated.
Live image retrieval is not enabled for an unconfigured Primary.

| Status | Meaning and next step |
| --- | --- |
| "Vorgeschlagen" (proposed) | A payload proposal exists. Review with the Lead; clarify the approval path with the operator. |
| "Freigabe erteilt" (approval granted) | Refers to the stored payload; does not prove execution. |
| UNKNOWN | Outcome unclear, including expired approval. Have Engineer / operator reconcile; do not execute again. |
| "Abgelaufen / abgelehnt" (expired / rejected) | Review the receipt and reason; request a new proposal if needed. |
| "Parameter geprüft" (parameters checked) | Result was compared with the approved feature parameters. Geometry, positions and outer dimensions have not been fully checked by this. |

**Find evidence.** The collapsed payload history shows four separate steps, the task and
**"Nächster Schritt"** (next step). Selecting another payload retains the open
history and its visible execution evidence (F8). **"Beleg & Freigabezuordnung"** (receipt and
approval mapping) contains the stored evidence with payload hash and CAD states.
Missing approver identity, execution time or channel delivery are not filled in.
Bambu Studio, production approval and print preparation are not integrated.

**Missing or old data.** **"Aktualisieren"** (refresh) reloads the stored state and
clears previous images; refresh the CAD view separately. Names refresh independently.
On image transport/decoder errors they remain visible if their metadata is still
valid. Metadata failures retain labels only for the same target and connection,
marked stale; target/connection changes and authorization failures invalidate them.
After five minutes, the display warns about stale data. Status errors clear old
cards / images and their names.
**"Verbindung & technische Details"** (connection and technical details) contains
diagnostics and connection management. Connection changes require administrator
rights. Images larger than 180 kB exceed the safe inline limit: use the Onshape
link and inform the operator.

**Live acceptance on 2026-10-20: started, paused for the day.** Tested state:
package `0.2.10`, SHA-256 prefix `cc7b0dd28a3d`, deployed through Clawake. Entry,
real CAD view and names were technically checked in the native browser: document
**wegwerf-document**, Candidate **ClawOnshape Candidate**, Primary **Main**,
Part Studio **Part Studio 1**. Following the link correction, the user reported
different Primary / Candidate destination URLs and withdrew the suspicion that
the links were identical.

**Current working tree, not deployed:** The 2026-10-21 top-down implementation
removes the previous image/name coupling; local tests cover independent names,
refresh, failed images and target/auth races. Goal actions are wired to the accepted
backend contract. Fixture browser checks are separate from live acceptance, which remains
open. Next, jointly check separate approval /
execution / verification evidence, an empty / error / stale state and refresh.
Historical comparison images remain outside the current render contract.
**Full user acceptance has not passed yet.** Use only existing data; visibly mark
demonstrations.

**Manual browser check (F3).** `npm run test:cockpit` is a manual, host-only check
outside `npm test`. It uses the `playwright-core` dependency currently supplied
transitively by the pinned OpenClaw development dependency and requires a local
Chromium executable (`/usr/bin/chromium`, or set `CHROMIUM_PATH`). It uses intercepted page routing without a loopback server, with visibly synthetic
data and no CAD provider requests. Both suites write screenshots into fresh temporary
directories by default and print their paths. Normal runs leave tracked evidence
and repository status untouched (apart from intended edits and existing build output).
Each view is checked at 1440×900, 1366×768 and 390×844; evidence remains synthetic.

Refresh repository evidence only by explicit opt-in. `COCKPIT_EVIDENCE_DIR` selects
the output root; selector images go directly there and regression images go in
`regression/`. `COCKPIT_EVIDENCE_FILES` restricts writes to a comma-separated list
of exact relative filenames (regression entries include `regression/`). Without
that filter an opted-in run writes all captures. Keep the filter limited to images
whose content changed, to avoid timestamp-only churn. For example:

```sh
COCKPIT_EVIDENCE_DIR=docs/product/onshape-selection-2026-10-21/implementation \
COCKPIT_EVIDENCE_FILES=13-null-names-390x844.png \
npm run test:cockpit
```

**3D Print prerequisites.** The view is blocked: no supported Bambu adapter,
validated STL/unit mapping, complete printer/nozzle/material/process profile,
validated project/tool mapping or job access contract is available in the current
plugin. Quantity, time and material estimates are not supplied. Continue manual
Bambu Studio import, profile selection, slicing and preview. Historical repository
research is recorded in `docs/reviews/bambu-h2c-integration-2026-10-20.md`; it does
not prove current printer connectivity or a working automated slicer. No file
upload, connect, slice or print control is presented as functional here.
