# A2A result integrity and audit warnings

Claw-Onshape signs all result JSON fields recursively with HMAC-SHA256, bound to
the delegation context. Object keys are sorted at every level; array order is
significant. Non-JSON values, accessors, cycles and excessive nesting are rejected.
Existing flat result signatures remain compatible. Both agents must use the new
serialization for nested results; there is no fallback to the old incomplete
signature check.

The Lead's result-admission path rejects missing, malformed or mismatched proofs
and invalid result JSON. It emits a warning through `api.logger.warn`, followed
by one JSON audit record. Direct adapter calls use `console.warn` by default;
this is also the fallback if the injected logger throws. Logging failure never
allows an unverified result.

The fixed message starts with:

```text
WARNING: Claw-Onshape rejected an unverified A2A result; possible tampering or protocol mismatch.
```

Audit record fields:

| Field | Meaning |
| --- | --- |
| `event` | `claw_onshape.a2a_result_rejected`, stable search/filter key |
| `schemaVersion` | `1` |
| `eventId` | Unique identifier for this rejection |
| `timestamp` | UTC time in ISO 8601 format |
| `severity`, `outcome` | `WARNING`, `rejected` |
| `reason` | Bounded rejection reason, such as `result_signature_mismatch` |
| `leadAgentId`, `engineerAgentId` | Agent identifiers from trusted configuration |
| `bindingDigest` | Existing digest of the authorized binding; no raw requester identity |
| `contextSha256` | SHA-256 of the expected delegation context |
| `taskSha256` | SHA-256 of the accepted task ID, when known |
| `receivedResultSha256` | SHA-256 of the bounded received result text, when available |

Reasons are `task_context_mismatch`, `invalid_result_shape`,
`invalid_result_json`, `invalid_result_object`, `missing_result_proof`,
`invalid_result_proof_format` and `result_signature_mismatch`.

Result text, proofs, keys, OAuth credentials and transport tokens are never
included in the warning. Provider/model-controlled text is represented only by a
digest, preventing log-line injection. A signature rejection indicates possible
tampering, a serialization/version mismatch, or a malformed response; it does
not establish attacker intent.

The host owns log persistence, retention and access control. Operators can collect
and filter the stable event in their existing host logging system for an audit
trail. This plugin does not provide a separate durable or tamper-evident audit
store, and does not change deployment logging configuration. Tests establish
warning emission and host-logger wiring with mocked transports, not live log
retention.
