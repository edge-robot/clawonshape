import {isDeepStrictEqual} from 'node:util';
import {parseConfig} from './config.ts';
import type {Binding, Config, Delegation} from './config.ts';

// Authorization compares validated field values, not JSON object serialization.
// Bindings form an unordered set (parseConfig rejects duplicate identity keys).
// Missing optional values mean UNKNOWN/absent; false remains distinct from both.
const bindingFields = [
  'agentId',
  'requesterSenderId',
  'messageChannel',
  'agentAccountId',
  'connectionRef',
  'documentId',
  'primaryWorkspaceId',
  'workspaceId',
  'elementId',
  'discordChannelId',
] as const;

function dataRecord(value: unknown): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new Error('invalid_configuration');
  }
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !field?.enumerable || !('value' in field)) {
      throw new Error('invalid_configuration');
    }
  }
}

function validatedConfig(value: Config): Config {
  dataRecord(value);
  if (!Array.isArray(value.bindings) || value.bindings.length > 64) {
    throw new Error('invalid_configuration');
  }
  const keys = Reflect.ownKeys(value.bindings);
  if (keys.length !== value.bindings.length + 1) {
    throw new Error('invalid_configuration');
  }
  for (let index = 0; index < value.bindings.length; index++) {
    const field = Object.getOwnPropertyDescriptor(value.bindings, String(index));
    if (!field?.enumerable || !('value' in field)) {
      throw new Error('invalid_configuration');
    }
    dataRecord(field.value);
  }
  if (value.oauth !== undefined) {
    dataRecord(value.oauth);
    if (value.oauth.applicationPermissions !== undefined) {
      dataRecord(value.oauth.applicationPermissions);
    }
  }
  if (value.delegation !== undefined) {
    dataRecord(value.delegation);
  }
  if (value.localMcp !== undefined) {
    dataRecord(value.localMcp);
  }
  if (value.goals !== undefined) {
    dataRecord(value.goals);
  }
  return parseConfig(value);
}

function bindingValues(binding: Binding) {
  return Object.freeze(bindingFields.map((field) => binding[field] ?? null));
}
function oauthValues(oauth: Config['oauth']) {
  if (!oauth) {
    return null;
  }
  const p = oauth.applicationPermissions;
  return Object.freeze([
    oauth.clientId,
    oauth.clientSecretFile,
    oauth.dashboardRedirectUri ?? null,
    p.canReadDocuments ?? null,
    p.canWriteDocuments ?? null,
    p.canDeleteDocumentsAndWorkspaces ?? null,
    p.canRequestPurchases ?? null,
    p.canShareAndUnshareDocuments ?? null,
    p.canReadProfileInformation ?? null,
  ]);
}
function delegationValues(d: Delegation | undefined) {
  return d
    ? Object.freeze([
        d.leadAgentId,
        d.engineerAgentId,
        d.peerSenderId,
        d.accountId,
        d.keyFile,
        d.transportTokenFile ?? null,
      ])
    : null;
}
function compareBindingValues(left: ReturnType<typeof bindingValues>, right: ReturnType<typeof bindingValues>) {
  for (let index = 0; index < left.length; index++) {
    const a = left[index],
      b = right[index];
    if (a === b) {
      continue;
    }
    if (a === null) {
      return -1;
    }
    if (b === null) {
      return 1;
    }
    return a < b ? -1 : 1;
  }
  return 0;
}

export function authorizationSnapshot(value: Config) {
  const c = validatedConfig(value);
  return Object.freeze({
    schemaVersion: 1,
    engineerAgentId: c.engineerAgentId ?? c.delegation?.engineerAgentId ?? 'clawcad-mechanical-engineer',
    liveReads: c.liveReads,
    bindings: Object.freeze(c.bindings.map(bindingValues).sort(compareBindingValues)),
    oauth: oauthValues(c.oauth),
    delegation: delegationValues(c.delegation),
    localMcp: c.localMcp ? Object.freeze([c.localMcp.connectionRef, c.localMcp.credentialDirectory]) : null,
    // Goal authority depends on both values; a change invalidates every running goal transition.
    goals: c.goals ? Object.freeze([c.goals.enabled, c.goals.approvalDirectory ?? null]) : null,
  });
}
export type AuthorizationSnapshot = ReturnType<typeof authorizationSnapshot>;
export function matchesAuthorizationSnapshot(value: Config, snapshot: AuthorizationSnapshot): boolean {
  try {
    return isDeepStrictEqual(authorizationSnapshot(value), snapshot);
  } catch {
    return false;
  }
}
export function sameAuthorizationConfig(left: Config, right: Config): boolean {
  try {
    return matchesAuthorizationSnapshot(left, authorizationSnapshot(right));
  } catch {
    return false;
  }
}
export function sameBinding(left: Binding | undefined, right: Binding | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  try {
    dataRecord(left);
    dataRecord(right);
    const a = parseConfig({bindings: [left]}).bindings[0],
      b = parseConfig({bindings: [right]}).bindings[0];
    return isDeepStrictEqual(bindingValues(a), bindingValues(b));
  } catch {
    return false;
  }
}
export function sameOAuth(left: Config['oauth'], right: Config['oauth']): boolean {
  try {
    const a = validatedConfig({bindings: [], liveReads: false, oauth: left}),
      b = validatedConfig({bindings: [], liveReads: false, oauth: right});
    return isDeepStrictEqual(oauthValues(a.oauth), oauthValues(b.oauth));
  } catch {
    return false;
  }
}
export function sameDelegation(left: Delegation | undefined, right: Delegation | undefined): boolean {
  try {
    const a = validatedConfig({bindings: [], liveReads: false, delegation: left}),
      b = validatedConfig({bindings: [], liveReads: false, delegation: right});
    return isDeepStrictEqual(delegationValues(a.delegation), delegationValues(b.delegation));
  } catch {
    return false;
  }
}
type AuthorizedBinding = {binding: Binding; contextId?: string};
export function sameAuthorizedBinding(
  left: AuthorizedBinding | undefined,
  right: AuthorizedBinding | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return sameBinding(left.binding, right.binding) && left.contextId === right.contextId;
}
