# REST control plane / MCP CAD data plane

Control/data-plane design, updated 2026-10-11. Native Discord read/render is live-accepted; mutation remains a proposal. Accepted boundaries are recorded in
[ADR](../ADR.md); no CAD mutation is implemented by this document.
Current native/live limits: [diagnostics](../diagnostics-2026-10-11.md),
[provider acceptance](../onshape-live-validation.md).

## Components and responsibilities

| Responsibility | Owner/plane | Current status |
| --- | --- | --- |
| User conversation, delegation, Discord delivery | Robotics Lead / OpenClaw | Real configured-user read/render journey accepted |
| Engineering intent, model investigation, FeatureScript, evaluation recovery | Mechanical Engineer | Future mutation orchestration |
| OAuth and requester/agent target binding | Claw-Onshape / REST | Implemented read-only; native dashboard OAuth accepted |
| Document/workspace/element membership | REST | Implemented and live-accepted |
| Feature metadata, primary protection, candidate creation | REST | Feature/source metadata reads live; write-denial guard exists; candidate creation missing |
| Source/result microversions, conflicts, versions, promotion boundaries | REST | Source capture implemented; resulting mutation/conflicts/version/promotion lifecycle planned |
| FeatureScript authoring/testing, feature creation, CAD exploration/debugging | MCP | Metadata adapter only, every execution disabled |
| Geometry/feature-state verification | REST | Planned; bounded observations, no generic CAD evaluator |
| Shaded views, screenshots, comparisons, stable links, report evidence | REST | Pinned shaded PNG/stable references implemented and live-accepted; before/after comparisons planned |
| Authoritative design and revision history | Onshape | Never duplicate locally |
| Installation, grants/config reconciliation, restart, callback routing | Clawake | Owns deployment; approved explicit global-grant support used; trust cleanup proposed |

One native plugin, one agent runtime integration. No standalone application,
broker, database, workflow engine, duplicated revision store or extra agents.
OpenClaw owns MCP authentication/transport; a supported narrow native call facade
must be established before implementation. A metadata probe is not that facade.

## Authentication and authority boundaries

REST credentials live in private native SDK-managed files, bound to the trusted
requester/channel/account fingerprint. Mechanical Engineer receives connection
references and sanitized evidence, never credentials. MCP credentials remain in
OpenClaw's separate native MCP resource store. REST OAuth2Read does not authorize
lifecycle POSTs; candidate/version support requires explicit REST Write consent
and operation policy. Do not confuse that future grant with MCP authorization.

### Verified OAuth scope and app-permission matrix (2026-10-12)

Verified from Onshape OpenAPI (`GET https://cad.onshape.com/api/openapi`) and
Onshape OAuth docs:

| Operation | OpenAPI evidence | Required OAuth scope(s) | App permission layer |
| --- | --- | --- | --- |
| Read document / workspaces / features / current microversion | `GET /documents/{did}`, `GET /documents/d/{did}/workspaces`, `GET /partstudios/d/{did}/{wvm}/{wvmid}/e/{eid}/features`, `GET /documents/d/{did}/{wv}/{wvid}/currentmicroversion` | `OAuth2Read` | "Application can read your documents" |
| Create candidate workspace | `POST /documents/d/{did}/workspaces` (`createWorkspace`) | `OAuth2Write` | "Application can write to your documents" |
| Create immutable version | `POST /documents/d/{did}/versions` (`createVersion`) | `OAuth2Write` | "Application can write to your documents" |
| Delete workspace | `DELETE /documents/d/{did}/workspaces/{wid}` (`deleteWorkspace`) | `OAuth2Delete` | "Application can delete your documents and workspaces" |
| Share/unshare document | `POST /documents/{did}/share` (`shareDocument`) | `OAuth2Read` + `OAuth2Share` | "Application can share and unshare documents on your behalf" |
| Read profile/session info | `GET /users/sessioninfo` description mentions OAuth profile scope | scope behavior documented as profile-dependent (`OAuth2ReadPII`) | "Application can read your profile information" |
| Purchases | `GET /accounts/purchases` (OAuth app context) | purchase scope expected (`OAuth2Purchase`) | "Application can request purchases on your behalf" |

Current product policy intentionally keeps delete/share/profile/purchase
application permissions disabled. This repository does not enable them.

