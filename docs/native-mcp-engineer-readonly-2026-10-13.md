# Native Engineer MCP read acceptance — 2026-10-13

Native MCP discovery, operation explanation, schema lookup and the assigned
Camera Mount Plate feature GET **PASS** in the existing Mechanical Engineer
container with unchanged OpenClaw 2026.9.9 (bcfc888). The one-shot CLI lifecycle
remains **PARTIAL**: every `agent exec` run exits 1 during Codex shared-client
cleanup, even when the native turn and all five MCP calls completed successfully.

This corrects the earlier conclusion that a public plugin MCP invocation handle
or an OpenClaw SDK extension was required. The agent invokes native MCP tools
directly alongside control-plane plugin tools; Claw-Onshape does not invoke or
proxy MCP. A names-only CLI probe does not establish missing agent schemas.
No OpenClaw source changes, private SDK imports or custom MCP clients were used.

## Test boundary

The test runs inside `clawcad-mechanical-engineer` using supported
`openclaw agent exec`, its existing LLM authentication and configured model,
direct tool mode, separate temporary config/state/workspace and a fresh session.
It grants only five `onshape__*` tools from the local Streamable HTTP connector;
shell, files, messaging, browser and spawning are excluded. The temporary plugin
selection contains only the model-provider plugins, avoiding a second Claw-Onshape
refresh owner. The running Gateway remains the sole Onshape refresh owner.
Production connector remains disabled; service mutation config remains absent.
The separate container on port 19491 was not the Engineer test runtime.

After operator reconnect, the mounted access-only credential is valid with
OAuth2Read. MCP has no refresh token and no independent OAuth flow. Auth status
uses `validate:false`: provider-wide identity validation is outside the exact
target read policy. Provider credential usability is established by the feature GET.

## Found and fixed server-side gap

The real native feature call initially failed before provider I/O. The OpenAPI
builder automatically supplies `Accept: application/json`, while external-token
read and mutation admission rejected any headers. Fork commit
`612de76266efedc6b1f7fcc1fafe3063837ae8da` allows only absent headers or exactly
one JSON Accept value. Other headers, duplicate values and non-JSON Accept values
remain denied. The predicate is pure core logic; filesystem/network I/O remains
in integration crates. The existing request adapter is used in the catalog test.

Full workspace Rust tests: **607 passed**. Format check and Clippy with workspace,
all targets, all features and `-D warnings`: **PASS**. No new dependencies.
Image digest: `sha256:51fff34f3180a2c2bf5ede12f89c3b88e8290640696b54131fd3c1b21c51cde6`.
Clawake applies/restarts the pinned service; health/readiness both return 200.

## Observed native calls and independent verification

All five actual calls completed successfully, recorded in the native Codex
transcript (not inferred from the model's final answer):

1. `onshape_auth_status` with `validate:false`.
2. `onshape_api_explain` for `getPartStudioFeatures`.
3. `onshape_api_explain` for `updatePartStudioFeature` (no update execution).
4. `onshape_api_schema` for `BTFeatureDefinitionCall-1406`.
5. `onshape_api_call` for `getPartStudioFeatures`, with did, wvm=w, wvmid, eid.

The operation and component tools return full inline API schemas, including the
required revision fields. Explain does not retain top-level component identifiers;
named schema lookup succeeds. The CLI still does not export raw tools/list schemas.
This test proves native argument-schema use and invocation, not a byte-for-byte
export of every tools/list descriptor or outputSchema.

Native response and independent REST at 2026-10-13T17:15:35.483Z agree:
document `8b63eacf80efca72049f8017`, Primary workspace
`1e76fac0ddca3ed10ecc9f28`, Part Studio `7768b96c15d71e78cdbdd7d9`,
feature `F37MrGsqQOiSdYi_0`, microversion `b83ee0a0efcda65537780ef8`,
feature status OK, plateWidth **50 mm**. Native serialization is 1.2.23,
libraryVersion 3095. Primary revision and pinned render hash remain unchanged.
There were zero CAD writes, no Candidate creation, approval, version or export.

See [actual tool-result evidence](evidence/native-mcp-engineer-readonly-2026-10-13.json).
Issue #1 inspection and feature-reading skills now have live native evidence.
Candidate mutation, live provider stale-write behavior and approval/attempt
handling remain separate gates.

Exactly one next task: repeat the read-only acceptance in a Gateway-owned isolated
Engineer session to establish clean lifecycle completion without the one-shot
CLI's Codex cleanup failure.
