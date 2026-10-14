# Free engineering tasks and native Candidate execution

Lead uses `onshape_delegate_task` with `workflow` inspect/edit/verify and freely
formulated `task`. The control plane binds configured target and A2A context and
hashes/signs the envelope with the existing shared delegation key. This establishes
shared-key provenance, not non-repudiation or a Verifiable Credential. Engineer
loads its installed Workshop skill, chooses native MCP operations, and finishes
through `onshape_complete_task` with the original request and observed evidence.
Arbitrary actual feature parameter IDs are verified against fresh REST reads at
the reported microversion. The summary remains agent interpretation.

## Implemented Candidate write sequence

1. Operator grants read/write OAuth and prepares a Candidate in the dashboard.
2. Host previews/applies Candidate assignment through
   `scripts/provision-candidate-mcp.mjs --candidate ID [--execute]` using Clawake.
3. Engineer reads native v16 feature metadata and records the complete proposed
   update using `onshape_propose_update`. An edit request does not itself approve it.
4. Host previews/applies the proposal's exact MCP target/feature/revision policy
   with the same utility and `--proposal ID`. Primary remains excluded.
5. Operator reviews the displayed target/body/hash and approves in the dashboard.
   The control plane persists UNKNOWN before publishing five-minute execution
   authority. Unreadable receipts block subsequent proposals and approvals.
6. Lead delegates edit intent with `approvalId`. Engineer obtains the exact
   `onshape_mutation_context`, invokes native `updatePartStudioFeature` once, reads
   again, and reconciles through `onshape_reconcile_update`.
7. Only VERIFIED permits a verified change report. UNKNOWN never permits automatic
   retry. Reconciliation checks approved parameter expressions, feature state and
   Primary revision; it is not complete geometric equivalence verification.

MCP uses the pinned local fork f27613e7854de1b4c8de2438c8f6c87761259cd5. Its
optional private approval file binds exact JSON body and expiry in addition to
existing target/revision/OAuth checks. Provider CAS and single-attempt dispatch
are not a durable exactly-once ledger. Future verified VC/VP claims should cover
subject, audience, target, operation, payload digest, revision, approval and expiry
at this seam; no DID resolver or credential issuance stack is added. The fork
commit is local and unpublished, so reproducible builds currently require the
local source override documented by the build metadata.

## Acceptance status

Read-only Discord/A2A/native-MCP execution is evidenced in the live demo and
dashboard repair reports. The free hole inspection returns independently verified
`holeDiameter=4 mm` and a clean Gateway session. Candidate write implementation
has unit coverage but no live CAD mutation acceptance yet. The deployed target
remains protected Primary read-only; do not infer write readiness from OAuth scope
alone. Dashboard readiness retains conservative mutation blockers until acceptance.
