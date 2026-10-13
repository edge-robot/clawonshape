# Camera Mount Plate MCP live sprint — 2026-10-12

Historical October 12 checkpoint. The later
[native Engineer test](native-mcp-engineer-readonly-2026-10-13.md) establishes
direct native agent invocation with the local fork, without a plugin MCP handle.
The importable Codex projection helper called "public" below was subsequently
identified as a private-local bundled surface, not a supported third-party SDK.
The runtime stop recorded at the end describes October 12, not today's process
inventory. Preserve these observations as history, not current execution gates.

**BLOCKED — provider/native contract insufficient.** REST target inspection and
isolated native MCP OAuth now pass. Authenticated native discovery verifies 14
provider tool names, but the CLI does not export full schemas and the public
schema-capable helper rejects standalone acquisition without its native lifecycle
owner. A supported owner-bound catalog/invocation seam remains unestablished.
No Candidate or CAD mutation was attempted. Current full schemas remain UNKNOWN;
this is a native integration-contract blocker, not a new proof that the provider
lacks every required capability.

Existing uncommitted work was preserved. This sprint adds this report and a
[sanitized evidence record](evidence/camera-mount-mcp-live-sprint-2026-10-12.json).
Production deployment/configuration/grants, plugin execution policy and mutation
implementation remain unchanged. A separate temporary operator-only native
runtime was deployed after explicit approval; see the follow-up below.

## A. Exact target and expected before-state

The installed 0.2.1 plugin's trusted binding was inspected on the existing
Mechanical Engineer runtime. It is enabled with `liveReads=true` and one binding:

| Reference | Evidence / value |
| --- | --- |
| Intended model / document name | Camera Mount Plate / provider document `wegwerf-document` |
| Engineer identity | `clawcad-mechanical-engineer` |
| Document | `8b63eacf80efca72049f8017` |
| Protected Primary Workspace | `1e76fac0ddca3ed10ecc9f28` |
| Configured source workspace | `1e76fac0ddca3ed10ecc9f28` — identical to Primary |
| Part Studio | `7768b96c15d71e78cdbdd7d9`, `Part Studio 1`; immutable PARTSTUDIO membership verified |
| Source microversion at fresh read | `b83ee0a0efcda65537780ef8`; revalidate before any Candidate preparation |
| Feature list / feature ID | Complete, one feature: `F37MrGsqQOiSdYi_0`, `ClawCAD Mount Plate 1`, state OK |
| Width parameter path / expression | Parameter ID `plateWidth`; observed `features[0].parameters[1].expression` = `50 mm` |
| Current 50 mm width | Declared feature expression independently read; geometry measurement not performed |
| Candidate | Not created; no workspace ID assigned |

Intended operation: update feature `F37MrGsqQOiSdYi_0`, parameter `plateWidth`,
expression `50 mm` → `60 mm` in one separately approved Candidate, preserving
the full feature definition and all other parameters. Select by IDs rather than
array offsets. No replacement feature or unrelated geometry is intended. There
is no authorized/native schema-approved mutation payload yet.

At `2026-10-12T13:27:31.534Z`, a temporary host diagnostic dispatched through
Podman stdin used the **installed** plugin's `parseConfig`, `connectionOwner`,
`validateTarget`, `credentials`, `accessToken`, `RestClient`, and bounded
`jsonRequest` helpers. It held tokens inside the Engineer process. Planned CAD
operations were GET-only: membership/document/workspaces, current microversion,
microversion-pinned elements and feature definitions, then Primary revision.
Configuration was checked for changes throughout. It stopped before those CAD
GETs because the saved REST grant was expired and the existing refresh lifecycle
returned `oauth_refresh_response_invalid`. No repeated refresh was attempted.

**Credential side effect:** the existing fail-closed refresh lifecycle persisted
null before exchange and did not save the rejected response. REST now requires
operator reconnection. This was ordinary REST credential renewal for the approved
read path, not MCP consent or a CAD write. Provider response contents and tokens
were not displayed, exported, or copied. The diagnostic is not a new agent tool,
REST mutation route, or production integration.

