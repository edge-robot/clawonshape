# MCP capabilities, security and OAuth investigation

Date: 2026-10-12. Repository branch: `feat/native-plugin-foundation`.
Inspected HEAD: `42f41b3` (additional existing working-tree REST receipt/test changes
were present and were not reverted). Reference: ClawCAD
`feat/mechanical-engineer-plugin` at `6d8313267e86fca31f271b821d7fbbf940b9b0c1`.

**Mutation: NO-GO.** Hosted candidate containment and write-time revision protection
are not established. Native OAuth and metadata discovery do not change this verdict.
Recommended OAuth architecture: **C, unified presentation with separate credentials**;
its immediate operational form is B, using the existing native MCP Settings/CLI.
No runtime configuration, grants, consent, CAD writes or deployment were changed.

## Evidence labels and scope

- **CURRENT PUBLIC:** unauthenticated HTTP metadata/OpenAPI/source fetched today.
- **CURRENT HOST:** read-only inspection of installed OpenClaw 2026.9.9 and native
  `mcp status --json`; no MCP connection or tool invocation.
- **REPOSITORY/OFFLINE:** current implementation and mocked provider contract tests.
- **HISTORICAL:** October 9 ClawCAD authentication/schema discovery and October 11
  Claw-Onshape Discord read/render acceptance; neither proves today's writes.
- **PROPOSED:** architecture requiring implementation and acceptance.

The threat model treats the operator, deployed plugin, Clawake, OpenClaw host and
Onshape authorization/execution infrastructure as trusted. Agent-generated
arguments/code, prompts and provider text are untrusted. External editors and
network/process failures are possible. Host/root compromise is outside this
boundary. A broad provider token must not become a general agent capability.

The first research step was ClawCAD `FINDING-015`. Also inspected
`deploy/demo/plugin/mcp-guard.mjs`, `tests/mcp_guard.test.mjs`,
`src/clawcad/mcp_execution.py:McpAdmission.admit`, `openclaw-mcp-cad-write.md`,
AMD-002/003 and the revision/admission test contracts. Reuse exact argument
admission, UNKNOWN outcomes and provider-precondition requirements; discard the
superseded workflow service/database composition. The hook tests demonstrate the
hook's own behavior, not universal native interception.

## A. Historical versus current MCP capabilities

| Area | Historical evidence | Current evidence / meaningful difference |
| --- | --- | --- |
| Endpoint | Native 2026.9.4 authenticated `https://fs-mcp.labs.onshape.app/mcp` | CURRENT PUBLIC: GET still responds 401; service is reachable and protected. CURRENT HOST: configured Streamable HTTP on 2026.9.9, disabled |
| Catalog | 14 full schemas, no CAD calls | No new authenticated catalog. No tool additions/removals claimed; current schemas/output schemas UNKNOWN |
| Authentication | Native owner consent requested Read+Write | Public resource metadata now verified directly: dedicated MCP resource and issuer; native stored status alone does not prove current consent/access |
| Containment | `create_geometry` implicit configured-version branch and default cleanup | No current public scoped-session/configuration contract establishes an exact REST candidate |
| Revision | Hosted write schema lacks expected revision | CURRENT PUBLIC Onshape REST schema documents skew rejection. No evidence hosted MCP forwards it |
| Application | Feature Studio source editing was possible in schema; target feature application absent | Official provider introduction describes custom-feature development and a user adding the feature to a Part Studio; no current automated candidate application contract verified |

