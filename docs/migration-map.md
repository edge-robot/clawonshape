# Research and migration map

Research date: 2026-10-09. Reference [branch](https://github.com/edge-robot/clawcad/tree/feat/mechanical-engineer-plugin): `edge-robot/clawcad:feat/mechanical-engineer-plugin`, locally inspected at `6d8313267e86fca31f271b821d7fbbf940b9b0c1`. GitHub's `git/ref/heads/feat/mechanical-engineer-plugin` API independently confirmed this head; retrieval of `plugin/index.mjs` confirms the same agent factory design. ClawCAD and Clawake were read only.

Evidence labels: **VERIFIED** means directly inspected source/contract or recorded live evidence (identified below); **IMPLEMENTED BUT UNVERIFIED** means executable implementation with offline tests, without live acceptance; **DOCUMENTED** means a stated direction or unsupported acceptance claim; **MISSING** means not established by this review. Historical live evidence is not a new Claw-Onshape live test.

| Capability | ClawCAD source file/function | Evidence | Reuse decision | Claw-Onshape implementation |
| --- | --- | --- | --- | --- |
| Native plugin / role exclusion | `plugin/index.mjs:register`; `plugin/openclaw.plugin.json`; `plugin/package.json` | VERIFIED source; `tests/clawcad_plugin.test.mjs` checks Engineer factories and Lead exclusion | Reuse optional factory pattern, rewrite in TS | `src/index.ts`, requester and agent binding checked again at execution |
| Inspection helpers | `plugin/inspection.mjs:prepareInspection,compareInspections` | IMPLEMENTED BUT UNVERIFIED provider semantics; tests use synthetic BTFS data and explicitly return source_revisions_verified=false | Do not migrate FeatureScript abstraction | Bounded REST inspection only |
| Packaging / Clawake assignment | `tools/prepare_plugin.py:build_archive,assigned_inventory`; `tests/test_plugin_package.py` | VERIFIED source; deterministic archive and inventory preservation. `docs/implementation/mechanical-engineer-plugin.md` records installed smoke and tools.catalog, unresolved duplicate discovery/provenance-invalid | Use npm package; no inventory generator or Clawake changes | Package manifest, explicit optional tool grants |
| Plugin-only architecture | `docs/specifications/AMD-003-mechanical-engineer-plugin.md`; `docs/findings/FINDING-016-plugin-only-direction.md` | DOCUMENTED accepted direction superseding older standalone requirements | Keep runtime/deployment ownership, omit service/workflow | Single native plugin |
| Native hosted MCP login | `docs/findings/FINDING-015-hosted-mcp-write-boundary.md`; `docs/implementation/openclaw-mcp-cad-write.md` | VERIFIED historical observation: OpenClaw 2026.9.4 owner OAuth, scope `OAuth2Read OAuth2Write`, URL `https://fs-mcp.labs.onshape.app/mcp`; no CAD call | Native MCP resource authentication remains separate | Native CLI discovery, no token forwarding |
| MCP write safety | same finding; `deploy/demo/plugin/mcp-guard.mjs`; `tests/mcp_guard.test.mjs`; `src/clawcad/mcp_execution.py`; `tests/test_mcp_execution.py` | IMPLEMENTED BUT UNVERIFIED native hook traversal; provider catalog lacks required targeting/revision contracts | Omit old gate/workflow engine; disable all tool calls | Discovery classifies every name as disabled; execution always rejects |
| Historical architecture | `docs/specifications/AMD-002-openclaw-cad-execution.md` | DOCUMENTED now superseded standalone workflow assignment | No service, DB, broker, events, custom revisions, agents or A2A bridge | Onshape owns versions/workspaces; merge disabled |
| REST OAuth consent/exchange | `src/clawcad/operator/oauth.py:ConsentAttempt,OAuthExchange,update_tokens`; `docs/implementation/onshape-oauth-local.md` | VERIFIED source and historical live read consent; `tests/test_operator_oauth.py:test_registration_and_code_exchange_contract,test_bad_callback_denied_before_network,test_expired_and_replayed_callback` are mock contracts | Rewrite minimal read-only client_secret_post exchange; no shared secret | `src/oauth.ts`, local CLI callback, host private secret-file storage |
| Read + Write consent | `tests/test_operator_oauth.py:test_write_consent_is_explicit_persisted_and_does_not_enable_write_capability`; `docs/findings/FINDING-015-hosted-mcp-write-boundary.md` | VERIFIED historical consent, not CAD write authorization/acceptance | MVP requests only OAuth2Read | No write consent or mutation execution |
| Refresh / reconnect | `operator/oauth.py:OperatorOAuthAuth`; `tests/test_operator_oauth.py:test_refresh_rotates_under_lock_and_bearer_is_sent_only_to_rest,test_concurrent_refresh_runs_only_once,test_ambiguous_refresh_is_not_retried,test_disconnect_cancels_pending_callback_and_reconnect_works` | IMPLEMENTED BUT UNVERIFIED live expiry/rotation/revocation, explicitly offline in acceptance doc | Avoid concurrent refresh complexity | Expiry/401 requires reconnect; refresh not implemented |
| Live REST read/render | `operator/readonly.py:planned_requests,ReadOnlyOnshapeProbe.inspect`; `operator/render.py:shaded_path,render_current`; `docs/implementation/onshape-oauth-acceptance.md`; `docs/implementation/readonly-discord-demo.md` | VERIFIED recorded 2026-10-07 OAuth GET inspection + pinned render, PNG 42,710 bytes SHA256 `3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26`; tests `test_onshape_readonly.py:test_mocked_readonly_three_requests_and_allowlisted_output`, `test_onshape_render.py:test_render_pins_microversion_and_preserves_provider_bytes` are mocked | Preserve REST contracts; do not copy Python/image decoder | Document/workspace/element reads; rendering deferred |
| REST mutations | `src/clawcad/onshape/rest.py:OnshapeRestAdapter.create_candidate_workspace,update_feature_parameters,create_immutable_version`; `tests/test_onshape_contract.py`; `tests/test_onshape_http.py` | IMPLEMENTED BUT UNVERIFIED MockTransport-only adapter; live transport constructor rejected | Do not migrate fixed CAD catalog | Target guard foundation, all writes disabled |
| Credential broker | `docs/implementation/connection-broker-foundation.md`; `src/clawcad/connections/{store,broker,provisioning}.py`; `tests/test_connection_foundation.py` | IMPLEMENTED BUT UNVERIFIED live composition, mock-only identity verifier | Do not migrate SQLite/encrypted history/leases | Native private credential files, minimal config references |

## Exact REST and OAuth contracts

REST base `https://cad.onshape.com/api/v10/`; native fetch rejects redirects and uses fixed constructed paths. Historic inspection: `GET documents/{did}`, `GET documents/d/{did}/{w|v|m}/{referenceId}/elements`, `GET partstudios/d/{did}/{w|v|m}/{referenceId}/e/{eid}/features`. Additional MVP membership query: `GET documents/d/{did}/workspaces`, no query parameters. Official [DocumentsApi.md](https://github.com/onshape-public/onshape-clients/blob/master/python/docs/DocumentsApi.md) was inspected (blob `e19fc73ea5bd1607d22bd1bfc63456edb3a6c435`): `get_document_workspaces` returns the document's workspaces. Its unversioned generated path supports the endpoint family; current v10 response acceptance remains mocked. The same official table records native `POST /api/documents/{did}/workspaces/{wid}/merge`, deferred here.

Rendering: `GET https://cad.onshape.com/api/v10/partstudios/d/{did}/m/{sourceMicroversion}/e/{eid}/shadedviews`; query `viewMatrix`, `outputWidth`, `outputHeight`, `pixelSize=0`, `edges=show|hide`, `useAntiAliasing=false`. ClawCAD accepts 500/800/1200 sizes, front/top/isometric, pins the inspected microversion. Deferred here.

Historical mock mutation contracts: `POST documents/d/{did}/workspaces` body includes `versionId`; `POST partstudios/d/{did}/w/{wid}/e/{eid}/features/featureid/{fid}` with preserved feature, `sourceMicroversion`, `rejectMicroversionSkew`; `GET documents/d/{did}/w/{wid}/currentmicroversion`; `POST documents/d/{did}/versions` body `workspaceId,microversionId`; `GET partstudios/d/{did}/v/{vid}/e/{eid}/stl` with explicit text/millimeter options. No migration of these writes. Native merge is deferred, not replaced with a local history.

`GET https://oauth.onshape.com/oauth/authorize`: `client_id,response_type=code,redirect_uri=http://localhost:8765,scope=OAuth2Read,state`. `POST https://oauth.onshape.com/oauth/token`, form content type: `grant_type=authorization_code,code,client_id,client_secret,redirect_uri`. Historical refresh uses same POST with `grant_type=refresh_token,refresh_token,client_id,client_secret`; not implemented here. Official profile endpoint `GET https://cad.onshape.com/api/users/sessioninfo`; canonical account verification remains deferred. Official [OAuth guide](https://onshape-public.github.io/docs/auth/oauth/) inspected; registration in individual/company developer settings is required. PKCE/public-client support for REST was **MISSING** in inspected contracts; do not promise secret-free public distribution or one-click onboarding.

## Observed hosted MCP catalog and bypass review

Historical account exposed 14 tools; future catalogs may differ. No annotation grants authority. Every tool below is disabled, including reads that could disclose unrelated document data.

| Tool | Observed parameters | Reason disabled |
| --- | --- | --- |
| create_feature_studio | did,wid,name,contents | Write; no revision precondition |
| create_geometry | feature_name,feature_code,clean | No did/wid/eid; configured sandbox and cleanup bypass target policy |
| edit_featurescript_notes | old_text,new_text | Unscoped write |
| get_api_usage | none | Account scope outside selected context |
| get_featurescript | did,wvm,wvmid,eid | Read needs enforced target wrapper, not implemented |
| list_feature_studios | did,wid | Read needs target wrapper |
| logout | confirm | Credential lifecycle side effect |
| put_featurescript | did,wid,eid,code | Write lacks revision precondition |
| read_featurescript_notes | none | Unscoped read |
| search_featurescript_documentation | topic | Documentation only but not exposed in MVP |
| set_api_allocation | company_id | Account mutation |
| test_feature | code | Evaluation effects/target not constrained |
| test_featurescript | code | Evaluation effects/target not constrained |
| whoami | none | Identity data not exposed to agent |

## Current OpenClaw verification

GitHub [latest release](https://github.com/openclaw/openclaw/releases/tag/v2026.9.9) API returned stable `v2026.9.9`, published 2026-10-08, release SHA `bcfc88812a35243893585dbeca87ca41b48272ca`. Source pinned to that tag was inspected through the GitHub connector. Shell DNS is unavailable and no local OpenClaw executable was found: real runtime loading is **MISSING**, not certified by mock registration tests.

| Capability | Official source at v2026.9.9 | Finding / decision |
| --- | --- | --- |
| Plugin loading/manifest | `docs/plugins/manifest.md`, `docs/plugins/sdk-overview.md`, `src/plugins/plugin-api.types.ts` | VERIFIED TS entries and JSON config schema; experimental APIs, pin host |
| Agent tool factory | `src/plugins/tool-types.ts` | VERIFIED `agentId`, `requesterSenderId`, `messageChannel`, `agentAccountId`, optional `assertInvocationCurrent`; use trusted context, never tool args |
| Authentication | `src/plugins/runtime/types-core.ts`, `src/plugin-sdk/secret-ref-readonly.ts` | VERIFIED model auth APIs are model/provider oriented; arbitrary Onshape REST OAuth integration not established |
| Secure files | `src/plugin-sdk/secret-file-runtime.ts`, `src/infra/secret-file.ts`, `src/infra/secret-file.test.ts` | VERIFIED native private atomic writes; read symlink denial is opt-in. Supply rejectSymlink and own private mode/ownership checks; separate credential files, no tokens in config/session/tool results. No OS-keyring/encryption claim |
| Native loader check | `src/cli/plugins-cli.ts`, `src/cli/plugins-inspect-command.ts` | VERIFIED `info` alias of `inspect`; default metadata-only, `--runtime` loads runtime. JSON nests status under `plugin.status`; test:host uses exact contract |
| Minimal persistence | `src/plugins/runtime/types-core.ts` | VERIFIED state.resolveStateDir/config.current facilities; persist target and identity bindings through host plugin config |
| MCP | `src/cli/mcp-cli.ts:readMcpProbeResult,registerMcpCli`; `src/config/zod-schema.mcp-server.ts`; `src/plugins/types.mcp-connection.ts` | VERIFIED native OAuth/per-requester resolver and `mcp probe --json`; no public plugin-owned catalog/call runtime facade established. Use native CLI discovery only, no SDK needed |
| MCP probe output | `src/cli/mcp-cli.ts:readMcpProbeResult` | Names only, projected by native runtime; no schemas. Filter cannot infer safe calls; deny every operation |
| UI | `src/plugins/host-hooks.ts:PluginControlUiDescriptor`, `docs/plugins/sdk-overview.md` | VERIFIED custom tab descriptor/HTTP route exists but custom UI lab default-off; secure Connect surface not demonstrated. Use configuration + operator CLI; no dashboard server |
| CLI | `src/plugins/plugin-registration.types.ts`, `docs/plugins/sdk-overview/cli-and-discovery.md` | VERIFIED registerCli receives Commander, descriptors support lazy roots |

The onboarding alternative is a user/company registered confidential OAuth application on an operator-controlled OpenClaw host. Client secret resides in a privately provisioned file. CLI Connect runs a temporary loopback callback listener, never a standalone service. Remote/container hosts require localhost routing to the same listener; no arbitrary callback substitution. Broad distribution requires a verified Onshape public-client contract or a separately approved vendor model; neither is implemented. Clawake remains responsible for installation, config and restart. Tools do not implement A2A or promotion authorization.
