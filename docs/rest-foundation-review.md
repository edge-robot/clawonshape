# REST foundation acceptance review

Date: 2026-10-12. Baseline: `42f41b3`, plus the package 5 working-tree checks.
This reviews observable repository code and test evidence. It does not certify
a deployment of the new code or authorize MCP mutation.

## Progress and decision

Completed: signed nested A2A results and rejection warnings; exact-source
candidate validation; bounded persistent duplicate fencing; trusted host write
authorization and three-layer capability reporting; English role contracts.
Package 5 adds a real SDK file check and missing-document response tests.

Missing acceptance evidence: the exact API v10 workspace creation contract and
a live exact-source candidate creation through this helper. No production agent
write tool or production caller of the internal write adapter exists.

| Area | Assessment | Basis |
| --- | --- | --- |
| Architecture | PASS | REST lifecycle only; no geometry mutation, service, database, merge or promotion |
| Candidate safety | PARTIAL | Offline isolation/revision/fencing checks pass; provider contract remains unverified |
| OAuth enforcement | PASS for tested internal helper | Actual Read+Write grant, trusted write attestation and host consent required; read-only connections cannot upgrade through refresh |
| Agent capability awareness | PARTIAL | Compact status distinguishes UNAVAILABLE and UNKNOWN; current status has no persistent provider success evidence |
| MCP readiness | NO-GO for live mutation | REST acceptance and native candidate containment still required |

The implementation is ready for controlled REST acceptance testing, not final
live REST acceptance. The primary is protected by tested fixed bindings and
candidate isolation checks. A current live write grant has not been verified.
Agents can identify policy denial and missing grants/settings before attempting
operations; UNKNOWN still requires trusted evidence. MCP must remain disabled.

## Provider contract evidence

