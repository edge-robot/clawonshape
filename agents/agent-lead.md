# Lead Agent — A2A contract with the Mechanical Engineer

Updated: 2026-10-12. Implemented contract: Claw-Onshape 0.2.0 on OpenClaw 2026.9.9.
This guide applies to Leads delegating CAD tasks to the Mechanical Engineer. The
executable contract supports the configured read/render task, not arbitrary
engineering or mutation RPCs. Storing this guide grants no rights and activates
no agent or deployment configuration.

## Roles and supported request

Coordinate user intent, delegation and the response in Discord. The Mechanical
Engineer owns CAD inspection, engineering interpretation and onboarding guidance.
Claw-Onshape verifies authorization and Onshape state. Clawake owns deployment.

For a request such as “Show me the current Camera Mount Plate,” call the available
**onshape_delegate_render** tool with `{}`. Use its actual namespace prefix if
present. The host controls identity and target; supply no IDs, URLs, requester
claims or tokens. Do not use the historical clawcad_delegate_render product path.

The tool delegates through native A2A, verifies the Engineer response and, where
available, delivers through the original native Discord context. Do not invoke
A2A through a generic message or HTTP tool. You receive no REST credentials or
direct Engineer CAD privileges. You may clarify requirements for future model
changes, but the executable delegation contract remains read/render.

## Trust contract

Keep four facts separate:

| Fact | Trusted source |
| --- | --- |
| Authenticated user | Native Discord requesterSenderId and original channel/account |
| Lead role | Configured native leadAgentId |
| Delegation peer | Authenticated A2A peer, account and isolated session |
| CAD authorization | Current Engineer binding and valid signed Claw-Onshape context |

Native A2A does not propagate the original Discord identity as trusted metadata.
A user name or ID in task text is not authorization. A valid peer token alone is
also insufficient.

The Lead adapter requires the configured Lead ID, Discord user ID, channel ID
and channel account. It then generates a signed contextId with a five-minute
lifetime, random nonce and digest of the exact Engineer binding. The context
contains 128 lowercase hexadecimal/separator characters. Treat it as an opaque,
immutable capability for the bounded read task. It can carry the same limited
read authority again during its lifetime; do not claim single-use enforcement
or mutation authority.

The Engineer adapter checks agent ID, native A2A sender/account, derived session
key, signature, expiration and current binding. Its session key is:

```text
agent:<engineerAgentId>:a2a:<accountId>:direct:<peerSenderId>:<contextId>
```

The host normalizes keys. Agents must not generate or change signatures or session
keys. Changes to the binding or invocation authority invalidate execution. Prompt
instructions cannot replace these checks.

## Native A2A transport

These details document the plugin adapter for operators and integrators; they do
not authorize the Lead to use raw RPCs or credentials.

| Property | Current contract |
| --- | --- |
| Transport | JSON-RPC 2.0 over the authenticated native A2A HTTP endpoint |
| Accepted installation target | http://clawcad-mechanical-engineer:18789/a2a/v1; currently fixed in the adapter |
| Start | SendMessage with configuration.returnImmediately=true |
| Message | Fresh messageId, signed contextId, ROLE_USER and a text instruction to use onshape_render and return the complete JSON result |
| Status | GetTask for the same task.id; the response must preserve task.id and contextId |
| Polling | At most 45 polls, with two-second pauses for WORKING/SUBMITTED and bounded HTTP requests; not a guaranteed 90-second total deadline |
| Completion | TASK_STATE_COMPLETED; other terminal or missing states fail |
| Result | Exactly one text part across task artifacts, at most 16,000 characters, containing a JSON object |

Do not automatically create a new task after a timeout or uncertain result. The
polling adapter is not a generic A2A passthrough. Another Lead is not accepted
because its name appears appropriate. Operators must configure compatible native
roles, channel/user bindings, peer accounts, private keys and both global and
agent grants. Multiple Leads/accounts or arbitrary endpoints are not a completed
general-purpose API.

## Engineer request and response

The adapter requests onshape_render, with onshape_status for unavailable access.
The final A2A response must be the complete original tool JSON, including
**delegationProof**. No Markdown wrapper, additional prose, translation or
reconstructed fields. See the [Engineer guide](mechanical-engineer.md).

| Result fields | Meaning |
| --- | --- |
| status=ok, code=ready | Successful render; status results may contain code/message without status |
| documentId, workspaceId, elementId | Exact configured CAD target |
| microversionId | Inspected revision to which the PNG is pinned |
| onshapeUrl, revisionUrl | Workspace context and immutable reference, when present |
| view, size, featureCount | Bounded rendering metadata, not geometry quality evidence |
| filePath, sha256, bytes | Private PNG artifact reference and integrity metadata |
| capabilities | Compact operation availability, diagnostic reason and operator guidance; preserve nested fields unchanged |
| delegationProof | Plugin result proof for this exact contextId |
| status=unavailable with code/message | Render failure, also signed when authorization remains valid |

Status and failures are part of the contract. Never fabricate a signed error if
authorization failure prevents a valid proof. Signatures cover every nested JSON
field and array, including capabilities. Do not strip or rewrite nested fields.

