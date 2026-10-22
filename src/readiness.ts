export const messages = {
  feature_observation_mismatch:
    'The native MCP observation does not match a fresh independent Onshape read. No verified result is available.',
  plugin_unavailable: 'Claw-Onshape is unavailable. Ask the operator to enable it for the Mechanical Engineer.',
  not_configured: 'Claw-Onshape is installed, but no authorized user connection has been configured yet.',
  oauth_configuration_required:
    'Claw-Onshape is installed, but the Onshape application has not been configured yet. Ask the operator to provision the application.',
  dashboard_callback_required:
    'The operator needs to register and configure the OpenClaw dashboard OAuth callback before Connect can be used here.',
  disconnected:
    'Onshape is not connected. Open Claw-Onshape in the Mechanical Engineer dashboard and choose Connect Onshape.',
  authorization_in_progress:
    'Onshape authorization is in progress. Complete browser consent, then refresh the connection status.',
  reconnect_required:
    'Your Onshape connection needs to be renewed. Choose Connect Onshape in the Mechanical Engineer dashboard.',
  oauth_refresh_rejected:
    'Onshape rejected renewal of this connection. Choose Connect Onshape in the Mechanical Engineer dashboard to authorize again.',
  oauth_refresh_response_invalid:
    'Onshape returned an invalid connection-renewal response. Ask the operator to inspect the diagnostic code and reconnect through the Mechanical Engineer dashboard.',
  credential_store_unavailable:
    'The private connection store is unavailable. Ask the operator to check its ownership and permissions.',
  target_missing: 'No Camera Mount Plate Part Studio has been selected. Ask the operator to configure the target.',
  live_reads_disabled: 'Onshape is connected, but REST access has not been enabled for this user.',
  connected: 'Onshape is connected. The selected Camera Mount Plate still needs a successful provider read.',
  ready: 'Onshape is connected and the Camera Mount Plate is available.',
  authorization_changed:
    'The authorization for this request has changed. Retry from your original authenticated session.',
  delegation_denied:
    'This delegated request has no valid user authorization. Ask the operator to check the trusted Lead-to-Engineer delegation setup.',
  delegation_result_invalid:
    'The Mechanical Engineer returned a result that could not be verified. Ask the operator to inspect the A2A result transport.',
  provider_forbidden:
    'Onshape denied access to the selected Camera Mount Plate. Check that the connected account can read it.',
  provider_not_found: 'The selected Camera Mount Plate could not be found in Onshape.',
  provider_rate_limited: 'Onshape has reached its request limit. Please try again later.',
  provider_unavailable: 'Onshape is temporarily unavailable. Please try again later.',
  provider_transport_error: 'The Onshape request could not be completed. Please try again later.',
  provider_protocol_error: 'Onshape returned an unexpected response. The operator can inspect the diagnostic code.',
  provider_image_invalid: 'Onshape did not return a valid Camera Mount Plate image.',
  workspace_not_in_document:
    'The selected workspace is not available in the configured document. Ask the operator to check the target.',
  target_not_part_studio:
    'The selected element is not an available Part Studio. Ask the operator to check the Camera Mount Plate target.',
  source_revision_missing: 'The current CAD revision could not be identified. No image was rendered.',
  source_revision_conflict:
    'The selected source revision changed before workspace preparation. Refresh and retry from the current revision.',
  candidate_revision_conflict:
    'The candidate workspace does not match the verified source revision. It cannot be accepted as a fresh experimental baseline.',
  candidate_not_isolated:
    'The candidate workspace must be separate from the source workspace. Select a dedicated experimental workspace.',
  candidate_verification_pending:
    'A candidate workspace was created but has not passed verification. Reconcile the existing attempt before requesting another workspace.',
  candidate_store_required:
    'Candidate creation requires a private persistent attempt store. Ask the operator to configure it.',
  candidate_store_unavailable:
    'The private candidate attempt store is unavailable or invalid. Creation is blocked; ask the operator to inspect it.',
  candidate_store_full:
    'The candidate attempt store has reached its bounded capacity. Creation is blocked; unresolved attempts must be preserved.',
  candidate_preparation_busy:
    'Another preparation or a stale private lock blocks this operation. Ask the operator to check the attempt; do not repeat workspace creation.',
  candidate_attempt_mismatch:
    'The supplied attempt does not match the recorded preparation. Use the original attempt reference.',
  candidate_result_too_large:
    'The candidate result exceeded its size limit. Ask the operator to inspect the recorded attempt.',
  provider_conflict: 'Onshape reported a conflict. Inspect the operation state before starting another request.',
  candidate_creation_unknown:
    'Workspace creation status is unknown after a transport interruption. Reconcile in Onshape before retrying.',
  oauth_read_scope_missing: 'REST read scope is missing. Reconnect Onshape with read consent.',
  app_permission_read_disabled:
    'The application has document read permission disabled. Ask the operator to review its configuration.',
  capability_result_too_large:
    'The capability summary exceeded its size limit. Ask the operator to inspect the diagnostic code.',
  oauth_write_scope_missing:
    'REST write access has not been granted for this connection. Reconnect Onshape and explicitly authorize REST write access.',
  app_permission_write_disabled:
    'The Onshape OAuth application has document write permission disabled. Ask the operator to review whether an approved task requires it.',
  app_permission_write_unknown:
    'Write permission status is unknown for this Onshape OAuth application. Ask the operator to verify application permission settings.',
  agent_policy_denied: 'This operation is intentionally blocked by current Claw-Onshape agent policy.',
  invalid_arguments: 'The tool arguments are malformed. Check the tool schema.',
  // Contract §6 plugin codes (docs/interface/onshape-mcp.md 0.4.0-draft); passed through unchanged.
  proposal_body_invalid:
    'Submit the complete native v16 feature from getPartStudioFeatures for the bound feature, with ' +
    'serializationVersion, libraryVersion, sourceMicroversion and rejectMicroversionSkew: true.',
  mcp_execution_disabled: 'Native MCP execution is disabled for this plugin. Ask the operator to review the setup.',
  mcp_discovery_failed: 'The native MCP server could not be discovered. Ask the operator to inspect the MCP status.',
  invalid_mcp_server: 'The native MCP server configuration is invalid. Ask the operator to fix it.',
  native_mcp_status_unavailable:
    'The native MCP status is unavailable or could not be parsed. Ask the operator to inspect it.',
  mutation_reconciliation_required:
    'An earlier approved update has an unknown outcome. Reconcile it with onshape_reconcile_update first.',
  mutation_approval_unavailable:
    'No current approval exists for this proposal. Ask the operator to approve it, or create a new proposal.',
  primary_revision_changed:
    'The Primary workspace changed during the update. Stop and escalate to the operator; do not retry.',
  mutation_outcome_unknown:
    'The update outcome is not known yet. Do not repeat the update; reconcile again later or ask the operator.',
  mutation_verification_mismatch:
    'The Candidate changed but does not match the approved update. Stop and escalate to the operator.',
  protected_primary_workspace: 'The Primary workspace is protected. Only the Candidate workspace can be changed.',
  mcp_credential_unavailable:
    'The Onshape credential for the native MCP server is unavailable. Ask the operator to reconnect Onshape.',
  mcp_credential_handoff_unavailable:
    'The credential handoff to the native MCP server is unavailable. Ask the operator to check its private directory.',
  // Contract §6 server codes; the plugin may observe them through the native MCP client.
  external_token_tool_denied: 'This MCP tool is not available in external-token mode. Choose a different tool.',
  external_token_read_policy_denied:
    'This read is outside the allowed MCP read set. Correct the request shape; new consent will not help.',
  target_policy_denied: 'This update is outside the MCP target policy. Escalate to the operator.',
  revision_policy_denied:
    'The update does not match the current Candidate baseline. Re-read the feature natively and create a new ' +
    'proposal with the current sourceMicroversion and rejectMicroversionSkew: true.',
  target_configuration_invalid: 'The MCP target configuration is invalid. Ask the operator to fix it.',
  external_token_configuration_invalid: 'The MCP external-token configuration is invalid. Ask the operator to fix it.',
  mutation_approval_mismatch:
    'The approval expired or does not match the submitted update. Create a new proposal and approval.',
  mutation_approval_consumed:
    'This approval was already used once. Do not repeat the update; reconcile it and create a new proposal if needed.',
  external_private_file_unavailable:
    'A private MCP handoff file failed its ownership or mode checks. Ask the operator to fix it.',
  external_token_unavailable:
    'The MCP server has no valid Onshape access token. Ask the operator to check the plugin connection.',
  external_token_expired: 'The MCP access token has expired. Wait for the plugin to refresh it, then try again.',
  external_token_write_scope_missing:
    'REST write access has not been granted. Ask the operator to reconnect Onshape with write consent.',
  external_token_client_unavailable: 'The MCP server could not build its Onshape client. Ask the operator.',
  external_token_request_failed: 'The MCP read request failed. You may retry the read.',
  mutation_outcome_unknown_reconcile_required:
    'The update outcome is unknown. Never retry it; call onshape_reconcile_update first.',
  external_token_auth_owned_externally: 'MCP authentication is managed by the plugin. No login is needed.',
  external_token_local_url_required: 'The MCP server requires a local URL. Ask the operator to fix the setup.',
  external_token_local_url_invalid: 'The MCP server local URL is invalid. Ask the operator to fix the setup.',
  external_token_validation_unavailable:
    'The MCP server could not validate its token setup. Ask the operator to fix the setup.',
  // Contract 1.1.0 §6/§12 server codes (goal grant); passed through unchanged.
  goal_grant_unavailable: 'The MCP server cannot read the goal grant. Stop and ask the operator to check the setup.',
  mutation_authority_conflict:
    'A goal grant and a payload approval are both active. Stop and ask the operator to resolve the conflict.',
  goal_grant_invalid: 'The goal grant is invalid or expired. Stop and report; a new confirmation is required.',
  goal_grant_stopped: 'The goal was stopped. Do not send further updates; stop and report.',
  goal_scope_denied:
    'This update is outside the confirmed goal scope (Candidate, feature or body keys). Correct the request; ' +
    'do not widen the scope.',
  goal_budget_exhausted: 'The goal dispatch budget is used up. Stop, verify and report.',
  goal_reconciliation_required:
    'An earlier goal update has an unknown outcome. Call onshape_goal_reconcile with the error data first; ' +
    'never retry blindly.',
  goal_dispatch_duplicate:
    'This exact update was already dispatched. Re-read the feature and build the next update on the current revision.',
  dispatch_journal_unavailable: 'The MCP dispatch journal is unavailable. Stop and ask the operator.',
  // goal-workflow.md §8 plugin codes.
  goal_unsupported: 'Goal authorization is not available: it is disabled here or the MCP server does not support it.',
  goal_not_found: 'No such goal exists for this binding.',
  goal_active_conflict:
    'Another goal is still open, or a goal holds live authority. Finish or stop it first; payload approval is ' +
    'blocked while a goal is active.',
  goal_hash_mismatch: 'The confirmed goal differs from the stored goal. Refresh the goal and review it again.',
  goal_confirmation_expired: 'The goal confirmation expired. Ask the Engineer to renew the goal.',
  goal_state_invalid: 'This goal action is not allowed in the current goal state, or its data is stale. Refresh.',
  goal_candidate_mismatch: 'The goal Candidate is missing or does not belong to the bound document.',
  goal_verification_incomplete:
    'The goal could not be verified completely. Some checks were not evaluable; nothing was marked complete.',
  goal_result_delivery_failed:
    'The goal result could not be posted to the original conversation. It is retried on the next Lead turn.',
  // work-context.md §8 plugin codes.
  selection_observation_stale: 'The Primary workspace changed since the catalog was read. Refresh and review again.',
  selection_part_missing: 'The selected part no longer exists at the current revision. Choose a part again.',
  selection_part_unsupported:
    'This part kind is not supported for a work context (only solid, non-mesh, non-flattened parts).',
  configuration_unsupported:
    'This Part Studio has configuration parameters. Configured Part Studios are not supported.',
  element_not_provisioned: 'This Part Studio is outside the provisioned MCP target and is not released for goals.',
  selection_target_not_allowed:
    'The selection is outside the bound document, Primary workspace or Part Studio. Nothing was changed.',
  selection_revision_conflict: 'Another selection was adopted first. Reload the work context and review it.',
  preview_unavailable: 'The part preview is not available.',
  // work-context.md §11.5 browsing codes.
  document_not_accessible: 'This Onshape document cannot be read with the connected account.',
  provider_quota_exhausted: 'The Onshape API call allowance is used up. Ask the operator to check the Onshape plan.',
  onshape_unavailable: 'Claw-Onshape could not complete this request. Ask the operator to inspect the diagnostic code.',
  oauth_reconnect_required: 'Onshape authorization did not complete. Choose Connect Onshape to retry.',
  oauth_connect_expired: 'Onshape authorization timed out. Choose Connect Onshape to retry.',
  approval_expired_not_dispatched: 'Approval expired without execution. Create a new proposal.',
  connection_busy_or_state_unavailable:
    'Another connection action is active, or the private state directory is unavailable. Wait and refresh; ask the operator if it persists.',
} as const;
export type ReadinessCode = keyof typeof messages;
export function state(code: ReadinessCode) {
  return {code, message: messages[code]};
}
const isReadinessCode = (value: string): value is ReadinessCode => Object.hasOwn(messages, value);
// Contract §6 (0.4.0): every listed code reaches details.code unchanged; only unknown codes collapse.
// Own keys only, so prototype names such as "toString" never become codes.
export function userError(error: unknown) {
  const code = error instanceof Error && isReadinessCode(error.message) ? error.message : 'onshape_unavailable';
  return state(code);
}

