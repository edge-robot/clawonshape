# Engineering Cockpit

Open the authenticated **Mechanical Engineer dashboard** at `http://localhost:19489`
and select **Claw-Onshape**. The native page has exactly three destinations:
**Workspace** (initial view), **CAD** and **3D Print**. The navigation remains visible
on narrow screens and supports keyboard activation and visible focus. The cockpit
provides a read-only overview and review. Team/project names are not assumed;
only the assigned Onshape context is shown.
The separate, collapsed **"Operator-Aktionen (Übergang bis Discord-Freigabe)"**
(Operator actions, interim path until Discord approval) section preserves the existing
`mutation-approve`, `mutation-reconcile` and `candidate-prepare` actions until P3b
(edge-robot/clawonshape#11). These require `operator.admin`; missing or unknown admin
access keeps the controls disabled. Review the exact payload before approving.
Each click is a single attempt, with no automatic retry. Engineer executes approved
updates through native MCP. Primary promotion and print starts are not triggered here.

**Orient and select.** Workspace shows the assigned context, stored Onshape
connection state, capabilities, timestamps and the next step. Current document,
workspace and Part Studio names load independently of images through the
read-only `workspace-context` action. It requires `operator.read`, `liveReads`,
a single exact binding and OAuth read access. Missing or invalid names fall back
to IDs. These names describe the current workspace, not a historical revision.
The Part Studio name is not transferred to an unconfigured Primary.

CAD has a **"Versionen & Branches"** (versions and branches) column with the
assigned Candidate and Primary. Several payload proposals in one workspace do
not become several Candidates. No ancestry edges are drawn without evidence;
the missing ancestry is stated explicitly. Select the workspace card, then open
**"Payload-Vorschläge & technische Nachweise"** (payload proposals and technical
evidence) to select a stored payload proposal. Only configured workspaces appear,
not a complete Onshape directory.

**Goal iteration.** **"Feature-Ziel & Iteration"** (feature goal and iteration)
shows a blocked state. No goal can be saved, confirmed, started or stopped here
until the reviewed server-side goal authorization and execution interface exists.
Stored payload approvals and parameter checks are not goal authorization or proof
of goal completion. Aggregate counts refer only to stored payload receipts.

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
**"Nächster Schritt"** (next step). **"Beleg & Freigabezuordnung"** (receipt and
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
refresh, failed images and target/auth races. Browser and live acceptance remain
open. Next, jointly check separate approval /
execution / verification evidence, an empty / error / stale state and refresh.
Historical comparison images remain outside the current render contract.
**Full user acceptance has not passed yet.** Use only existing data; visibly mark
demonstrations.

**Manual browser check (F3).** `npm run test:cockpit` is a manual, host-only check
outside `npm test`. It uses the `playwright-core` dependency currently supplied
transitively by the pinned OpenClaw development dependency and requires a local
Chromium executable (`/usr/bin/chromium`, or set `CHROMIUM_PATH`). It uses intercepted page routing without a loopback server, with visibly synthetic
data and no CAD provider requests. Requested artifacts are written under
`docs/product/dashboard-workflow-2026-10-21/implementation/` only when Chromium
can actually launch. Each view is checked at 1440×900, 1366×768 and 390×844;
blocked goal/print views do not simulate authorization or slicing. Browser screenshots are fixture evidence, not live acceptance.

**3D Print prerequisites.** The view is blocked: no supported Bambu adapter,
validated STL/unit mapping, complete printer/nozzle/material/process profile,
validated project/tool mapping or job access contract is available in the current
plugin. Quantity, time and material estimates are not supplied. Continue manual
Bambu Studio import, profile selection, slicing and preview. Historical repository
research is recorded in `docs/reviews/bambu-h2c-integration-2026-10-20.md`; it does
not prove current printer connectivity or a working automated slicer. No file
upload, connect, slice or print control is presented as functional here.
