# Interface contract: ClawOnshape ⇄ onshape-mcp

| | |
|---|---|
| Contract-Version | `1.2.0-draft` |
| Status | **draft**: derived from code, not yet accepted |
| Owner | onshape-architekt (only the architect edits this file and `fixtures/`) |
| ADR | [`docs/ADR.md`](../ADR.md) → "ADR-review-2026-10-15"; [edge-robot/clawonshape#2](https://github.com/edge-robot/clawonshape/issues/2); gap issues in §11; [edge-robot/clawonshape#5](https://github.com/edge-robot/clawonshape/issues/5), [#10](https://github.com/edge-robot/clawonshape/issues/10) (0.3.0); [#12](https://github.com/edge-robot/clawonshape/issues/12) (0.4.0); [#14](https://github.com/edge-robot/clawonshape/issues/14) (1.0.0, ADR-2026-10-16); [#18](https://github.com/edge-robot/clawonshape/issues/18), [edge-robot/onshape-mcp#5](https://github.com/edge-robot/onshape-mcp/issues/5) (1.1.0, ADR-2026-10-21) |
| Derived from | clawonshape `demo/gateway-native-read-20261014` @ `2457ff8` · onshape-mcp `claw-onshape/external-token` @ `1a1934a` · clawake `demo/gateway-native-read-20261014` @ `4da3957` · OpenClaw `2026.9.9` |

Normative words: **MUST**, **MUST NOT**, **SHOULD**, **MAY**. Gaps and contradictions found
while deriving this draft are marked ⚠️ and listed in §11.

---

## 0. Scope and parties

| Party | Role in this contract |
|---|---|
| **onshape-mcp** (server) | Executes Onshape REST calls for MCP tools in **external-token mode**. Sole owner of **execution admission**: target, read policy, operation enum, revision CAS, approved body, single attempt; for goals (§12) also grant scope, budget, STOP and the durable dispatch journal. |
| **ClawOnshape** (plugin) | Owns OAuth and refresh. Publishes the access token (channel B). Issues mutation approvals and goal grants (channel C, §12). Assesses readiness (channel D). **Is not an MCP client** (clawonshape#2). |
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
| Mounts | `credentialDirectory`: rw in the Engineer, **ro** in the server. `approvalDirectory`: rw in the Engineer, **ro** in the server. Config file: ro in the server. **1.1.0:** `dispatch_journal_dir` (§12.1): rw in the server only, persistent across restarts and image upgrades. |
| File ownership | The server validates that the file and its parent are owned by **its own UID**, with no group or other bits (§3, §4). Writer and reader MUST therefore resolve to the same host UID through the Podman user-namespace mapping. ⚠️ G7 |
| Start order | No ordering is required. Until channel B holds a valid token, the server is live but not ready (§5). |
| Restart | The server re-reads all channel B/C files on every dispatch. A restart MUST NOT cause a retry of an earlier mutation. **1.1.0:** the only server state is the dispatch journal (§12.4); a lost journal directory blocks goal admission (`dispatch_journal_unavailable`) instead of resetting budgets. |
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
24-hex id. **1.0.0:** while a valid v2 approval (§4) whose claims lie within the static bounds (§2.5
step 5, §8.9; requires `[external_token.mutation]`) is active (`now < expiresAt`, consumed or
not), `{w}` MAY also be the approval's claimed `target.workspaceId` for the paths
`/documents/d/{d}/w/{w}/currentmicroversion` and `/partstudios/d/{d}/w/{w}/e/{e}/features`,
so that the Engineer can verify the Candidate after the update. `{d}` and `{e}` stay the
configured target. A violation yields `external_token_read_policy_denied` before any provider
I/O. The API base is `v10`, or `v16` when `read_api_version = "v16"`.

### 2.5 Mutation admission (`onshape_api_call`, method other than GET)

**1.0.0.** Static, Clawake-provisioned bounds in `[external_token.mutation]`: `document_id`,
`element_id`, `excluded_workspace_ids`, `allowed_operations`, `write_mode`. The dynamic target
(workspace, feature, expected microversion) comes from the claims of the approval file (§4 v2).
During the expand step the static pins `workspace_id`, `feature_id`, `expected_microversion`
MAY still be configured; if present, claims MUST equal them. A v1 approval (deprecated, §4) is
admitted only with these static pins and uses them in place of claims.

Evaluated in this order. The first failure wins, and **no provider I/O** happens before
step 10 (step 9 reads only the local token file):

| # | Check | Error |
|---|---|---|
| 1 | `[external_token.mutation]` is present | `target_policy_denied` |
| 2 | `write_mode = "modify"`; method `POST`; `allowed_operations` contains `updatePartStudioFeature`; no query parameters; JSON headers only | `target_policy_denied` |
| 3 | The approval file is readable under the private-file rules (§4). It is **mandatory**: a server with `[external_token.mutation]` and without `mutation_approval_file` does not start (`target_configuration_invalid`) | `mutation_approval_unavailable` |
| 4 | The approval is structurally valid for its `version` (§4), `expiresAt > now`, for v2 `0 < expiresAt − issuedAt ≤ 900 000`, and a v1 approval only if the pins `workspace_id` and `expected_microversion` are configured | `mutation_approval_mismatch` |
| 5 | Target: path = `/partstudios/d/{d}/w/{w}/e/{e}/features/featureid/{fid}`; `{d}` = `document_id` = claim `target.documentId`; `{e}` = `element_id` = claim `target.elementId`; `{w}` = claim `target.workspaceId` and not in `excluded_workspace_ids`; `{fid}` = claim `featureId` = `body.feature.featureId`; claim `operation` ∈ `allowed_operations`; the configured `workspace_id` and `feature_id` pins equal their claims | `target_policy_denied` |
| 6 | Revision: `body.sourceMicroversion` = claim `expectedMicroversion`, a configured `expected_microversion` pin equals that claim, and `body.rejectMicroversionSkew == true` | `revision_policy_denied` |
| 7 | `approval.body` equals the request body exactly | `mutation_approval_mismatch` |
| 8 | The `proposalId` has not been admitted before by this server process | `mutation_approval_consumed` |
| 9 | Token valid (§3) **and** scopes contain `OAuth2Write` | `external_token_*` / `external_token_write_scope_missing` |
| 10 | Record the `proposalId` as consumed, then single-attempt dispatch to `https://cad.onshape.com/api/v16` | see §6 (`UNKNOWN`) |

The consumed record is per process and not persisted; after a restart the revision CAS
(step 6 with `rejectMicroversionSkew`) still prevents a second application of the same body.
G2 and G3 are resolved by this section (§11).

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
| Schema v2 (1.0.0) | `{"version": 2, "proposalId": uuid-v4, "issuedAt": integer (Unix ms), "expiresAt": integer (Unix ms), "target": {"documentId", "workspaceId", "elementId"} (24-hex each), "featureId": string, "expectedMicroversion": 24-hex, "operation": "updatePartStudioFeature", "requestHash": string, "payloadHash": sha256-hex, "body": object}`, or the JSON literal `null` (= no active approval). All fields are required; unknown fields are rejected. |
| Schema v1 (deprecated) | `{"version": 1, "proposalId": uuid-v4, "expiresAt": integer (Unix ms), "requestHash": string, "payloadHash": sha256-hex, "body": object}`. Accepted by the server only during the expand/migrate steps and only with static pins (§2.5); removed in the contract step of the 1.0.0 migration. Producers MUST switch to v2 in the migrate step. |
| Fields the server checks | `version` ∈ {1, 2}; `expiresAt > now`; `proposalId` non-empty and not consumed; v2: `0 < expiresAt − issuedAt ≤ 900 000`, all claims against the request and bounds (§2.5 steps 5–6); `body` deep-equals the request body |
| Fields the server ignores | `requestHash`, `payloadHash`: audit fields for the plugin's receipts. ⚠️ G4 |
| Lifetime | v1: `expiresAt = approvedAt + 300 000 ms` (5 min). v2: `issuedAt` = issuance of the approval proof, `expiresAt ≤ issuedAt + 900 000 ms` (15 min, ADR-2026-10-16) |
| Reset | The plugin writes `null` when `reconcile` reaches a terminal receipt status (`VERIFIED` or `REJECTED`). There is no timer-based reset; an expired file on disk is harmless because the server rejects it (`mutation_approval_mismatch`). |
| Receipt lifecycle | `PROPOSED` → (approve) `UNKNOWN` → (reconcile) `VERIFIED` \| `REJECTED`. `VERIFIED` and `REJECTED` are terminal. |
| Reconcile rules | On an `UNKNOWN` receipt, in this order: (1) Primary microversion changed → `primary_revision_changed`, stays `UNKNOWN`. (2) Candidate microversion changed → verify feature identity, state and approved expressions → `VERIFIED`, else `mutation_verification_mismatch`, stays `UNKNOWN`. (3) Candidate microversion unchanged and `now < expiresAt + 60 000 ms` → `mutation_outcome_unknown`, stays `UNKNOWN`. (4) Candidate microversion unchanged and `now ≥ expiresAt + 60 000 ms` → `REJECTED` with `reason: "approval_expired_not_dispatched"`. The 60 s grace covers the server's 30 s Onshape timeout (§7) so that a dispatch admitted just before expiry has finished. |
| One-at-a-time | While any receipt is `UNKNOWN`, the plugin MUST NOT issue a new proposal or approval (`mutation_reconciliation_required`). |
| Fixtures | `fixtures/approved-update/valid/*.json`, `fixtures/approved-update/invalid/*.json` |

### 4.1 Execution context `onshape_mutation_context` (plugin → Engineer → channel A)

The plugin tool hands the approved request to the Engineer, who sends it to the server
through channel A. Its output is part of the contract because it MUST be a valid
`onshape_api_call` input. ⚠️ G13 (0.2.x shipped `operation` instead of `endpoint`).

| Item | Contract |
|---|---|
| Availability | Only for a receipt in `UNKNOWN` with `now < expiresAt`; otherwise `mutation_approval_unavailable`. Performs no MCP call and no provider I/O. |
| Schema (`details`, and the JSON text in `content[0].text`) | `{"status": "ok", "proposalId": uuid-v4, "approvedRequestHash": string, "payloadHash": sha256-hex, "expiresAt": integer (Unix ms), "apiCall": {"endpoint": "updatePartStudioFeature", "path_params": {"did", "wid", "eid", "fid"}, "body": object}}` |
| `apiCall` | MUST validate against the `onshape_api_call` input schema in `fixtures/mcp-tools.json`. `path_params` values are the receipt's target and feature; `body` deep-equals `approved-update.json` `body`. No `query_params`, `header_params` or `file_refs`. |
| Engineer obligation | Parse the result if it arrives as text, pass `apiCall` **unchanged** as the arguments of `onshape__onshape_api_call`, exactly one attempt, then `onshape_reconcile_update`. |
| Removed | The 0.2.x top-level fields `operation`, `path_params`, `body` are not part of the contract and MUST NOT be emitted. |
| Fixtures | `fixtures/mutation-context/valid/update-feature.json` (paired with `approved-update/valid/update-feature.json`) |

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
Plugin tools MUST return the code string unchanged in `details.code` together with the operator
text; they MUST NOT collapse a listed code into a generic one (0.4.0).

| Code | Channel | Meaning | Retry | Consumer action |
|---|---|---|---|---|
| `external_token_tool_denied` | A | tool not available in external-token mode | no | none; fix the tool choice |
| `external_token_read_policy_denied` | A | GET outside the fixed read set (§2.4) | no | correct the request shape; OAuth consent cannot fix it |
| `target_policy_denied` | A | mutation outside the policy (§2.5 steps 1, 2, 5) | no | escalate to the operator |
| `revision_policy_denied` | A | baseline, microversion pin or skew flag wrong (§2.5 step 6) | no | re-read the baseline, new proposal |
| `target_configuration_invalid` / `external_token_configuration_invalid` | A | server config invalid | no | Clawake or operator fixes the config |
| `mutation_approval_unavailable` | A, C | approval file missing, insecure or unreadable | no | issue an approval through the plugin |
| `mutation_approval_mismatch` | A, C | approval expired, `null`, structurally invalid (incl. v2 lifetime > 15 min), or body differs | no | new proposal and approval |
| `mutation_approval_consumed` | A, C | this `proposalId` was already admitted by the running server (1.0.0, §2.5 step 8) | **never** | reconcile; a new attempt needs a new approval |
| `external_private_file_unavailable` | B, C | private-file checks failed (internal; surfaces as one of the codes above) | no | fix ownership or mode |
| `external_token_unavailable` | A, B | token file missing, `null` or invalid | no | plugin re-sync or reconnect |
| `external_token_expired` | A, B | `expiresAt ≤ now + 30 s` | after re-sync | wait for plugin refresh |
| `external_token_write_scope_missing` | A, B | mutation without `OAuth2Write` | no | operator grants write consent |
| `external_token_client_unavailable` | A | HTTP client could not be built (`internal_error`) | no | operator |
| `external_token_request_failed` | A | read dispatch failed (`internal_error`) | yes, for reads only | caller MAY retry the read |
| `mutation_outcome_unknown_reconcile_required` | A | mutation transport failure, 5xx, 3xx or 408 (`internal_error`). `data: {"outcome":"UNKNOWN","retryAllowed":false,"reconciliationRequired":true}` | **never** | plugin `onshape_reconcile_update`; no new attempt until reconciled |
| `goal_grant_unavailable` | A, C | goal grant file missing, insecure or unreadable (1.1.0, §12.3 step 2) | no | plugin re-publishes the grant |
| `mutation_authority_conflict` | A, C | a goal grant and an active approval v2 exist at the same time (§12.2) | no | plugin clears one authority |
| `goal_grant_invalid` | A, C | grant structurally invalid, expired, lifetime > 8 h, budget > 25 (§12.3 step 4) | no | new confirmation (D4) |
| `goal_grant_stopped` | A, C | grant `STOPPED`, or STOP observed just before dispatch (§12.3 steps 5, 11) | **never** | stop iterating; report |
| `goal_scope_denied` | A | request outside the grant target, feature IDs or body shape (§12.3 step 7) | no | stay in scope or ask for a new goal |
| `goal_budget_exhausted` | A | `maxDispatches` reached (§12.3 step 9) | no | verify and report; a new budget needs a new confirmation |
| `goal_reconciliation_required` | A | an earlier dispatch of this goal is uncertain and not reconciled (§12.3 step 9) | after reconciliation | plugin goal reconcile with `data.sequence` |
| `goal_dispatch_duplicate` | A | the identical request was already dispatched with outcome `OK` or `UNCERTAIN` (§12.3 step 9) | **never** | re-read the revision; build a new request |
| `dispatch_journal_unavailable` | A | journal directory or file unreadable, insecure or corrupt (§12.4) | no | operator / Clawake |
| `external_token_auth_owned_externally` | CLI | `auth login` in external-token mode | no | none |
| `external_token_local_url_required` / `_invalid`, `external_token_validation_unavailable` | startup | server refuses to start | no | Clawake or operator |
| `mcp_execution_disabled`, `mcp_discovery_failed`, `invalid_mcp_server`, `native_mcp_status_unavailable` | plugin | plugin-side MCP projection errors | no | operator |
| `invalid_arguments`, `authorization_changed`, `provider_protocol_error`, `proposal_body_invalid` | plugin | malformed tool arguments; binding/receipt drift; unexpected provider response shape; proposal body is not a complete native v16 feature update for the bound feature (0.4.0) | no | fix the arguments / re-read / submit the complete native feature from `getPartStudioFeatures` |
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
| Approval lifetime | v1: 300 000 ms; v2: `expiresAt − issuedAt` ≤ 900 000 ms (§4), checked by the server | plugin (issues), server (v2 bound) |
| Plugin `/health` timeout | 2 000 ms | plugin |
| `mcp status` / `mcp probe` timeout | 15 000 / 20 000 ms | plugin |
| Token file / approval file size | 16 384 B / 1 048 576 B | server |
| `accessToken` length / `scopes` count | 8 192 / 32 | server |
| Proposal body (plugin) | ≤ 900 000 B canonical JSON | plugin |
| Goal grant file | ≤ 65 536 B; lifetime ≤ 28 800 000 ms (default 7 200 000); `maxDispatches` ≤ 25 (default 10); `featureIds` ≤ 32 (§12.2) | server (caps), plugin (defaults) |
| Goal-mode request body | ≤ 900 000 B canonical JSON (§12.3 step 7) | server |
| `GET /capabilities` timeout (plugin) | 2 000 ms | plugin |

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
8. Whenever `[external_token.mutation]` is configured, `mutation_approval_file` MUST be
   configured as well. **1.0.0:** the server enforces this at startup (`target_configuration_invalid`).
9. The mutation target is never wider than the static bounds: claims can only narrow it to a
   workspace inside the configured document and element, outside `excluded_workspace_ids`.
10. **1.1.0:** a goal grant never authorizes more than its listed feature IDs, operation, Candidate,
    budget and lifetime; budget and uncertain-outcome blocking survive server restarts (§12.4).
    The plugin never auto-confirms a goal and never auto-approves payloads.

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
| 0.1.0-draft | `localhost/clawonshape-mcp@sha256:defe0ab2…` (tag `f27613e-external-token-v4`, revision `f27613e`) | 0.2.8 @ `2457ff8` | 2026.9.9 | observed, not accepted; mutation path fails live (G13, G5) |
| 1.0.0-draft | `localhost/clawonshape-mcp:acceacd-approval-v2-expand-curl` @ `sha256:d98a11dc…0eb8` (image id `1a541934896e`, revision `acceacd`; binary sha256 `a5a57f30…704685f` copied unchanged from the distroless build below, wrapped in `deploy/onshape-mcp/Dockerfile` for the curl `HealthCmd`) | 0.2.10 @ `6bbc5e5` (writes v1) | 2026.9.9 | **accepted** 2026-10-20 (live E2E: proposal `fa2e74ca…` → one dispatch → `VERIFIED`; replay → `mutation_approval_consumed`; evidence `docs/evidence/2026-10-20-approval-v2-expand-e2e.md`). **Deployed.** Next row: same image + P3 plugin (writes v2) |
| 1.0.0-draft | `localhost/clawonshape-mcp:acceacd-approval-v2-expand` @ `sha256:b720bbbb…3854de` (image id `f04796cc49de`, distroless runtime target) | 0.2.10 @ `6bbc5e5` | 2026.9.9 | **not deployable** with the current Clawake quadlet: no `curl`, so `HealthCmd` fails and systemd kills the service every ~60 s (live 2026-10-20, 97 restarts). Blocked on edge-robot/onshape-mcp#4 and edge-robot/clawake#39 |
| 0.4.0-draft | same image (`f27613e`) | 0.2.10 @ `6bbc5e5`, `sha256:e98648b9…433e03b` | 2026.9.9 | **accepted** 2026-10-16 (R7: first complete live mutation `VERIFIED`); Engineer gateway; rollback target for the spike |
| 0.4.0-draft | same image (`f27613e`) | Lead only: 0.2.11-spike.1 @ `64d2daa` (15:23) → spike.2 @ `795cf78` `sha256:99429bc0…5762` (16:05) → **spike.3 @ `ceaa42c` `sha256:90a5a265…4d0baf` (16:44 CEST, current)**, branch `spike/plugin-command-approval`, clawonshape#13; Engineer: 0.2.10 | 2026.9.9 | **spike, never accepted; rolled back** 2026-10-16 17:02 CEST (Lead back on 0.2.10 `e98648b9…`, backup `state/backups/plugin-rollback-0.2.10-20261016T165841`); spike checks 1–3 passed; no contract element touched |
| 0.3.0-draft | same image (`f27613e`, implements 0.2.0-draft; compatible, change is plugin-side) | 0.2.9 @ `09f7b49`, `sha256:5df286a3…7553ade` | 2026.9.9 | superseded 2026-10-16 (R1 pass, R2/R3 fail → 0.2.10); rollback target |

## 10. Fixtures

| Path | Kind | Consumed by |
|---|---|---|
| `fixtures/mcp-tools.json` | code-first snapshot of `tools/list` in external-token mode | Rust `tests/contract.rs` (exact match) |
| `fixtures/access-token/valid/*.json` | contract-first | Rust: accepted by `Credential`/`load`. TS: writer output matches structurally |
| `fixtures/access-token/invalid/*.json` | contract-first | Rust: rejected with the code in `fixtures/expectations.json`. TS: readiness reader rejects |
| `fixtures/approved-update/valid/*.json` | contract-first | Rust: admitted against the paired request — v1 with the `target` pins, v2 with `boundsV2` (and also with the `target` pins). TS: `approve` output matches structurally (v2 from the migrate step on) |
| `fixtures/approved-update/invalid/*.json` | contract-first | Rust: rejected with the code in `expectations.json`, evaluated in the §2.5 order; also the behavioural entries `replay`, `missingApprovalFile`, `readsV2` |
| `fixtures/mutation-context/valid/*.json` | contract-first | TS: `executionContext` output for the paired approval equals the fixture (except volatile `expiresAt`); `apiCall` validates against the `onshape_api_call` schema in `mcp-tools.json`. Rust: not consumed (0.3.0) |
| `fixtures/goal-grant/valid/*.json`, `invalid/*.json`, `requests/*.json` | contract-first (1.1.0) | Rust: admitted/rejected against `boundsGoal` and the paired requests in `expectations.json` `goal-grant`, incl. behavioural entries (budget, duplicate, uncertain, restart, STOP race, authority conflict, reads). TS: grant writer output validates structurally; `goal-workflow.md` fixtures |
| `fixtures/capabilities/*.json` | contract-first (1.1.0) | Rust: `/capabilities` output equals the fixture for the matching config. TS: parser accepts both, treats `404` as `UNSUPPORTED` |
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
| G2 | **Resolved in 1.0.0-draft (§2.5 step 3, §8.8):** the approval file is mandatory and enforced at server startup; server change in the expand step (rust-mcp-dev). The approval file is **optional** in the server. If it is absent, a mutation passes with target policy and CAS only. Conflicts with the "ClawOnshape issues approvals" ownership. | `external_token.rs` `execute` (`if mutation && let Some(file)`); `docs/target-policy.md` ("optionally") | Clawake validation rejects `mutation` without `mutation_approval_file` (invariant §8.8). Optionally a server flag `require_approval`. | [edge-robot/onshape-mcp#2](https://github.com/edge-robot/onshape-mcp/issues/2) (Clawake part split off when decided) |
| G3 | **Resolved in 1.0.0-draft (§4 v2 claims, §2.5 steps 5–6, ADR-2026-10-16):** workspace, feature and expected microversion are claims of the approval file inside static bounds. Dynamic candidate target: workspace and `expected_microversion` are pinned in `config.toml`. | `target_policy.rs` `TargetConstraint` | Open question 1 in clawonshape#2: reprovisioning vs. approval-file claims. If claims are chosen, channel C gets a **major** change. | [edge-robot/clawonshape#3](https://github.com/edge-robot/clawonshape/issues/3), clawonshape#2 |
| G4 | Still open in 1.0.0-draft; planned as a separate step after the migration (canonical payload hash check). `requestHash` and `payloadHash` are ignored by the server, which matches on the full body only. | `approval_matches` | Keep as audit fields. A future claim-based approval would use `payloadHash`. | [edge-robot/clawonshape#4](https://github.com/edge-robot/clawonshape/issues/4) (proposed: accepted) |
| G5 | **Resolved in 0.3.0-draft (§4 reconcile rule 4).** Live acceptance 2026-10-16 (M16) showed the real defect: an approved but never dispatched update left the receipt `UNKNOWN` forever and blocked all further proposals. The server-side `mutation_approval_mismatch` for an expired file is accepted. | `mutation-workflow.ts` `reconcile`; `docs/evidence/2026-10-16-mutation-path-acceptance.md` | Plugin implements reconcile rule 4 (prompt 2026-10-16-mutation-context-and-expired-approval). | [edge-robot/clawonshape#5](https://github.com/edge-robot/clawonshape/issues/5), clawonshape#2 (MVC) |
| G6 | Plugin readiness uses `/health` (liveness), not `/health/ready`. | `src/mcp.ts` `localMcpReadiness` | Plugin additionally probes `/health/ready` → field `ready`. Minor change. | [edge-robot/clawonshape#6](https://github.com/edge-robot/clawonshape/issues/6) |
| G7 | Private-file checks require the same UID for writer (Engineer) and reader (server) across containers. This is undocumented in Clawake. | `private_json` (`uid == /proc/self` owner) | Clawake documents and validates the UID mapping. | [edge-robot/clawake#16](https://github.com/edge-robot/clawake/issues/16) |
| G8 | `/mcp` has no HTTP authentication. Any container on the private network can call the tools with the operator's token. | `external_token.rs` `run_http` | Accept: only the Engineer joins the network. Clawake asserts the network membership. Revisit with VC/VP. | [edge-robot/clawonshape#7](https://github.com/edge-robot/clawonshape/issues/7) (ADR note pending) |
| G9 | Client `requestTimeoutMs` (30 s) equals the server's Onshape timeout (30 s). The client can give up while the server's mutation is still in flight, so the agent never sees `UNKNOWN`. | `runtime_config.py`; `[api] timeout = 30` | Client timeout MUST exceed the server timeout plus a margin, e.g. 45 000 ms. | [edge-robot/clawake#17](https://github.com/edge-robot/clawake/issues/17) |
| G10 | `clawonshape/spec.md` says "MCP CAD execution: Disabled" and "discovered tools remain disabled". The live Engineer has native MCP with `onshape_api_call` enabled. | `spec.md:35`, `spec.md:79`; clawonshape#2 comment | spec drift issue, as announced in clawonshape#2 | [edge-robot/clawonshape#8](https://github.com/edge-robot/clawonshape/issues/8) |
| G11 | The running server image digest is not mapped to a source commit. | `podman ps` 2026-10-15 | Clawake records the source commit with the digest. Fill in the matrix in §9. | [edge-robot/clawake#18](https://github.com/edge-robot/clawake/issues/18) |
| G13 | `onshape_mutation_context` returned `operation` instead of the `endpoint` that `onshape_api_call` requires; the execution context was not specified or tested against the server schema. Live step 7 failed with `missing field endpoint`. | `mutation-workflow.ts` `executionContext`; live evidence 2026-10-16 (M15) | §4.1 `apiCall`; contract test against `mcp-tools.json`. | [edge-robot/clawonshape#10](https://github.com/edge-robot/clawonshape/issues/10) |
| G12 | `onshape_auth_status` with `validate: true` issues `GET /users/sessioninfo`, which is not in the read set (§2.4). The outcome in external-token mode is unverified (likely `external_token_read_policy_denied` or a validation error). | `tools.rs` `AuthStatusInput`; `external_token.rs` `allowed` | rust-mcp-dev documents the actual behaviour with a test in the G1 prompt; decide afterwards. | [edge-robot/onshape-mcp#1](https://github.com/edge-robot/onshape-mcp/issues/1) (investigation) |

## 12. Goal authorization (1.1.0)

ADR-2026-10-21, [edge-robot/clawonshape#18](https://github.com/edge-robot/clawonshape/issues/18),
[edge-robot/onshape-mcp#5](https://github.com/edge-robot/onshape-mcp/issues/5). One human goal
confirmation authorizes several **agent-authored** feature updates in **one** Candidate, within a
grant that the server enforces. The plugin-facing goal model (states, dashboard actions, agent
tools) is specified in [`goal-workflow.md`](goal-workflow.md); this section covers only what crosses
the plugin ⇄ server boundary. Everything in §12 is **additive**: a server without goal configuration
behaves exactly as in 1.0.0, and approval v2 (§4) is unchanged.

### 12.1 Server configuration (provisioned by Clawake)

| Key (in `[external_token]`, next to `mutation_approval_file`, unless noted) | Contract |
|---|---|
| `goal_grant_file` | Optional. Absolute canonical path of the goal grant, e.g. `/run/onshape-approval/goal-grant.json` (same ro mount as `mutation_approval_file`). |
| `dispatch_journal_dir` | **Required if `goal_grant_file` is set**, otherwise the server does not start (`target_configuration_invalid`). Absolute canonical path of a **server-owned, rw**, private directory (mode `0700`, owner = server UID), e.g. `/var/lib/onshape-mcp/journal`. Not mounted into any other container. |
| `allowed_operations`, `document_id`, `element_id`, `excluded_workspace_ids`, `write_mode` (in `[external_token.mutation]`) | Unchanged static bounds. A grant can only narrow them (§8.9). |

### 12.2 Channel C: goal grant `goal-grant.json`

| Item | Contract |
|---|---|
| Producer / consumer | ClawOnshape goal store (on confirm, STOP, reconcile, expiry) → onshape-mcp `goal_grant_file` |
| Path, directory, file | `<approvalDirectory>/goal-grant.json`; same private-file rules as §3; **≤ 65 536 bytes** |
| Write | Atomic replace (`writePrivateSecretFileAtomic`). The plugin persists its goal record **before** it publishes a grant revision. `grantRevision` strictly increases per `goalId`. |
| Schema v1 | `{"version": 1, "goalId": uuid-v4, "grantRevision": integer ≥ 1, "goalHash": sha256-hex, "state": "ACTIVE" \| "STOPPED", "issuedAt": integer (Unix ms), "expiresAt": integer (Unix ms), "target": {"documentId", "workspaceId", "elementId"} (24-hex each), "operations": ["updatePartStudioFeature"], "featureIds": string[1..32] (unique, each 1–64 chars `[A-Za-z0-9_]`), "maxDispatches": integer 1..25, "reconciledThrough": integer ≥ 0}`, or the JSON literal `null` (= no goal authority). All fields required; unknown fields are rejected. |
| Lifetime | `0 < expiresAt − issuedAt ≤ 28 800 000` (8 h hard cap). Plugin default 2 h (D2). |
| Budget | `maxDispatches` ≤ 25 (hard cap). Plugin default 10 (D2). |
| Operations | Phase 1: exactly `["updatePartStudioFeature"]` (D5). |
| `target.workspaceId` | The goal's Candidate. MUST NOT be in `excluded_workspace_ids`. |
| `reconciledThrough` | Highest journal `sequence` (§12.4) whose uncertain outcome the plugin has reconciled. Raised only with a new `grantRevision`. |
| `state: STOPPED` | STOP/revocation (§12.5). The plugin MAY instead write `null`. |
| Reset | `null` after the goal reaches a terminal state (`COMPLETED`, `FAILED`, `STOPPED`, `EXPIRED`) and has no unreconciled dispatch. |
| Fixtures | `fixtures/goal-grant/valid/*.json`, `fixtures/goal-grant/invalid/*.json`, `fixtures/goal-grant/requests/*.json` |

**One authority at a time.** If `goal_grant_file` holds a non-`null` grant **and**
`mutation_approval_file` holds a non-`null`, unexpired approval, every mutation fails with
`mutation_authority_conflict`. A non-`null` grant selects goal admission (§12.3); otherwise the
§2.5 path applies unchanged.

### 12.3 Goal mutation admission (`onshape_api_call`, method other than GET)

Evaluated in this order; the first failure wins. **No provider I/O** before step 11 (step 10
reads only the local token file).

| # | Check | Error |
|---|---|---|
| 1 | §2.5 steps 1–2 (mutation section, `write_mode`, `POST`, static `allowed_operations`, no query parameters, JSON headers) | `target_policy_denied` |
| 2 | The grant file is readable under the private-file rules | `goal_grant_unavailable` |
| 3 | Authority: grant non-`null` and no active approval v2 | `mutation_authority_conflict` (`null` grant → §2.5 path) |
| 4 | Grant structurally valid (§12.2), `expiresAt > now`, lifetime ≤ 8 h, `maxDispatches` ≤ 25, operation ∈ static `allowed_operations` | `goal_grant_invalid` |
| 5 | `state == "ACTIVE"` | `goal_grant_stopped` |
| 6 | Static bounds: grant `target.documentId` = `document_id`, `target.elementId` = `element_id`, `target.workspaceId` ∉ `excluded_workspace_ids` | `target_policy_denied` |
| 7 | Grant scope: path = `/partstudios/d/{d}/w/{w}/e/{e}/features/featureid/{fid}` with `{d}`,`{w}`,`{e}` = grant target; `{fid}` ∈ `featureIds`; `body.feature.featureId` = `{fid}`; body top-level keys ⊆ {`feature`, `sourceMicroversion`, `rejectMicroversionSkew`, `serializationVersion`, `libraryVersion`}; canonical body ≤ 900 000 B | `goal_scope_denied` |
| 8 | Revision: `body.sourceMicroversion` is 24-hex and `body.rejectMicroversionSkew == true` | `revision_policy_denied` |
| 9 | Journal (§12.4) for `goalId` readable; `reconciledThrough` ≤ the highest journal `sequence` (else `goal_grant_invalid`); no entry with outcome `UNCERTAIN` (or `PENDING`) and `sequence > reconciledThrough` → else `goal_reconciliation_required`; no earlier entry with the same `requestHash` and outcome `OK` or `UNCERTAIN` → else `goal_dispatch_duplicate`; counted entries < `maxDispatches` → else `goal_budget_exhausted` | `dispatch_journal_unavailable` / as listed |
| 10 | Token valid (§3) **and** scopes contain `OAuth2Write` | `external_token_*` / `external_token_write_scope_missing` |
| 11 | Append a `PENDING` entry (fsync), re-read the grant: if it is no longer `ACTIVE` with the same `goalId`, set the entry to `NOT_DISPATCHED` and fail with `goal_grant_stopped`. Otherwise single-attempt dispatch to `https://cad.onshape.com/api/v16`, then record the outcome (fsync) | §12.4 |

`requestHash` = SHA-256 hex of the canonical JSON (sorted keys, no whitespace) of
`{"path": <path>, "body": <body>}`.

**Clarifications accepted from the onshape-mcp#5 report (2026-10-21, CR-1..CR-7):**

- *Pins (CR-1):* configured expand-step pins (§2.5) also bound goal admission: `workspace_id` ≠ grant
  workspace → step 6 `target_policy_denied`; `feature_id` ≠ `{fid}` → step 7 `goal_scope_denied`;
  `expected_microversion` ≠ `sourceMicroversion` → step 8 `revision_policy_denied`.
- *Active approval (CR-2):* an approval file is active if it passes the private-file rules and holds a
  non-`null` value with an integer `expiresAt > now`, whatever its version; an unreadable or insecure
  approval file counts as no approval.
- *Step 11 re-read (CR-3):* evaluated with the full step-4 validation incl. expiry; a grant that expires
  between steps 9 and 11 yields `NOT_DISPATCHED` + `goal_grant_stopped`.
- *Error data (CR-5):* `goal_reconciliation_required` and `goal_dispatch_duplicate` carry the referenced
  journal entry's `sequence`, `featureId`, `sourceMicroversion`, `admittedAt`; other step 9–10 errors carry
  the request's `goalId`, `featureId`, `sourceMicroversion`; step-11 and unknown-outcome errors carry the
  new `sequence` and `admittedAt`; unknown-outcome `data` = the §6 object merged with these fields.
- *Unrecorded outcome (CR-6):* if the outcome line cannot be appended, the call returns
  `mutation_outcome_unknown_reconcile_required` regardless of the provider status; a failed
  `NOT_DISPATCHED` append still returns `goal_grant_stopped` and the remaining `PENDING` blocks the goal.
- *Strictness (CR-7):* `goalId` is a **lowercase** uuid-v4; `goal_grant_file` and `dispatch_journal_dir` are
  absolute without empty, `.` or `..` segments and without a trailing slash, else startup fails with
  `external_token_configuration_invalid`; journal files over 4 MiB are corrupt (`dispatch_journal_unavailable`).

### 12.4 Dispatch journal (server-owned)

| Item | Contract |
|---|---|
| Location | `<dispatch_journal_dir>/<goalId>.jsonl`, private-file rules, append-only, one JSON object per line, fsync after every write |
| Entry | `{"sequence": integer ≥ 1 (per goal, gapless), "grantRevision", "requestHash", "featureId", "sourceMicroversion", "admittedAt": Unix ms, "outcome": "PENDING" \| "OK" \| "PROVIDER_REJECTED" \| "UNCERTAIN" \| "NOT_DISPATCHED", "httpStatus": integer \| null}`. An outcome update is a new line with the same `sequence`; the last line per `sequence` wins. |
| Outcome mapping | 2xx → `OK`; 4xx except 408 → `PROVIDER_REJECTED`; transport error, timeout, 3xx, 408, 5xx → `UNCERTAIN` (MCP error `mutation_outcome_unknown_reconcile_required`, §6) |
| Restart | On load, a `PENDING` entry without a later outcome counts as `UNCERTAIN`. The journal is never truncated by the server. |
| Budget | Entries with outcome `NOT_DISPATCHED` do not count; all others do. |
| Unreadable or corrupt journal | Fail closed: `dispatch_journal_unavailable`; no dispatch. |
| Error data | Goal-mode errors from steps 9–11 and the unknown-outcome error carry `data: {"goalId", "sequence" (if any), "featureId", "sourceMicroversion", "admittedAt" (if any)}` so that the plugin can reconcile without reading the journal. |
| At most one uncertain | Because step 9 blocks every admission while an `UNCERTAIN`/`PENDING` entry is unreconciled, a goal has at most one unreconciled entry at any time. |
| Plugin access | No file access. The plugin reconciles from error data and Onshape REST reads (`goal-workflow.md` §5) and reads progress through `GET /goals/{goalId}/journal-summary` (§12.7). |

### 12.5 STOP, expiry and reconciliation across the boundary

- **STOP:** the plugin atomically writes the grant with `state: STOPPED` (new `grantRevision`) or
  `null`. Any admission whose step 2 or step 11 read happens after the write fails with
  `goal_grant_stopped` (or falls back to §2.5 for `null`, which then fails on the approval file).
  A dispatch already past step 11 completes and is recorded; the plugin reconciles it. Executed
  changes are not rolled back.
- **Expiry:** `expiresAt ≤ now` → `goal_grant_invalid`. Resume after `STOPPED` or `EXPIRED` needs a
  new confirmation (D4), which yields a new grant revision for the same `goalId` and Candidate.
- **Uncertain outcome:** blocks the goal (step 9) until the plugin publishes a grant with
  `reconciledThrough ≥ sequence`. Nobody retries the uncertain request blindly; the next request is
  built on a re-read revision (CAS).

### 12.6 Reads while a goal grant exists

While a non-`null` grant whose target lies within the static bounds exists and `now < expiresAt`
(`ACTIVE` or `STOPPED`), `{w}` MAY also be the grant's `target.workspaceId` for
`/documents/d/{d}/w/{w}/currentmicroversion`, `/documents/d/{d}/w/{w}/elements` and
`/partstudios/d/{d}/w/{w}/e/{e}/features`. Otherwise §2.4 applies unchanged.

### 12.7 Capability reporting

| Probe | Contract |
|---|---|
| `GET /capabilities` | server; no auth, no provider I/O; `200` `{"contractVersion": "1.1.0", "mutationAuthorities": string[]}` where the list contains `"approval-v2"` when `mutation_approval_file` is configured and `"goal-grant-v1"` when `goal_grant_file` and `dispatch_journal_dir` are configured and the journal directory passes the private-file checks. Unknown fields MUST be ignored by the plugin. |
| `GET /goals/{goalId}/journal-summary` | server; no auth (private network, G8), no provider I/O, `goalId` uuid-v4 else `404`. `200` `{"goalId", "entries": integer, "counted": integer, "maxSequence": integer, "unreconciledSequence": integer \| null, "lastOutcome": string \| null, "lastAdmittedAt": integer \| null, "unreconciledEntry": {"sequence", "grantRevision", "requestHash", "featureId", "sourceMicroversion", "admittedAt", "outcome": "PENDING" \| "UNCERTAIN", "httpStatus": integer \| null} \| null}` (**1.2.0**: `unreconciledEntry` is the journal entry named by `unreconciledSequence`, last line per sequence; never request bodies or tokens) computed from the journal against the current grant's `reconciledThrough`; unknown goal → `200` with zeros and `null`s; unreadable journal → `503` `dispatch_journal_unavailable`. Authoritative source for budget and progress in the plugin. |
| Journal summary details (CR-4) | `404` also when the server has no goal configuration; the `503` body is `{"code":"dispatch_journal_unavailable"}`; `lastOutcome` is the stored outcome (may be `PENDING`); `reconciledThrough` comes from the current grant if it is structurally valid (expiry ignored) and names the same `goalId`, else 0. |
| Plugin | probes `/capabilities` with the §5 liveness rules (2 000 ms, `redirect: 'error'`). The goal path is `AVAILABLE` only if `goal-grant-v1` is listed **and** the plugin config enables goals; otherwise `UNSUPPORTED`. A `404` (pre-1.1.0 server) means `UNSUPPORTED`. |

## Changelog

- `1.2.0-draft` (2026-10-21): **minor, additive**. §12.7 journal summary gains `unreconciledEntry` (the unreconciled journal entry: sequence, grant revision, request hash, feature, source microversion, admission time, outcome, HTTP status), so that operators and agents can reconcile without the original MCP error data. Fixture `goal-grant/journal-summary/uncertain.json`, expectations `journalSummaryUncertain`; `goal-workflow.md` → `goal-1.1.0-draft` (§5 input, §9 `progress.unreconciledEntry`). clawonshape#18, onshape-mcp#5.

- `1.1.0-draft` amended (2026-10-21, wording and one fixture field): §12.3 clarifications CR-1..CR-3, CR-5..CR-7 and §12.7 CR-4 from the onshape-mcp#5 report; plugin-facing `goal-workflow.md` amended (CR-1 nonce, CR-2, CR-3). Fixture `goal-workflow/goal-view/active.json` gains `confirmation.nonce: null`. No server behaviour change.

- `1.1.0-draft` (2026-10-21): **minor, additive**. New §12 goal authorization (ADR-2026-10-21): goal grant file in channel C, server config `goal_grant_file` + `dispatch_journal_dir`, goal admission order, durable dispatch journal, STOP/expiry/reconciliation rules, goal-grant reads, `GET /capabilities`. New server codes `goal_grant_unavailable`, `mutation_authority_conflict`, `goal_grant_invalid`, `goal_grant_stopped`, `goal_scope_denied`, `goal_budget_exhausted`, `goal_reconciliation_required`, `goal_dispatch_duplicate`, `dispatch_journal_unavailable`. §0, §1, §6, §7, §8.10, §10. Fixtures `goal-grant/`, `capabilities/`, `expectations.json` `goal-grant` + `boundsGoal`. Plugin-facing goal model in `goal-workflow.md`. Approval v2 unchanged. clawonshape#18, onshape-mcp#5.

- `1.0.0-draft` amended (2026-10-16, wording only, fixtures unchanged): rust-mcp-dev expand report CR-1 (microversion pin checked at step 6 → `revision_policy_denied`), CR-2 (v1 without pins → step 4 `mutation_approval_mismatch`), CR-3 (claimed reads only for claims within the static bounds); §6 step references, §2.5 "no provider I/O before step 10", §7 v2 lifetime.
- `1.0.0-draft` (2026-10-16): **major**. §4 approval file v2 with target claims (`issuedAt`, `target`, `featureId`, `expectedMicroversion`, `operation`; lifetime ≤ 15 min); v1 deprecated. §2.5 rewritten: static bounds only, claims within bounds, approval file mandatory and enforced at startup, new step 8 replay protection `mutation_approval_consumed`. §2.4 reads of the claimed Candidate while an approval is active. §6, §8.8–8.9, §10. Fixtures: `approved-update/valid/update-feature-v2.json`, nine `invalid/v2-*.json`, `invalid/version-2.json` → `version-3.json`; `expectations.json` `boundsV2`, `replay`, `missingApprovalFile`, `readsV2`. Resolves G2, G3. Migration in four steps (§9): server expand → plugin migrate (P3) → live E2E → contract (remove v1 and static pins). clawonshape#14, ADR-2026-10-16.
- `0.4.0-draft` (2026-10-16): §6 plugin codes `invalid_arguments`, `authorization_changed`, `provider_protocol_error`, `proposal_body_invalid`; plugin tools pass codes through unchanged (CR-1, M20, clawonshape#12). Minor, additive. The proposal no longer pins `serializationVersion`/`libraryVersion` to the plugin's REST read (M21; plugin-internal).
- `0.3.0-draft` (2026-10-16): §4 receipt lifecycle and reconcile rules; terminal `REJECTED` with `approval_expired_not_dispatched` after `expiresAt + 60 s` (resolves G5, clawonshape#5). New §4.1 execution context with `apiCall` and fixture `mutation-context/valid/update-feature.json` (G13, clawonshape#10). Error code list: plugin `approval_expired_not_dispatched`. Minor: plugin-side, additive for the server; onshape-mcp keeps implementing 0.2.0-draft until its next contract-version bump.
- `0.2.0-draft` (2026-10-15): add the code-first snapshot `fixtures/mcp-tools.json` (G1), define the `VERSION` file format, record `onshape_auth_status` annotations, link the gap issues in §11, add G12. Minor: additive fixture, no behaviour change.
- `0.1.0-draft` (2026-10-15): initial draft derived from code by onshape-architekt setup.
