---
name: "onshape-verify-candidate"
description: "Verify Onshape Candidate changes with live native MCP reads and independent control-plane evidence; reconcile uncertain outcomes without write retries."
---

# Verify a Candidate result

Use the target, baseline, intended change and attempt reference supplied by the
host-authorized mutation context. This skill performs reads; it never retries a
write, creates a replacement Candidate or promotes a workspace.

Read the assigned Candidate through native `getPartStudioFeatures`. Locate the
affected feature by its approved ID and parameters by `parameterId`. Record the
resulting `sourceMicroversion`, current expressions, suppression state and feature
evaluation errors. Compare against the captured before-state: requested parameters
must match the approved change and unrelated parameters must be preserved.

For a mounting-hole diameter change, verify the mapping from the changed parameter
to all requested mounting holes. Use allowed geometric reads for actual diameters
when the task requires geometric proof. Parameter expressions and rendered images
are useful evidence but are not substitutes for diameter measurements. Report
unavailable measurements as unverified instead of claiming “all holes verified”.

Obtain independent Claw-Onshape verification and confirm the protected Primary
revision remains unchanged. Keep native observations distinct from independent
verification; use only actual returned evidence and signatures. The currently
deployed `onshape_verify_feature_read` verifies plate width only and cannot certify
hole diameters or a mutation attempt.

Return the before/after values and units, Candidate target, baseline/result
microversions, evaluation state, Primary preservation, attempt outcome and evidence
limits. For UNKNOWN attempts, report the observed state to the control plane for
reconciliation; an apparently matching model is not permission to redispatch or
declare the original attempt resolved.


## Signed free engineering task and Candidate receipt verification

For engineering-request envelopes use onshape_complete_task with original request,
summary and actual native feature parameter/state evidence; the generic verifier
supports holeDiameter, plateWidth and other actual parameter IDs. Use
onshape_reconcile_update with request and proposalId for the approved Candidate
attempt: it checks parameter/state results and Primary preservation and revokes
completed authority. It never retries a write. Return proposalId and distinguish
VERIFIED from UNKNOWN; parameter verification does not prove every geometric hole.