The entire Engineer runtime configuration fingerprint remained
`df0e4ad3615314df1a5764fc08ae22524c630c432c4d13c5f03d70f7570b88d4`
before/after, including agent grants and MCP declaration. The production MCP
connector was disabled. Lead was not changed or invoked. Primary received no
write from this sprint; fresh before/after provider revisions are unavailable,
so absence of unrelated external edits is not claimed.

## B. Current MCP contract

**Authenticated current tool names: VERIFIED. Full schemas: NOT RETRIEVED.**
The supported native `openclaw mcp probe onshape --json` completed with exit 0,
14 provider tools and zero diagnostics, without a configured tool filter. The
14 names match FINDING-015; the four extra projected names are native
`prompts_get`, `prompts_list`, `resources_list`, and `resources_read` helpers,
not new provider CAD tools. None was invoked. See
[current catalog evidence](evidence/camera-mount-mcp-catalog-2026-10-12.json).

Input/output schema changes, annotations, target binding, revision preconditions,
operation-specific granted scopes and provider execution semantics remain UNKNOWN.

The previous investigation and original
`clawcad-plugin/docs/findings/FINDING-015-hosted-mcp-write-boundary.md` were read.
Its October 9 catalog remains historical:

| Tool | Historical arguments | Relevant limitation |
| --- | --- | --- |
| `create_feature_studio` | did, wid, name, contents | Source creation, not Part Studio application; no exposed revision precondition |
| `create_geometry` | feature_name, feature_code, clean | Implicit configured-version target; default cleanup; no exact Candidate inputs |
| `edit_featurescript_notes` | old_text, new_text | Implicit persistent notes context |
| `get_api_usage` | none | Account context |
| `get_featurescript` | did, wvm, wvmid, eid | Source read, not feature definition update |
| `list_feature_studios` | did, wid | Workspace source inspection |
| `logout` | confirm | Connection lifecycle mutation |
| `put_featurescript` | did, wid, eid, code | Feature Studio replacement; no exposed revision precondition |
| `read_featurescript_notes` | none | Implicit notes read |
| `search_featurescript_documentation` | topic | Documentation search |
| `set_api_allocation` | company_id | Account allocation mutation |
| `test_feature` | code | Implicit execution context; side effects unverified |
| `test_featurescript` | code | Implicit execution context; side effects unverified |
| `whoami` | none | Profile/account disclosure |

This parameter-name summary is not a substitute for fresh full schemas. Current
provider-name additions/removals were not observed; schema differences cannot be
asserted. In particular, absence of historical
parameters does not prove absence of mandatory provider-internal enforcement.

