# Claw-Onshape architectural decisions

Date: 2026-10-11. Evidence reference: ClawCAD
`feat/mechanical-engineer-plugin@6d8313267e86fca31f271b821d7fbbf940b9b0c1`.
Read through `git show`; the current ClawCAD checkout was not switched or edited.
Accepted decisions define boundaries, not implemented/live-accepted features.
Review: 2026-10-11; current Discord read/render accepted, future writes remain disabled.
See [feature specification](../spec.md), [review record](adr-review-2026-10-11.md)
and [current validation](onshape-live-validation.md) and
[interface design](architecture/control-data-plane.md).

Product priority update: Increment 0 connectivity/onboarding and Increment 1
Discord read/render take precedence over MCP mutation work. ADR-008–011 record
the implemented product slice; ADR-001–007's plane/security boundaries remain.

## ADR-001: REST controls the engineering process; MCP performs CAD work

Status: Accepted

### Context

Historical ClawCAD mixed provider exploration, operator reads, generic workflows
and CAD write infrastructure. Claw-Onshape needs one focused engineering journey.

### Decision

REST owns OAuth, document/target inspection, workspace/revision/version lifecycle,
verification, rendering and reporting. MCP owns contained CAD exploration,
FeatureScript authoring/testing, feature creation and geometry modification.

### Rationale

Reuse proven REST observations and lifecycle contracts while keeping engineering
code generation with the Engineer. Each plane has a clear authority boundary.

### ClawCAD Evidence

`operator/readonly.py:planned_requests,ReadOnlyOnshapeProbe.inspect`,
`operator/render.py:shaded_path,render_current`, `onshape/rest.py:OnshapeRestAdapter`,
`docs/implementation/onshape-oauth-acceptance.md` and FINDING-015. REST rendering
was historically live; lifecycle writes were MockTransport-only.

### Adaptation for Claw-Onshape

Reuse endpoint contracts and bounded-output patterns; reimplement focused TS
capabilities inside the native plugin. Implement three fixed inspection GETs and six fixed render GETs, including
feature metadata, source revision and pinned element/view inspection. Do not port the Python operator process,
generic provider facade or parameter-mutation adapter. We reuse knowledge, not
the superseded workflow architecture.

### Consequences

REST lifecycle Write consent will be needed later; REST geometry writes remain
outside the chosen execution model. MCP metadata is not execution acceptance.

### Rejected Alternatives

All-MCP coordination/reporting; all-REST rigid CAD mutation catalog; raw passthrough.

### Open Questions

Current hosted MCP schemas and actual scoped feature-application capability;
bounded REST geometric observation contract for independent verification.

## ADR-002: Onshape owns workspace and revision history

Status: Accepted

### Context

Reliable source/result references and concurrency protection are necessary without
duplicating CAD project state or deploying a workflow platform.

### Decision

REST resolves/captures source and result microversions, branches a candidate from
the exact source and optionally creates an immutable version. Onshape is the
authoritative state. No local workflow database, broker or generic workflow engine.

### Rationale

Native versions/workspaces already represent provider history. Local storage
should only protect credential lifecycle and uncertain execution recovery.

### ClawCAD Evidence

`onshape/rest.py:create_candidate_workspace,create_immutable_version`,
`tests/test_onshape_contract.py`, `tests/test_onshape_http.py` are mocked contracts.
`mcp_execution.py:McpAdmission.admit` and
`tests/test_mcp_execution.py:test_restart_preserves_immutable_plan_outcome_and_blocks_replay`
establish the useful no-replay/UNKNOWN pattern, not live provider CAS.
AMD-003 explicitly supersedes AMD-002's service/database requirements.

### Adaptation for Claw-Onshape

Reuse sourceMicroversion/conflict and unknown-write knowledge. Reimplement native
REST lifecycle calls after live contract validation. Discard ChangeWorkflow,
SQLite snapshots/events, service ingress, connection broker and custom revisions.
A minimal private dispatch receipt may fence an uncertain call across restart;
it contains IDs/digests/status, never a second CAD history or agent credential.
No receipt implementation is added by this task.

### Consequences

Missing revision guarantees block writes. No automatic mutation replay; reconcile
against Onshape before any new authorization. Candidate POST's historical
`versionId` contract must not be relabeled as microversion branching.

### Rejected Alternatives

Duplicated Git/SQLite revision store; durable generic orchestration service;
pre-read revision check presented as atomic write protection.

### Open Questions

Provider-supported exact-source branch anchor and atomic candidate version creation;
smallest native receipt persistence/reconciliation contract.

## ADR-003: Experimental workspaces protect primary; promotion is separate

Status: Accepted

### Context

The requested Camera Mount Plate task must preserve the original design and not
turn a successful engineering experiment into an automatic primary change.

### Decision

Permit future CAD execution only in an authorized experimental workspace. Validate
primary/candidate membership and primary protection before and after execution.
No automatic merge, print or simulation step. Future promotion requires separate
trusted authorization and provider merge/conflict checks.

### Rationale

Isolation limits damage only when the execution boundary also constrains targets.
Detecting primary changes after an unrestricted call cannot undo them.

### ClawCAD Evidence

`onshape/rest.py:create_candidate_workspace`, FINDING-015's configured sandbox
problem, `docs/implementation/openclaw-mcp-cad-write.md`'s approved target versus
historical sandbox and missing BEFORE. `tests/test_mcp_execution.py:test_exact_call_scope`
checks exact intent/call matching offline.