// Operator dashboard metadata only; never attached to agent readiness results.
export type McpReadiness = {
  provider: 'onshape';
  local?: {
    configured: boolean;
    running: boolean | null;
    credential: 'AVAILABLE' | 'MISSING' | 'EXPIRED' | 'UNKNOWN';
    expiry?: string;
    refreshOwner: 'claw-onshape';
  };
  configured: boolean | null;
  enabled: boolean | null;
  oauth: {
    status: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
    storedGrant: boolean | null;
    expiresAt?: string;
    expired?: boolean;
    requiresOperatorAction: boolean | null;
    reason: string;
  };
  discovery: {status: 'NOT_PERFORMED' | 'HISTORICAL' | 'VERIFIED' | 'UNKNOWN'; reason: string};
  mutation: {status: 'BLOCKED'; blockers: string[]};
  operatorAction: string;
};
export function unknownMcpReadiness(): McpReadiness {
  return {
    provider: 'onshape',
    configured: null,
    enabled: null,
    oauth: {
      status: 'UNKNOWN',
      storedGrant: null,
      requiresOperatorAction: null,
      reason: 'Native read-only MCP status is unavailable or invalid; no connection was attempted.',
    },
    discovery: {
      status: 'HISTORICAL',
      reason:
        'ClawCAD discovery was previously recorded on October 9, 2026. Claw-Onshape has not performed authenticated discovery; no current catalog is verified.',
    },
    mutation: {
      status: 'BLOCKED',
      blockers: [
        'Unverified Candidate Workspace containment',
        'Missing atomic revision enforcement',
        'Unverified guarded native MCP invocation',
        'Unverified Part Studio mutation contract',
      ],
    },
    operatorAction:
      'Inspect native OpenClaw MCP Settings/status. Keep production MCP disabled. Future consent must use native operator onboarding in an approved isolated profile.',
  };
}