Uncertainty: OpenAPI does not expose an endpoint that returns the current app's
enabled/disabled permission toggles for a grant. Capability reporting therefore
uses trusted operator configuration plus known policy defaults, and keeps unknown
states as `UNKNOWN` rather than guessing.

Target authority comes from host-controlled bindings plus trusted invocation
identity, never tool arguments, FeatureScript comments or agent text. Bind a
mutation context to requester, agent, channel/account, delegation/session, did,
candidate wid, permitted Part Studio/Feature Studio eids, expected microversion,
operation/code digest, expiry and an execution receipt. Narrow capability/context
references are not bearer OAuth tokens. Recheck live config and invocation
authority before calls and before returning evidence. Lead does not inherit
Engineer capabilities. Preserve room for future credential-verifier output at
this boundary; OIDC4VC/VP is out of scope.

A2A must carry host-authenticated original requester identity or a host-verified
delegation envelope binding sender, recipient, task/session, allowed context and
expiry. No custom agent or bridge service is needed. First verify OpenClaw's
actual delegation context; if fields disappear, deny. The direct authenticated
Engineer path can validate REST while this independent blocker is addressed.

## MCP safety and current capability gap

Historical catalog at the reference ClawCAD commit contained 14 tools; see
`docs/findings/FINDING-015-hosted-mcp-write-boundary.md`. Explicitly targeted
`create_feature_studio(did,wid,name,contents)` and
`put_featurescript(did,wid,eid,code)` lack revision preconditions.
`get_featurescript(did,wvm,wvmid,eid)` / `list_feature_studios(did,wid)` can be
wrapped only with immutable/exact target checks. `create_geometry` has no
did/wid/eid, defaults cleanup, and uses a configured sandbox. `test_feature` and
`test_featurescript` accept only code; their side effects/context are unproven.
Unscoped notes/account/allocation/logout tools remain unavailable. Documentation
search can be considered separately, without granting CAD authority.