### Adaptation for Claw-Onshape

Reuse membership/isolated-target and exact-call patterns. Current
`config.ts:validateTarget` rejects primary writes then all other writes. Extend
the guard only after contained MCP acceptance. Discard generic Human Gate/workflow
HTTP implementation; preserve the requirement for authentic user authority at
the native host boundary. Do not substitute the historical sandbox target.

### Consequences

Model/primary target must be resolved fresh. Workspace isolation alone does not
justify an account-wide token or unscoped tools.

### Rejected Alternatives

Modify primary then revert; automatic merge on evaluation success; agent approval.

### Open Questions

The configured target is resolved and live-tested. Authoritative primary workspace
identity still needs verification before mutation; current configured primary
is conservatively protected. Future promotion requires trusted authorization.

## ADR-004: REST supplies visual and engineering evidence

Status: Accepted

### Context

Provider success text or an image alone cannot establish engineering correctness.
ClawCAD already validated pinned shaded views without MCP.

### Decision

REST owns feature/revision observations, geometry verification, microversion-pinned
shaded-view PNGs, before/after comparisons and stable result references. Engineer
interprets these observations; Lead delivers the authorized report to Discord.

### Rationale

Independent pinned observations provide evidence separate from the mutation call.
Visual comparisons supplement dimensional and feature evaluation checks.

### ClawCAD Evidence

`render.py:render_current`, `readonly.py:ReadOnlyOnshapeProbe.inspect`,
`tests/test_onshape_render.py:test_render_pins_microversion_and_preserves_provider_bytes`,
`test_observed_live_flat_image_shape`, `test_invalid_provider_images_fail_closed`,
`test_dimensions_only_return_literal_provider_quantities`;
October 7 OAuth acceptance records the 42,710-byte PNG and immutable source.
`plugin/inspection.mjs:compareInspections` explicitly cannot verify source revisions.

### Adaptation for Claw-Onshape

Reuse shadedviews/query contracts, flat/nested Base64 handling and bounded
PNG-validation pattern. Reimplement TS decoding/artifacts natively; port a small
pure view-matrix constant only if its license and numeric validation are checked.
No screenshot service, Python decoder process or agent-supplied verified boolean.
Report states unknown when geometry/units/reference-frame evidence is missing.

### Consequences

REST feature metadata, source revision and pinned PNG support are implemented
and live-accepted. Independent dimensional mutation verification and before/after
comparison remain unimplemented. Edited quantity expressions
and screenshots are not geometry measurements. Artifact delivery needs recipient
checks and fixed private paths.

### Rejected Alternatives

MCP screenshots/reporting by default; synthetic renders; parameter text as fit proof.

### Open Questions

Which bounded REST geometric/evaluation observations satisfy width and hole-center
invariants for the actual model? Current read/render response shapes are live-accepted.

## ADR-005: Dynamic FeatureScript requires a proven narrow MCP boundary

Status: Accepted

Implementation scope: MCP execution remains deferred; this accepts the containment
boundary, not an executable mutation design.

### Context

Mechanical Engineer must author code dynamically; historical hosted MCP lacks
target/revision inputs on several tools and has no proven safe execution path.

### Decision

Avoid a rigid mutation catalog. Expose focused code/plan execution only when
provider containment, exact target binding and write-time revision protection
are established. Keep raw MCP tools and unscoped operations unavailable. Hooks
are defense in depth until the selected native routes are tested.

### Rationale

Target arguments cannot constrain a tool that ignores them. REST pre/post checks
cannot close concurrency races or prevent unrelated account writes.

### ClawCAD Evidence

FINDING-015 catalogs unscoped `create_geometry`, notes and evaluation tools;
targeted `put_featurescript` lacks revision preconditions.
`deploy/demo/plugin/mcp-guard.mjs:createMcpGuard`, `tests/mcp_guard.test.mjs`
prove mock fail-closed admission, not native traversal.
`mcp_execution.py:McpAdmission.admit` explicitly requires trusted write-time
precondition verification. AMD-002/003 preserve Engineer-authored FeatureScript.

### Adaptation for Claw-Onshape

Reuse exact payload/identity binding, conservative call budgets, no blind retries
and UNKNOWN outcomes as patterns. Discard workflow service tokens, HTTP admission,
generic execution engine and broad native grants. Reimplement a small wrapper
only against a verified native call facade/scoped provider contract. No code is
ported now. Installed 2026.9.9 source routes were inspected; full hook traversal
and current provider schemas remain unverified. If suitable contracts are absent,
fail closed and document the external prerequisite, not a generic fallback platform.

### Consequences

Current MCP cannot be claimed safe for the journey. Feature Studio modification
does not prove an existing Part Studio feature was applied. Tool annotations or
configured filters do not authorize side effects.

### Rejected Alternatives

Account-wide grants to finish the demo; hook-only safety; arbitrary MCP passthrough;
every CAD operation implemented as a dedicated plugin function.

### Open Questions

Current schemas, server context/session scopes, code/import containment, atomic
revision enforcement, feature instantiation and native MCP projection coverage.

## ADR-006: REST and MCP credentials stay separate

Status: Accepted

### Context

