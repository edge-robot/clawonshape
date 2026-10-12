# Claw-Onshape feature specification

Version: 0.2.0 · Reviewed: 2026-10-11 · Host: OpenClaw 2026.9.9

The implemented product is a native, read-only vertical slice:
Discord #clawcad → Robotics Lead → authenticated A2A → Mechanical Engineer →
Claw-Onshape → Onshape REST → pinned Camera Mount Plate PNG → Discord.
The real user confirmed image delivery on October 11. CAD mutation is disabled.

“Implemented” describes shipped code; live acceptance is listed separately.
Architecture decisions do not imply implementation. Detailed evidence is in
[product status](docs/product-mvp-status.md), [live validation](docs/onshape-live-validation.md)
and [ADR](docs/ADR.md).

## Implemented features

| Feature | Behavior / boundary | Code | Acceptance |
| --- | --- | --- | --- |
| Native plugin | claw-onshape manifest, optional v2 tool factories, CLI and native UI entry; no standalone service | src/index.ts, openclaw.plugin.json | Loaded on Lead and Engineer |
| Configured target | Host owns exact document/workspace/Part Studio and requester/agent/channel/account binding; no agent-supplied target or URL | src/config.ts | Live membership/type checks; negative offline tests |
| Readiness | Product guidance for missing setup, disconnected/pending/expired state, target and provider errors; precise codes retained | src/readiness.ts, src/connections.ts | Live connected/pending/error results |
| Native onboarding | Engineer Control UI page provides connection selector, Connect, authorization link, progress/status and Disconnect | ui/control-ui.js, src/dashboard.ts | Real browser consent/callback passed |
| Operator app provisioning | Public client ID/callback and private client-secret path; masked terminal helper writes persistent Git-excluded 0600 secret under private directory | scripts/provision-oauth-secret.mjs | Operator provisioned; private mount verified |
| Shared OAuth consent | One code-exchange implementation behind CLI loopback and dashboard gateway callbacks; Read by default, explicitly consented read+write after application attestation, five-minute single-use state, exact Host/path checks | src/oauth.ts, src/authorization.ts, src/oauth-listener.ts, src/connections.ts, src/cli.ts | Dashboard consent live; replay/timeout/revocation tests |
| Private credential lifecycle | Owner-bound native atomic files, canonical path/UID/mode checks and exclusive consent/refresh/disconnect lock | src/credentials.ts | Native persistence live; offline negative/race checks |
| Synchronous refresh | Token endpoint POST under existing lock before expired reads; validate response, persist credentials, fail closed on uncertain outcome | src/authorization.ts | Fresh-grant POST live; provider-expired renewal/rotation remains partial |
| Native requester delegation | Lead tool admits exact trusted Discord binding; signed five-minute context associates authenticated A2A peer with Engineer binding | src/delegation.ts, src/index.ts | Actual Discord admission and native Engineer invocation passed |
| Verified A2A results | Engineer signs success/status/error JSON in text transport; Lead checks proof, exact target, revision and PNG hash before delivery | src/delegation.ts, src/index.ts | Live signed errors and successful image journey |
| Document inspection | Fixed GETs for document, workspace list and current elements; bounded identifier output | src/rest.ts, onshape_inspect | Live provider reads |
| Pinned Part Studio view | Feature sourceMicroversion capture, pinned element check and shaded-view GET; inspection/render refer to same revision | src/rest.ts, onshape_render | Real Camera Mount Plate PNG |
| Candidate workspace preparation (control-plane only) | Exact-source candidate workspace create/resolve contract with protected-primary rejection, source-drift conflict detection, uncertain POST UNKNOWN result, and no automatic active-workspace change | src/rest.ts | Offline contract tests only; no live POST executed in this session |
| PNG handling | Flat/nested provider Base64, bounded PNG validation, private artifact, canonical path/name and SHA-256 checks | src/render.ts | Real 800×800 / 42,710-byte PNG; negative fixture tests |
| Discord reporting | Lead receives verified references and uses originating native delivery; no Lead REST credentials or direct CAD tool | src/index.ts, onshape_delegate_render | Real image received and user-confirmed |
| Focused role deployment | Versioned role guidance and native AGENTS.md get/set adapter with expectedHash/readback | deploy/roles, scripts/apply-runtime-role.mjs | Native writes/routing verified; fresh Codex session required after role replacement |
| MCP metadata discovery | Explicit operator-only native probe; discovered tools remain disabled | src/mcp.ts, src/cli.ts | Offline contract checks / historical catalog research; current scoped execution not accepted |

## Public engineering capabilities

Agent tools accept an empty object only. Host configuration chooses the target.

| Tool | Role | Result |
| --- | --- | --- |
| onshape_status | Authorized Mechanical Engineer | Readiness code/message; signed JSON on delegated path |
| onshape_inspect | Authorized Mechanical Engineer | Document/workspace/element identifiers |
| onshape_render | Authorized Mechanical Engineer | Pinned PNG and document/workspace/element/microversion, private path and hash; signed delegated result |
| onshape_delegate_render | Authorized Robotics Lead | Fixed native A2A read/render task; verified image/result and originating delivery acknowledgement |

