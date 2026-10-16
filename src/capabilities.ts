import {sameBinding} from './authorization-snapshot.ts';
import type {Binding, Config, OnshapeApplicationPermissions} from './config.ts';
import {id} from './config.ts';
import type {OAuthScope} from './oauth.ts';

export type CapabilityAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
export type CapabilityCheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';
export type CapabilityOperation =
  | 'read_document'
  | 'inspect_workspace'
  | 'render_part_studio'
  | 'create_candidate_workspace'
  | 'create_immutable_version'
  | 'delete_workspace'
  | 'share_unshare_document'
  | 'read_user_profile'
  | 'request_purchases'
  | 'execute_mcp_cad_mutation';
export type CapabilityResult = Readonly<{
  operation: CapabilityOperation;
  availability: CapabilityAvailability;
  reason: string;
  requiredAction?: string;
  checks: Readonly<{
    applicationPermission: CapabilityCheckStatus;
    oauthScope: CapabilityCheckStatus;
    internalAuthorization: CapabilityCheckStatus;
    providerAvailability: CapabilityCheckStatus;
  }>;
}>;
type Input = Readonly<{
  config: Config;
  binding?: Binding;
  connected: boolean;
  grantedScopes?: readonly string[];
  verifiedReadOperations?: readonly CapabilityOperation[];
}>;
type Rule = Readonly<{
  operation: CapabilityOperation;
  permission: keyof OnshapeApplicationPermissions;
  scope: OAuthScope;
  read?: true;
  label: string;
}>;
// Mappings follow the official Onshape OAuth scope descriptions. Application
// attestations are operator evidence, never a grant or token introspection API.
const rules: readonly Rule[] = [
  {operation: 'read_document', permission: 'canReadDocuments', scope: 'OAuth2Read', read: true, label: 'read'},
  {operation: 'inspect_workspace', permission: 'canReadDocuments', scope: 'OAuth2Read', read: true, label: 'read'},
  {operation: 'render_part_studio', permission: 'canReadDocuments', scope: 'OAuth2Read', read: true, label: 'read'},
  {operation: 'create_candidate_workspace', permission: 'canWriteDocuments', scope: 'OAuth2Write', label: 'write'},
  {operation: 'create_immutable_version', permission: 'canWriteDocuments', scope: 'OAuth2Write', label: 'write'},
  {
    operation: 'delete_workspace',
    permission: 'canDeleteDocumentsAndWorkspaces',
    scope: 'OAuth2Delete',
    label: 'delete',
  },
  {
    operation: 'share_unshare_document',
    permission: 'canShareAndUnshareDocuments',
    scope: 'OAuth2Share',
    label: 'share',
  },
  {operation: 'read_user_profile', permission: 'canReadProfileInformation', scope: 'OAuth2ReadPII', label: 'profile'},
  {operation: 'request_purchases', permission: 'canRequestPurchases', scope: 'OAuth2Purchase', label: 'purchase'},
];
const actions: Readonly<Record<string, string>> = {
  agent_policy_denied: 'This operation has no authorized agent tool.',
  connection_not_ready: 'Connect Onshape and refresh status.',
  live_reads_disabled: 'Ask the operator to review liveReads.',
  target_missing: 'Ask the operator to select the Part Studio.',
  target_not_authorized: 'Ask the operator to review the trusted binding.',
  provider_read_unverified: 'Use the authorized read result as evidence; avoid repeated probes.',
  mcp_execution_disabled: 'MCP mutation remains disabled.',
};
function resolve(rule: Rule, input: Input): CapabilityResult {
  const {config, binding} = input,
    setting = config.oauth?.applicationPermissions[rule.permission];
  const bound = !!binding && config.bindings.some((b) => sameBinding(b, binding));
  const engineer = config.engineerAgentId ?? config.delegation?.engineerAgentId ?? binding?.agentId;
  const target = bound && id(binding?.documentId) && id(binding?.workspaceId);
  const rendered = rule.operation === 'render_part_studio',
    elementReady = !rendered || id(binding?.elementId);
  // An observation proves only this operation on the supplied current binding.
  const observed =
    !!rule.read &&
    target &&
    elementReady &&
    input.connected &&
    input.verifiedReadOperations?.includes(rule.operation) === true;
  const scope: CapabilityCheckStatus =
    input.grantedScopes === undefined
      ? 'UNKNOWN'
      : input.grantedScopes.includes(rule.scope) &&
          (rule.operation !== 'create_candidate_workspace' || input.grantedScopes.includes('OAuth2Read'))
        ? 'PASS'
        : 'FAIL';
  const checks: CapabilityResult['checks'] = {
    applicationPermission: setting === false ? 'FAIL' : setting === true || observed ? 'PASS' : 'UNKNOWN',
    oauthScope: scope,
    internalAuthorization:
      rule.read && target && elementReady && binding?.agentId === engineer && config.liveReads ? 'PASS' : 'FAIL',
    providerAvailability: observed ? 'PASS' : 'UNKNOWN',
  };
  let reason: string;
  if (setting === false) reason = `app_permission_${rule.label}_disabled`;
  else if (!input.connected) reason = 'connection_not_ready';
  else if (
    !rule.read &&
    rule.operation !== 'create_candidate_workspace' &&
    rule.operation !== 'create_immutable_version'
  )
    reason = 'agent_policy_denied';
  else if (scope === 'FAIL') reason = `oauth_${rule.label}_scope_missing`;
  else if (rule.read && !target) reason = 'target_not_authorized';
  else if (rule.read && !elementReady) reason = 'target_missing';
  else if (rule.read && !config.liveReads) reason = 'live_reads_disabled';
  else if (checks.internalAuthorization === 'FAIL') reason = 'agent_policy_denied';
  else if (scope === 'UNKNOWN') reason = 'oauth_grant_unknown';
  else if (!observed) reason = 'provider_read_unverified';
  else reason = 'all_checks_passed';
  const availability: CapabilityAvailability =
    Object.values(checks).includes('FAIL') || !input.connected
      ? 'UNAVAILABLE'
      : Object.values(checks).includes('UNKNOWN')
        ? 'UNKNOWN'
        : 'AVAILABLE';
  const requiredAction =
    availability === 'AVAILABLE'
      ? undefined
      : (actions[reason] ??
        (reason.startsWith('app_permission_')
          ? 'Ask the operator to verify the application setting.'
          : reason.startsWith('oauth_')
            ? 'Reconnect only with the scopes required for an approved task.'
            : 'Ask the operator to review the capability evidence.'));
  return {operation: rule.operation, availability, reason, checks, ...(requiredAction ? {requiredAction} : {})};
}
export function assessCapabilities(input: Input): Readonly<Record<CapabilityOperation, CapabilityResult>> {
  const results = Object.fromEntries(rules.map((rule) => [rule.operation, resolve(rule, input)])) as Record<
    CapabilityOperation,
    CapabilityResult
  >;
  results.execute_mcp_cad_mutation = {
    operation: 'execute_mcp_cad_mutation',
    availability: 'UNAVAILABLE',
    reason: 'mcp_execution_disabled',
    requiredAction: actions.mcp_execution_disabled,
    checks: {
      applicationPermission: 'UNKNOWN',
      oauthScope: 'UNKNOWN',
      internalAuthorization: 'FAIL',
      providerAvailability: 'UNKNOWN',
    },
  };
  return Object.freeze(results);
}
// Do not repeat operation names, layer checks or long matrix text in agent turns.
// Detailed checks remain available to internal reviewers via assessCapabilities.
export function capabilitySummary(input: Input) {
  const summary = Object.fromEntries(
    Object.entries(assessCapabilities(input)).map(([operation, {availability, reason, requiredAction}]) => [
      operation,
      {availability, reason, ...(requiredAction ? {requiredAction} : {})},
    ]),
  );
  if (Buffer.byteLength(JSON.stringify(summary)) > 2048) throw new Error('capability_result_too_large');
  return summary;
}