REST confidential-app OAuth and hosted native MCP OAuth are different resources
with different lifecycle and target policy. Historical authentication is not a
new plugin connection or engineering authorization.

### Decision

REST uses privately provisioned application secret and native credential files;
MCP uses OpenClaw's native separate resource store. Agents receive neither.
Current REST requests Read only. Shared serialized refresh is implemented;
uncertain/invalid renewal and provider 401 fail closed. See ADR-014 for live limits.

### Rationale

Prevent accidental credential forwarding and serialize credential rotation.
Keep verified requester binding independent from OAuth consent.

### ClawCAD Evidence

`operator/oauth.py:ConsentAttempt,OAuthExchange,OperatorOAuthAuth,RuntimeStore`,
`tests/test_operator_oauth.py:test_registration_and_code_exchange_contract`,
`test_concurrent_refresh_runs_only_once`, `test_ambiguous_refresh_is_not_retried`;
historical October 7 REST consent and October 9 native MCP consent are distinct.

### Adaptation for Claw-Onshape

Reuse OAuth endpoint/state/client_secret_post and private-file/locking patterns;
already rewritten in TS. Do not port Authlib, old tokens, SQLite credential broker
or a credential broker. Reimplement the small private-lock refresh pattern
in the shared native lifecycle. CLI status reports account binding unverified, rather
than claiming OAuth consent proves account identity. Future REST lifecycle writes
require explicit scope extension and operation grants.

### Consequences

Operator-provisioned single-owner native onboarding and Discord read/render pass.
Canonical Onshape account identity is not independently verified. A fresh-grant
refresh POST passes; provider-expired renewal/rotation needs further acceptance.

### Rejected Alternatives

Reuse old tokens; tokens in config/model text; shared bundled client secret;
MCP token forwarded to REST; silent scope upgrades.

### Open Questions

Native canonical account identity verification; provider-expired refresh/rotation
acceptance and secure public-client onboarding contract.

## ADR-007: Engineer orchestrates; Lead coordinates; Clawake deploys

Status: Accepted

### Context

The existing OpenClaw roles and Clawake reconciliation already supply orchestration
and lifecycle. Generic ClawCAD services and additional agents would duplicate them.

### Decision

Engineer owns design investigation, code, recovery and engineering result. Lead
owns delegation and Discord delivery. Clawake owns install/config/grants/restarts
and structural runtime remedies. Trusted requester authority must be carried
through verified delegation; unsigned/unbound A2A requests are denied. No identity inferred from text; no OIDC4VC/VP implementation.

### Rationale

Use native ownership with a small extensible authorization boundary that can
later consume credential-verifier assertions without changing CAD execution.

### ClawCAD Evidence

AMD-003 supersedes standalone application/workflow/DB/broker requirements.
`plugin/index.mjs:register` optional Engineer factories and
`tests/clawcad_plugin.test.mjs` role exclusion; old demo A2A delegation helpers
and mocked identity contracts are evidence, not a trusted live propagation proof.
Clawake `services/gateway_config.py:ensure_plugin_runtime_config` reconciles
entries/grants; `services/plugins.py` owns installation.

### Adaptation for Claw-Onshape

Reuse optional factory and exact identity-check patterns (already native TS).
Discard extra agents, A2A bridge service, broker, generic gate ingress and runtime
self-management. Document cross-repository proposals and obtain explicit scope authorization.
The operator approved the focused Clawake global-grant change (ADR-013). Direct Engineer acceptance can isolate A2A failures, but cannot
be advertised as a complete Discord journey.

### Consequences

Deployment and identity prerequisites are independent of CAD code correctness.
Plugin loading with zero bindings proves no engineering journey. Native signed A2A association and actual Discord image delivery are accepted.
This does not mean the host forwards raw Discord identity over A2A.

### Rejected Alternatives

Generated config edits; Lead inherits mutation rights; agent-authored requester IDs;
extra orchestration layer; deployment from plugin execution.

### Open Questions

Supported private-archive provenance policy and duplicate discovery remediation;
future multi-user association. The current native A2A contract is recorded in ADR-011.

## ADR-008: Mechanical Engineer guides readiness and product onboarding

Status: Accepted

### Context

Users ask the agents for CAD; raw internal errors and terminal-only consent do
not form a useful product journey. Mutation-first sequencing delayed that journey.

### Decision

Ship connectivity and Discord/A2A read/render first. Engineer exposes machine-readable
readiness and user-oriented guidance for missing plugin/config/app, disconnected,
authorization in progress, expired connection, missing target and provider-ready
result. Mutation and promotion become later increments.

### Rationale

An existing model view is immediately useful and exercises the actual roles and
provider path without enabling write authority.

### ClawCAD/OpenClaw Evidence

ClawCAD `readonly-discord-demo.md` establishes useful view/report behavior.
Native 2026.9.9 optional tool factories and current unconfigured runtime prove
that loaded and connected are separate states. The product tests cover role
isolation, readiness, OAuth and the fixed delegation adapter.

### Adaptation for Claw-Onshape

Add focused `onshape_status`, `onshape_render`, `onshape_delegate_render` tools
and `readiness.ts`. Retain the exact binding guard and original `onshape_inspect`.
No new agent, workflow service or general project browser. A configured/connected
state is not called provider-ready until actual rendering succeeds.

### Consequences

MCP safety is not on the read/render critical path. Actual Discord image delivery
was operator-confirmed on October 11; offline tests remain separate evidence.