Dashboard status requires operator.read; Connect/Disconnect require operator.admin.
Dashboard authority does not establish Discord requester identity. This is one
operator-configured owner/target, not multi-user self-service.

CLI: openclaw onshape connect/status/disconnect owner-rest. CLI consent additionally
requires its registered localhost:8765 callback; dashboard uses the configured
localhost:19489/plugins/claw-onshape/oauth/callback. MCP discovery is an explicit
operator action in a separate profile, not an agent execution API.

## Current accepted model

- Document: 8b63eacf80efca72049f8017
- Workspace: 1e76fac0ddca3ed10ecc9f28
- Part Studio: 7768b96c15d71e78cdbdd7d9
- Observed source/render microversion: b83ee0a0efcda65537780ef8
- Real Discord request/result: 2026-10-11, 19:01 UTC; user confirmed receipt.

These are observations of this configured project, not hardcoded general-provider
identities. No width parameter, authoritative primary identity or dimensional
mutation invariant is inferred from the rendered image.

## Missing features and remaining acceptance

| Feature / gap | Current state | Next requirement |
| --- | --- | --- |
| Provider-expired refresh and rotation | Partial: expired-grant HTTP-200 response failed validation; fresh-grant response passed but values were unchanged | Capture safe validation categories during real expiry/rotation; prove recovery or give reconnect guidance |
| Unified dashboard provisioning | Proposed ADR-012; no dashboard secret entry, Discord setup, A2A provisioning or target selection wizard | Operator-only private writes and Clawake-owned reconciliation, no secret readback |
| Multi-user onboarding | Not implemented | Trusted dashboard/Discord association and isolated consent/target grants |
| Canonical Onshape user identity | Not independently verified | Provider identity check separate from configured requester binding |
| Candidate workspace lifecycle | Implemented as internal REST control-plane capability; no mutation execution path enabled | Live provider POST behavior still requires explicit operator-approved validation |
| Versions/concurrency/promotion | Not implemented | Authoritative revision checks, immutable result capture and distinct human authorization |
| MCP CAD execution | Disabled | Current schemas, containment, target/revision binding and actual native-route safety proof |
| Dynamic FeatureScript application | Not implemented | Contained testing, Feature Studio authoring and real Part Studio feature application |
| Mutation verification | Not implemented | Independent geometry/evaluation observations, dimensions/units and hole-position checks |
| Before/after comparison | Not implemented | Two verified revisions and identical REST rendering options |
| General project browser | Deliberately absent | Add only if a concrete product journey requires it |
| Provenance/duplicate discovery cleanup | Non-blocking diagnostics remain | Clawake/OpenClaw structural correction; loader success is not valid provenance |
| Credential encryption/keyring/public-client distribution | Not implemented | Separate reviewed distribution design; same-UID/root processes remain trusted |
| OIDC4VC/VP | Deferred | Future credential verifier can enter the authorization boundary; no implementation now |

No automatic merge, print or simulation is implemented. No arbitrary HTTP/MCP
passthrough, workflow engine, service, database, broker or duplicate CAD history.
REST remains the control/reporting plane; future MCP is the contained CAD data plane.

## Deployment and verification contract

Clawake owns installation, private mounts, configuration, explicit global plus
per-agent grants and restarts. The approved global-grant reconciliation is an
external Clawake dependency; it is not implemented by this plugin. Generated
OpenClaw JSON is not manually edited. Normal product tools receive no OAuth secret.

31 offline tests and the exact-host SDK typecheck pass. Tests validate guards and
mock provider/host contracts; actual native/browser/Onshape/Discord acceptance is
recorded separately. OpenClaw API compatibility is claimed only for 2026.9.9.

Accepted read/render does not authorize mutation. The next product increment is
separately scoped candidate-workspace support and a proven contained MCP boundary,
followed by verified FeatureScript application; promotion remains later work.

## Repository authorization checkpoint (2026-10-12)

Candidate preparation remains internal and grants no agent write capability.
A trusted host adapter checks requester/Engineer identity, exact current binding,
private connection grants, application write attestation and explicit consent.
Request Booleans cannot authorize writes. Current authority is rechecked directly
before dispatch; unresolved POSTs remain fenced by bounded receipts across restarts.

Status summaries are at most 2 KiB and distinguish AVAILABLE, UNAVAILABLE and
UNKNOWN with actionable codes. Unknown attestations do not become disabled or
enabled implicitly; operation-specific provider evidence is required for AVAILABLE.
Read status performs no network probe and stores no historical read proof.
See [OAuth capabilities](docs/oauth-capabilities.md) and
[receipt limits](docs/candidate-preparation-receipts.md). These are offline code
contracts; deployment and live candidate acceptance remain outstanding.