Installed native CLI `probe --json` projects filtered names/counts/diagnostics.
`src/mcp.ts:discover` consumes this projection; it is not full-schema discovery.
The public [CLI contract](https://docs.openclaw.ai/cli/mcp/json-output) documents
this shape. Do not call a filtered probe a complete provider contract.

Required authenticated discovery is strictly `tools/list` (including pagination)
through a supported native schema-capable surface, with no `tools/call`, resource
reads, test/evaluation, cleanup, or account-management calls. Preserve raw bounded
schemas and annotations as reviewed evidence, independently of any local filters.

Provider retries, timeouts, cleanup guarantees, resulting IDs and before/after
revision output remain UNKNOWN. The native runtime contains request timeouts and
disposal, but those do not establish provider cancellation, rollback or
idempotency. After any eventual dispatch ambiguity, record UNKNOWN and reconcile
actual state before another attempt.

## C. OAuth state and concrete onboarding proposal

**Native isolated MCP OAuth: PASS.** After the operator's explicit approval,
native `openclaw mcp login onshape` opened the consent browser, requested the
approved `OAuth2Read OAuth2Write` pair, saved credentials through OpenClaw, and
exited 0. The subsequent authenticated provider catalog probe passed. Neither
REST credentials nor production MCP credentials were copied. Production
`onshape` remains disabled. The earlier
native stored grant expiry, `2026-10-09T14:52:55.598Z`, is historical status evidence;
this sprint did not inspect private native credential storage or treat that grant
as current provider access.

Explicit operator approval was received for this exact onboarding proposal:

| Item | Proposed value |
| --- | --- |
| Provider | `https://fs-mcp.labs.onshape.app/mcp` |
| Resource | `https://fs-mcp.labs.onshape.app` |
| Issuer | `https://mcp-auth.labs.onshape.app` |
| Requested scopes | `OAuth2Read OAuth2Write`, historical proven pair; current minimum scope requirement still unverified |
| Consent effect | Enables native provider reads/writes within the account's permissions; does not authorize this sprint to invoke CAD tools |
| Discovery authority | Operator only; no engineering agent session or production grant |
| Native flow | OpenClaw Settings/CLI browser consent with native PKCE/state/store |
| Isolation | Separate operator profile provisioned under Clawake ownership; fresh native state, no copied REST/production MCP credentials |
| Suggested profile label | `camera-plate-mcp-sprint-20261012`; proposal only, not provisioned |

Approval and browser consent were separate completed steps. The scope pair is broader
than catalog listing alone and its write effect was explicitly presented; no
Delete/Profile/Share/Purchase scope is proposed. If the provider expands or changes
the requested consent, stop for operator review. Production Engineer grants must
remain unchanged.

Supported native login is `openclaw --profile <isolated-profile> mcp login onshape`.
Installed `mcp-cli-Dt7GFrqd.mjs:670–719` shows native registration/authorization,
loopback callback waiting, native completion, and callback cleanup in `finally`.
Do not pass codes/tokens through reports or use REST's callback. Provisioning and
callback reachability must be checked before initiating consent; a callback in a
container is not automatically reachable from the operator browser. No profile,
listener, separate service, or production connector was created while approval
remained pending.

The operator was also asked to reconnect REST through the existing Engineer
dashboard at `http://localhost:19489`, with read consent, and confirm completion.
REST reconnection does not authorize or repair MCP.

## D. Guarded native invocation

The focused pinned-host inspection confirms the previous architectural concern:

| Native surface | Supported role | Missing guarantee for this plugin |
| --- | --- | --- |
| `OpenClawPluginApi.registerTool` | Narrow plugin capability with trusted v2 context/current-invocation checks | Does not itself invoke native MCP |
| `PluginRuntime.gateway.request` | Trusted plugin gateway dispatch | No verified core `mcp.callTool` RPC or plugin-scoped MCP call contract |
| `registerMcpServerConnectionResolver` | Sender/account/channel-bound URL/header resolution | Receives no Candidate, element, operation, expected revision or execution-attempt authorization |
| `SessionMcpRuntime.callTool/listTools/getCatalog/dispose` | Native session-owned MCP machinery | Type existence is not acquisition/authorization authority for Claw-Onshape |
| Public `codex-mcp-projection.materializeStaticMcpToolsForHarnessRun` | Executable tools materialized under a Codex harness authority envelope | Not a demonstrated plugin-owned nonprojected invocation handle |
| Public requester materialization / harness `loadMcpToolCatalog` | Requester/harness-owned tool/catalog integration | Requires its native session/harness authority; not a generic operator schema/call facade |

After successful OAuth, a schema-only diagnostic called the public
`materializeStaticMcpToolsForHarnessRun` export in the isolated native environment.
It failed before catalog acquisition with **`Session MCP runtime scheduler has
not been bound by its lifecycle owner`**. No materialized tool was executed.
This demonstrates a missing owner binding for this standalone public-helper
path; it does not prove the helper cannot work inside its proper native harness.
No supported plugin acquisition path with that ownership was established here.

Exact source evidence: installed
`/app/dist/plugin-sdk/codex-mcp-projection.js` exports the static helper;
`codex-mcp-projection-B8J87J9H.mjs:24–27` delegates to harness materialization.
`agent-bundle-mcp-harness-BdaKzFm3.mjs:104–170` acquires a session runtime,
materializes executable tools, applies policy/approval and returns tools/disposal.
`agent-bundle-mcp-materialize-L-Le_IRZ.mjs:299` calls
`runtime.callTool(serverName, toolName, input)` directly. Native Codex external
server projection is a separate path in `bundle-mcp-codex-B1rsH5-i.mjs`.

The installed public API/runtime type contracts were checked via the repository's
pinned OpenClaw dependency (`agent-harness-runtime-R8dTs5zl.d.ts`, especially
`PluginRuntime`, `OpenClawPluginApi`, `SessionMcpRuntime`, requester resolver and
harness catalog/materialization types). **No accepted plugin-scoped native MCP
invocation mechanism was established.** The harness export is a real mechanism,
not an absent function; treating it as an arbitrary plugin authorization facade
would require proving the authority/lifecycle composition first. No private hashed
module was imported, no fake agent/harness session was created, and no custom MCP
client was implemented.

**Raw bypass determination:** direct native MCP tools granted/projected to the
Engineer can dispatch without entering a Claw-Onshape `registerTool` wrapper.
Claw-Onshape's `rejectMcpCall` only rejects its own caller path and cannot intercept
those native calls. Current production disabling prevents that path here. It does
not prove safe guarded invocation once enabled. Generic hook tests, tool-name
approval and prompts cannot substitute for Candidate/revision authorization.
Universal coverage across external Codex projection, materialized tools, tool
search and MCP Apps has not been live-tested.

Smallest missing native contract to establish: a supported plugin-authorized,
session-owned invocation handle for an exact native server/tool, usable without
projecting raw provider tools to the Engineer, preserving trusted invocation
identity, native OAuth/transport/cleanup and a single dispatch. A supported native
schema-listing interface is needed for operator discovery as well. Provider CAS
and concrete Part Studio mutation remain independent requirements; a native handle
alone cannot supply them. This is a native contract/acceptance gap, not a proven
small missing Claw-Onshape adapter ready to implement today.

## E. Security gates

| Gate | Result | Evidence |
| --- | --- | --- |
| 1. Candidate isolation | BLOCKED | No approved/created Candidate; current target-binding schemas unavailable |
| 2. Primary protection | BLOCKED | Configured source equals Primary; no demonstrated Candidate-only MCP write binding. No write selected or dispatched |
| 3. Revision protection | UNKNOWN | REST source revision verified, but fresh provider CAS contract unavailable; REST pre-read is not atomic. Published REST skew fields are not proof of MCP enforcement |
| 4. Concrete Part Studio operation | UNKNOWN | Exact feature/width parameter verified; current mutation schemas unavailable. Feature Studio source creation insufficient |
| 5. Guarded native execution | BLOCKED | No accepted plugin-scoped native composition; independent raw MCP paths exist if granted |
| 6. Explicit immediate mutation approval | BLOCKED | Not requested because preceding gates fail; OAuth/sprint approval is not mutation approval |

These are live-write gate statuses, not a claim that historical provider
limitations were reconfirmed through today's authenticated schemas.

## F. Candidate, mutation authorization and live test

Candidate creation: **zero attempts**. Existing `RestClient.prepareCandidateWorkspace`
and its authorization/attempt receipts were inspected and preserved. It already
checks source/Primary membership, immutable baseline, isolation, trusted direct
authority, REST write scope/app attestation, current consent and dispatch fencing.
It is not a production registered agent tool or operator dashboard creation action.
Current application write attestation was absent in the sanitized configuration;
REST read reconnection must not be interpreted as lifecycle-write permission.

Proposed Candidate name for eventual review:
`Camera Mount Plate — MCP width 60 mm — 2026-10-12`.
Expected source is a **fresh verified immutable microversion of the configured
Primary**, preserving element `7768b96c15d71e78cdbdd7d9`. The observed source is
`b83ee0a0efcda65537780ef8`; it must be revalidated before presenting a concrete
creation approval request. No creation approval was requested. Do not create
from the October 11 revision or reuse an unverified workspace. Before creation,
present exact document/revision/Primary/name/source/change and obtain separate
operator approval; create once through the existing Control Plane, then verify
IDs/baseline/distinctness and reconcile any ambiguous response without replay.

No executable mutation authorization object was minted. A later one-shot record
must contain the authentic operator approval reference/time, trusted Engineer
identity, exact document/Candidate/element/feature/parameter, 50→60 mm operation,
current expected Candidate microversion, exact native tool/schema-approved payload
and unique attempt ID. Incomplete placeholders must not be treated as authority.
It must be checked at dispatch; mark the attempt consumed before sending and do
not reuse it after uncertainty. Native/provider preconditions must prevent stale
writes; an audit object alone does not enforce CAS or disable raw paths.

MCP provider tool invocations / CAD mutations: **zero**. Native OAuth and catalog
probe were performed; no CAD tool was called. There is no before/after feature, geometry,
regeneration or render evidence for a live write. No plausible PNG or historical
render is offered as verification. Once executable, independent REST checks must
verify the Candidate's resulting revision, exact feature value, feature states,
relevant geometry, microversion-pinned render and unchanged Primary revision.

## G. Architecture conclusion

The intended architecture remains the direction: REST for operator connection,
trusted inspection, Candidate lifecycle and verification; native OpenClaw MCP for
CAD authoring/testing/mutation; Claw-Onshape for bounded authority; Clawake for
deployment/configuration/grants. Its live mutation viability is **unverified**.
REST target reads and native OAuth succeeded. This sprint cannot truthfully
conclude READY or successful mutation while full authenticated schemas and an
accepted guarded invocation seam remain missing. The BLOCKED verdict concerns
the unestablished native owner-bound integration contract; current provider
mutation insufficiency has not been established from names alone.

Conditional alternatives, if fresh hosted schemas confirm insufficiency:

| Compatible alternative | Decision condition |
| --- | --- |
| Hosted MCP with improved configuration | First preference if exact Candidate binding, Part Studio mutation and atomic revision enforcement can be demonstrated |
| Narrow MCP adapter using verified Onshape APIs | Focused fallback if native credential/invocation composition and mandatory target/CAS enforcement can be reviewed; no implementation authorized by speculation |
| Alternative reviewed Onshape MCP | Require target/CAS/auth/raw-bypass review; broad REST passthrough does not establish bounded mutation |
| Hybrid hosted authoring + narrow MCP application | Possible later; each mutating/test path still requires containment and revision guarantees |

The previous reviewed `altendky/onshape-mcp` findings are reused rather than
re-investigated or treated as new acceptance. No REST mutation fallback, generic
proxy, new service/workflow/persistence or permanent production grant was added.

## H. Exactly one next task

**Add a supported native owner-bound full MCP catalog export for operator use.**
It must return paginated provider `tools/list` schemas/annotations from the
approved isolated native connection, use the existing runtime lifecycle owner,
and close the discovery session without invoking tools or exposing raw provider
tools to the Engineer. Expose it through supported CLI/SDK/operator integration,
not private hashed modules or a new client. This is a native capability task;
no missing production Claw-Onshape wrapper can substitute for its ownership.
Its acceptance will settle current provider target/CAS/Part Studio contract gaps
before selecting a mutation adapter. A guarded invocation seam remains a separate
requirement to demonstrate; catalog export alone must not make mutation ready.
No new native runtime implementation is attempted in this repository sprint.

## Follow-up — REST restored and exact width identified

The operator reconnected REST through the existing dashboard and explicitly
requested continuation. At `2026-10-12T13:35:56.408Z`, the same GET-only diagnostic
successfully verified the following provider state. This supersedes the UNKNOWN
target fields in the initial attempt above; the failed refresh remains historical
evidence rather than an unresolved current REST blocker.

| Reference | Current provider evidence |
| --- | --- |
| Document name | `wegwerf-document` |
| Document ID | `8b63eacf80efca72049f8017` |
| Primary/source | `Main`, `1e76fac0ddca3ed10ecc9f28` |
| Part Studio | `Part Studio 1`, `7768b96c15d71e78cdbdd7d9`; immutable element type PARTSTUDIO verified |
| Source microversion | `b83ee0a0efcda65537780ef8`; currentmicroversion and pinned feature sourceMicroversion agree |
| Primary microversion after read | `b83ee0a0efcda65537780ef8` |
| Feature list | Complete, one feature, rollbackIndex 1 |
| Feature | `F37MrGsqQOiSdYi_0`, `ClawCAD Mount Plate 1`, type `clawcadMountPlate`, not suppressed, state OK |
| Width | `plateWidth`, quantity parameter, expression `50 mm` |
| Exact path in observed response | `features[0].parameters[1].expression`; locate by IDs rather than array offsets for eventual dispatch |
| Intended change | Preserve the full feature definition and change only the `plateWidth` expression to `60 mm` in the approved Candidate |
| Other parameters | plateLength 80 mm; plateThickness 4 mm; holeDiameter 4 mm; holeSpacingX 60 mm; holeSpacingY 30 mm |
| Serialization/library | `1.2.21` / `3095` |

The quantity parameter's `value` is 0 and `units` is empty in this feature
definition; the authoritative declared width expression is `50 mm`. Do not treat
that raw numeric field as a measured zero-width plate. No independent geometric
measurement or new render was performed in this follow-up.

The workspace-list `microversion` field was `823def379a8ff6e87eae3036`, different
from the currentmicroversion/pinned-feature evidence. Its meaning is not assumed;
it is preserved separately and not used as the Candidate source. Candidate
preparation must revalidate the approved immutable source using the existing
currentmicroversion and feature checks. This read is not a future write CAS.

Document/workspace/element membership passed. Configuration fingerprints remained
identical to the initial inspection; MCP remained disabled in production. No
write was made to Primary or any other CAD workspace. Full custom-feature namespace,
parameter identification, baseline revision and feature status are preserved in
the [sanitized evidence](evidence/camera-mount-mcp-live-sprint-2026-10-12.json).

## Follow-up — approved isolated native runtime

The operator explicitly approved the proposed isolated runtime and native MCP
sign-in with `OAuth2Read OAuth2Write`. A separate Clawake v1 inventory was prepared
under ignored `state/deployment/mcp-sprint-20261012/team.json`; production
`state/deployment/team.json` was not changed. Validation and setup preview passed.
Clawake `setup --member clawonshape-mcp-sprint-20261012 --execute` then installed
only that member's new Quadlets and performed its managed start. No production
member was selected or restarted.

The temporary instance uses the existing digest-pinned OpenClaw 2026.9.9 image
(`sha256:7f10d5cc975a90b65192eaa099454fe33ce8ce2390806c61c65cd868e9ef730d`),
its own workspace/native state and network, and host-loopback port 19491. It has
no production mounts, environment files, plugins, Discord/A2A connections or
engineer grants. No credential store was copied. Agent tools are denied globally;
no agent turn is authorized or started. The isolated native `onshape` connector
uses the fixed provider, explicit scope pair, serial calls and prompt approval;
its Codex projection is limited to `mcp-sprint-operator`, not the Engineer.

Native `openclaw --version` reports 2026.9.9 and `openclaw config validate` passes.
The first readiness checks returned connection reset. The isolated image's
startup doctor/gateway rejected the missing gateway token and systemd restarted
it; a token-generation command in that restarting container was interrupted.
Clawake's `SystemdService.stop` and `doctor_command` were then used for the same
isolated member: stop the restart cycle, run native doctor with
`--generate-gateway-token` in its managed one-shot image, and perform a managed
restart. Native doctor exited 0 and created the isolated gateway's own token.
CLI output was captured/suppressed; no token was displayed or copied from another
runtime. The credential generation was gateway bootstrap, not provider OAuth.

Subsequent `/ready` returned **HTTP 200**. Initially native
`openclaw dashboard --no-open` supplied a public gateway URL which was mapped to
host-loopback port 19491 and opened at `/settings/mcp`. **That launch did not
deliver native browser authentication**, as established in the correction below.
No gateway credential was written to the report/chat. The operator was asked to click **Sign in**
for `onshape`, complete native consent, and report success or pairing/error.
Provider consent has not yet been confirmed and no MCP call/catalog was dispatched.
Read-only native `mcp status --json` subsequently reports enabled=true,
hasTokens=false, state=unauthenticated and no expiry. Its
requiresAuthorization=false field does not establish authorization in the absence
of tokens. Browser sign-in remains the required operator action.

A post-start production configuration inspection again returned fingerprint
`df0e4ad3615314df1a5764fc08ae22524c630c432c4d13c5f03d70f7570b88d4`
and `onshape.enabled=false`. Production grants/configuration remain unchanged.

The native MCP Settings page has a **Sign in** button for enabled operator-owned
OAuth connectors, verified in the installed UI bundle. It is separate from the
Claw-Onshape REST Connect button. Native `mcp.authLogin` requires operator.admin,
browser origin and current connector authority; it runs the existing browser
wizard and closes/cancels its pending authorization in `finally`. The operator
uses the isolated gateway's `/settings/mcp`, once ready. Gateway bootstrap
authentication must remain native; no provider token is printed or transferred.

## Follow-up — corrected native browser authentication handoff

The operator reported `token mismatch / unauthorized` on port 19491 after using
`openclaw gateway auth-token --show`. Sanitized isolated gateway diagnostics
confirmed token_mismatch; native `devices list --json` initially had no pending
or paired devices. The command's originating host/profile was not established,
so a wrong-instance token is a possibility, not a proven cause.

The earlier host launcher had a concrete defect: it parsed the **public**
`Dashboard URL:` from native text output and assumed it carried authentication.
An in-memory comparison found no token in that URL's query or fragment. Installed
`dashboard-Ca99koOX.mjs:352–380` explicitly prints the public URL, delivering the
distinct one-time browser URL through browser/clipboard instead. Thus the previous
browser-open result proved only launch, not authentication delivery.

The launcher was corrected to use the supported `openclaw dashboard --json`
contract and its **`browserUrl`** field, not `url`/`httpUrl` or text output. Native
OpenClaw verifies the local Gateway and issues the short-lived browser handoff.
The host helper checks the exact isolated loopback origin and presence of an
authorization payload, maps port 18789 to the isolated host port 19491, preserves
the full native path/query/fragment and opens the one-time URL in the browser.
It does not construct tokens, implement OAuth, import private runtime modules,
disable gateway authentication, or change production state. Bootstrap URLs and
credentials are captured in memory only and never displayed in tool output/chat.

The corrected launch reports `openedIsolatedNativeBrowserHandoff=true`; native
handoff expiry metadata was `1791814796410`. The operator was instructed to use
the newly opened tab without the previous manually entered secret and then use
Settings → MCP → onshape → Sign in. Browser connection and provider consent still
require independent confirmation; opening the URL alone is not acceptance.

## Follow-up — screenshots, successful OAuth and authenticated discovery

The operator confirmed gateway authentication and supplied
`screenshot-2026-10-12_16-24-41.png` and
`screenshot-2026-10-12_16-22-41.png`. Inspection confirmed that the actual MCP
page had no visible Sign in control. Earlier instructions to click it were
incorrect for the observed page; its exact gating prerequisite was not proven.
The missing Claw-Onshape dashboard is expected in this isolated instance because
no plugin was installed. Production's plugin/dashboard remains separate.
For this instance, gateway authentication must use the token belonging to
`clawonshape-mcp-sprint-20261012`, with host dashboard port 19491.

The already-approved provider consent was completed with native
`openclaw mcp login onshape`, through Clawake's same pinned image and isolated
native credential mounts. A temporary one-shot native CLI container used host
networking for the native loopback OAuth callback. OpenClaw owned PKCE/state,
callback, registration, token exchange, storage and callback cleanup. A host
helper only launched the native process and browser, checked the approved
issuer/scope pair, and suppressed secret output. It implemented no OAuth or MCP
protocol. Native login exited 0 and reported credentials saved; subsequent native
status reports `hasTokens=true`, `storedState=authorized`, and
`requiresAuthorization=false`. No provider token was displayed or copied.

Authenticated `openclaw mcp probe onshape --json` returned **14 provider tools,
zero diagnostics**. All provider names match historical FINDING-015; four extra
native prompt/resource helpers are not provider additions. The probe does not
export complete input schemas. The supported public helper's owner-binding
failure described in D prevented full schema retrieval. Neither private runtime
imports nor a custom client were used to bypass this failure. No tool execution,
Candidate creation or CAD mutation occurred. Sanitized catalog evidence is in
[camera-mount-mcp-catalog-2026-10-12.json](evidence/camera-mount-mcp-catalog-2026-10-12.json).
These results supersede the earlier pending browser-consent observations.

## Follow-up — isolated runtime stopped

After the operator questioned the still-running temporary instance, Clawake's
`SystemdService.stop("clawonshape-mcp-sprint-20261012", execute=True)` completed
with exit code 0 at 2026-10-12 17:13:27 CEST. Systemd confirmed stopped and Podman
confirmed the container removed. The gateway did not finish graceful shutdown
within the managed 10-second timeout, so Podman used SIGKILL; systemd records
`failed/exit-code` (137), not an active service. Native state and OAuth credentials
remain in the isolated bind-mounted workspace; stopping is not grant revocation.
The deployment definition was retained. No production service was stopped.