### Rejected Alternatives

Return internal OAuth codes to users; grant Lead direct CAD access; postpone A2A
until mutation; declare a locally working tool to be a completed product.

### Open Questions

True multi-user onboarding association and unified operator provisioning (ADR-012).

## ADR-009: Native OpenClaw dashboard page is the onboarding HMI

Status: Accepted

### Context

The host's UI capability must be established from source rather than inventing a
dashboard API or adding a separate application.

### Decision

Use a native plugin page/navigation contribution with authenticated
`plugins.sessionAction` status/connect/disconnect operations. Connect/disconnect
require `operator.admin`; status requires `operator.read`. Use a state-protected
callback route on the existing gateway, with the registered loopback dashboard URI.

### Rationale

This provides a native Connect experience without terminal invocation, an extra
server or container loopback forwarding. Administrator access is an explicit MVP
operator boundary, not a fabricated Discord identity.

### ClawCAD/OpenClaw Evidence

Installed 2026.9.9 `docs/plugins/feature-plugins.md` documents
`defineControlUiPlugin`, `host.ui.registerPage/registerNavigation` and
`host.request`; `feature-contract.js:createFeatureClient` calls
`plugins.sessionAction`. `plugin-host-hooks-DPJ5Z2m1.mjs` applies action scope
checks and passes only connId/scopes plus optional resolved session/agent: it does
not give a Discord requester identity. `manifest-DtzM0468.mjs` permits prebuilt
entries only under a dedicated dist directory. Exact npm SDK declarations confirm
the registration signatures. Custom native UI is gated by
`gateway.controlUi.experimental.customPlugins`, default off.

### Adaptation for Claw-Onshape

Implement a self-contained prebuilt native entry at
`dist/control-ui/product/index.js`, backed by `dashboard.ts`. Display status,
configured connection references, Connect/progress/link, Disconnect and useful
failure text. No arbitrary command runner or CLI subprocess exposed through UI.
Client ID and registered callback are operator config; client secret remains a
private-file reference and is never included in action results.

### Consequences

Clawake must enable the custom UI lab for this reviewed plugin and install its
browser artifact. Browser activation is distinct from backend loading. A normal
unprivileged dashboard visitor cannot attach their consent to another Discord
owner: arbitrary user self-service is deliberately not claimed. The configured
owner uses the operator dashboard for this MVP.

### Rejected Alternatives

Standalone dashboard; raw HTTP admin RPC/exec UI; tokens in URLs/config; assume
dashboard sessions automatically prove Discord identity.

### Open Questions

Trusted per-user dashboard-to-Discord association and clearer authorization-link
guidance. Connect starts consent; the user must also follow the authorization link.
Native browser/callback acceptance passed. Hosted non-loopback onboarding is not designed.

## ADR-010: One OAuth lifecycle serves CLI and dashboard adapters

Status: Accepted

### Context

The CLI already implements native state checks and private persistence. Dashboard
onboarding must not become a second OAuth implementation. The old ClawCAD secret
was in logout-sensitive runtime storage and is no longer provisioned here.

### Decision

Keep `Consent` as the single authorization/code-exchange implementation and
`authorizeConnection` as the exclusive invalidation/save lifecycle. CLI loopback
listener and dashboard gateway callback are transport adapters. Reconnection
remains explicit when renewal fails; ordinary renewal is shared with REST tools
(ADR-014). Consent is Read-only and separate from MCP credentials.

### Rationale

Shared guards, locking and persistence prevent overlapping lifecycle writes or
late callbacks restoring a disconnected/reassigned connection.

### ClawCAD/OpenClaw Evidence

ClawCAD `ConsentAttempt`, `OAuthExchange`, callback replay/expiry tests and native
private-file runtime research are retained knowledge. Current app registration
was operator-confirmed for `http://localhost:19489/plugins/claw-onshape/oauth/callback`.
Native SDK provides private atomic storage; its runtime-only export lacks public
declarations, so narrow local types mirror the inspected implementation.

### Adaptation for Claw-Onshape

Factor listener out of CLI; share `authorization.ts`, `oauth.ts`, private secret
loading and credential store. Dashboard has one pending attempt, five-minute
timeout, exact state/Host/path/redirect checks, config revalidation and callback
draining before lock release. CLI retains `http://localhost:8765`; applications
using it must register that callback separately. Add a masked operator command
writing persistent 0600 `state/deployment/oauth/client-secret`, mounted read-only
into Engineer by Clawake. Do not copy old tokens or recover secret contents into chat.

### Consequences

App provisioning is an operator action; browser consent is user onboarding;
expiry/reconnect/disconnect is runtime lifecycle. Restart cancels attempts;
stale process locks fail closed. Local disconnect does not revoke the provider grant.

### Rejected Alternatives

Duplicated dashboard exchange code; app secret in normal config/password text;
runtime-directory-only secret; arbitrary callback URLs; a standalone background refresh worker.

### Open Questions

Provider-expired refresh/rotation acceptance; deliberate recovery procedure if
a process leaves a stale private lock. Consent/code exchange/callback pass live.

## ADR-011: Signed A2A context associates peer delegation with user authorization

Status: Accepted

### Context

Bundled A2A authenticates peer credentials and creates an isolated peer/context
session. It does not forward original Discord identity as trusted metadata.

### Decision

