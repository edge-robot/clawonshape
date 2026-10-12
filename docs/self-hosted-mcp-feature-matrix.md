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
