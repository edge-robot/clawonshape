# Self-hosted MCP feature matrix — 2026-10-12

Evidence baseline: Claw-Onshape 0.2.2 (0.2.1 before integration), OpenClaw 2026.9.9; upstream
[f78ddc48a445765f32fcf052d9d8e6d709497d56](https://github.com/altendky/onshape-mcp/tree/f78ddc48a445765f32fcf052d9d8e6d709497d56),
MIT OR Apache-2.0, workspace version 0.5.3-dev.0.
REQUIRED marks requirements. AVAILABLE means code/catalog support, not live
acceptance. PARTIAL lacks a stated part; MISSING is absent from inspected code;
UNSAFE violates our boundary; UNKNOWN lacks evidence. Hosted current full schemas
remain UNKNOWN; October 9 schemas and October 12 names are historical evidence.
Local acceptance is recorded in [the integration report](self-hosted-mcp-integration-2026-10-12.md). Native discovery verifies names only; full source-generated schemas do not establish native schema acceptance.

| Capability | Need | Hosted Labs | Upstream pinned | Claw-Onshape extension / acceptance |
|---|---|---|---|---|
| REST OAuth | REQUIRED | UNKNOWN | PARTIAL: independent OAuth | AVAILABLE: existing control plane |
| MCP OAuth | REQUIRED: avoid second flow | AVAILABLE: separate native consent | AVAILABLE: own direct/per-user flow | AVAILABLE: external-token mode, no second consent |
| Refresh ownership | REQUIRED: one owner | UNSAFE for shared grant | UNSAFE: independent refresh | AVAILABLE: Claw-Onshape only |
| Access-token injection | REQUIRED | UNKNOWN | MISSING: bearer client exists, external mode absent | AVAILABLE: private atomic access-only file |
| Refresh-token isolation | REQUIRED | PARTIAL: distinct resource | MISSING for shared REST lifecycle | AVAILABLE: refresh store not mounted into MCP |
| Operator onboarding | REQUIRED | AVAILABLE: native consent | AVAILABLE: auth login | AVAILABLE: existing dashboard; reconnect live-tested |
| Expiry/rotation | REQUIRED | UNKNOWN: stored metadata only | AVAILABLE: own watcher/refresh | AVAILABLE: per-dispatch reload; missing/expired/rotation tests |
| Identity/scopes visibility | REQUIRED | UNKNOWN: whoami named | PARTIAL: auth metadata | PARTIAL: scopes stored, canonical identity unverified |
| stdio | REQUIRED: supported option | MISSING | AVAILABLE | AVAILABLE: native process; no token args |
| Streamable HTTP | REQUIRED: separate service option | AVAILABLE | PARTIAL: experimental, owns OAuth | AVAILABLE: private upstream HTTP handler; native discovery PASS |
| Native OpenClaw registration | REQUIRED | AVAILABLE | PARTIAL: upstream HTTP is experimental | AVAILABLE: local URL saved, production disabled |
| Tool discovery | REQUIRED | PARTIAL: 14 names, schemas unavailable | AVAILABLE: tools/list | PARTIAL: five tool names + two native helpers verified |
| Full schema discovery | REQUIRED | UNKNOWN | AVAILABLE: MCP schemas | UNKNOWN: native owner-bound seam pending |
| Invocation | REQUIRED | PARTIAL: raw native projection | PARTIAL: generic API execution | MISSING: supported guarded plugin invocation |
| Health/readiness | REQUIRED | UNKNOWN | PARTIAL: HTTP/lifecycle | AVAILABLE: independent endpoints and operator projection |
| Document/workspace/element IDs | REQUIRED | PARTIAL: selected tools | AVAILABLE: API path parameters | AVAILABLE: service rejects other mutable targets |
| Version/microversion | REQUIRED | PARTIAL: source read tools | AVAILABLE: OpenAPI paths | PARTIAL: REST pinned evidence; native calls blocked |
| Exact Part Studio targeting | REQUIRED | UNKNOWN | AVAILABLE: API paths | PARTIAL: REST membership PASS; native invocation missing |
| Inspect features | REQUIRED | UNKNOWN | AVAILABLE: get features operation | PARTIAL: bound service GET policy tested; live REST inspection PASS |
| Modify feature parameters | REQUIRED | UNKNOWN | AVAILABLE: updatePartStudioFeature | MISSING: guarded dispatch, before/after validation |
| Create/update features | REQUIRED | PARTIAL: source creation | AVAILABLE: catalog operations | MISSING: authorization/revision enforcement |
| FeatureScript authoring | REQUIRED later | PARTIAL: historical source tools | PARTIAL: API/source catalog, no agent author | MISSING: bounded source/code policy |
| FeatureScript testing/application | REQUIRED later | UNKNOWN: implicit execution context | PARTIAL: API operations | MISSING: per-operation containment and CAS |
| Sketch/extrude/revolve/fillet | REQUIRED later | UNKNOWN | PARTIAL: feature payloads via API | MISSING: reviewed operation contracts |
| Arbitrary API fallback | REQUIRED operator investigation only | MISSING historically | UNSAFE: generic execution | AVAILABLE: executor rejects every write and unlisted GET |
| Candidate-only writes | REQUIRED | UNKNOWN | MISSING | MISSING: all local writes blocked initially |
| Primary protection | REQUIRED | UNKNOWN | MISSING | AVAILABLE: existing REST candidate guard; MCP writes blocked |
| Expected revision | REQUIRED | UNKNOWN | PARTIAL: request body can carry it | MISSING: mandatory guard binding |
| sourceMicroversion | REQUIRED | UNKNOWN | AVAILABLE: exact update schema | PARTIAL: contract documented, no live stale-write test |
| rejectMicroversionSkew | REQUIRED | UNKNOWN | AVAILABLE: exact update schema | PARTIAL: provider semantics documented, execution not accepted |
| Attempt identity/idempotency | REQUIRED | UNKNOWN | MISSING | PARTIAL: Candidate receipts only |
| Timeout reconciliation | REQUIRED | UNKNOWN | UNSAFE: OAuth may retry API on 401 | MISSING for MCP writes; external reads never refresh/retry |
| Duplicate-write prevention | REQUIRED | UNKNOWN | MISSING | MISSING: durable mutation receipt |
| Raw bypass prevention | REQUIRED | UNKNOWN | MISSING | AVAILABLE: all external writes denied; production native registry disabled |
| Feature state/result microversion | REQUIRED | UNKNOWN | AVAILABLE: response schema | PARTIAL: read baseline PASS; no post-write evidence |
| Geometry state | REQUIRED | UNKNOWN | PARTIAL: API observations | MISSING: selected dimensional invariants |
| Pinned render | REQUIRED | PARTIAL: implicit provider tools | PARTIAL: screenshot tool | AVAILABLE: existing fixed REST renderer |
| Before/after evidence | REQUIRED | UNKNOWN | MISSING | PARTIAL: fresh before evidence; no mutation/after evidence |

No running process, OAuth consent, tool annotations, or preflight GET makes mutation
AVAILABLE. Native bounded invocation, server admission, durable no-replay receipts,
and independent verification must all pass before requesting a live write.

## 2026-10-13 — Issue #1 execution boundary checkpoint (before native read test)

This dated section supersedes the earlier implementation status, while preserving
historical evidence. Architecture reference:
[Issue #1](https://github.com/edge-robot/clawonshape/issues/1).
AVAILABLE below means implemented and locally tested; it does not imply native
OpenClaw or live mutation acceptance. Production remains read-only and disabled.

| Capability | Classification | Current evidence / boundary |
|---|---|---|
| Complete server tools/list schemas | AVAILABLE | Binary MCP protocol test returns all five external-mode input schemas, exact api_call fields; explain/schema calls succeed. Output schemas are optional and dynamic API results have none. |
| Complete native OpenClaw schema retrieval | BLOCKED | 2026.9.9 probe maps projected tools to names (`mcp-cli-Dt7GFrqd.mjs:319`); public harness materialization requires lifecycle-owned scheduler. No accepted plugin handle. |
| Native tool invocation | BLOCKED | CLI has no call command; no accepted owner-bound plugin acquisition. Private hashed imports and custom MCP clients excluded. |
| Read-only invocation | PARTIAL | MCP protocol calls and target read policy tested; independent REST control-plane tests pass; live native provider call unaccepted. |
| Generic writes | PARTIAL | Only audited updatePartStudioFeature admitted by optional target policy; other mutations denied. Production mutation config absent. |
| Target binding / operation allowlist | AVAILABLE | Exact document/workspace/element, finite operation enum, optional feature; raw api_call shares dispatch policy. |
| Primary exclusion | AVAILABLE | Nonempty excluded workspace IDs mandatory; conflicts rejected. Operator must supply actual Primary ID; no name inference. |
| Revision constraints | AVAILABLE | Required expected microversion, exact sourceMicroversion and boolean rejectMicroversionSkew:true; unmodified payload. |
| Provider stale-write rejection | UNKNOWN | Vendored v16 contract declares rejection; no live stale-write request, compatibility or simultaneous duplicate acceptance claimed. |
| External token / credential rotation | AVAILABLE | Access-only reload per dispatch; no OAuth/refresh/adoption; expiry and rotation regressions pass. |
| Mutation attempt behavior | PARTIAL | Redirect/transport retry disabled; ambiguous transport, 408, redirect, 5xx => UNKNOWN/no retry/reconcile. Provider CAS bounds revision-changing replay. No durable mutation ledger yet. |
| Production unrestricted write exposure | AVAILABLE (excluded) | Connector disabled, mutation absent; external-mode tools cannot escape execution policy. |

| Mechanical Engineer skill (Issue #1) | Classification | Actual capability |
|---|---|---|
| Interpret assigned Change Request / explicit context | PARTIAL | Existing trusted binding and candidate orchestration; MCP consumes operator-provisioned scope, not workflow state. |
| Inspect CAD | PARTIAL | REST inspection/render works; native MCP provider invocation blocked. |
| Discover document/Part Studio | PARTIAL | REST target/workspace/elements inspection and catalog endpoints; external MCP reads restricted to assigned document. |
| Read features/parameters | PARTIAL | REST pinned features; exact-target MCP GET policy; native live read pending. |
| Mutate existing parameter | PARTIAL | Generic feature replacement with mandatory provider CAS implemented; first live 50→60 mm slice blocked by native invocation. |
| Create/update features | PARTIAL | Existing-feature update supported; create/delete operations intentionally denied pending atomic revision audit. |
| FeatureScript | MISSING | Catalog discovery does not authorize execution; FeatureScript writes remain denied. |
| Operate only in assigned workspace | AVAILABLE | Server target/exclusion enforcement and existing REST candidate guards; live Candidate not created. |
| Detect stale baseline | PARTIAL | Mandatory CAS request fields tested; actual provider rejection unknown. |
| Validate result | PARTIAL | Independent REST feature/result regressions; no post-mutation live evidence. |
| Capture evidence / review candidate | PARTIAL | Existing pinned REST rendering/receipts; no new candidate or after screenshot; mutation is not approval. |
| Release discipline / artifact provenance | MISSING | Version/export remain separate future approval-gated work; no release performed. |

Independently testable later gaps: owner-bound native schema/call handle; durable
approved mutation attempt/reconciliation; live v16 CAS acceptance; audited
FeatureScript/create operations; geometry acceptance; release/export provenance.
The proposed plugin schema/call handle was an earlier hypothesis. The later
native agent read test below supersedes it.

## 2026-10-13 — Native Engineer read acceptance

Evidence: [native LLM read test](native-mcp-engineer-readonly-2026-10-13.md).
The agent uses native MCP tools alongside Claw-Onshape control-plane tools;
plugin-owned MCP invocation is not required. OpenClaw source is unchanged.

| Capability / Issue #1 skill | Classification | Actual evidence / remaining boundary |
|---|---|---|
| Native invocation | AVAILABLE | Five actual MCP calls completed in isolated Engineer LLM turn. |
| Native schema use | AVAILABLE | Native explain/schema return complete inline API contracts and revision fields; structured feature arguments execute successfully. |
| Raw tools/list descriptor export | PARTIAL | Server protocol test complete; CLI probe still names-only, byte-for-byte native descriptor export not established. |
| Read features/parameters / inspect CAD | AVAILABLE | Native getPartStudioFeatures yields plateWidth=50 mm, feature OK and exact sourceMicroversion; independent REST agrees. |
| Assigned target enforcement | AVAILABLE | Exact-target read succeeds after JSON Accept fix; provider-wide auth validation denied. Wrong-target unit cases remain tested. |
| External-token rotation | AVAILABLE | Operator reconnect publishes read-only access metadata; native target GET proves usability, no refresh token in MCP. |
| Mutation contract discovery | AVAILABLE | Native update explain and named request schema expose sourceMicroversion/rejectMicroversionSkew. No write executed. |
| Candidate mutation / live stale-write rejection | UNKNOWN | Not exercised by the read test; production connector disabled, mutation config absent. |
| Capture evidence | AVAILABLE | Actual native tool results and independent pinned REST render retained; no after-mutation evidence. |
| Native one-shot lifecycle completion | PARTIAL | Model turn and calls complete, but Codex shared-client cleanup fails and agent exec exits 1. |

Exactly one next task: repeat the bounded read test in a Gateway-owned isolated
Engineer session and verify clean lifecycle completion. No SDK extension or
custom MCP client is currently justified.