Only a Lead tool admitted for the exact native Discord sender/channel/account can
mint a five-minute, read-only signed context bound to an existing Engineer binding.
Pass it in native A2A `contextId`. Engineer verifies native peer/channel/account,
exact host-derived session key, signature/expiry and current binding digest before
exposing CAD reads. Engineer signs its structured result; Lead validates it and
the private PNG before replying to the original Discord context.

### Rationale

Authenticated user, agent role, peer delegation and CAD authorization are separate
facts. A peer token alone or an identity written in a prompt cannot authorize CAD.

### ClawCAD/OpenClaw Evidence

Installed `/app/extensions/a2a/src/http.ts` authenticates `peerName`, uses
`message.contextId`, and dispatches text without forwarding metadata.
`inbound.ts` sets channel `a2a`, sender peerName, account and isolated context;
only final text completes the task. `protocol.ts` limits context IDs to 128 ASCII
characters. `session-key-BC4m_Ly5.mjs:buildAgentPeerSessionKey` lowercases and
builds `agent:<agent>:a2a:<account>:direct:<peer>:<context>`.
`openclaw-tools-CfoJyEsW.mjs:resolveOpenClawPluginToolInputs` supplies native
sender/account and `deliveryContext`; `createPluginToolFactoryContext` provides
invocation guards. Public v2 factory descriptors require final-effect authority.
ClawCAD `delegateRender` supplies fixed SendMessage/GetTask/shared-artifact patterns,
not a trusted requester propagation mechanism.

### Adaptation for Claw-Onshape

Implement a 128-character lowercase HMAC-SHA256 context carrying expiry, nonce and
a 128-bit digest of the exact configured binding. Private shared key is Clawake-
mounted; no key/token appears in agent arguments. Fixed delegate tool sends only
this read/render task and polls the same task/context. It grants Lead no REST
credentials. v2 factories and each provider/result boundary recheck current
authority. Reuse the existing private A2A transport token, never old REST OAuth.
No new service, database, broker or generic delegation framework.

### Consequences

An authenticated `lead` peer without a valid signed context is still denied.
The short-lived context is visible as an opaque session reference, not a new
account token; replay permits only the same bounded read capability within its
lifetime. Identity-link/session-scope changes fail closed. Cross-host transport,
multiple users and other CAD targets require separate review. Native A2A route, exact requester admission and Discord delivery passed in the
real user journey at 19:01 UTC on October 11.

### Rejected Alternatives

Trust prompt/metadata identity; bind every Lead peer request to an owner; grant
Lead `onshape_render`; assume generic tool hooks enforce native MCP; add a broker.

### Open Questions

Multiple users, key rotation and future cross-host deployment. No mutation uses
this context; current v2 context/routing/signature/Discord delivery passed live.

## ADR-012: Unified Mechanical Engineer provisioning and onboarding

Status: Proposed

### Context

The operator provisioned the Onshape client secret using the masked native repository helper on October 11. They explicitly require future Mechanical Engineer dashboard onboarding to configure everything needed for Discord and Onshape together, including the public client ID and private application secret. The previous ephemeral XDG runtime file did not survive deployment changes.

### Decision

Make the Mechanical Engineer OpenClaw dashboard the future guided onboarding surface for Discord channel/account setup, trusted requester grants, Onshape application ID, registered callback, private secret provisioning, user consent, target selection and readiness verification. Keep operator provisioning distinct from user consent. The present MVP uses the masked `scripts/provision-oauth-secret.mjs` helper and Clawake-owned private mounts; dashboard secret submission is deferred until a reviewed operator-only write action exists.

### Rationale

A coherent onboarding flow should survive restarts and make missing dependencies understandable without putting credentials in ordinary plugin configuration.

### ClawCAD/OpenClaw Evidence

ClawCAD historically used ephemeral runtime-directory secrets. Native OpenClaw 2026.9.9 supports plugin pages and scoped session actions (ADR-009); those actions convey operator scopes, not authenticated Discord user identity. The current helper writes an owner-only persistent Git-excluded file, and shared OAuth lifecycle code consumes its mounted private path.

### Adaptation for Claw-Onshape

Reuse private-file handling and existing native host interactions. Add focused provisioning adapters later rather than a separate dashboard, service or credential database. Clawake retains mount/config reconciliation ownership. Public application IDs may appear in normal configuration; secrets and Discord tokens must remain private and must never be returned in action results.

### Consequences

Future dashboard provisioning requires operator-admin authorization, safe private atomic writes, no secret readback, explicit replacement/disconnect behavior and reviewed Clawake reconciliation. User consent remains a separate Connect action. This task does not claim dashboard secret entry or Discord setup is implemented.

### Rejected Alternatives

Persist secrets in UI-visible plugin configuration; ephemeral runtime-only provisioning; prompt-based identity authorization; standalone onboarding application.

### Open Questions

Which existing Discord host onboarding actions can be safely reused, how an operator-only private write action hands off to Clawake, and how multi-user consent is isolated beyond this single-owner MVP.

## ADR-013: Explicit Clawake-owned global tool grants preserve native policy

Status: Accepted

### Context

Live native A2A selected historical tools despite per-agent grants. On OpenClaw 2026.9.9 global tools.allow and agent policy are independent filtering boundaries. Existing global lists exclude the product tools.

### Decision