| Question | Verified evidence | Remaining limitation |
| --- | --- | --- |
| Workspace endpoint | Official generated [Document API](https://github.com/onshape-public/go-client/blob/master/onshape/docs/DocumentApi.md) exposes POST `/documents/d/{did}/workspaces` | Generated client is v16; repository is v10 |
| Exact microversion input | Official [request model](https://github.com/onshape-public/go-client/blob/master/onshape/docs/BTVersionOrWorkspaceParams.md) includes `microversionId`, `versionId` and `workspaceId` as optional fields | Field presence does not prove v10 accepts a microversion alone or guarantee exact branch semantics |
| Immutable version required | No verified evidence that a version is mandatory for this request | Do not create a version or assert that it is unnecessary until the selected API contract is established |
| Candidate document identity | Official [response model](https://github.com/onshape-public/go-client/blob/master/onshape/docs/BTWorkspaceInfo.md) marks `documentId` optional | Repository requires it for creation and membership verification; omissions fail closed |
| API v10 examples | Official [document guide](https://onshape-public.github.io/docs/api-adv/documents/) documents v10 document inspection, elements and version creation | Does not establish this workspace creation request/response |
| Scope meanings | Official [authorization definitions](https://github.com/onshape-public/go-client/blob/master/onshape/README.md#documentation-for-authorization) document Read, Write, Delete, Share, ReadPII and Purchase | No verified public application-checkbox introspection endpoint or endpoint-specific live grant evidence |
| Lost POST response | Repository writes UNKNOWN before dispatch; uncertain response remains fenced | No provider idempotency guarantee established; never retry automatically |

The API Explorer was not accessible through the research tool. This limitation
is retained as an acceptance gate, not replaced with guessed server behavior.
Obtain the selected v10 endpoint definition from the official Explorer or a
provider-supported contract, then verify the exact baseline with the helper.
Do not change API versions solely to match a generated client.

The complete permission matrix and operator actions are in
[oauth-capabilities.md](oauth-capabilities.md). The four known disabled
application permissions remain disabled and are not prerequisites inferred for
candidate creation. REST OAuth never establishes MCP authorization.

## Findings

No verified target escape or privilege escalation was found in this checkpoint.
The following are acceptance gaps, rather than demonstrated live provider bugs.

| Severity | Reference | Evidence and consequence | Correction |
| --- | --- | --- | --- |
| HIGH | `src/rest.ts:329`, `src/rest.ts:345`, `src/rest.ts:131` | v10 microversion branch semantics and required document fields are not verified. A valid provider response could leave the helper UNKNOWN or CREATED_UNVERIFIED | Establish the exact provider contract before live acceptance; retain fencing and membership checks |
| MEDIUM | `src/capabilities.ts:60`, `src/connections.ts:24` | Status has no stored operation-specific successful provider evidence; correctly remains UNKNOWN even after historical read acceptance | Document this conservative behavior; any future evidence must be bounded and tied to current connection and target |
| MEDIUM | `src/candidate-authorization.ts:48` | Adapter is internal; no production preparation caller is wired | Exercise an explicit operator-controlled adapter for acceptance; design any agent-facing write flow as a separate reviewed increment |

## Independent validation

`npm test`: **65 passed**, zero failed or skipped. `npm run typecheck`: passed.
Provider responses and the file SDK are mocked in this suite. Actual filesystem
tests cover receipt bounds, locks and reopening stores; these are not native
host or live provider acceptance.

Added coverage checks missing `documentId` after POST, missing membership evidence
for existing and new candidates, GET-only reconciliation, preservation of an
uncertain outcome across restart, and the exact two-field creation body.
The tests deliberately do not assert that mocks establish API v10 compatibility.

`npm run test:native-files` uses a fresh process without the suite's SDK hook.
In the local npm installation it reports UNAVAILABLE because the exported
runtime JavaScript file is absent. This is a local installation limitation;
the declaration file and offline tests cannot prove runtime availability.

The same script executed through Node stdin in the running
`clawcad-mechanical-engineer` container: **PASS** for real SDK private ownership
and permissions, durable option acceptance, complete replacement, absence of
leftover temporary files, fresh-process reading and symlink rejection. Only
synthetic temporary files were written and removed. No credentials, provider
requests, plugin installation or agent messages were involved.

This functional check does not simulate a crash, verify atomic visibility under
concurrent readers, or establish storage behavior under power loss. Its compact
output explicitly records `powerLossDurability: UNVERIFIED`.

Read-only host source inspection followed `secret-file-runtime.js` into
`secret-file-BUNgfGOI.mjs` and `@openclaw/fs-safe/secret-file.js`.
`materializeSecretFileAtomic` supplies `sync: params.durable !== false` but
`strictFileSync: createOnly && params.durable === 'file'`. The plugin uses the
overwrite writer (`createOnly` false). In the inspected fallback,
`file-sync.js` ignores only EPERM and propagates other sync errors. This was a
verified conditional error-handling gap, not evidence of an actual lost receipt.
The correction below closes that gap in repository code. Native backend behavior
and forced crash recovery remain separate evidence. The functional SDK test does
not inject EPERM.

## Resolved synchronization finding

The originally HIGH finding at `src/candidate-attempts.ts:78` is corrected in
the package 5 working tree. After the native write, the helper opens the receipt
with `O_NOFOLLOW`, checks regular-file type, owner, private mode, single link,
bounded exact length and byte-for-byte expected content. It strictly calls
`FileHandle.sync()` and verifies that the published path still identifies the
same private inode before synchronizing the directory. No sync error is ignored.

Fault-injection tests make the real Node file-handle sync reject with EPERM and
EIO: zero POSTs, sanitized failure, UNKNOWN receipt retained, and a new client
refuses to retry. A second test fails sync after a successful POST: the known
candidate stays CREATED_UNVERIFIED and GET-only reconciliation can finish later.
The SDK and provider remain mocked in these fault tests. Bounds are unchanged;
the additional read buffer is 2049 bytes and no extra persistent record is added.

## Corrections and next increment

Before REST acceptance: resolve the provider contract, verify native crash
recovery with the corrected helper, and perform the scoped live lifecycle test while checking
primary revision and configuration invariance. Leave unresolved receipts intact.

Before MCP integration: establish native target containment, separate MCP grants,
requester/role isolation, revision checks and protection against route bypass.
The Lead must retain delegation-only authority. No REST scope can replace this.

Can defer: persistent read-success evidence and broader operator capability UX.
No generic IAM framework, new database or provider abstraction is required.

The [E2E checklist](rest-foundation-e2e.md) separates offline, native host,
read/render and explicitly scoped live candidate evidence for all five packages.
