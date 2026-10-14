---
name: "onshape-edit-feature-parameters"
description: "Plan bounded Onshape Candidate parameter changes through native MCP; execute only with technical approval and verify before/after evidence."
---

# Change feature parameters on a Candidate

Engineering choices belong here; authority comes from Claw-Onshape and the MCP
server. This skill grants no permissions. Current deployment is read-only: until
the control plane provides a valid mutation context, complete inspection and a
change plan, then report the missing execution gate without calling a write.

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


## Signed free engineering task and implemented Candidate execution

A Lead edit request expresses intent; operator approval binds an actual payload.
On Primary, inspect and report a plan/blocked Candidate gate. On an assigned
Candidate, use native v16 getPartStudioFeatures, preserving the complete feature,
serializationVersion, libraryVersion, sourceMicroversion and rejectMicroversionSkew:true.
Use onshape_propose_update with original request, body and summary. Return planned
status and proposalId through onshape_complete_task. The operator reviews the
actual proposal in the plugin dashboard and provisions its MCP policy through Clawake.
For an edit request with approvalId, call onshape_mutation_context with request and
proposalId. Execute its exact operation/path_params/body ONCE through native
onshape_api_call. Never change the approved payload or retry UNKNOWN. Read again
natively and call onshape_reconcile_update; finish through onshape_complete_task
with observed parameter evidence and proposalId. Only a VERIFIED mutation receipt
permits a verified execution claim. These control-plane tools never execute MCP.