Use explicitly configured Clawake `global_tool_allow` names alongside per-agent grants. Engineer receives only status/inspect/render; Lead receives only delegate_render. Preserve all denies and unrelated global entries. The operator explicitly approved this focused cross-repository implementation.

### Rationale

Deployment owns policy changes. Agent prompts cannot confer authority, and generated configuration must remain reconciled by Clawake.

### ClawCAD/OpenClaw Evidence

Installed `agent-tools.policy-CTwQOYjx.mjs:resolveEffectiveToolPolicy` and `tool-policy-pipeline-BhdrHJWh.mjs` retain/filter global policy independently. Clawake `services/gateway_config.py` previously reconciled only agent grants. Native A2A returned historical operator-session-unavailable results and the new delegate correctly rejected unsigned output.

### Adaptation for Claw-Onshape

Add a small explicit inventory grant capability in Clawake instead of a runtime override in Claw-Onshape. Preserve provider scoping, signed identity association and disabled mutation. The implementation rejects groups/wildcards, absent/empty explicit global allowlists, and withdrawal that would empty the list.

### Consequences

Clawake tracks only newly introduced global names; withdrawal preserves operator-preexisting grants. 48 focused Clawake tests and Ruff pass. Native factories still decide authorization independently of catalog inclusion. Global grant support does not enable MCP.

### Rejected Alternatives

Edit generated config directly; grant all plugin tools; remove global restrictions; allow historical unsigned reports as native product evidence.

### Open Questions

Managing this dependency in the Clawake repository and release. Actual Discord
sender/channel association and attachment delivery passed on October 11.

## ADR-014: Renew REST credentials and preserve signed A2A failures

Status: Accepted

### Context
The real fresh-session Discord request reached the authorized Engineer but its Onshape access token had expired. Native tool transport exposed human-readable error text without signed details; the Lead consequently reported an authorization failure instead of the actual onboarding state.

### Decision
Renew near-expiry REST tokens through the shared private authorization lifecycle under the existing connection lock. Persist denial before an uncertain refresh exchange, validate returned credentials, and check current authorization before saving. Status and render error text must carry complete signed JSON, with distinct invalid-A2A-result and OAuth diagnostic codes. Keep user grant validation unchanged.

### Rationale
A working delegation must carry provider failures faithfully as well as successful render metadata. Normal access-token expiry should use provider-supported refresh; failed or uncertain refresh requires browser consent rather than repeated reuse of a possibly consumed credential.

### ClawCAD/OpenClaw Evidence
ClawCAD src/clawcad/operator/oauth.py:OAuthExchange.request uses fixed form-encoded refresh; OperatorOAuthAuth.auth_flow serializes renewal and persists denial before exchange. Its historical live acceptance did not claim forced-refresh acceptance. Onshape's official OAuth contract https://onshape-public.github.io/docs/auth/oauth/ specifies refresh_token grant and storage of returned access/refresh tokens. Actual native Engineer transcripts at 15:11 UTC show text-only reconnect guidance; the post-fix 15:41 UTC native A2A task returns a signature-verifiable disconnected result.

### Adaptation for Claw-Onshape
Reuse the fixed provider contract and fail-closed private-lock pattern, not ClawCAD's application architecture. Implement a small accessToken function beneath native plugin REST tools and existing CLI/dashboard consent adapters. No service, database, provider passthrough or new agent is introduced.

### Consequences
Expired reads can renew without exposing credentials to agents. Failed/uncertain exchange closes local connection and requires consent. A signed onboarding result travels over the same A2A trust boundary as a signed PNG report. Offline renewal/error transport tests pass; the first live renewal failed and is not recorded as accepted.

### Rejected Alternatives
Granting extra user/agent rights to hide a connection failure; unsigned agent-written status; bypassing signature verification; copying old tokens; replaying uncertain refresh; requiring manual reconnect for every normal expiry.

### Open Questions
A fresh-grant live POST passed strict validation with expires_in 3572 and unchanged
token values; its local expiry condition was forced by an operator probe. An actual
expired-grant POST returned HTTP 200 but failed token validation; its shape was not
retained. Successful provider-expired renewal and rotation remain unverified.
Do not assert a parser defect or rotation success from these observations.
Current signed render and real Discord attachment passed after renewed consent.

## ADR-015: Apply role updates through native files and a fresh Codex session

Status: Accepted

### Context

Correct grants did not fix historical ClawCAD routing in an existing native Codex
thread. Updated workspace files and /reset soft still left the original AGENTS.md
snapshot active. Repeated Discord retries did not exercise the new delegate.

### Decision

Maintain focused role templates in deploy/roles. Back up deployed originals, then
use native agents.files.get/set with expectedHash and verified readback to update
the actual workspace. When replacing a native Codex thread's captured role, use
the documented fresh-session boundary (/new), not a soft reset. No extra reset
is needed for ordinary plugin implementation changes with unchanged role routing.

### Rationale

Configuration stored on disk and instructions active in a thread are distinct.
Deployment/HMI must explain that distinction without editing internal session DBs
or widening plugin conversation-access permissions.

### ClawCAD/OpenClaw Evidence

