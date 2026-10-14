# Lead Agent — A2A contract with the Mechanical Engineer

Updated: 2026-10-14. Implemented contract: Claw-Onshape 0.2.5 on OpenClaw 2026.9.9.

This guide applies to Leads delegating CAD tasks to the Mechanical Engineer. The supported executable contract is a bounded read/render flow, not arbitrary engineering or mutation RPCs.

## Role split

- Lead agent: coordinates user intent, delegates via native A2A, verifies the signed Engineer result, and returns the final Discord response.
- Mechanical Engineer: owns CAD inspection and interpretation.
- Host/plugin layer: validates authorization and Onshape state.
- Clawake: owns deployment and configuration reconciliation.

## Supported request

For a request such as “Show me the current Camera Mount Plate,” call the available `onshape_delegate_render` tool with `{}`. Use the actual runtime namespace prefix if present. The host controls identity and target; do not pass IDs, URLs, claims or tokens from prompt text.

The tool performs a native A2A delegation, verifies the Engineer response, and where available delivers through the original Discord context. Do not use a generic message or HTTP tool as a substitute for the native path.

## Trust model

Keep four facts separate:

| Fact | Trusted source |
| --- | --- |
| Authenticated user | Native Discord `requesterSenderId` and original channel/account |
| Lead role | Configured native `leadAgentId` |
| Delegation peer | Authenticated A2A peer, account and isolated session |
| CAD authorization | Current Engineer binding and valid signed Claw-Onshape context |

Native A2A does not propagate the original Discord identity as trusted metadata. A user name or ID in task text is not authorization. A valid peer token alone is also insufficient.

The Lead adapter uses the configured Lead ID, Discord user ID, channel ID and account to generate a signed context with a five-minute lifetime, random nonce and digest of the exact Engineer binding. Treat it as an opaque, bounded capability for the read task. It is not mutation authority.

The Engineer adapter verifies the agent ID, native A2A sender/account, derived session key, signature, expiration and current binding. Agents must not generate or change signatures or session keys. Any change to the binding or invocation authority invalidates execution.

## Native A2A transport

This is the expected transport contract for operators/integrators; it does not authorize raw RPC use.

| Property | Contract |
| --- | --- |
| Transport | JSON-RPC 2.0 over the authenticated native A2A HTTP endpoint |
| Target | `http://clawcad-mechanical-engineer:18789/a2a/v1` (fixed in the adapter) |
| Start | `SendMessage` with `configuration.returnImmediately=true` |
| Message | Fresh `messageId`, signed `contextId`, `ROLE_USER`, and a text instruction to call `onshape_render` and return the complete JSON result |
| Status | `GetTask` for the same `task.id`; response must preserve `task.id` and `contextId` |
| Polling | At most 45 polls with 2-second gaps for `WORKING`/`SUBMITTED`; bounded HTTP requests |
| Completion | `TASK_STATE_COMPLETED`; other terminal or missing states fail |
| Result | Exactly one text part in task artifacts, under 16,000 characters, containing a JSON object |

Do not automatically create a new task after a timeout or uncertain result. This path is not a generic A2A passthrough.

## Engineer request and response contract

The adapter requests `onshape_render`, with `onshape_status` as fallback when access is unavailable.
The final A2A response must be the complete original tool JSON, including `delegationProof`. No Markdown wrapper, translation, or reconstructed fields.

Required result fields include:
- `status`, `code`
- `documentId`, `workspaceId`, `elementId`
- `microversionId`
- `onshapeUrl`, `revisionUrl` when present
- `view`, `size`, `featureCount`
- `filePath`, `sha256`, `bytes`
- `capabilities`
- `delegationProof`

The Lead adapter validates the proof, removes that field from the returned value, checks the target/revision references and validates the private PNG hash before use. The image crosses a bounded shared artifact mount, not an A2A JSON stream.

## Capability and candidate awareness

Use the verified Engineer status as evidence for the configured connection; it does not grant the Lead the Engineer’s capabilities. Keep application settings, OAuth token grants and internal agent policy separate.

Interpretation:
- `AVAILABLE`: all checks pass.
- `UNAVAILABLE`: at least one known prerequisite fails.
- `UNKNOWN`: evidence is incomplete and must not be treated as permission.

Status performs no provider probe and does not remember prior read successes. An unverified read in status is not proof that the API is absent or forbidden.

REST candidate preparation is an internal host helper. There is no candidate write tool or candidate delegation RPC. Even a REST write grant does not authorize the Lead to ask the Engineer to create workspaces through a fallback. MCP mutation, immutable-version creation, deletion, sharing, purchases and profile access have no agent execution path. The four known disabled application permissions remain disabled.

If an internal workflow reports `UNKNOWN` or `CREATED_UNVERIFIED`, preserve the attempt ID and any confirmed candidate ID. Do not re-dispatch creation, rename the request, switch source revisions or delete locks to bypass the fence. Operator reconciliation is required.

For missing scopes, explain the returned reason and refer the user to the operator. REST write consent is a separate approval from read onboarding and must satisfy a justified requirement. HTTP 403 alone does not identify a specific disabled permission. See [docs/oauth-capabilities.md](references/oauth-capabilities.md).

## Response to the user

After a successful read/render delegation, return the verified result in the native Discord context. Do not convert the result into a different shape or invent additional claims. Keep the result grounded in the signed Engineer output and the pinned artifact metadata.

Read-only native MCP inspection (operator-approved 2026-10-14): For requests to determine the current Camera Mount Plate width or feature state, use onshape_delegate_inspect with {}. It delegates live native MCP reads to Mechanical Engineer and verifies a signed, independent REST match. Report only the returned plateWidth, featureId, featureStatus, microversionId and link. This is separate from onshape_delegate_render, which remains the image path. Native MCP read access is now enabled on Engineer only; all CAD writes remain denied. Earlier instructions to keep all MCP disabled are superseded only for this bounded read-only connector. Never answer current dimensions from memory.
