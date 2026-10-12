# Self-hosted Onshape MCP integration — 2026-10-12

Result: **local read-only runtime and access-only credential handoff deployed;
mutation BLOCKED**. Native operator discovery passes. Full native schemas and a
supported plugin-owned invocation interface are unavailable on the pinned host;
therefore native auth/document/feature calls and every write gate remain unaccepted.
No Candidate was created and no CAD mutation was attempted.

## A. Feature matrix

The complete [feature matrix](self-hosted-mcp-feature-matrix.md) compares required
capabilities, historical hosted Labs evidence, pinned upstream and implemented
extensions. Hosted full schemas remain UNKNOWN. Upstream supplies generic API
catalog/execution, OAuth, stdio and experimental HTTP; it does not supply external
access-only credentials or Candidate/CAS/attempt admission.

Implemented: external-token mode, atomic access-only publication, rotation/expiry
checks, private service lifecycle, local native registry, five-tool read-only
catalog, exact-target GET admission and independent health/readiness. Not
implemented: guarded native mutation, Candidate admission at MCP, durable mutation
receipts, timeout reconciliation, dimensional post-write verification or bounded
FeatureScript creation/application.

## B. ADR reconciliation

[ADR-018](ADR.md#adr-018-self-hosted-mcp-with-one-control-plane-refresh-owner)
explicitly amends ADR-006/016's separate hosted OAuth assumption for the local
connector and ADR-017's hosted investigation preference. Historical decisions and
sprint evidence remain. Candidate isolation, operator approval, provider-side
revision enforcement and independent verification remain mandatory.

Claw-Onshape owns REST control and OAuth/refresh. MCP owns structured provider
execution. Clawake owns isolation, configuration, private connectivity and
lifecycle without brokering credentials. Engineer receives guarded capabilities
only. No direct Engineer REST, custom MCP proxy or fabricated native session was
introduced to work around the absent SDK seam.

## C. Runtime topology

Clawake rootless Quadlet/systemd → separate `clawonshape-mcp` container → Onshape.
Engineer OpenClaw host → private `clawonshape-mcp-private` Podman bridge →
`http://clawonshape-mcp:8080/mcp`. The bridge allows provider HTTPS egress and
publishes no host port. Lead remains on its existing A2A network. Engineer's
plugin owns the writable handoff mount; MCP sees it read-only. Agent grants,
bindings and Discord/A2A configuration were compared and preserved.

Service: UID/GID 1000, keep-id user namespace, read-only root, no capabilities,
NoNewPrivileges, /tmp tmpfs 16 MiB, pids 128, MemoryMax 512 MiB, CPUQuota 100%,
no engine socket or agent workspace. Only private credential directory and
non-secret config are mounted. Health failure kills the process; systemd restarts
on failure. Credential absence does not cause an OAuth flow or restart loop.

`clawake onshape-mcp --config service.json --action plan|apply|status|restart|probe`
uses existing artifact application and SystemdService. `--execute` performs the
operation; probe uses an isolated native operator profile without an agent turn.
Generic inventory v2 services remain model-only. Team `onshape_mcp: true`
reconciles the local disabled registry, adopting only the explicitly disabled
known hosted connector. Operator-owned unrelated entries are refused.

Final image replacement was controlled: finish isolated build/tests, stop
`clawonshape-mcp.service`, update exact digest, then Clawake apply/start. Liveness
and credential readiness subsequently returned 200 and native discovery passed.
The build container never mounted production credentials or replaced running code.

## D. Credential flow

Claw-Onshape 0.2.2 in Engineer retains existing OAuth application, consent,
connection owner, native private store and refresh lock. Lead retains its existing
0.2.1 installation. Optional `localMcp` selects one existing connection and an
absolute private directory. Before store changes the handoff is revoked with
JSON null; successful saves atomically publish exactly `accessToken`, `expiresAt`
(epoch milliseconds) and `scopes`. Refresh token and OAuth client secret remain
outside the MCP mount. Plugin maintenance serializes synchronization every 15
seconds through the existing refresh owner and revokes on failure/disposal.

MCP rereads the atomically replaced file for each API dispatch. It accepts only a
bounded strict schema, private owner directory/file, non-symlink single-link inode
and Read scope, and rejects expiry within 30 seconds. No CLI token argument,
legacy credential merge, OAuth initiation, independent refresh, watcher or token
persistence occurs in external mode. Missing/invalid credentials fail closed.
Dashboard responses expose sanitized state, never tokens or credential paths.

The operator renewed Read consent in the existing dashboard; handoff readiness
changed to HTTP 200 without MCP owning OAuth. Canonical account identity is not
live-accepted. Existing provider-expired REST refresh reliability remains a
control-plane limitation; a second refresh owner was not added to hide it.

## E. Upstream changes

Upstream: [altendky/onshape-mcp](https://github.com/altendky/onshape-mcp/tree/f78ddc48a445765f32fcf052d9d8e6d709497d56),
commit `f78ddc48a445765f32fcf052d9d8e6d709497d56`, version 0.5.3-dev.0,
MIT OR Apache-2.0. Build uses pinned Rust 1.99.0 builder, Cargo.lock, a stripped
debug binary and digest-pinned Debian runtime with CA certificates/curl.
The runtime is immutable by digest, but apt package resolution is not independently
version-locked; reproducing a later build can produce another image digest.

Local working fork: `/home/kaos/Projects/01_pib/02_sw/onshape-mcp`, branch
`claw-onshape/external-token`, upstream origin retained. Its README lists changes.
The six modified Rust files match the tested temporary build checkout byte for
byte. No credentials, target cache or temporary build outputs were copied into it.
The local fork change is committed as `80d9f3a8e9cca3d89c3467d1035e5bb4a489bd4d`.
The fork is now published at `edge-robot/onshape-mcp` on branch
`claw-onshape/external-token`; README publication metadata is commit `c959c2d126b518e2ae248b21eabb58206bd9dae6`.
Clawake service implementation is commit `68679f311cda738b3e22e65749d476dbc99b5401`.
See [the standalone handoff](self-hosted-mcp-agent-handoff-2026-10-12.md) for
pushed branches, host paths and the next-agent execution contract.

Code patch: [0001-external-token-readonly.patch](../deploy/onshape-mcp/patches/0001-external-token-readonly.patch),
209 added / 6 removed lines across six Rust files. Adds optional config, external
state/dispatch, credential reader/GET policy/HTTP branch, tool filtering and auth
login refusal. Upstream OAuth behavior outside the optional mode is preserved.
The credential adapter can be proposed upstream; exact-target read admission and
local deployment assumptions should remain separately reviewed project policy.

| Artifact | SHA-256 |
|---|---|
| Patch | c97f3f80453cd01776552fb85594be2756e9871f32099e1a97dbc33c210e46cd |
| Stripped binary | b979220bf040c086367842c7aa28e7c01188c564ad4937830cfcd5759c611ec1 |
| Runtime image digest | d2a4404afabecf7059cd94427104a3b23cc5fe88cfdf371e6980357fd244e90f |

[Build assets and pins](../deploy/onshape-mcp/upstream.json) reproduce the code
patch and dependency inputs. The local runtime config/spec stay in ignored private
state; Clawake never reads the token file contents.

## F. MCP integration

Transport: upstream rmcp Streamable HTTP, experimental upstream implementation,
private network only; no custom proxy. Saved production connector is local and
**enabled:false**. Native probe profile `onshape-local-readonly-20261012` is
operator-only and changes no production agent grants.

Upstream source defines eleven tools: get_started, auth_status, auth_login,
api_search, api_explain, api_schema, api_call, list_resources, read_resource,
screenshot and error_lookup (all with `onshape_` prefix). Complete source-generated
schemas are preserved in [schema evidence](evidence/self-hosted-mcp-upstream-tool-schemas-2026-10-12.json).
They are explicitly not an accepted native full-schema catalog.

External mode exposes five provider tools: `onshape_api_search`,
`onshape_api_explain`, `onshape_api_schema`, `onshape_api_call`,
`onshape_auth_status`. Native discovery additionally projects `resources_list`
and `resources_read`. Native CLI returns names, not the full tool schemas needed
by the guard. Zero MCP tools/call invocations were made. Native auth status,
document lookup, Part Studio inspection and feature inspection are consequently
BLOCKED, rather than inferred from independent REST reads.

The dashboard distinguishes configured/running and credential
AVAILABLE/MISSING/EXPIRED/UNKNOWN. Mutation is always BLOCKED. Discovery remains
UNKNOWN there because no complete current native schema acceptance is cached;
the dated operator names-only discovery evidence remains PASS.

## G. Mutation contract

Exact catalog operation: `updatePartStudioFeature`, POST
`/partstudios/d/{did}/w/{wid}/e/{eid}/features/featureid/{fid}`.
The catalog requires OAuth2Write. MCP `onshape_api_call` uses `endpoint`,
`path_params`, `query_params`, `header_params`, `body`, `file_refs`; explain uses
`endpoint`, schema uses `schema`. No endpoint or body was guessed from tool names.

Request schema: `BTFeatureDefinitionCall-1406`; replace the complete existing
feature definition while retaining its unrelated fields, libraryVersion and
serializationVersion. Set only the approved parameter expression to `60 mm`,
include the exact Candidate `sourceMicroversion` and force
`rejectMicroversionSkew:true`. The wrapper has `btType` and `feature` fields.
Response schema: `BTFeatureDefinitionResponse-1617`, including feature,
featureState, sourceMicroversion and skew metadata. A successful response does
not establish independently verified geometry or Primary protection.

The embedded schema describes provider refusal when source revision mismatches
and best-effort reinterpretation otherwise. The
[Onshape Features API guide](https://onshape-public.github.io/docs/api-adv/featureaccess/)
and [extracted operation/schema](evidence/self-hosted-mcp-mutation-contract-2026-10-12.json)
provide contract evidence. This supports provider-side protection in the contract;
preflight reads are not atomic protection. Live stale rejection has not been
performed. The embedded catalog advertises API v16; this read adapter fixes v10
to match existing REST. Exact mutation API-version compatibility remains UNKNOWN.
All local writes stay denied until the native seam and exact live contract pass.

Independent REST baseline, observed `2026-10-12T18:08:07.723Z`:

| Binding | Value |
|---|---|
| Document | 8b63eacf80efca72049f8017 |
| Source / Primary workspace | 1e76fac0ddca3ed10ecc9f28 |
| Part Studio element | 7768b96c15d71e78cdbdd7d9 |
| Source microversion | b83ee0a0efcda65537780ef8 |
| Feature | F37MrGsqQOiSdYi_0 / ClawCAD Mount Plate 1 |
| Feature type | clawcadMountPlate |
| Parameter | plateWidth / expression 50 mm |
| Feature status | OK |
| Serialization / library | 1.2.23 / 3095 |

The feature comes from a linked FeatureScript namespace. Future parameter updates
can regenerate the feature and downstream geometry; derived part IDs/topology and
references may change. No FeatureScript source edit is planned for this parameter
test. Candidate creation and a fresh Candidate baseline must precede concrete
approval. The source microversion above is not an approved future Candidate write
revision. No Candidate ID or fabricated approval package is presented.

## H. Security gates

| Gate | Result | Evidence / limitation |
|---|---|---|
| One OAuth/refresh owner | PASS | Existing REST owner; external mode has no OAuth/refresh path |
| Access-only protected handoff | PASS | Strict schema, atomic private file, read-only service mount, tests |
| Private isolated lifecycle | PASS | Clawake final replacement, UID 1000, no public port, limits |
| Local liveness / credential readiness | PASS | HTTP 200 / 200 after reconnect and image replacement |
| Native names discovery | PASS | Five provider tools + two native helpers; no tools/call |
| Full native schema acquisition | BLOCKED | Native CLI supplies names only; source schemas are separate |
| Bounded owner-native invocation | BLOCKED | No supported pinned plugin acquisition/invocation interface |
| Current exact target / 50 mm | PASS via REST | Native MCP feature invocation remains BLOCKED |
| Unrestricted Engineer raw tools | PASS for current disabled deployment | No production enable/grant; every service write rejected |
| Candidate-only mutation / Primary exclusion | BLOCKED | Writes denied; approved Candidate admission not implemented |
| Exact operation and skew contract | PASS catalog / UNKNOWN live | Endpoint/schema known; version compatibility/stale rejection unaccepted |
| Durable mutation attempt / replay prevention | BLOCKED | Candidate creation receipts exist; mutation receipts absent |
| Timeout reconciliation for writes | BLOCKED | No write path enabled; no mutation UNKNOWN ledger yet |
| Operator write approval | BLOCKED | Prerequisites unmet; no approval requested |
| Result geometry / post-write pinned evidence | BLOCKED | Only independent before evidence exists |

## I. Tests

| Check | Exact result |
|---|---|
| Patched upstream `cargo +1.99.0 test --offline --locked --workspace` | 697 passed, 0 failed |
| Patched upstream locked build + strip | PASS |
| Claw-Onshape `npm test` | 78 passed, 0 failed |
| Claw-Onshape `npm run typecheck` | PASS |
| Clawake `.venv/bin/pytest -q` | 254 passed, 0 failed |
| Ruff on changed CLI/runtime/service and service tests | PASS |
| Final Clawake-managed stop/replacement/start | PASS |
| Final `/health` and `/health/ready` | 200 / 200 |
| Final native `mcp probe onshape --json` | PASS names; full schemas unavailable; tools/call 0 |
| Independent live REST target/features/render/Primary recheck | PASS read-only; provider writes 0 |

Added tests cover publication/rotation/revocation, refresh exclusion, malformed,
missing and expired credentials, insecure permissions/symlinks, sanitized status,
service down/up projection, configuration/pin/isolation, disabled registry and
native probe shape/diagnostic rejection. Existing OAuth, Candidate receipt,
read/render, dashboard and role regression tests pass. Rust admission tests deny
wrong workspace and writes; the exact document/element policy is in the executor.

Wrong document/element/operation, stale write revision, duplicate mutation attempt,
guarded payload construction and ambiguous mutation reconciliation **are not
accepted mutation tests**: that capability is blocked and was not implemented to
bypass the absent native seam. Existing Candidate receipt tests must not be counted
as mutation replay tests. No live Discord regression journey was initiated.

## J. Live mutation

Not requested for approval or executed. Zero mutation attempts and zero Candidate
creation attempts. Independent Primary microversion after inspection equals the
before microversion. Baseline feature JSON and 800×800 PNG (42,710 bytes) are in
ignored `state/deployment/artifacts/self-hosted-mcp-before-20261012/`.
PNG SHA-256: `3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26`.
The render is evidence of the baseline, not dimensional geometry measurement.
Sanitized deployment/read evidence is [recorded separately](evidence/self-hosted-mcp-readonly-2026-10-12.json).

## K. Remaining gaps

- Supported owner-bound native acquisition/invocation and complete native schemas
  are absent; native read-only auth/document/feature validation has not occurred.
- Candidate-bound approved mutation admission and durable attempt fencing/replay
  reconciliation have not been implemented; all service writes remain denied.
- Exact API-version compatibility and provider stale-revision refusal remain
  unaccepted for this mutation; preflight REST cannot substitute for CAS.
- Candidate creation has not been live-validated in this sprint; current consent
  is Read only. Approval must name a verified fresh Candidate and exact payload.
- Dimensional geometry invariants, post-write render and Primary-after verification
  remain to be accepted after a permitted one-attempt mutation.
- Dashboard does not persist complete native catalog acceptance; canonical account
  identity and existing provider-expired refresh reliability remain unresolved.
- FeatureScript create/test/apply and other geometric feature mutations require
  their own narrow approved operation contracts; this patch grants none.

## L. Exactly one next task

**Add a supported owner-bound native OpenClaw MCP acquisition/invocation interface
for Claw-Onshape, including complete tool schemas, without projecting raw tools
into Engineer sessions.** Accept that interface with read-only auth and exact
Camera Mount Plate inspection before designing or enabling any mutation dispatch.