Public MCP resource metadata: [protected resource](https://fs-mcp.labs.onshape.app/.well-known/oauth-protected-resource).
Issuer metadata: [authorization server](https://mcp-auth.labs.onshape.app/.well-known/oauth-authorization-server).
Provider product documentation: [FeatureScript MCP setup](https://www.onshape.com/en/blog/get-started-featurescript-mcp-server).
The public endpoint's authentication error is not proof that saved tokens are
invalid: the request deliberately supplied no credentials.

Full live rediscovery was not performed: production server is disabled and the
historical credential's reported expiry is in the past. This task forbids new
consent without explicit approval and copying credentials into an isolated
profile. A future authenticated schema check must use an operator-owned isolated
profile, no agent grants, no `tools/call`, explicit consent approval, bounded
output and disposal. Do not enable the production server just to inspect schemas.

## B. MCP capability matrix

All parameter names below are **HISTORICAL FINDING-015**, not a newly fetched
catalog. Current output schemas and annotation accuracy are UNKNOWN. No tool was
invoked. No listed tool is enabled through Claw-Onshape.

| Tool | Parameters | Targeting | Potential side effects | Revision protection | Security status |
| --- | --- | --- | --- | --- | --- |
| create_feature_studio | did, wid, name, contents | Explicit document/workspace, new element | Creates source element | Not exposed historically | BLOCKED: needs containment, write CAS and fresh schema |
| create_geometry | feature_name, feature_code, clean | Implicit configured version/sandbox | Branch/geometry creation; cleanup defaults true | Not exposed | BLOCKER: no exact candidate target; cleanup unproven |
| edit_featurescript_notes | old_text, new_text | Implicit notes context | Persistent notes edit | None exposed | UNAVAILABLE: unnecessary unscoped write |
| get_api_usage | none | Account context | Usage inspection; allocation cost unknown | N/A | UNKNOWN; not needed for MVP |
| get_featurescript | did, wvm, wvmid, eid | Explicit immutable reference possible | Intended read | Immutable reference possible, not write CAS | UNKNOWN: eligible only after fresh read/side-effect review and binding |
| list_feature_studios | did, wid | Explicit document/workspace | Intended read of mutable workspace | No immutable parameter | UNKNOWN: require exact target and bounded output |
| logout | confirm | Provider account/session | Changes connection state | N/A | UNAVAILABLE to engineering agent |
| put_featurescript | did, wid, eid, code | Explicit Feature Studio | Replaces source, not proven feature application | Not exposed | BLOCKED: no demonstrated write CAS |
| read_featurescript_notes | none | Implicit notes context | Intended read, account data disclosure | N/A | UNAVAILABLE: unscoped/unneeded |
| search_featurescript_documentation | topic | Documentation query | Search/quota; no CAD target expected | N/A | UNKNOWN; first possible isolated read candidate after review |
| set_api_allocation | company_id | Company/account | Changes API allocation | None exposed | UNAVAILABLE |
| test_feature | code | Implicit evaluation context | Sandbox writes/cleanup cannot be excluded | Not exposed | BLOCKED: “test” does not establish read-only behavior |
| test_featurescript | code | Implicit evaluation context | Sandbox writes/cleanup cannot be excluded | Not exposed | BLOCKED despite existing saved include filter |
| whoami | none | Account identity | Profile/account disclosure and possible scope requirements | N/A | UNKNOWN; disabled profile permission must remain disabled |

`src/mcp.ts:discover/filterCatalog` uses native `openclaw mcp probe --json` and
returns names with `enabled:false`. Installed `readMcpProbeResult` returns projected
names, counts and diagnostics, **not schemas**. The probe applies configured filters.
An empty or one-tool filtered catalog does not establish provider absence or safety.
Do not label names-only metadata “schema inspection” or expose a generic tool call.

## C. Workspace containment verdict — BLOCKED

There is no proof the Engineer can invoke hosted writes while being unable to
modify primary or another account-accessible document. Explicit `did/wid/eid`
arguments help construct a target but do not restrict raw alternate tools, implicit
sandbox configuration, cleanup, or provider-internal effects. OAuth resource
binding selects an MCP service, not an Onshape document/workspace.

Current REST helper verifies source/primary membership, pinned Part Studio type,
exact source and candidate baseline, distinct candidate/source/primary IDs,
trusted direct Engineer authority and consent. It stores bounded attempt receipts
before dispatch and fences UNKNOWN/CREATED_UNVERIFIED. Signed A2A read contexts
are specifically denied for candidate writes. These protections do not restrict
an independently enabled MCP connection. No production candidate tool is registered.

Required execution boundary: server-side enforcement of a host-issued candidate
capability containing exact document/workspace/allowed elements and expiry;
revalidation at dispatch; no primary/other-document, implicit target, cleanup,
branch, account-management or unrestricted raw operation. Native projections,
tool search, MCP Apps and alternate harness paths must not provide bypasses.
A scoped provider identity/ACL could strengthen this, but workspace-only ACL or
OAuth guarantees are not established. A candidate branch alone is not an ACL.

Client preflight, local lock, prompts and post-write checks are insufficient.
For a narrow adapter, restriction must live at its authoritative execution/server
boundary, with private credentials unavailable to the agent and raw bypasses
closed. This would be a new reviewed provider boundary, not a wrapper around
`create_geometry` that merely checks input text.

## D. Atomic revision safety verdict — BLOCKED for hosted MCP

A provider-side alternative exists in the public REST contract:

- Feature add/update bodies use `BTFeatureDefinitionCall-1406`.
- `sourceMicroversion` with `rejectMicroversionSkew=true` requests rejection of
  a mismatched current document revision; preserve serialization/library fields.
- Feature Studio contents inherit these fields through `BTFeatureApiBase-1430`.
- Feature responses include revision/skew and feature-state information.

Source: [current Onshape OpenAPI](https://cad.onshape.com/api/openapi), downloaded
API build `1.222.90730-c8d74e607a47`, whose advertised server is `/api/v17`.
Claw-Onshape currently uses v10. This is published contract evidence, not a
live stale-write rejection test; applicability of the chosen API v10 operation,
response semantics and rejection behavior require acceptance before mutation.
The feature list/response revision is document-level, not a local revision counter.

No hosted tool historically accepts these fields, and no current implementation
shows mandatory internal use. Do not infer automatic CAS or use guessed If-Match
headers. A GET before mutation leaves a race; locks cannot exclude Onshape UI
editors; post-read detection occurs after damage. Candidate creation from an
immutable source does not confer CAS on a later geometry write.

Future ordered edits must advance the expected revision after each verified
write, including Feature Studio edits; a multi-call sequence is not one atomic
transaction. Timeout after dispatch remains UNKNOWN: no automatic replay.
The current receipt store fences REST candidate preparation only; it is not an
MCP dispatch receipt or proof of provider idempotency.

## E. Camera Mount Plate mutation feasibility

**Existing plate 50 → 60 mm: UNKNOWN model feasibility; BLOCKED execution.**
No current feature/parameter measurement establishes 50 mm or a `width` parameter.
The existing renderer exports a feature count, not complete editable definitions.
The authorized target is documented in product status; its October 11 rendered
revision is historical evidence, not a fresh mutation baseline.

| Needed step | Hosted MCP evidence | Missing requirement |
| --- | --- | --- |
| Inspect Part Studio features/parameters | Historical get_featurescript reads Feature Studio source | Exact candidate feature tree, parameters, geometry and immutable revision |
| Author FeatureScript | LLM can generate code; source create/put schemas exist | Candidate-scoped source write, code/import limits and revision CAS |
| Test code | Code-only test tools exist historically | Proven side effects, context and no cleanup/branch escape |
| Apply custom feature | No explicit existing Part Studio application tool observed | Exact eid feature insertion referencing the authored custom namespace |
| Modify current feature/parameters | No corresponding hosted tool observed | Targeted update of inspected feature definition rather than replacing unrelated geometry |
| Regenerate and verify | Hosted test success is not target geometry evidence | Valid featureStates, resulting revision, width/hole measurements and pinned REST images |

Onshape itself documents feature insertion and replacement via its
[Features API](https://onshape-public.github.io/docs/api-adv/featureaccess/).
A future MCP data-plane implementation may use those provider REST endpoints
internally: the plane describes capability ownership, not a ban on provider HTTP.
REST control-plane lifecycle, revision coordination and reporting remain separate.
Source-file creation alone does not instantiate a Part Studio custom feature.
A successful evaluation response alone does not prove persistent geometry changes.

For custom features, author and evaluate source, identify its exported feature
and namespace/import reference, then insert/update an explicitly targeted Part
Studio feature at the latest verified candidate revision. FeatureScript can be
dynamic; the adapter need not catalog width/extrude/hole operations. It must still
constrain provider operations, targets, imported dependencies, payloads and effects.
Preserve all other feature data when updating. Inspect and measure the model first.

## F. OAuth architecture and dashboard integration

### REST lifecycle (REPOSITORY)

`src/oauth.ts` uses `oauth.onshape.com/oauth/authorize` and `/oauth/token`, an
operator-registered confidential client, private client-secret file and form
code/refresh exchange. CLI uses `http://localhost:8765`; dashboard uses the separately
registered `/plugins/claw-onshape/oauth/callback` on its allowed origin.
State, host/path, expiry, cancellation and current authority are checked.
REST records are private, connection-owner-bound and labeled
`https://cad.onshape.com/api/`. That label is a plugin restriction, not verified
provider token audience/introspection.

Read consent defaults to OAuth2Read. Explicit `--rest-write` or backend
`requestRestWriteAccess:true` adds OAuth2Write only after verified operator app-write
attestation. Parsing checks returned scopes or the narrowly justified unchanged
consent/refresh scope. Refresh cannot silently widen a grant; legacy records imply
read only. Renewal is serialized and fails closed after an uncertain exchange.
Current UI buttons send no write option and display code/message, not the returned
capability matrix. Internal candidate creation requires actual Read+Write plus
application-write attestation, trusted binding and separate current consent.
Thus code supports lifecycle authorization; current live write consent and creation
are **not accepted**. October 11 read/PNG acceptance remains separate.

### MCP lifecycle (CURRENT PUBLIC + CURRENT HOST)

Resource `https://fs-mcp.labs.onshape.app`, issuer `https://mcp-auth.labs.onshape.app`;
public endpoints `/authorize`, `/token`, `/register`, `/revoke`. Discovery advertises
S256, public/private-key client auth, code/refresh/token-exchange grants and supported
Read/Write/Delete/ReadPII scopes. Advertised token exchange is not evidence this REST
client/token can exchange successfully. No exchange or client registration was run.
Required tool-specific granted scopes and current provider audience checks remain
UNKNOWN; do not request all supported scopes. Historical consent requested Read+Write.

OpenClaw creates an MCP public-client metadata record, discovers issuer/resource
through the MCP SDK, keeps PKCE and refresh state, and persists credentials in its
canonical SQLite state under lease ownership. It checks issuer association before
refresh reuse. No new Claw-Onshape database is needed. Shared identity keys include
server name/URL; requester keys additionally bind channel/account/requester, not
agent ID. Session/agent restrictions are separate from credential partitioning.
Current Engineer configuration is `oauth.identity=shared`, no external auth profile,
server disabled, filter `test_featurescript`. The shared credential is runtime-owned,
not automatically Engineer-only. Raw access must still be closed.

`openclaw mcp status --json` reported stored `authorized`, token-presence and expired
`expiresAt=1791557575598`. Source `projectMcpOAuthCredentialsStatus` maps presence
to authorized without establishing present provider access. Treat as
**stored grant with renewal unverified**, never “MCP ready”. Token values were not
read/exported by this investigation; native status did not connect.

### Options and verdict

| Option | Compatibility / ownership | Verdict |
| --- | --- | --- |
| A — reuse REST OAuth | Different issuer/resource/client lifecycle; no supported token handoff from private REST files into native MCP | Reject for current integration. Provider-specific token exchange compatibility UNVERIFIED |
| B — separate OAuth | Existing REST lifecycle plus native MCP discovery/registration/refresh/store | Supported operational starting point; separate operator consent; independent failure/reconnect |
| C — one dashboard, separate credentials | Unified statuses/guidance; native MCP browser wizard remains credential owner | Recommended presentation. Prefer linking existing native Settings before adding custom OAuth actions |

- **REST OAuth sufficient for MCP: NO** for the verified supported integration.
- **Separate native MCP OAuth required: YES** for the hosted provider path.
- **Dashboard changes required: YES** to meet separate capability/readiness reporting;
  a custom MCP login panel is **OPTIONAL**, because native Settings already supports it.
- **Recommended architecture: C**, staged on B; never copy tokens.

Supported native mechanisms and limits:

| Need | Verified host contract | Limitation |
| --- | --- | --- |
| Initiate/reconnect browser consent | `mcp.authLogin({sessionId,serverName})`, native Settings sign-in, operator.admin; wizard methods | Only enabled operator-owned HTTP OAuth connector, browser origin and current authority; current disabled connector cannot sign in here |
| Authorization URL/callback | Native browser-auth wizard publishes URL and completes callback with PKCE/state | No verified standalone plugin “get URL” API; follow wizard protocol rather than reuse REST callback |
| Status | CLI `mcp status --json`; native plugin management projects declared matching operator connector status | Stored status is not a successful provider probe; current manifest declares no MCP server |
| Disconnect | Native CLI `mcp logout <name>` | Clears local shared credentials; provider revocation not implied. No separate supported MCP logout/status RPC found |
| Requester OAuth | Native channel connect flow; CLI rejects per-requester login | A2A peer identity is not the original Discord identity; read delegation signature is not native OAuth requester propagation |

Public plugin API has `api.runtime.gateway.request` and
`registerMcpServerConnectionResolver`. The latter resolves URL/headers from native
requester fields, not an agent-scoped candidate capability; it neither supplies CAS
nor authorizes REST token forwarding. A custom dashboard action must prove preserved
browser/admin authority, wizard cleanup and ownership before using core login.
Do not assume a plugin's generic gateway request grants administrator authority.

Smallest dashboard extension: separate REST and MCP status sections; show observed
REST read/write grant and policy separately; MCP configured/enabled/stored-expired/
renewal-unknown, discovery freshness/filter limitations and mutation **BLOCKED** with
actual gates. Missing statuses stay UNKNOWN. Do not implement this extension here.

Recommended operator journey:

1. Keep accepted REST read/render connection; verify app permissions privately.
2. For approved REST lifecycle work only, separately request Read+Write consent;
   current standard Connect remains Read. Do not enable Delete/Share/Profile/Purchase.
3. For MCP investigation, Clawake provisions a separate isolated operator profile,
   fixed hosted endpoint, explicit minimal scopes and zero production agent grants.
4. Only after explicit operator consent approval, use native Settings sign-in for
   an enabled isolated connector, or `openclaw --profile <profile> mcp login onshape`.
   Complete native browser wizard/loopback callback, not REST's callback.
5. Inspect metadata/schemas only; assess issuer/grants/side effects, dispose session.
6. Show independent states in the Engineer onboarding surface. Keep production
   connector disabled until containment, CAS and native guarded routing are accepted.
7. Reconnect/disconnect each plane through its owner. REST disconnect does not clear
   MCP; MCP logout does not clear REST. OAuth success never removes mutation gates.

## G. Native OpenClaw integration

CURRENT HOST supports `mcp.servers` stdio/SSE/Streamable HTTP, OAuth shared or
per-requester identity, server filters, native discovery and invocation. Host source
contains Codex-specific `codex.agents` restrictions and session overrides that can
narrow them. Those restrict agent/server visibility, not candidate targets.

Materialized calls (`agent-bundle-mcp-materialize-L-Le_IRZ.mjs:299`) directly call
`runtime.callTool`; manager forwards to the server owner. Codex static projection
(`bundle-mcp-codex-B1rsH5-i.mjs`) separately configures external servers and tool
policies. Generic before-call hooks are not proven to intercept every projection,
MCP App or native client route. No native mock invocation/hook coverage test was
executed here. Do not import private hashed modules as a production SDK dependency.

Public PluginRuntime has gateway dispatch and requester connection resolution,
but no verified plugin-scoped native `mcp.callTool` facade. Public harness helper
exports exist, but they require run/harness ownership and do not establish a
simple authorized plugin wrapper contract. The preferred guarded-capability chain
remains **unaccepted** until a supported invocation seam and absence of raw bypass
are demonstrated. Native MCP transport itself is available; the missing proof is
safe composition. Server enforcement remains necessary even if hook coverage passes.

## H. Alternative provider comparison

Pinned alternative source: [altendky/onshape-mcp](https://github.com/altendky/onshape-mcp/tree/f78ddc48a445765f32fcf052d9d8e6d709497d56).
Reviewed README, authentication/tool docs, Onshape request policy and I/O dispatch.
No installation/deployment/tool calls. Historical “API keys only” is outdated:
current project documents direct OAuth, optional self-hosted exchange proxy and
API-key alternative. Local stdio and experimental self-hosted HTTP are available;
there is no public server. Its own local token-file lifecycle is not automatically
OpenClaw-owned provider authentication.

Tool documentation says execution/permission work is pending, but pinned I/O source
already dispatches `ToolEffect::ApiRequest` to `executor.execute`. This inconsistency
prevents treating prose as exact enforcement evidence. Generic full-API request
construction can carry explicit target and revision fields; inspected request policy
special-cases document creation, not candidate-only targets or mandatory CAS.
No verified candidate-bound enforcement was found. This is a scoped review, not a
complete security audit or assertion that every enforcement mode is absent.

| Option | Functionality | Security guarantees today | Complexity / operation | OAuth fit | Decision |
| --- | --- | --- | --- | --- | --- |
| Hosted FeatureScript MCP | Source authoring/test-oriented historical catalog; application gap | Containment/CAS unproven; implicit geometry/cleanup | Small integration, external provider dependency | Native dedicated MCP OAuth | Metadata investigation only |
| Alternative MCP | Broad REST/API-driven feature access | Generic passthrough, no proven mandatory target/CAS | Additional local process or hosted server, substantial hardening/audit | Own direct OAuth/key store; native HTTP compatibility unaccepted | Do not adopt wholesale |
| Narrow native MCP adapter | Focused dynamic source/eval/application contract, fixed candidate capability | Could enforce server-side targets and mandatory provider skew rejection; NOT implemented/proven | Smallest controllable mutation boundary, but native invocation and credential composition unresolved | Must preserve native transport/auth ownership with supported adapter contract | Preferred mutation direction if hosted contract remains insufficient; NO-GO pending proof |
| Hybrid | Hosted authoring plus narrow feature application | Application can be restricted; hosted testing/source writes still need containment | Two provider paths and separate failure states | Separate native MCP from REST; adapter authentication still needs proof | Optional later; not an excuse to enable uncontained tests |

Smallest viable integration **now** is operator-only metadata/readiness with native
OAuth ownership. No evaluated option is presently accepted for the requested
mutation. A future narrow adapter should expose engineering source/evaluate/apply
capabilities, not raw URLs or full Onshape API access. REST implementation beneath
MCP is allowed, but native credential ownership and safe invocation cannot be
silently replaced by another client/service. If host support is insufficient,
propose the exact OpenClaw seam rather than building an unauthorized proxy.

## I. Permissions and security findings

Four independent checks: operator-attested application settings; actual stored
REST scopes; independent native MCP scopes; agent/target/operation authorization.
Known disabled Delete, Purchase, Share and Profile stay disabled. Their absence
is not evidence candidate creation or source writes require them. A provider 403
cannot uniquely identify which checkbox or scope is missing.

| Operation | Current classification | Reason / action |
| --- | --- | --- |
| REST read/render | AVAILABLE at historical accepted target/consent; current connection readiness UNKNOWN here | No new REST call/credential read in this investigation; use operation-specific evidence |
| REST candidate create | UNAVAILABLE to agents; internal provider acceptance UNKNOWN | Internal helper only; explicit actual Read+Write, app confirmation and trusted direct consent needed |
| Version creation | UNAVAILABLE | No exposed operation/grant; not automatically authorized by Write |
| Delete/share/purchase/profile | UNAVAILABLE | Disabled application permissions and no agent capabilities |
| MCP authentication | UNKNOWN live | Historical stored grant expired; separate approved consent/renewal needed |
| MCP catalog | UNKNOWN current | Historical schemas only; filtered CLI probe names cannot supply schema proof |
| MCP source/test/apply | UNAVAILABLE | Execution disabled; containment/CAS/application/native-boundary gates |

| Threat / finding | Severity | Enforcement boundary and verified mitigation | Remaining uncertainty | Blocks mutation? |
| --- | --- | --- | --- | --- |
| Other document/workspace targeting | BLOCKER | Current plugin rejects all MCP calls; REST fixed binding is separate | Hosted candidate session/ACL and raw paths unproven | Yes |
| Primary modification | BLOCKER | Candidate REST helper rejects primary/source | Hosted account-wide write route has no proven restriction | Yes |
| Implicit target/branch creation | BLOCKER | create_geometry unavailable | Historical configured-version semantics; no exact candidate input | Yes |
| Cleanup effects | HIGH | No test/create/delete tools called | clean default and evaluation internals unverified; false is not proof of containment | Yes |
| Concurrent external edits | BLOCKER | REST schema offers provider skew rejection; no mutation enabled | Hosted forwarding/atomic enforcement not established | Yes |
| Success followed by timeout | HIGH | Candidate receipt fences its own UNKNOWN dispatch | MCP-specific receipt/reconciliation and provider idempotency absent | Yes |
| Duplicate execution | HIGH | REST preparation fenced across restart | MCP execution at-most-one dispatch not implemented | Yes |
| Raw native MCP bypass | BLOCKER | Server disabled; existing grants unchanged | Static Codex/tool-search/App paths and guarded facade acceptance missing | Yes |
| Excessive OAuth grants | HIGH | REST defaults Read; app-sensitive permissions unchanged | Hosted minimum scopes by operation and workspace-bound grants unknown | Yes for broad write enabling |
| Token leakage/confusion | HIGH | Private separate lifecycle; no values exported; native status only | Adapter future credential composition must remain native-owned | Yes if composition unproven |
| Untrusted tool output/code/imports | HIGH | No automatic execution; bounded names only | Provider code effects/imports, output schema and exact result provenance | Yes |
| Misleading successful response | HIGH | Accepted REST PNG validates pinned state; signed A2A not geometry proof | Need feature states, returned revision and independent geometry invariants | Yes |
| Stored authorized label with past expiry | MEDIUM | Native CLI metadata reveals expiry; report UNKNOWN renewal | UI must not translate token presence into MCP ready | No for metadata; cannot grant mutation |
| Hidden catalog/quota cost | LOW | No new authenticated discovery | Provider internal REST fan-out not measured | No; budget evidence needed before recurring probes |

## J. Exactly one next implementation task

**Add independent, operator-only MCP readiness reporting to the existing onboarding
surface, without connecting or executing tools.**

Scope: fixed `onshape` server status via native `openclaw mcp status --json`, bounded
allowlisted projection; configured/disabled, stored grant, expiry/renewal-unknown,
discovery not checked, candidate containment unknown and mutation blocked. Keep
REST capability/grant reporting separate. Use existing page/session status action;
no new authentication implementation or automatic probe.

Likely files: `src/mcp.ts`, `src/connections.ts`, `src/readiness.ts`,
`ui/control-ui.js`, focused tests and operator documentation. Dependencies: pinned
host CLI contract, Clawake-owned fixed server declaration, existing operator.read
authority. Acceptance: expired native authorized label never becomes ready;
REST-only success never implies MCP authentication; malformed/oversized/unknown
status fails closed; no tokens/client information/auth URL exposed; zero network
requests, config changes or CAD calls; all existing read/render tests pass.

Exclusions: login/logout initiation, scope changes, production enabling/grants,
schema calls, custom MCP client/proxy, FeatureScript writes/evaluation, geometry,
workspace creation/promotion. This makes the unresolved gates visible; it does not
claim to remove the provider or native execution blockers.

## K. GO / NO-GO decisions

| Increment | Decision | Conditions / missing evidence |
| --- | --- | --- |
| MCP metadata discovery | GO for public metadata and bounded native stored status | Authenticated schema discovery deferred to explicitly approved isolated operator consent; no production enabling |
| Read-only MCP integration | NO-GO for production agent access; GO for contract investigation | Fresh exact schema/side-effect, target binding and native bypass proof required; “test” is not read-only |
| MCP OAuth onboarding | GO for designing native separate lifecycle; NO-GO for initiating consent in this task | Use existing native Settings/CLI after approval, isolated configuration; no token reuse |
| Candidate-only FeatureScript authoring | NO-GO for provider source writes | Target/CAS/native boundary missing. Offline agent drafting of code is not a provider write |
| Actual Part Studio mutation | NO-GO | Candidate containment, mandatory provider CAS, application operation and geometry verification unaccepted |
| Production Engineer MCP access | NO-GO | Keep disabled and grants unchanged until operation-specific acceptance |

### Verification performed

Public GETs: MCP protected-resource document (200); wrong-host authorization metadata
(404); correct issuer metadata (200), OIDC discovery (404); unauthenticated MCP GET
(401); Onshape OpenAPI (200); alternative Git tree/source at pinned commit (200).
No OAuth authorize/token/register/revoke endpoint invoked. No CAD tool called.

Read-only runtime: container inventory/version; sanitized config/grants; native
`openclaw mcp status --json`; public SDK/source copies to /tmp. Engineer version
2026.9.9, plugin enabled/liveReads true, hosted MCP disabled. Global allow grants:
legacy read tools plus onshape_status/inspect/render. Engineer alsoAllow additionally
contains legacy preparation/comparison, no hosted writes. Agent entries live under
`agents.entries`, not `agents.list`. Runtime app-permission attestations were absent;
repository scope/reporting improvements are not presumed deployed.

`npm test`: **65 pass**, provider and file-SDK contract mocks; no live Onshape writes.
`npm run typecheck`: PASS. Tests ran against the inspected working tree; they do not
prove native hook coverage, live candidate creation, CAS or credential compatibility.
Public evidence snapshot: [metadata and schema references](evidence/mcp-investigation-2026-10-12.json).


## Implementation follow-up — operator MCP readiness (2026-10-12)

Section J is now implemented in the repository, validated offline. The existing
session `status` action is operator.read-only and returns separate MCP metadata;
agent `onshape_status` still uses the REST-only lifecycle. The native command is
`openclaw mcp status --json`, bounded to 1 MiB / 15 seconds after runtime correction and projected only for
`onshape`. No private native imports or credential-file inspection are used.

Configuration/enabled state and stored-grant/optional expiry/action metadata are
available when the CLI supplies valid fields. CLI failure or incompatible data
leaves those signals UNKNOWN. Native `authorized` never becomes CONNECTED: saved
presence/expiry cannot verify current token validity, renewal or reachability.
OAuth discovery state is not authenticated tool-discovery evidence. October 9
ClawCAD discovery is labeled HISTORICAL; current catalog remains unverified.
Mutation remains BLOCKED on containment, atomic revision enforcement, guarded
native invocation and Part Studio mutation contract. REST grants remain separate.

OAuth onboarding and authenticated discovery are not completed. Future MCP consent
belongs to native operator Settings/CLI in an approved isolated profile, with no
production agent grants. The immediate next dependency is read-only dashboard
acceptance on the pinned host while its connector remains disabled. See
[readiness signals and native API references](mcp-dashboard-readiness.md).


### Native status adapter correction (2026-10-12)

Actual OpenClaw 2026.9.9 disabled-server status has `configured:true`,
`enabled:false`, `ok:false`; `ok` means enabled/resolved transport, not credential
validity. The projector now accepts either boolean while still rejecting missing
or malformed fields. A captured allowlisted native record is a regression fixture.
The bounded native command timeout is 15 seconds; exact built-adapter execution
from memory completed in 5,517 ms on Engineer and 4,748 ms on Lead, without
installing files. Configuration and grants stayed unchanged. Engineer reports
stored-expired grant/operator action, connection UNKNOWN, discovery HISTORICAL and
mutation BLOCKED. 74 tests, typecheck/build and diff checks pass. Full dashboard
acceptance remains blocked on authorized managed deployment and browser checks;
no OAuth, discovery, grant changes or deployment occurred.
