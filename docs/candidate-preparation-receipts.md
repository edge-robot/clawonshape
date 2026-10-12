# Bounded candidate preparation receipts

Candidate preparation remains an internal REST helper. This increment does not
register an agent write tool, grant write access, or enable MCP mutation.

Creation requires a trusted private host state directory supplied through the
third `RestClient` constructor argument, `{stateDir, warn, authorization}`. The host should route
`warn` to its existing logger. Without persistent state, creation fails before
provider requests. Existing-candidate inspection remains read-only and requires
the trusted authorization adapter described in [OAuth capabilities](oauth-capabilities.md).

## Storage and response limits

The directory `claw-onshape-candidate-attempts` contains at most 64 receipts,
each at most 2,048 bytes. Each connection owner and document has one latest
receipt. Both reading and writing enforce the bound. Receipt payload storage is
therefore at most 128 KiB; filesystem metadata, one lock and the native writer's
temporary replacement file add overhead. A full store refuses new slots while
allowing updates to existing slots. Unexpected files or unsafe permissions fail
closed.

Receipts contain fixed identifiers, timestamps, status, a request digest, feature
count and an optional fixed diagnostic code. They contain no geometry, feature
lists, tokens, workspace names, raw provider messages or growing history.
Candidate results are independently limited to 2,048 bytes and return only the
feature count. This is a byte limit, not an exact model-token budget; receipts
are never automatically inserted into agent context.

## Dispatch and restart safety

A private, non-waiting global lock serializes preparation. An `UNKNOWN` receipt
is atomically written and synchronized before dispatching a POST. The directory
entry is synchronized too. A storage failure prevents dispatch.

`UNKNOWN` means the outcome cannot be established. `CREATED_UNVERIFIED` means
the expected creation response supplied an isolated candidate ID, but subsequent
validation or persistence did not complete. Both block further creation across
restarts, changed names and changed source revisions. There are no automatic
POST retries, polling loops, expiration or deletion of unresolved receipts.

`reconcileCandidateWorkspace` performs GET requests only, and only for a
candidate ID confirmed by the expected POST response. It checks document
membership, isolation and the stored exact source revision. A matching name or
an empty workspace listing cannot clear an `UNKNOWN` outcome. Such outcomes
require operator investigation; this increment exposes no automated clearing
API. Inspecting an arbitrary existing candidate does not clear a receipt.

A verified preparation is reused with fresh read-only validation. Starting a
new preparation after `VERIFIED` or a confirmed HTTP `REJECTED` outcome requires
the exact previous `replaceCompletedAttemptId`. This acknowledgement is an
internal request contract, not authorization or a substitute for write consent.
HTTP 408, server errors, timeouts and malformed responses remain uncertain.

A leftover lock after a crash blocks further preparation. Operators must verify
that no preparation is running and investigate the receipt before recovering
the lock. Do not delete unresolved receipts to make retries work.

## Audit evidence

Unresolved outcomes and blocked repeats emit a clear `WARNING` and a structured
single-line event: `claw_onshape.candidate_outcome_unresolved` or
`claw_onshape.candidate_repeat_blocked`. Events include a timestamp, attempt ID,
owner hash, document ID, status and an optional sanitized diagnostic code.
They contain no credentials or raw provider payloads. Correlate events by
attempt ID. These events record safety-relevant behavior; they do not prove that
a blocked repeat was malicious.

The host owns log rotation, retention and audit access. Receipts are bounded
safety state, not a complete or tamper-evident historical audit trail. No second
log archive is created, and logs are not returned as agent context.

## Evidence limitations

Tests use real temporary files, permissions, locks and restart receipts, with
mocked provider responses and a mocked native private-file writer. They verify
dispatch ordering, bounds, fencing and GET-only reconciliation, but do not
establish native writer crash durability or live Onshape write acceptance.
Write authorization and OAuth capability enforcement are covered by the narrow
host adapter and [capability contract](oauth-capabilities.md). No production agent
caller is registered for candidate creation.
