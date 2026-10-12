# REST foundation E2E checklist

This is the next acceptance exercise, not a record of a completed E2E run.
Use a fresh native agent session after role changes: resumed sessions can retain
the previous instruction snapshot. Record the tested commit and installed
artifact digest; historical read/render success does not validate this revision.

## Evidence limits

Keep one compact operator report with step, outcome, fixed reason, timestamp and
correlation IDs. Do not store whole API schemas, raw conversations, images as
base64, feature arrays or tokens in the report. Keep existing artifact handling
and host log retention. Candidate receipts remain at most 64 x 2048 bytes;
capability and candidate results remain at most 2048 bytes. This checklist is
operator documentation, not content to append to every agent prompt.

## All-package sequence

| Package | Exercise | Acceptance evidence |
| --- | --- | --- |
| 1 | Fresh Lead to Engineer read/render; isolated negative test modifies a nested signed result | Valid original result accepted; tampered result refused with correlated WARNING and no sensitive payload |
| 2 | Verify trusted document, source workspace, Part Studio and captured source microversion; inspect a candidate baseline | Exact membership and baseline; source and primary cannot become candidate targets |
| 3 | Isolated test persists UNKNOWN, interrupts/reopens the client, attempts preparation again and reconciles a known candidate by GET | One POST at most; unresolved receipt survives; no blind retry; private bounded records |
| 4 | Read-only grant, absent write attestation, Lead identity, claimed authority and changed binding | Fail before POST with distinct sanitized reasons; compact capability summary; MCP remains UNAVAILABLE |
| 5 | Real SDK check, selected v10 contract evidence and scoped candidate acceptance | Native checks and contract recorded separately from mocked and live evidence |

First run `npm test`, `npm run typecheck` and `git diff --check` locally. Run
`npm run test:native-files` where the complete pinned OpenClaw runtime exists.
Its synthetic files are temporary and private; it does not access Onshape.
Use native plugin diagnostics on both roles to verify current artifact loading
and grants. Clawake owns installation and reconciliation.

Then validate the existing native Discord read/render path on the authorized
target. Verify signed nested metadata, exact originating delivery binding,
pinned revision, artifact integrity and token-free results.

## Live lifecycle gate

No production agent candidate tool exists. A read/render E2E alone cannot prove
candidate creation. Before any live POST, establish the v10 contract and review
a concrete operator invocation of the existing internal host adapter, including
trusted owner, document, source, protected primary and explicit consent.
Verify the actual current Read+Write grant and trusted write-app attestation.
Do not enable the four disabled application permissions or MCP tools.
Verify that the tested artifact contains the strict receipt synchronization
correction; normal SDK success does not test its suppressed EPERM error path.

Capture the primary microversion, trusted configuration digest and source
microversion before preparation. Authorize at most one candidate creation in
that exact document from that exact source revision. Capture the candidate ID,
attempt ID, exact baseline and resulting primary microversion. Check that primary
revision and active configuration are unchanged. External concurrent changes
must be reported separately rather than attributed without evidence.

If the POST result is uncertain, stop: retain the receipt and use GET-only
reconciliation when a trusted candidate ID exists. Do not retry by changing the
name, source, agent or connection. A timeout simulation belongs in the isolated
test environment, not against the provider. Candidate deletion, sharing,
promotion, merge and geometry mutation are outside this exercise.

Finish with a per-step PASS/FAIL/UNAVAILABLE report. Mark a blocked live step
UNAVAILABLE with its missing prerequisite; never convert mocked evidence into
live acceptance or certify all packages from the historical read/render run.
