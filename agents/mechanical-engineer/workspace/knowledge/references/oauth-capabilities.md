# REST OAuth and agent capability contract

Updated: 2026-10-12. This describes repository code, not a deployed or live write
acceptance. The accepted Discord read/render deployment remains separate evidence.
No agent write tool, MCP mutation, promotion or automatic merge is enabled.

## Three authorization layers

Application permissions are configured for the Onshape OAuth application. The
token grant belongs to a specific REST connection. Agent policy belongs to
Claw-Onshape's trusted identity, role and target binding. All must permit an
operation. Document/account access and provider availability are additional
requirements, and a failed target or expired token is not a missing application
permission.

The official [Onshape scope descriptions](https://github.com/onshape-public/go-client/blob/master/onshape/README.md#documentation-for-authorization)
map OAuth2Read to document reads, OAuth2Write to document writes, OAuth2Delete to
document/workspace deletion, OAuth2Share to sharing/unsharing, OAuth2ReadPII to
profile reads and OAuth2Purchase to purchase requests. The
[official document client](https://github.com/onshape-public/go-client/blob/master/onshape/docs/DocumentApi.md)
documents workspace/version creation and the other document lifecycle endpoints.
That generated client uses API v16; this repository uses v10. These sources are
provider contract evidence, not live acceptance of the repository's writes.

No verified public application-checkbox introspection contract has been
established for this implementation. Document permission-set endpoints describe
document access and must not be treated as application settings. The plugin
does not call a guessed permission endpoint or infer a particular missing
checkbox from HTTP 403.

## Focused matrix

The current connection's grant comes only from its private credential record.
Historical successful read/render acceptance does not establish today's token
validity or a write grant. The following classifications describe the agent
surface and available evidence; no live write was performed for this increment.

| Operation | Documented application permission | Required REST scope | Grant evidence | Agent policy | Classification / next step |
| --- | --- | --- | --- | --- | --- |
| Read document | Application can read your documents | OAuth2Read | Current stored read grant; legacy read-only records cannot imply writes | Trusted configured read binding and liveReads | UNKNOWN in status until operation-specific provider evidence; AVAILABLE only when every check passes |
| Inspect workspace | Application can read your documents | OAuth2Read | Same connection's read grant | Authorized onshape_inspect | UNKNOWN without current read evidence; missing target/grant/policy is UNAVAILABLE |
| Render Part Studio | Application can read your documents | OAuth2Read | Same connection's read grant | Authorized onshape_render plus configured Part Studio | UNKNOWN without render evidence; document-read success alone is insufficient |
| Create candidate workspace | Application can write to your documents | OAuth2Write plus OAuth2Read for this helper's validation GETs | No implicit write grant; explicit reauthorization required for read-only connections | No agent write tool | UNAVAILABLE to agents; internal host preparation additionally requires trusted write attestation and explicit consent |
| Create immutable version | Application can write to your documents | OAuth2Write; a future verification workflow may also need reads | Must verify separately | Not implemented as an agent tool | UNAVAILABLE; not needed for the current exact-microversion workspace helper |
| Delete workspace | Application can delete your documents and workspaces | OAuth2Delete | Independently checked, never requested by onboarding | No deletion tool | UNAVAILABLE by policy; explicit false attestation also records the known disabled application permission |
| Share/unshare document | Application can share and unshare documents on your behalf | OAuth2Share | Independently checked, never requested | No sharing tool | UNAVAILABLE; keep the known disabled permission disabled |
| Read user profile | Application can read your profile information | OAuth2ReadPII | Independently checked, never requested | No profile tool | UNAVAILABLE; keep the known disabled permission disabled |
| Request purchases | Application can request purchases on your behalf | OAuth2Purchase | Independently checked, never requested; no purchase endpoint implemented | No purchase tool | UNAVAILABLE; keep the known disabled permission disabled |
| Execute MCP CAD mutation | Separate native MCP authorization and containment contract | Unknown for future MCP execution; REST scopes cannot establish it | Never inferred from the REST connection | Disabled | UNAVAILABLE; a separate increment must establish the MCP contract |

The provider mapping lists exact scope meanings. The matrix does not claim that
all endpoint behavior, purchase semantics or MCP grants have been validated.
Disabled deletion permission is not assumed necessary for workspace creation.

## Trusted application attestations

`oauth.applicationPermissions` accepts optional Boolean fields:

```json
{
  "canReadDocuments": true,
  "canWriteDocuments": true,
  "canDeleteDocumentsAndWorkspaces": false,
  "canRequestPurchases": false,
  "canShareAndUnshareDocuments": false,
  "canReadProfileInformation": false
}
```

This is an illustrative operator attestation, not a recommendation to enable
writes. Record true only after checking the actual application setting. Omission
means UNKNOWN; false means known disabled. Configuration grants no token scope or
agent authority and must never be supplied through agent arguments. The four
known disabled permissions must be recorded explicitly by the operator. The
manifest and runtime parser accept the same fields and reject unknown fields.

## Consent, grants and refresh

Read consent remains the default. CLI `--rest-write` and the internal dashboard
lifecycle option request read+write only after an explicit operator choice and a
trusted enabled-write attestation. The current page does not add a write-consent
button. The plugin never requests deletion, sharing, purchase or profile scopes.
Existing read-only grants require explicit reauthorization for writes; refresh
cannot upgrade them.

Token parsing rejects missing required scopes, unexpected extra grants and
malformed scope data. Under [RFC 6749 sections 5.1 and 6](https://www.rfc-editor.org/rfc/rfc6749#section-5.1),
scope omission can represent an unchanged grant. The parser permits inheritance
only in the completed consent exchange or from the previous private refresh
grant. Standalone parsing with no scope cannot fabricate a grant. Refresh retains
the existing required scopes and rejects both unexpected expansion and loss.

Old private records with no scopes field came from the previously read-only
onboarding contract. They migrate to OAuth2Read only. Explicit malformed, empty
or oversized scope arrays are rejected; they never normalize to a valid grant.
The normal read path also fails fast on a known disabled application read
permission or an explicit grant without OAuth2Read.

## Internal candidate authorization

`candidateAuthorization(current, identity, stateDir, assertConsent)` is a narrow
host adapter. Its opaque object is registered privately in-process; a request
object cannot imitate it. The host supplies trusted invocation identity and an
explicit current-consent assertion. The adapter resolves the configured Engineer
binding, rejects Lead/A2A identities, checks the configuration snapshot and reads
the exact owner/connection credential record. The Engineer role must match the
configured engineerAgentId, delegation Engineer or default native Engineer ID.

RestClient receives this adapter only through its host constructor options.
Preparation input contains source revision, optional candidate ID/name and the
explicit completed-attempt acknowledgement. Authorizing Booleans and target
overrides are rejected before network access. A missing or forged adapter fails
closed. Creation requires actual read+write grants, trusted application write
confirmation and current consent; unknown write permission remains UNKNOWN and
blocks dispatch. Read-only inspection/reconciliation needs read authority but
does not require write consent or scope.

Candidate GETs recheck read authority and the actual token. The POST rechecks
write authority and token equality before and after receipt persistence, directly
before dispatch. A final synchronous recheck introduces no promise boundary
between the decision and the fixed provider fetch. Changed configuration, revoked invocation, disconnected or
changed credentials, missing scopes and withdrawn consent prevent dispatch.
A receipt written just before a denied dispatch conservatively remains UNKNOWN;
it is not automatically retried. Known creation followed by failed verification
preserves the unresolved receipt and candidate ID.

No production agent caller constructs this write adapter in the current product.
The helper has no unrestricted HTTP path, new service, permission database,
generic IAM framework or MCP credential bridge.

## Compact status and audit

Status and CLI use a capability summary of at most 2,048 bytes. Each fixed
operation has availability, a diagnostic reason and short remediation guidance.
No feature inventory, token, secret, raw provider message or historical receipt
archive is included. Detailed layer checks are available to internal reviewers
through assessCapabilities and are omitted from routine agent turns.

AVAILABLE requires every layer and operation-specific provider evidence.
UNAVAILABLE means at least one known prerequisite fails. UNKNOWN means evidence
is incomplete, with no known failure. A missing application setting stays UNKNOWN
in its layer even when the operation is UNAVAILABLE because agent policy denies
it. Status makes no network probes and stores no read evidence; its unverified
read label is not a request for an automatic probe loop. Agents should use the
actual authorized read/render result for the requested task.

Rejected candidate authorization emits a clear WARNING with the structured event
`claw_onshape.candidate_authorization_rejected`, timestamp, owner hash, document
ID and fixed diagnostic reason. It never echoes request contents or credentials.
Existing unresolved-attempt warnings remain unchanged. The host owns rotation,
retention and audit access; the plugin creates no additional log archive. A denied
request is evidence of rejection, not proof that its sender was malicious.

## Evidence and remaining acceptance

Offline tests use real private files and locks with mocked provider responses and
a mocked native atomic writer. They cover scope mismatch/inheritance, malformed
stored grants, known disabled and unknown permissions, forged authorization,
wrong identity/target, revocation before POST, bounded summaries and read-only
reconciliation. Existing read/render and signed A2A regressions remain covered.

These checks establish neither deployed behavior nor live candidate creation.
Operator application attestations, explicitly approved write reauthorization,
native writer durability and live exact-source candidate acceptance remain
required before claiming live REST write acceptance. MCP execution additionally
requires independently verified native authorization, candidate-only target and
code containment, write-time revision protection and its own acceptance tests.