Installed OpenClaw 2026.9.9 extensions/codex/src/app-server/attempt-workspace-context.ts:167
prefers startupBinding.agentWorkspaceDeveloperInstructions, supplied through
run-attempt-context.ts:163–164. run-attempt.workspace-snapshot.test.ts explicitly
verifies that first instructions stay frozen after AGENTS.md changes on resume.
Native agents.files.set supports optimistic expectedHash; slash-command docs define
/new as archiving the current session and starting fresh. Actual new Discord session
selected onshape_delegate_render; the subsequent successful journey delivered a PNG.

### Adaptation for Claw-Onshape

scripts/apply-runtime-role.mjs is a fixed AGENTS.md operator adapter, not an agent
file tool. Nested role mounts were removed; native guarded edits updated deployed
workspaces. Clawake retains ownership of install/config/mounts/restarts. No ClawCAD
source or generated OpenClaw configuration was edited for this role update.

### Consequences

Future onboarding should identify stale active roles and guide a deliberate session
renewal. Native workspace readback alone is insufficient evidence of current routing.
Role text provides guidance only; authorization still comes from plugin/host guards.

### Rejected Alternatives

Repeated /reset soft and blind redispatch; internal binding/DB edits; prompt hook
permissions to override the thread; giving Lead direct CAD tools.

### Open Questions

Future native HMI indication of saved versus active role revision; behavior on host
upgrades beyond the pinned 2026.9.9 release.

## ADR-016: Separate native MCP OAuth with unified readiness presentation

Status: Accepted; read-only dashboard extension implemented offline on 2026-10-12.

### Context

The accepted REST onboarding uses Claw-Onshape's confidential Onshape application
and private connection store. Current public hosted MCP metadata identifies a
different resource and authorization server. A saved native `authorized` status
can have a past expiry and does not establish current access or mutation safety.

### Decision

Keep native OpenClaw as MCP transport/OAuth/store owner and keep REST consent
independent. Choose architecture C: one operator-facing readiness presentation
with separate credentials; use existing native MCP Settings/CLI initially.
REST success never implies MCP success. MCP success never removes containment,
revision or application gates. Do not forward/copy REST tokens or silently add
scopes. The current production MCP connector stays disabled.

### Rationale

Resource/client compatibility and supported token exchange were not established.
The native host already implements browser sign-in and refresh, so duplicating
OAuth in Claw-Onshape adds risk without solving target isolation.

### ClawCAD/OpenClaw Evidence

