# Interface contract: ClawOnshape ⇄ onshape-mcp

| | |
|---|---|
| Contract-Version | `0.2.0-draft` |
| Status | **draft**: derived from code, not yet accepted |
| Owner | onshape-architekt (only the architect edits this file and `fixtures/`) |
| ADR | [`docs/ADR.md`](../ADR.md) → "ADR-review-2026-10-15"; [edge-robot/clawonshape#2](https://github.com/edge-robot/clawonshape/issues/2); gap issues in §11 |
| Derived from | clawonshape `demo/gateway-native-read-20261014` @ `2457ff8` · onshape-mcp `claw-onshape/external-token` @ `1a1934a` · clawake `demo/gateway-native-read-20261014` @ `4da3957` · OpenClaw `2026.9.9` |

Normative words: **MUST**, **MUST NOT**, **SHOULD**, **MAY**. Gaps and contradictions found
while deriving this draft are marked ⚠️ and listed in §11.

---

## 0. Scope and parties

| Party | Role in this contract |
|---|---|
| **onshape-mcp** (server) | Executes Onshape REST calls for MCP tools in **external-token mode**. Sole owner of **execution admission**: target, read policy, operation enum, revision CAS, approved body, single attempt. |
| **ClawOnshape** (plugin) | Owns OAuth and refresh. Publishes the access token (channel B). Issues mutation approvals (channel C). Assesses readiness (channel D). **Is not an MCP client** (clawonshape#2). |
| OpenClaw native MCP client | Transport for agent tool calls (channel A). Third party; its configuration is listed in §2.2. |
| Clawake | Deploys and configures both sides. Third party; its obligations are listed in §1. |

Out of scope: the stdio and OAuth-HTTP modes of onshape-mcp (upstream features), the
REST control plane of ClawOnshape (inspect, render, candidate creation), and Discord/A2A.

## 1. Topology and lifecycle

```
Engineer container (OpenClaw + ClawOnshape)            clawonshape-mcp container
  native MCP client ──── HTTP /mcp ───────────────────►  onshape-mcp http  ──► https://cad.onshape.com/api/v10|v16
  plugin ── writes ──► <credentialDirectory>/access-token.json  ──(ro mount)──► [external_token] file
  plugin ── writes ──► <approvalDirectory>/approved-update.json ──(ro mount)──► mutation_approval_file
  plugin ── GET /health ─────────────────────────────►
```

| Item | Contract |
|---|---|
| Lifecycle owner | **Clawake** quadlet service `clawonshape-mcp`. The plugin MUST NOT start, stop or restart the server. |
| Command | `onshape-mcp --config /run/onshape-config/config.toml http` |
| Network | Private Podman network `clawonshape-mcp-private`; base URL `http://clawonshape-mcp:8080`. No published host port. Egress only to `cad.onshape.com`. |
| Image | Pinned by immutable digest. Clawake rejects images without a digest. |
| Mounts | `credentialDirectory`: rw in the Engineer, **ro** in the server. `approvalDirectory`: rw in the Engineer, **ro** in the server. Config file: ro in the server. |
| File ownership | The server validates that the file and its parent are owned by **its own UID**, with no group or other bits (§3, §4). Writer and reader MUST therefore resolve to the same host UID through the Podman user-namespace mapping. ⚠️ G7 |
| Start order | No ordering is required. Until channel B holds a valid token, the server is live but not ready (§5). |
| Restart | The server is stateless and re-reads both files on every dispatch. A restart MUST NOT cause a retry of an earlier mutation. |
| Healthcheck | Today: `curl --fail http://127.0.0.1:8080/health`. Planned: `onshape-mcp healthcheck` for a distroless image. That is a minor change, server first, then Clawake. |

## 2. Channel A: MCP over Streamable HTTP

### 2.1 Endpoint and protocol

| Item | Value |
|---|---|
| URL | `http://clawonshape-mcp:8080/mcp` |
| Transport | MCP Streamable HTTP via `rmcp` 3.4 (`StreamableHttpService`, `LocalSessionManager`) |
| `public_url` | MUST be `http://…/` with path `/`, no query and no userinfo. Otherwise startup fails with `external_token_local_url_required` or `external_token_local_url_invalid`. |
| Auth on `/mcp` | None at the HTTP layer. The private network is the boundary; the Onshape credential comes from channel B. ⚠️ G8 |
| `tools/list` cache | `ttl` = `STATIC_MCP_CACHE_TTL_MS`, scope `public` |

### 2.2 Native client configuration (provisioned by Clawake, `runtime_config.py`)

```json
{"mcp":{"servers":{"onshape":{
  "transport":"streamable-http","url":"http://clawonshape-mcp:8080/mcp","enabled":true,
  "requestTimeoutMs":30000,"connectionTimeoutMs":5000,
  "toolFilter":["onshape_auth_status","onshape_api_explain","onshape_api_schema","onshape_api_call"]}}}}
```
Agent-visible names carry the server prefix, e.g. `onshape__onshape_api_call`.

### 2.3 Tools (external-token mode)

In external-token mode the server lists **exactly** these tools. Every other tool call
fails with `external_token_tool_denied`.

| Tool | Effect | Annotations | Required input | Exposed to Engineer |
|---|---|---|---|---|
| `onshape_auth_status` | read (local); `validate: true` calls `GET /users/sessioninfo` ⚠️ G12 | `readOnlyHint: false`, `destructiveHint: false` | none (optional `validate`) | yes |
| `onshape_api_search` | read (local catalog) | `readOnlyHint: true` | `query` (+ `method`, `tag`) | **no** (not in `toolFilter`) |
| `onshape_api_explain` | read (local catalog) | `readOnlyHint: true` | `endpoint` | yes |
| `onshape_api_schema` | read (local catalog) | `readOnlyHint: true` | `schema` | yes |
| `onshape_api_call` | read **or mutation**, decided by the HTTP method | `readOnlyHint: false`, `destructiveHint: true` | `endpoint` (+ `path_params`, `query_params`, `header_params`, `body`, `file_refs`) | yes |

The authoritative tool definitions (names, descriptions, annotations, input schemas) are
the **snapshot** `fixtures/mcp-tools.json`, generated from the Rust `schemars` types (§10).
Its order is the server's `tools/list` order. The snapshot was generated by the architect
from onshape-mcp `claw-onshape/external-token` @ `1a1934a`; rust-mcp-dev moves the
generation into a contract test (G1).

### 2.4 Read admission (`onshape_api_call`, method GET)

A read is admitted only if all of these hold: method `GET`, no body, **no query
parameters**, only JSON response headers, and the path is one of:

- `/documents/{d}`
- `/documents/d/{d}/workspaces`
- `/documents/d/{d}/w/{w}/currentmicroversion`
- `/documents/d/{d}/w/{w}/elements`
- `/partstudios/d/{d}/w/{w}/e/{e}/features`
- `/documents/d/{d}/m/{mid}/elements`
- `/partstudios/d/{d}/m/{mid}/e/{e}/features`

`{d}`, `{w}` and `{e}` are the configured `[external_token]` target. `{mid}` is any
24-hex id. A violation yields `external_token_read_policy_denied` before any provider
I/O. The API base is `v10`, or `v16` when `read_api_version = "v16"`.

### 2.5 Mutation admission (`onshape_api_call`, method other than GET)

Evaluated in this order. The first failure wins, and **no provider I/O** happens before
step 6:

| # | Check | Error |
|---|---|---|
| 1 | `[external_token.mutation]` is present | `target_policy_denied` |
| 2 | `write_mode = "modify"`; method `POST`; `allowed_operations` contains `updatePartStudioFeature`; no query parameters; JSON headers only | `target_policy_denied` |
| 3 | Path = `/partstudios/d/{d}/w/{w}/e/{e}/features/featureid/{fid}` on the exact policy target. The workspace is not in `excluded_workspace_ids`. `{fid}` is valid and equals `feature_id` if one is configured. `body.feature.featureId == {fid}` | `target_policy_denied` |
| 4 | `body.sourceMicroversion == expected_microversion` and `body.rejectMicroversionSkew == true` | `revision_policy_denied` |
| 5 | If `mutation_approval_file` is configured: the file is valid (§4) and `approval.body` equals the request body exactly | `mutation_approval_unavailable` / `mutation_approval_mismatch` |
| 6 | Token valid (§3) **and** scopes contain `OAuth2Write` | `external_token_*` / `external_token_write_scope_missing` |
| 7 | Single-attempt dispatch to `https://cad.onshape.com/api/v16` | see §6 (`UNKNOWN`) |

⚠️ G2: step 5 is optional in the server. ⚠️ G3: `expected_microversion` and the
workspace are static in the config.

## 3. Channel B: credential handoff `access-token.json`

| Item | Contract |
|---|---|
| Producer / consumer | ClawOnshape `publishMcpCredential` → onshape-mcp `[external_token] file` |
| Path | `<credentialDirectory>/access-token.json`. In the server: `/run/onshape-credentials/access-token.json`, absolute and canonical (no symlinks). |
| Directory | Owned by the reader's UID, mode with no group or other bits (`0700`) |
| File | Regular file, `nlink == 1`, owner = reader's UID, mode `0600`, opened with `O_NOFOLLOW`, **≤ 16 384 bytes** |
| Write | Atomic replace via `openclaw/plugin-sdk/secret-file-runtime` `writePrivateSecretFileAtomic` |
| Schema | `{"accessToken": string, "expiresAt": integer (Unix ms), "scopes": string[]}` with **no additional properties**, **or** the JSON literal `null` (= revoked or unavailable) |
| Field rules | `accessToken`: 1–8192 chars, no whitespace. `scopes`: ≤ 32 entries, MUST contain `OAuth2Read`; `OAuth2Write` is required for mutations. `expiresAt`: safe integer > 0 |
| MUST NOT contain | refresh token, client id or secret, resource URL, any other metadata |
| Validity | The server treats the token as expired when `expiresAt ≤ now + 30 000 ms` (`external_token_expired`). The plugin uses the same margin for readiness (`EXPIRED`). |
| Refresh | The plugin re-syncs every **15 000 ms** under its refresh lock. The server **never** refreshes and re-reads the file on every dispatch. |
| Revocation | The plugin writes `null` on refresh failure, on disconnect and on plugin `dispose`. |
| Fixtures | `fixtures/access-token/valid/*.json`, `fixtures/access-token/invalid/*.json` |

## 4. Channel C: mutation approval `approved-update.json`

| Item | Contract |
|---|---|
| Producer / consumer | ClawOnshape `mutationStore.approve` → onshape-mcp `mutation_approval_file` |
| Path | `<approvalDirectory>/approved-update.json`, absolute and canonical |
| Directory and file | Same private-file rules as §3; **≤ 1 048 576 bytes** |
| Write | Atomic replace (`writePrivateSecretFileAtomic`). The plugin persists its own receipt as `UNKNOWN` **before** it publishes the approval. |
| Schema | `{"version": 1, "proposalId": uuid-v4, "expiresAt": integer (Unix ms), "requestHash": string, "payloadHash": sha256-hex, "body": object}`, or the JSON literal `null` (= no active approval) |
| Fields the server checks | `version == 1`, `expiresAt > now`, `proposalId` non-empty, `body` deep-equals the request body |
| Fields the server ignores | `requestHash`, `payloadHash`: audit fields for the plugin's receipts. ⚠️ G4 |
| Lifetime | `expiresAt = approvedAt + 300 000 ms` (5 min) |
| Reset | After a successful `reconcile` (receipt `VERIFIED`) the plugin writes `null`. ⚠️ G5: an expired approval is not reset automatically. |
| One-at-a-time | While any receipt is `UNKNOWN`, the plugin MUST NOT issue a new proposal or approval (`mutation_reconciliation_required`). |
| Fixtures | `fixtures/approved-update/valid/*.json`, `fixtures/approved-update/invalid/*.json` |

## 5. Channel D: health and readiness

| Probe | Producer | Contract |
|---|---|---|
| `GET /health` | server | `200` once listening. Liveness only; it does not prove credentials or provider access. |
| `GET /health/ready` | server | `200` if channel B currently loads (§3), otherwise `503` |
| Plugin liveness check | plugin | `GET http://clawonshape-mcp:8080/health`, timeout **2 000 ms**, `redirect: 'error'`. `200` → `running: true`, anything else or an error → `running: false` |
| Plugin credential check | plugin | Reads channel B with the same rules. Result `AVAILABLE`, `EXPIRED` or `MISSING`; anything unparseable → `UNKNOWN` |
| `openclaw mcp status --json` | native CLI | Timeout 15 000 ms, ≤ 1 MiB. Projected fields: `servers[name=onshape].{configured,enabled,ok,auth,authStatus.{hasTokens,requiresAuthorization,expiresAt}}`. Anything malformed → `UNKNOWN`. Reference: https://docs.openclaw.ai/cli/mcp/json-output |
| `openclaw mcp probe onshape --json` | native CLI | Operator-only. Timeout 20 000 ms, ≤ 1 MiB. `{tools: string[] (≤256, unique, /^[a-zA-Z0-9_-]{1,160}$/), diagnostics: []}`; otherwise `mcp_discovery_failed` |

⚠️ G6: the plugin uses `/health`, not `/health/ready`.

## 6. Errors

Returned as MCP errors (`invalid_request` unless noted). The **code string is the contract**.

| Code | Channel | Meaning | Retry | Consumer action |
|---|---|---|---|---|
| `external_token_tool_denied` | A | tool not available in external-token mode | no | none; fix the tool choice |
| `external_token_read_policy_denied` | A | GET outside the fixed read set (§2.4) | no | correct the request shape; OAuth consent cannot fix it |
| `target_policy_denied` | A | mutation outside the policy (§2.5 steps 1–3) | no | escalate to the operator |
| `revision_policy_denied` | A | baseline or skew flag wrong (§2.5 step 4) | no | re-read the baseline, new proposal |
| `target_configuration_invalid` / `external_token_configuration_invalid` | A | server config invalid | no | Clawake or operator fixes the config |
| `mutation_approval_unavailable` | A, C | approval file missing, insecure or unreadable | no | issue an approval through the plugin |
| `mutation_approval_mismatch` | A, C | approval expired, `null`, or body differs | no | new proposal and approval |
| `external_private_file_unavailable` | B, C | private-file checks failed (internal; surfaces as one of the codes above) | no | fix ownership or mode |
| `external_token_unavailable` | A, B | token file missing, `null` or invalid | no | plugin re-sync or reconnect |
| `external_token_expired` | A, B | `expiresAt ≤ now + 30 s` | after re-sync | wait for plugin refresh |
| `external_token_write_scope_missing` | A, B | mutation without `OAuth2Write` | no | operator grants write consent |
| `external_token_client_unavailable` | A | HTTP client could not be built (`internal_error`) | no | operator |
| `external_token_request_failed` | A | read dispatch failed (`internal_error`) | yes, for reads only | caller MAY retry the read |
| `mutation_outcome_unknown_reconcile_required` | A | mutation transport failure, 5xx, 3xx or 408 (`internal_error`). `data: {"outcome":"UNKNOWN","retryAllowed":false,"reconciliationRequired":true}` | **never** | plugin `onshape_reconcile_update`; no new attempt until reconciled |
| `external_token_auth_owned_externally` | CLI | `auth login` in external-token mode | no | none |
| `external_token_local_url_required` / `_invalid`, `external_token_validation_unavailable` | startup | server refuses to start | no | Clawake or operator |
| `mcp_execution_disabled`, `mcp_discovery_failed`, `invalid_mcp_server`, `native_mcp_status_unavailable` | plugin | plugin-side MCP projection errors | no | operator |
| `mutation_reconciliation_required`, `mutation_approval_unavailable` (plugin), `source_revision_conflict`, `primary_revision_changed`, `mutation_outcome_unknown`, `mutation_verification_mismatch`, `protected_primary_workspace`, `mcp_credential_unavailable`, `mcp_credential_handoff_unavailable` | plugin | proposal, approval, reconciliation and handoff errors | no | per the plugin workflow |

Machine-readable list: `fixtures/error-codes.json`.

## 7. Timeouts and limits

| Item | Value | Owner |
|---|---|---|
| Server → Onshape request timeout (`[api] timeout`) | 30 s | server config (Clawake) |
| Native client `requestTimeoutMs` | 30 000 ms | Clawake. ⚠️ G9 |
| Native client `connectionTimeoutMs` | 5 000 ms | Clawake |
| Token expiry margin | 30 000 ms | both sides |
| Token re-sync interval | 15 000 ms | plugin |
| Approval lifetime | 300 000 ms | plugin |
| Plugin `/health` timeout | 2 000 ms | plugin |
| `mcp status` / `mcp probe` timeout | 15 000 / 20 000 ms | plugin |
| Token file / approval file size | 16 384 B / 1 048 576 B | server |
| `accessToken` length / `scopes` count | 8 192 / 32 | server |
| Proposal body (plugin) | ≤ 900 000 B canonical JSON | plugin |

## 8. Security invariants

1. No refresh token, client secret or OAuth client id crosses any channel.
2. The server never refreshes, never runs an OAuth flow and never writes channel B or C.
3. The plugin never executes MCP calls and never proxies `/mcp` (clawonshape#2).
4. The server is the only hard admission boundary for agent-originated Onshape calls.
   Plugin-side checks are defence in depth only.
5. A mutation is dispatched **at most once**. An uncertain outcome is `UNKNOWN`. Nobody
   retries. A new attempt requires reconciliation first.
6. Primary workspaces are listed in `excluded_workspace_ids` and are never written.
7. Every invalid, missing, expired or unparseable input on any channel fails closed.
8. **Deployment invariant:** whenever `[external_token.mutation]` is configured,
   `mutation_approval_file` MUST be configured as well. ⚠️ G2

## 9. Versioning and compatibility

- **patch:** wording only.
- **minor:** additive (new tool, new optional field, new error code with a generic fallback).
- **major:** removal or rename, semantic change, new required field, stricter admission,
  shorter timeout or limit.
- **Order:** the consumer becomes tolerant first, then the producer switches. In
  practice: **server → plugin → Clawake**. Breaking changes run in four steps: expand,
  migrate, live E2E, contract. Exception: security tightening may ship server and
  plugin together, pinned in Clawake.
- **Compatibility matrix.** Clawake deploys only rows marked accepted:

| Contract | onshape-mcp image | ClawOnshape | OpenClaw | Status |
|---|---|---|---|---|
| 0.1.0-draft | `localhost/clawonshape-mcp@sha256:defe0ab2…` (running 2026-10-15; source commit to be confirmed) | 0.2.8 @ `2457ff8` | 2026.9.9 | observed, not accepted |

## 10. Fixtures

| Path | Kind | Consumed by |
|---|---|---|
| `fixtures/mcp-tools.json` | code-first snapshot of `tools/list` in external-token mode | Rust `tests/contract.rs` (exact match) |
| `fixtures/access-token/valid/*.json` | contract-first | Rust: accepted by `Credential`/`load`. TS: writer output matches structurally |
| `fixtures/access-token/invalid/*.json` | contract-first | Rust: rejected with the code in `fixtures/expectations.json`. TS: readiness reader rejects |
| `fixtures/approved-update/valid/*.json` | contract-first | Rust: `approval_matches` accepts against its paired request. TS: `approve` output matches structurally |
| `fixtures/approved-update/invalid/*.json` | contract-first | Rust: rejected with the expected code |
| `fixtures/error-codes.json` | contract-first | both: every emitted code is listed |
| `fixtures/expectations.json` | index | both: fixture → expected result or code |

The architect copies `fixtures/` with a `VERSION` file to
`onshape-mcp/crates/onshape-mcp-core/tests/contract/` and `clawonshape/tests/contract/`.
`VERSION` has two lines: the contract version, then `sha256:<hex>` computed in the
fixtures directory as

```sh
find . -type f ! -name VERSION -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum
```

Consumers MUST check line 1 against the version their prompt names.

## 11. Open gaps and contradictions

| ID | Finding | Evidence | Proposed resolution | Tracking |
|---|---|---|---|---|
| G1 | `mcp-tools.json` did not exist. The existing snapshot `onshape-api-tools.json` lacks `onshape_auth_status`, and the external-token allowlist is duplicated in `onshape-mcp-io` (list and call) and not testable in core. | `onshape-mcp-core/tests/fixtures/onshape-api-tools.json`; `onshape-mcp-io/src/lib.rs` (external-token `retain`) | Architect generated the snapshot (0.2.0-draft). rust-mcp-dev moves the allowlist into `onshape-mcp-core` and adds the exact-match contract test. | [edge-robot/onshape-mcp#1](https://github.com/edge-robot/onshape-mcp/issues/1) |
| G2 | The approval file is **optional** in the server. If it is absent, a mutation passes with target policy and CAS only. Conflicts with the "ClawOnshape issues approvals" ownership. | `external_token.rs` `execute` (`if mutation && let Some(file)`); `docs/target-policy.md` ("optionally") | Clawake validation rejects `mutation` without `mutation_approval_file` (invariant §8.8). Optionally a server flag `require_approval`. | [edge-robot/onshape-mcp#2](https://github.com/edge-robot/onshape-mcp/issues/2) (Clawake part split off when decided) |
| G3 | Dynamic candidate target: workspace and `expected_microversion` are pinned in `config.toml`. | `target_policy.rs` `TargetConstraint` | Open question 1 in clawonshape#2: reprovisioning vs. approval-file claims. If claims are chosen, channel C gets a **major** change. | [edge-robot/clawonshape#3](https://github.com/edge-robot/clawonshape/issues/3), clawonshape#2 |
| G4 | `requestHash` and `payloadHash` are ignored by the server, which matches on the full body only. | `approval_matches` | Keep as audit fields. A future claim-based approval would use `payloadHash`. | [edge-robot/clawonshape#4](https://github.com/edge-robot/clawonshape/issues/4) (proposed: accepted) |
| G5 | An expired approval stays on disk until a reconcile. The server rejects it as `mutation_approval_mismatch`, not `unavailable`. | `mutation-workflow.ts`; `approval_matches` | Accept as is, or the plugin writes `null` on expiry. Decide when the dashboard status model is built. | [edge-robot/clawonshape#5](https://github.com/edge-robot/clawonshape/issues/5), clawonshape#2 (MVC) |
| G6 | Plugin readiness uses `/health` (liveness), not `/health/ready`. | `src/mcp.ts` `localMcpReadiness` | Plugin additionally probes `/health/ready` → field `ready`. Minor change. | [edge-robot/clawonshape#6](https://github.com/edge-robot/clawonshape/issues/6) |
| G7 | Private-file checks require the same UID for writer (Engineer) and reader (server) across containers. This is undocumented in Clawake. | `private_json` (`uid == /proc/self` owner) | Clawake documents and validates the UID mapping. | [edge-robot/clawake#16](https://github.com/edge-robot/clawake/issues/16) |
| G8 | `/mcp` has no HTTP authentication. Any container on the private network can call the tools with the operator's token. | `external_token.rs` `run_http` | Accept: only the Engineer joins the network. Clawake asserts the network membership. Revisit with VC/VP. | [edge-robot/clawonshape#7](https://github.com/edge-robot/clawonshape/issues/7) (ADR note pending) |
| G9 | Client `requestTimeoutMs` (30 s) equals the server's Onshape timeout (30 s). The client can give up while the server's mutation is still in flight, so the agent never sees `UNKNOWN`. | `runtime_config.py`; `[api] timeout = 30` | Client timeout MUST exceed the server timeout plus a margin, e.g. 45 000 ms. | [edge-robot/clawake#17](https://github.com/edge-robot/clawake/issues/17) |
| G10 | `clawonshape/spec.md` says "MCP CAD execution: Disabled" and "discovered tools remain disabled". The live Engineer has native MCP with `onshape_api_call` enabled. | `spec.md:35`, `spec.md:79`; clawonshape#2 comment | spec drift issue, as announced in clawonshape#2 | [edge-robot/clawonshape#8](https://github.com/edge-robot/clawonshape/issues/8) |
| G11 | The running server image digest is not mapped to a source commit. | `podman ps` 2026-10-15 | Clawake records the source commit with the digest. Fill in the matrix in §9. | [edge-robot/clawake#18](https://github.com/edge-robot/clawake/issues/18) |
| G12 | `onshape_auth_status` with `validate: true` issues `GET /users/sessioninfo`, which is not in the read set (§2.4). The outcome in external-token mode is unverified (likely `external_token_read_policy_denied` or a validation error). | `tools.rs` `AuthStatusInput`; `external_token.rs` `allowed` | rust-mcp-dev documents the actual behaviour with a test in the G1 prompt; decide afterwards. | [edge-robot/onshape-mcp#1](https://github.com/edge-robot/onshape-mcp/issues/1) (investigation) |

## Changelog

- `0.2.0-draft` (2026-10-15): add the code-first snapshot `fixtures/mcp-tools.json` (G1), define the `VERSION` file format, record `onshape_auth_status` annotations, link the gap issues in §11, add G12. Minor: additive fixture, no behaviour change.
- `0.1.0-draft` (2026-10-15): initial draft derived from code by onshape-architekt setup.
