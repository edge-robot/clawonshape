import {bindingFor, connectionOwner} from './config.ts';
import type {Binding, Config, Identity} from './config.ts';
import {credentials} from './credentials.ts';
import type {Tokens} from './oauth.ts';
import {OAUTH_SCOPE_READ, OAUTH_SCOPE_WRITE} from './oauth.ts';
import {authorizationSnapshot, matchesAuthorizationSnapshot, sameBinding} from './authorization-snapshot.ts';

export type CandidateAuthorizationCheck = Readonly<{
  availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  reason:
    | 'authorized'
    | 'agent_policy_denied'
    | 'authorization_changed'
    | 'live_reads_disabled'
    | 'reconnect_required'
    | 'oauth_read_scope_missing'
    | 'oauth_write_scope_missing'
    | 'app_permission_read_disabled'
    | 'app_permission_write_disabled'
    | 'app_permission_write_unknown';
}>;
// Private runtime registration prevents an input object from impersonating a
// host authorization adapter. This is only for the internal candidate helper.
declare const authority: unique symbol;
export type CandidateAuthorization = Readonly<{[authority]: true}>;
type Check = (binding: Binding, write: boolean, token?: string) => Promise<CandidateAuthorizationCheck>;
const authorities = new WeakMap<
  object,
  {check: Check; dispatch: (binding: Binding, write: boolean, token: string) => CandidateAuthorizationCheck}
>();

export function candidateAuthorization(
  current: () => Config,
  identity: Identity,
  stateDir: string,
  assertConsent: () => void,
): CandidateAuthorization {
  return candidateAuthority(current, identity, stateDir, assertConsent);
}

// Called only by the native operator session-action handler. Never synthesize a
// Discord/agent identity from a configured binding to authorize a dashboard action.
export function operatorCandidateAuthorization(
  current: () => Config,
  binding: Binding,
  stateDir: string,
  assertOperator: () => void,
): CandidateAuthorization {
  return candidateAuthority(current, undefined, stateDir, assertOperator, Object.freeze({...binding}));
}

function candidateAuthority(
  current: () => Config,
  identity: Identity | undefined,
  stateDir: string,
  assertConsent: () => void,
  operatorBinding?: Binding,
): CandidateAuthorization {
  const initial = current(),
    context = identity
      ? Object.freeze({
          ...identity,
          deliveryContext: identity.deliveryContext ? Object.freeze({...identity.deliveryContext}) : undefined,
        })
      : undefined;
  const select = (config: Config) =>
    operatorBinding
      ? config.bindings.find((b) => sameBinding(b, operatorBinding))
      : context
        ? bindingFor(config, context)
        : undefined;
  const initialBinding = select(initial),
    snapshot = authorizationSnapshot(initial);
  const value = Object.freeze({}) as CandidateAuthorization;
  let store: Awaited<ReturnType<typeof credentials>> | undefined;
  const validate = (binding: Binding, write: boolean, token?: string): CandidateAuthorizationCheck | undefined => {
    const denied = (
      reason: CandidateAuthorizationCheck['reason'],
      availability: 'UNAVAILABLE' | 'UNKNOWN' = 'UNAVAILABLE',
    ): CandidateAuthorizationCheck => ({availability, reason});
    let config: Config;
    try {
      context?.assertInvocationCurrent?.();
      if (operatorBinding) {
        assertConsent();
      }
      config = current();
    } catch {
      return denied('authorization_changed');
    }
    const engineer = config.engineerAgentId ?? config.delegation?.engineerAgentId ?? 'clawcad-mechanical-engineer';
    // Signed A2A contexts authorize reads only and must not become write grants.
    const selected = select(config);
    if (
      !initialBinding ||
      !selected ||
      selected.agentId !== engineer ||
      (!operatorBinding && (!context || context.agentId !== engineer || context.messageChannel === 'a2a'))
    ) {
      return denied('agent_policy_denied');
    }
    if (
      !matchesAuthorizationSnapshot(config, snapshot) ||
      !sameBinding(selected, initialBinding) ||
      !sameBinding(binding, selected)
    ) {
      return denied('authorization_changed');
    }
    if (!config.liveReads) {
      return denied('live_reads_disabled');
    }
    if (write) {
      try {
        assertConsent();
      } catch {
        return denied('agent_policy_denied');
      }
    }
    if (!store) {
      return;
    }
    let grant: Tokens;
    try {
      grant = store.read(token === undefined);
    } catch {
      return denied('reconnect_required');
    }
    if (token !== undefined && grant.accessToken !== token) {
      return denied('authorization_changed');
    }
    if (!grant.scopes.includes(OAUTH_SCOPE_READ)) {
      return denied('oauth_read_scope_missing');
    }
    if (config.oauth?.applicationPermissions.canReadDocuments === false) {
      return denied('app_permission_read_disabled');
    }
    if (write) {
      if (!grant.scopes.includes(OAUTH_SCOPE_WRITE)) {
        return denied('oauth_write_scope_missing');
      }
      const permission = config.oauth?.applicationPermissions.canWriteDocuments;
      if (permission === false) {
        return denied('app_permission_write_disabled');
      }
      if (permission !== true) {
        return denied('app_permission_write_unknown', 'UNKNOWN');
      }
    }
    // No await between the final authority check and returning the decision.
    try {
      context?.assertInvocationCurrent?.();
      if (!matchesAuthorizationSnapshot(current(), snapshot)) {
        return denied('authorization_changed');
      }
      if (write || operatorBinding) {
        assertConsent();
      }
    } catch {
      return denied('authorization_changed');
    }
    return {availability: 'AVAILABLE', reason: 'authorized'};
  };
  authorities.set(value, {
    check: async (binding, write, token) => {
      const result = validate(binding, write, token);
      if (result) {
        return result;
      }
      try {
        store = await credentials(
          stateDir,
          initialBinding!.connectionRef,
          connectionOwner(initialBinding!),
          initial.localMcp?.credentialDirectory,
        );
      } catch {
        return {availability: 'UNAVAILABLE', reason: 'reconnect_required'};
      }
      return validate(binding, write, token) ?? {availability: 'UNAVAILABLE', reason: 'agent_policy_denied'};
    },
    // Synchronous recheck after all awaited preflight/persistence steps, with no
    // promise boundary before the caller dispatches its fixed provider request.
    dispatch: (binding, write, token) =>
      validate(binding, write, token) ?? {availability: 'UNAVAILABLE', reason: 'agent_policy_denied'},
  });
  return value;
}

export async function checkCandidateAuthorization(
  value: unknown,
  binding: Binding,
  write: boolean,
  token?: string,
): Promise<CandidateAuthorizationCheck> {
  const check = value && typeof value === 'object' ? authorities.get(value) : undefined;
  return check ? check.check(binding, write, token) : {availability: 'UNAVAILABLE', reason: 'agent_policy_denied'};
}

export function candidateDispatchAuthorization(
  value: unknown,
  binding: Binding,
  write: boolean,
  token: string,
): CandidateAuthorizationCheck {
  const entry = value && typeof value === 'object' ? authorities.get(value) : undefined;
  return entry ? entry.dispatch(binding, write, token) : {availability: 'UNAVAILABLE', reason: 'agent_policy_denied'};
}