ClawCAD FINDING-015 records separate native consent. Current protected-resource
metadata declares `https://fs-mcp.labs.onshape.app` and issuer
`https://mcp-auth.labs.onshape.app`. Installed OpenClaw 2026.9.9
`mcp-auth-login-C5Nrcsmc.mjs:mcpAuthLoginHandlers` implements administrator/browser
wizard login; `mcp-operator-auth-Dq37qXJH.mjs` rejects disabled/non-operator
connectors. Native Control UI Settings uses `mcp.authLogin`. Canonical OAuth state
is OpenClaw-owned SQLite, not Claw-Onshape workflow storage. Full evidence:
[MCP investigation](mcp-integration-investigation-2026-10-12.md#f-oauth-architecture-and-dashboard-integration).

### Adaptation for Claw-Onshape

Reuse native OAuth/resource knowledge and existing page/session-action patterns.
The dashboard now adds bounded independent MCP readiness, native Settings guidance
and separate REST capability/policy display. No custom OAuth implementation,
standalone dashboard or workflow database. The page exposes REST controls
only; MCP metadata comes from the documented native CLI status command, with no
custom MCP credential-management endpoints.

### Consequences

Separate consent and reconnection may be necessary. Native shared credentials are
runtime/server-owned, not agent-only; grants and trusted target authorization stay
separate. A2A read proof does not become per-requester MCP consent or write authority.
Provider-advertised token exchange remains UNVERIFIED. No consent initiated here.

### Rejected Alternatives

Manual token copying, using the REST resource label as an audience proof, displaying
MCP ready from REST connected, requesting every advertised scope, and importing
private native OAuth modules as a supported API.

### Open Questions

Approved isolated fresh schemas/tool-specific scopes; live dashboard status
acceptance; supported custom-page wizard authority and cleanup; requester identity
through delegated execution; supported MCP disconnect UI contract. Known disabled
Delete/Share/Profile/Purchase application settings remain disabled.

## ADR-017: Hosted mutation remains blocked despite published REST skew rejection

Status: Accepted as execution gate; Proposed narrow adapter direction.

### Context

REST candidate preparation now has exact-source membership/baseline checks,
trusted operation authorization and bounded persistent uncertainty receipts.
Hosted historical MCP schemas have implicit geometry targets, unverified cleanup,
no expected-revision arguments and no explicit existing Part Studio application.
Candidate creation protections cannot constrain an independent MCP route.

### Decision

Keep hosted MCP mutation and production Engineer access disabled. Require an
actual server/execution-boundary candidate capability, mandatory provider write-time
revision enforcement, exact Part Studio application and absence of raw bypass.
Investigate a narrow native MCP adapter only if the hosted provider cannot supply
these contracts. Dynamic FeatureScript remains the engineering model; no rigid
operation catalog. Provider REST endpoints may implement MCP data-plane capabilities
internally without moving control-plane lifecycle/reporting to MCP.

### Rationale

Published provider skew-rejection fields offer a potential atomic write contract;
preflight reads, local locks, hook tests and post-verification do not provide it.
A safe adapter must make target and CAS unavoidable at execution, rather than add
checks before an unrestricted hosted tool. No evaluated provider is mutation-ready.

### ClawCAD/OpenClaw Evidence

FINDING-015, `mcp_execution.py:McpAdmission.admit`'s provider-precondition gate,
and `mcp_guard.test.mjs` distinguish authorization from native coverage.
Current Onshape OpenAPI build `1.222.90730-c8d74e607a47` publishes
`sourceMicroversion`/`rejectMicroversionSkew` for feature calls and Feature Studio
contents via `BTFeatureApiBase-1430`; the schema advertises API v17 while the plugin
uses v10. Version compatibility and live rejection were not tested. Installed
native materialization, Codex static projection and requester resolver paths do
not establish a plugin-scoped invocation facade or universal hook coverage.
[Detailed containment/revision/provider comparison](mcp-integration-investigation-2026-10-12.md).

### Adaptation for Claw-Onshape

Reuse provider revision fields, scoped admission, uncertainty semantics and native
transport ownership. Do not port the historical workflow engine or revision store.
The existing candidate receipt is a bounded dispatch fence for preparation, not a
second CAD history or an MCP idempotency guarantee. Any future adapter must preserve
native authentication ownership and demonstrate a supported invocation composition.

### Consequences

MCP OAuth/catalog success cannot authorize source/test/geometry writes. `clean=false`
is not a containment proof. Feature Studio edits must advance the next expected
candidate revision before feature application. A transport timeout must not trigger
redispatch. Feature states and independent geometry/REST evidence determine success.

### Rejected Alternatives

Unrestricted `create_geometry`, post-write-only protection, prompt-only targeting,
generic full-REST MCP passthrough, client-side checks alone, assumed If-Match support,
and enabling production tools to learn their effects.

### Open Questions

Fresh hosted schemas and scoped context, API v10 live skew-rejection semantics,
custom feature namespace/application contract, code/import effects, narrow supported
native invocation seam, credential composition and complete projection bypass tests.

## ADR-018: Self-hosted MCP with one control-plane refresh owner

Status: Accepted architecture, staged read-only implementation; mutation blocked.
Date: 2026-10-12.

### Supersession

Amends ADR-006 and ADR-016's separate hosted MCP OAuth requirement **for the
self-hosted connector**. Those decisions and hosted sprint evidence remain
historical; hosted credentials must never be copied into REST. Amends ADR-017's
preference for hosted investigation: use pinned altendky/onshape-mcp as the local
starting point. ADR-001–005's authority, Candidate, CAS and verification gates
remain. ADR-005's dynamic FeatureScript direction remains; the existing parameter
update is the narrow first acceptance, not a general CAD policy framework.

### Decision

Claw-Onshape owns operator OAuth and the only refresh lifecycle. It atomically
publishes accessToken, expiresAt (epoch milliseconds), and granted scopes to a
protected runtime directory; null/reconnect/refresh invalidation revokes that
handoff first. The MCP service receives no refresh token or client secret, never
logs in or refreshes, reloads the file per request and refuses expired tokens.
Clawake creates the service/configuration/mounts/private network and owns restart
and health; it does not read, renew or broker credentials.

REST owns bindings, source revision, Candidate workspace preparation, verification,
rendering and approval. MCP owns CAD API execution via structured tools. Engineer
gets guarded capabilities only, no unrestricted REST, credentials or raw write
projection. Initial external-token mode rejects every write at the server and
admits only exact-target read endpoints. Discovery does not remove that restriction.

Use a separate rootless non-root service on a dedicated Podman network with no
published port, read-only credential directory and filesystem, bounded resources
and independent liveness/credential readiness. HTTP is upstream experimental;
validate native OpenClaw transport before production switch. No custom proxy.

### Evidence / consequences

Upstream f78ddc48a445765f32fcf052d9d8e6d709497d56 lacks external-token-only auth
and Candidate/CAS enforcement. A small isolated patch adds external credentials
and a read-only HTTP branch; its original OAuth behavior remains unchanged.
The generic updatePartStudioFeature POST body contains sourceMicroversion and
rejectMicroversionSkew; provider documentation describes refusal on mismatch.
Preflight reads do not provide atomic protection. Live stale-write rejection is
not accepted merely from the schema. No mutation is enabled while the supported
plugin-owned native invocation seam is absent. A narrow guarded mutation must
consume an approved exact payload/attempt before dispatch and reconcile UNKNOWN
without retry; raw generic writes must remain impossible through alternate routes.

### Rejected alternatives

Second user consent, shared refresh credentials, Clawake credential brokerage,
agent-mounted token files, token CLI arguments, custom MCP proxy, direct Engineer
REST and enabling writes to compensate for an unavailable native seam.

### Implementation checkpoint — 2026-10-12

Clawake deployed the separate pinned service; native operator discovery verifies
five external-mode provider tool names and two native resource helpers. Production
registry is local and disabled. Access-only handoff and read-only containment tests
pass. Full upstream source schemas are preserved separately and are not native
catalog acceptance. Independent REST baseline remains plateWidth = 50 mm.
No Candidate creation or mutation occurred. The embedded catalog advertises API
v16 while the isolated execution adapter deliberately fixes API v10 to match the
existing REST path; exact mutation compatibility remains unaccepted. Native
plugin invocation, complete schema acceptance, Candidate/CAS execution and durable
mutation receipts remain mandatory gates. See the dated integration report.