**Current provider catalog is not verified.** Engineer's server is disabled and
the plugin discovery command refuses disabled configuration. Do not enable its
agent configuration just to inspect metadata. A Clawake-provisioned isolated
operator profile with no agent grants may authenticate/list schemas through
native MCP, dispose the session and preserve the deployed server's disabled
state. Inspect schemas, descriptions, context configuration and actual upstream
target/revision behavior; names alone are insufficient. The official
[FeatureScript MCP introduction](https://www.onshape.com/en/blog/get-started-featurescript-mcp-server)
supports custom-feature development intent, not proof of target isolation/CAS.

Installed OpenClaw 2026.9.9 source was examined: generic
`agent-tools.before-tool-call-X_CJSoow.mjs` implements before-call hooks;
`agent-bundle-mcp-materialize-L-Le_IRZ.mjs` calls `runtime.callTool`,
`agent-bundle-mcp-manager-api-CSnWgCB8.mjs` forwards to the server owner, and
`startup-state-readiness-m0k9uoIo.mjs` contains direct native client calls.
This does **not** establish end-to-end hook coverage of every projection or
alternate execution route. No synthetic native call/hook integration test or
live CAD execution was run. A unit-tested hook is not an account-wide boundary.

| Proposed enforcement | What it can prove | Limitation / requirement |
| --- | --- | --- |
| Explicit did/wid/eid wrappers | Exact constructed arguments | Provider must honor them; code/imports and indirect effects need containment |
| Server context / scoped sessions | Possible server-side restriction | No scoped hosted session contract verified |
| REST pre/post-validation | Membership, revisions, primary change detection | Cannot prevent unauthorized effects or close read/write race |
| Experimental workspace | Protect primary from correctly targeted writes | Account-wide token/unscoped tool can escape |
| Revision checks | Detect drift | Need write-time CAS; pre-read alone insufficient |
| OpenClaw hooks | Possible admission defense | Must verify actual selected harness/routes, later parameter hooks and bypasses |
| Narrow native call adapter | Central policy within plugin | Raw native tools/projections must be absent; no supported facade yet proven |

Required boundary: only focused Engineer capabilities are reachable; the trusted
adapter constructs/validates exact provider targets, server enforces containment
and write-time revision protection, every reachable native path is tested, and
unscoped tools are absent. FeatureScript is code: inspecting string arguments or
holding a local lock cannot prove its provider effects remain in a workspace.
If those guarantees cannot be established, execution remains disabled. Do not
substitute unrestricted MCP, REST geometry writes or a generic new service.

## Workspace and revision lifecycle

Resolve an existing authorized document/Part Studio from real provider data.
Confirm the protected primary workspace separately, inspect model/evaluation
state, capture immutable source microversion and source feature metadata.
Create/select a dedicated experimental workspace based on that exact source;
verify its document membership, unequal-to-primary ID and resulting baseline.
Verified 2026-10-12 against Onshape `GET https://cad.onshape.com/api/openapi`:
`POST /api/v10/documents/d/{did}/workspaces` (`createWorkspace`) uses
`BTVersionOrWorkspaceParams` with `microversionId`, `versionId` and `workspaceId`
fields and requires `OAuth2Write`. The published contract does not require
creating an immutable version before branching; this capability uses explicit
`microversionId` to avoid mutable-latest branching. Live provider POST behavior
for this operation was not executed in this repository session.
Never silently branch from latest mutable primary state.

Immediately before execution confirm candidate revision and primary source;
the mutation provider must enforce the expected candidate revision atomically.
Capture the resulting revision through REST. Verify primary remained unchanged
and inspect pinned after-state. Unexpected drift is a conflict, not success.
On timeout/disconnect after dispatch, return `UNKNOWN`, never retry mutation.
Onshape inspection plus native/private receipt artifacts can support reconciliation
without a new revision database. Minimal private receipt stores only context,
digest, dispatch/result status and evidence references, not CAD state. A restart
must revoke execution contexts and fence unresolved receipts from automatic replay.
This small receipt is required only if writes are later enabled.

No automatic merge or printing. Candidate/version URLs are result references;
future promotion is a separate authorized boundary, not an implied report action.

## Focused capability contracts (proposed)

Common policy: exact trusted identity/context, no arbitrary URL/HTTP/MCP passthrough;
sanitize provider failures. Bounded GET retries may handle transient errors only
when authority remains current. 401 reconnect; 403 deny; 404 unavailable; 409
conflict; 429 report rate limit. Writes are not automatically replayed.

| Capability / plane | Purpose and inputs → outputs | Authorization / revision / provider dependency | Failure, idempotency and retry |
| --- | --- | --- | --- |
| inspectDocument / REST | Bound context → document, workspaces, typed elements, bounded feature/evaluation metadata | Read binding; workspace membership; fixed document/elements/features GETs; mutable read marked observational | Malformed/missing membership denies; idempotent GET, bounded retry only |
| resolveTarget / REST | Context + selected allowed element reference → did, protected/active wid, Part Studio eid | Trusted bindings, provider type/membership; capture source revision; no agent-created authority | Ambiguous/empty/wrong-type target denies; read idempotent |
| prepareCandidateWorkspace / REST | Source context/revision + task reference → candidate target/baseline | Exact Engineer/context lifecycle grant + REST Write; validated branch/version POST contract | Conflict or uncertain creation; reconcile membership/task receipt before reuse; no blind POST retry |
| captureRevision / REST | Bound wid or immutable reference → microversion, time, stable reference | Read, membership and type validated; currentmicroversion/features GET agreement | Inconsistent revisions fail; GET idempotent but latest wid can change |
| executeCadMutation / MCP | Candidate context + expected revision + Engineer code/plan digest → typed native outcome and target evidence | Engineer-only, scoped native session/wrapper, allowed eids, provider write-time CAS and code containment | Evaluation failure distinct from transport UNKNOWN; one dispatch per receipt, never auto-retry |
| verifyMutation / REST | Source/result revisions + expected dimensions/invariants → pass/fail/unknown observations | Read pinned features/geometry/evaluation; primary protection check; empirical measurement contract must be validated | Missing measurements or errors cannot pass; idempotent pinned reads |
| renderResult / REST | Pinned result context + bounded view/size → PNG artifact hash, revision, view metadata | Read only exact Part Studio m-reference shadedviews; no arbitrary output path/URL | Bounded Base64/PNG validation; fresh private artifact, safe read retry; no overwrite |
| createVersion / REST | Candidate/result microversion + bounded task label → immutable vid/reference | Explicit lifecycle grant, REST Write, provider honors microversion; currentrevision guard | Conflict/UNKNOWN; no duplicate POST retry, reconcile native versions |
| reportEngineeringResult / REST evidence + Engineer/Lead delivery | Verified evidence references + intent → structured report | Recipient/requester binding checked; credential-free, bounded artifact delivery | Mark partial/unknown explicitly; message delivery dedup keyed by receipt, no CAD side effects |

## FeatureScript and verification workflow

Engineer inspects the actual model before choosing how to modify it. Dynamic
FeatureScript is permitted in the future focused execution capability, not a
rigid catalog of geometry functions. Provider testing must occur in the same
contained candidate context; an unscoped evaluation tool is not admitted.
Successful compilation/test is not proof the existing Part Studio changed.
Feature Studio source updates alone are not Part Studio feature instantiation.
The provider must support both targeted authoring and actual feature/model
application; otherwise the Camera Mount Plate journey remains blocked.

For width +10 mm, establish which geometric extent is width, units and reference
frame from source observations. Verify after width minus before width = 10 mm
within a declared tolerance and all mounting-hole centers unchanged in the same
frame; also inspect feature/model evaluation errors. Preserve expected thickness
and hole dimensions if required by the selected engineering plan. Historical
quantity IDs help investigation but are not current facts. If REST metadata does
not establish real geometry, add a narrowly bounded, validated REST observation
contract; do not treat edited parameter text or screenshots as dimensional proof.

REST pins both shaded views to microversions using identical view/size/edge
options. Decode observed flat or documented nested Base64, bound bytes, verify PNG
dimensions/structure/CRC and save fresh private artifacts. No AI image generation.
Before/after screenshots are visual evidence alongside measurements and evaluation.
Report includes task, actor context reference, target did/wid/eid, source/result
microversions, optional vid, operation/code digest, measurements/units/tolerances,
evaluation status, primary-protection result, PNG hashes/view options, stable
Onshape links, limitations and `verified|failed|unknown`. Lead returns only this
authorized evidence to the originating Discord requester/channel.

```mermaid
sequenceDiagram
    participant U as Discord user
    participant L as Robotics Lead
    participant E as Mechanical Engineer
    participant R as Claw-Onshape REST
    participant M as Scoped native MCP
    participant O as Onshape
    U->>L: Engineering intent
    L->>E: Task + trusted requester delegation
    E->>R: Resolve/inspect authorized target
    R->>O: Membership, features, source revision
    R->>O: Prepare experimental workspace (future REST lifecycle)
    R-->>E: Candidate context + expected revision
    E->>E: Inspect design and author FeatureScript
    E->>M: Scoped test/evaluation
    M->>O: Evaluate in candidate only
    E->>M: Exact code/target + write-time revision precondition
    M->>O: Apply candidate CAD change
    E->>R: Capture and verify result
    R->>O: Pinned after-state + primary check
    R->>O: Shaded views; optional immutable version
    R-->>E: Measurements, PNGs, references
    E-->>L: Structured engineering result
    L-->>U: Verified evidence or explicit failure/unknown
    Note over M,O: Blocked until containment and CAS are proven; no automatic merge
```

## Product increment implementation evidence

Native dashboard page/session actions share one OAuth lifecycle with CLI. Operator consent and native REST inspection/pinned PNG rendering now pass live. Signed native A2A operator round-trips pass after explicit Clawake-owned global and per-agent grants. The full authenticated Discord path requires its own acceptance; source/code and operator probes do not substitute for it. REST/MCP responsibilities above remain unchanged, and mutation is still disabled. See ADR-009–013 and product-mvp-status.md.

## Internal REST authorization checkpoint (2026-10-12)

The candidate helper accepts source revision and candidate-selection data only.
A narrow host adapter derives authorization from the current trusted Engineer
binding, invocation authority, explicit host consent, private token grant and
operator application-permission attestations. It checks the actual token before
candidate GETs and rechecks write authority before POST. Lead and signed A2A read
contexts are not write grants. No agent candidate tool is registered.

Scope inheritance is confined to completed consent or the previous refresh grant;
malformed explicit stored grants fail closed. Capability summaries are bounded to
2 KiB and require operation-specific provider evidence for AVAILABLE. Unknown
application settings remain unknown, and status causes no provider probes or new
permission requests. Receipts remain bounded safety state; existing host logging
owns audit retention. See [OAuth capabilities](../oauth-capabilities.md) and
[candidate receipts](../candidate-preparation-receipts.md). This checkpoint does
not establish live writes or change the future MCP containment requirements.
