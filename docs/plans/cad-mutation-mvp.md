# Product-first Claw-Onshape increments

Updated 2026-10-11. This replaces mutation-first prioritization. Mutation safety
must not block the read/render product slice. No CAD writes are implemented.

## Increment 0 — Product connectivity

Goal: Mechanical Engineer explains readiness, and its existing OpenClaw dashboard
provides Connect/Status/Disconnect. Operator provisions the application; user
consents in the browser. One OAuth lifecycle serves CLI and dashboard adapters.

Implemented: readiness mapping, native page, scoped session actions, public
state-protected gateway callback, private persistent application-secret provisioning.
Source: `src/{readiness,connections,authorization,dashboard,oauth,cli}.ts`,
`ui/control-ui.js`, `scripts/provision-oauth-secret.mjs` and manifest.

Dependencies: Clawake installation/config reconciliation; custom plugin UI lab;
private application secret; registered dashboard callback; authenticated dashboard
administrator. Dashboard operator authority is not Discord requester identity.

Acceptance: native plugin load, browser activation, real Connect consent,
connected status, expiry/reconnect/disconnect behavior; no credential in UI/logs.
Tests: OAuth state/replay/origin checks, cancellation draining, private file
permissions, scope denial and readiness states. These dependencies were satisfied in live acceptance. Broader provisioning and
expired-provider renewal remain follow-ups, not accepted general onboarding.

## Increment 1 — Read/Render MVP (immediate priority)

User in Discord #clawcad → Lead → authenticated A2A peer + signed user context →
Engineer → fixed REST reads → microversion-pinned PNG → Lead → original Discord
context. The selected target is explicitly supplied by the operator/user, not
inferred from a model name.

| Step | Goal / likely files | Reused evidence | Dependencies | Tests and acceptance | Risk / effort |
| --- | --- | --- | --- | --- | --- |
| Trusted A2A association | Fixed delegation tool, compact signed context and signed result; `src/delegation.ts`, `src/config.ts`, `src/index.ts` | Native A2A peer/context ingress; ClawCAD SendMessage/GetTask reporting | Exact Discord owner/channel/account; private shared signing key, native peer token | Forged/wrong peer/account/channel/session/target/expiry deny; live native delegation reaches authorized Engineer factory | Native metadata differs from source expectation; 1–3h live acceptance |
| Current target inspection | Exact did/wid/eid, membership/type and source revision; `src/rest.ts` | `readonly.py`, feature sourceMicroversion and fixed endpoint contracts | New native OAuth Read, authorized target | Real access/membership, Part Studio type and revision; no arbitrary URL arguments | Historical approved target may currently be empty; 1–2h |
| Pinned rendering | Exact microversion shadedviews, bounded PNG and private artifact; `src/render.ts`, `src/rest.ts` | `render_current`, `shaded_path`, flat/nested Base64, PNG integrity tests and historical live render | Valid Part Studio/source; shared artifact mount, Engineer-only write | GET-only; immutable inspection/render reference; real valid 800×800 image/hash | Current image variant/API quota; 1–2h |
| Engineer readiness/result | Explain missing app/connection/target and return typed metadata; `src/index.ts`, `src/readiness.ts` | Optional role factories; bounded sanitized results | Native tool grants | Wrong requester denied; errors guide dashboard; valid image+metadata | Loaded plugin alone does not imply ready; 1h |
| Lead reporting | Delegate-only CAD role, verify signed outcome and image; `src/index.ts`, `src/delegation.ts` | Historical A2A polling and shared render artifact validation | Existing native A2A and Discord delivery capability | Same task/context; actual originating Discord recipient; image hash/target verification | Native delivery capability may be unavailable; final source reply fallback; 1–2h |
| Real Discord acceptance | User asks “Show me the current Camera Mount Plate”; `docs/product-mvp-status.md`, `docs/onshape-live-validation.md` | Historical read/render evidence discipline, not acceptance substitution | All above + a real user message | Capture request/task/tool/REST revision/image/Discord response; unconnected journey gives useful onboarding | Cannot substitute CLI impersonation or mocked provider for live E2E; 1–2h |

Current implementation is tested offline; see status document for native/live
acceptance. Do not count source inspection, a forged operator turn, an old token,
or ClawCAD's historical PNG as this product acceptance.

## Increment 2 — Safe CAD mutation (after Increment 1 acceptance)

1. REST exact source/revision capture and experimental workspace lifecycle.
2. Inspect current MCP schemas in an isolated native operator profile; prove
   server containment, exact candidate target and write-time revision protection.
3. Focused Engineer-authored FeatureScript testing/application; distinguish source
   editing from real Part Studio feature application. No rigid operation catalog.
4. REST independent geometry/evaluation verification, primary protection check,
   source/result microversions and identical before/after render options.

Likely files: focused extensions to `src/rest.ts`, `src/mcp.ts`, configuration and
new narrow execution/verification modules only when supported. Reuse ClawCAD
provider/CAS/UNKNOWN/no-replay knowledge, not its workflow service or database.
Dependencies: Increment 1; separately authorized future mutation; suitable provider
contract; explicit separate REST lifecycle Write and MCP grants. Tests: target
escape, primary denial, concurrency, native route bypass, evaluation errors,
uncertain execution/restart and real candidate-only acceptance. Missing provider
CAS/containment remains a hard mutation gate. Effort: 20–40h if provider supports
it; external provider changes unknown. No mutation work is deployed here.

## Increment 3 — Promotion (later)

REST immutable versions, authentic human approval, merge authorization and future
credential-based assertions. No automatic merge. Onshape owns revision history.
No workflow service, broker, database, duplicated revision store, new agents,
generic project browser or OIDC4VC/VP implementation.

Dependencies: real verified candidate mutation, provider merge/conflict semantics
and trusted user authorization. Tests: stale approvals, conflict, wrong owner,
credential expiry and uncertain version/merge reconciliation. Effort deferred
until product requirements are demonstrated.

## Completed October 11 checkpoint / Monday October 12 readiness

Increment 0 native dashboard consent and Increment 1 real Discord read/render are
accepted: authorized request at 19:01 UTC, signed native A2A result, pinned PNG at
b83ee0a0efcda65537780ef8, delivered:true and real user confirmation. The fixed
Camera Mount Plate read/render demo is ready while the configured connection is
valid. No further reset or acceptance retry is required. Earlier table efforts
are implementation estimates, not remaining work on this accepted slice.

Reliability follow-up: successful refresh after actual provider expiry/rotation
remains unverified. A fresh-grant exchange passed with unchanged values; a prior
expired-grant HTTP-200 response failed validation. Keep useful reconnect guidance,
separate diagnostic codes and fail-closed state; do not claim long-running session
reliability from fresh-grant acceptance.

Native Codex role changes require a deliberate fresh session because its first
AGENTS.md snapshot remains frozen on resume. Actual role writes use native guarded
Agent Files actions; config/grants/mounts remain Clawake-owned.

## Exactly one next implementation task

Add narrow REST candidate-workspace preparation with exact-source contract tests
and protected-primary validation. Keep all MCP/CAD mutation execution disabled.
This is the smallest control-plane prerequisite for Increment 2; it does not
reintroduce a workflow engine or promise an unsafe mutation demo. Real mutation
still depends on verified MCP containment and revision enforcement.

## Deferred work

Unified Discord/Onshape dashboard provisioning, trusted multi-user onboarding,
canonical account verification, public-client distribution and credential-based
promotion gates require separate product/security scope. Provenance/duplicate
cleanup is a structural deployment follow-up. No automatic merge or printing.
