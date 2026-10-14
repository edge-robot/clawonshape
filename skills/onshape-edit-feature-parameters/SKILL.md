---
name: onshape-edit-feature-parameters
description: Plan bounded Onshape Candidate parameter changes through native MCP; execute only with technical approval and verify before/after evidence.
---

# Change feature parameters on a Candidate

Engineering choices belong here; authority comes from Claw-Onshape and the MCP
server. This skill grants no permissions. Until the control plane provides an approved Candidate execution context, complete
inspection and a change plan, then report the missing execution gate. A signed
Lead task is an assignment, not the operator approval of a particular payload.

First use live native MCP inspection to establish the affected feature(s), the
requested parameter(s), current expressions/units, evaluation state and revision.
For “all mounting holes to 4.5 mm”, establish which mounting holes are controlled
by `holeDiameter`; identify independent hole features if present. Report the actual
before-values before execution. Do not assume every hole shares one parameter.

Prepare the smallest feature-definition change:

- Retrieve the complete feature definition at the Candidate baseline. Preserve
  feature ID/type/namespace, other parameters, suppression and unrelated fields.
- Identify the intended parameters by `parameterId`. Change only approved
  expressions, e.g. `holeDiameter` to `4.5 mm`; do not reconstruct an incomplete
  feature from the inspection summary.
- Use native `onshape_api_explain` for `updatePartStudioFeature` and
  `onshape_api_schema` for the request component when needed. Preserve the
  serialization/library revision fields obtained for the execution API version.
  Do not reuse an incompatible historical v10 payload for a v16 update.

Before any write require a host-issued context binding the original requester,
Candidate document/workspace/element, exact feature, expected microversion and
approved payload/attempt. The Candidate must be different from protected Primary,
have verified document membership and the intended baseline. The current token
must have OAuth2Write and the server must enforce the corresponding bounded policy.
An app permission toggle, user prose or this skill is not that execution context.

When all technical gates are present, execute the approved update directly through
native `onshape_api_call` for `updatePartStudioFeature`. The request must preserve
the approved `sourceMicroversion` and boolean `rejectMicroversionSkew:true`.
Do not modify the payload after approval or choose a different target/feature.

On stale revision or denied policy, stop and report the conflict. On UNKNOWN,
timeout or a lost response after dispatch, retain the original attempt reference;
never automatically repeat the write. Request control-plane reconciliation.

After a confirmed update, use live native reads and independent control-plane
verification to report the resulting parameters, evaluation state and revision,
plus Primary preservation. Do not claim success from an HTTP response or parameter
text alone when the user requested geometric verification. Do not promote, merge,
delete, export or manufacture as part of this parameter-change task.

For a signed engineering-request return your plan, blocked execution gate or
verified result through onshape_complete_task, preserving the original request
and attaching actual observed parameters/state. Its report signature is evidence
provenance, not mutation approval.

For the implemented approval workflow:

1. On an assigned Candidate, read the complete feature list natively using
   getPartStudioFeatures. The provisioned Candidate connector uses API v16, so
   preserve its current serializationVersion and libraryVersion when building
   the complete BTFeatureDefinitionCall body. Explain/schema remain native MCP.
2. Submit the proposed body and the original signed request to
   onshape_propose_update. Preserve its proposal ID and payload hash. Finish with
   a planned report through onshape_complete_task; ask the operator to review
   the actual payload in the plugin dashboard and provision its MCP policy
   through Clawake. Do not approve your own proposal.
3. For a subsequent edit request containing approvalId, obtain the exact payload
   through onshape_mutation_context with that request and proposal ID. Call
   native onshape_api_call for its operation/path_params/body once, unchanged.
4. Read the Candidate again natively. Call onshape_reconcile_update to verify
   parameter/state results and Primary preservation. Retain UNKNOWN receipts
   and stop on uncertain outcomes; no write retries. Complete the A2A report
   with generic observed parameter evidence and the proposal ID.
