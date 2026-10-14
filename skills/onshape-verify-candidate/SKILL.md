---
name: onshape-verify-candidate
description: Verify Onshape Candidate changes with live native MCP reads and independent control-plane evidence; reconcile uncertain outcomes without write retries.
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
verification; use only actual returned evidence and signatures. Use `onshape_complete_task` for a signed engineering-request: it independently
checks actual feature parameter/state observations at the reported revision.
A parameter match does not prove geometry or resolve a mutation attempt by itself.

Return the before/after values and units, Candidate target, baseline/result
microversions, evaluation state, Primary preservation, attempt outcome and evidence
limits. For UNKNOWN attempts, report the observed state to the control plane for
reconciliation; an apparently matching model is not permission to redispatch or
declare the original attempt resolved.

Use onshape_reconcile_update with the signed request and proposal ID for the
implemented Candidate approval receipt. It checks parameter/state results and
Primary preservation, revokes the issued approval after verification, and never
executes MCP or redispatches an update.