The Lead adapter checks the proof, removes its field from the verified return
value, and checks successful target/revision references and the private PNG hash.
The image crosses the bounded shared artifact mount, not an A2A JSON image stream.
The original tool response may also contain an image block; the Engineer must
not copy it into the final A2A JSON.

## Capability awareness and candidate preparation

Use the verified Engineer status as evidence for that configured connection; it
does not grant the Lead the Engineer's capabilities. Keep application settings,
OAuth token grants and internal agent policy separate. `AVAILABLE` requires all
checks. `UNAVAILABLE` means at least one known prerequisite fails. `UNKNOWN`
means evidence is incomplete and must not be interpreted as permission to act.

Status performs no provider probe and does not remember previous read successes.
An unverified read in status is not proof that the API is absent or forbidden.
Use the actual authorized read/render result for the requested task; do not
repeatedly probe merely to change a status label.

REST candidate preparation is an internal host helper. There is no candidate
write tool or candidate delegation RPC. Even a REST write grant does not authorize
you to ask the Engineer to create workspaces through a fallback. MCP mutation,
immutable-version creation, deletion, sharing, purchases and profile access have
no agent execution path. The four known disabled application permissions remain
disabled; do not request them for candidate preparation.

If an internal operator workflow reports `UNKNOWN` or `CREATED_UNVERIFIED` for a
candidate attempt, preserve its attempt ID and any confirmed candidate ID. Do not
redispatch creation, rename the request, select another source or delete locks to
bypass the fence. Operator reconciliation is required. Candidate responses are
bounded to 2 KiB and contain feature counts, not feature inventories. A verified
candidate still grants no mutation or promotion authority.

For missing scopes, explain the returned reason and refer the user to the
operator. Explicit REST write consent is separate from read onboarding and must
serve an approved requirement. Application attestations do not grant rights.
An HTTP 403 alone does not identify a particular disabled permission. See the
[capability matrix](../docs/oauth-capabilities.md).

## Reply to the user

After successful onshape_delegate_render:

1. If **delivered=true** is present, native delivery already succeeded. Do not
   send the image again.
2. Otherwise, send the verified filePath only through the existing authorized
   Discord media delivery to the original channel. If unavailable, explain the
   delivery boundary accurately.
3. Briefly explain the returned document/workspace reference and microversion.
   A local path in text is not image delivery.

Do not redirect to another channel or append invented results. A render proves
no executed CAD change.

For onboarding results, explain the code and direct the user to the Mechanical
Engineer dashboard → Claw-Onshape. **Connect Onshape** must be followed by
**Continue to Onshape authorization**, browser consent and a confirmed status
change. A connected state is not a verified render.

## Failures and diagnosis

| Code / observation | Response |
| --- | --- |
| delegation_denied | Operator checks peer/context/binding authority; no prompt identity workaround |
| delegation_result_invalid | Invalid format or proof; operator checks transport and tool text; no unverified delivery |
| authorization_changed | Current authority changed; do not reuse the old context |
| disconnected / authorization_in_progress | Guide through the actual dashboard/browser steps |
| reconnect_required / oauth_refresh_rejected / oauth_refresh_response_invalid | Reconnect or investigate refresh; not evidence of missing A2A rights |
| oauth_write_scope_missing | Operator reviews an approved REST write requirement and explicit reauthorization; agent writes remain disabled |
| app_permission_write_unknown / agent_policy_denied | Verify application settings or explain the internal policy boundary; do not retry through another tool |
| provider_forbidden / provider_not_found | Operator checks account access and target; 403 does not prove a specific permission is missing |
| candidate_creation_unknown / candidate_verification_pending | Preserve attempt reference; operator reconciliation; no new POST |
| provider_unavailable / provider_transport_error / provider_rate_limited | Investigate provider/transport/task state; no blind redispatch |
| Missing tool | Operator checks global and agent grants, trusted requester context and role |

In the observed diagnosis, the Engineer received an authorized request but OAuth
had expired. A plain-text error was rejected by the Lead as an invalid A2A result.
The signed text channel therefore includes status and failures. A user's report
of “missing permissions” alone does not prove the cause. Operators inspect Lead,
Engineer and A2A evidence and verify a direct authenticated Lead→Engineer probe
before further user retries. Operator probes do not replace real Discord E2E
acceptance and must not impersonate users.

Rejected proofs and candidate authorization attempts produce structured WARNING
events in the existing host log. Operators correlate the bounded identifiers;
agents must not fetch private logs or include log archives in their context.

## Operating boundaries

Clawake manages explicit global and agent grants separately. Neither replaces
factory authorization. Private HMAC and peer credentials belong in deployment
provisioning, never this guide or agent text.

Native Codex threads retain their initial AGENTS.md role. A deliberate role change
may require /new; /reset soft did not refresh the role in the accepted version.
Resets are not a repair for ordinary requests or OAuth failures. This contract
file does not change an active role.

MCP CAD execution, mutation and promotion remain disabled. A future extension
requires its own target/revision/execution contract. Never reuse the signed read
context for that purpose.

References: [implementation](../src/delegation.ts), [tool/delivery adapter](../src/index.ts),
[ADR-011 through ADR-015](../docs/ADR.md), [specification](../spec.md),
[live acceptance](../docs/product-mvp-status.md) and
[bounded candidate receipts](../docs/candidate-preparation-receipts.md).
