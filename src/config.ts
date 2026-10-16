import {createHash} from 'node:crypto';
export type Binding = Readonly<{
  agentId: string;
  requesterSenderId: string;
  messageChannel: string;
  agentAccountId: string;
  connectionRef: string;
  documentId: string;
  primaryWorkspaceId: string;
  workspaceId: string;
  elementId?: string;
  discordChannelId?: string;
}>;
export type OnshapeApplicationPermissions = Readonly<{
  canReadDocuments?: boolean;
  canWriteDocuments?: boolean;
  canDeleteDocumentsAndWorkspaces?: boolean;
  canRequestPurchases?: boolean;
  canShareAndUnshareDocuments?: boolean;
  canReadProfileInformation?: boolean;
}>;
export type Delegation = Readonly<{
  leadAgentId: string;
  engineerAgentId: string;
  peerSenderId: string;
  accountId: string;
  keyFile: string;
  transportTokenFile?: string;
}>;
export type LocalMcp = Readonly<{connectionRef: string; credentialDirectory: string}>;
export type Config = Readonly<{
  localMcp?: LocalMcp;
  bindings: readonly Binding[];
  oauth?: Readonly<{
    clientId: string;
    clientSecretFile: string;
    dashboardRedirectUri?: string;
    applicationPermissions: OnshapeApplicationPermissions;
  }>;
  liveReads: boolean;
  engineerAgentId?: string;
  delegation?: Delegation;
}>;
export const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
export const ref = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\x00-\x1f]/.test(v);
export function parseConfig(value: unknown): Config {
  if (
    !object(value) ||
    Object.keys(value).some(
      (k) => !['bindings', 'oauth', 'liveReads', 'engineerAgentId', 'delegation', 'localMcp'].includes(k),
    ) ||
    !Array.isArray(value.bindings) ||
    value.bindings.length > 64 ||
    (value.liveReads !== undefined && typeof value.liveReads !== 'boolean')
  )
    throw new Error('invalid_configuration');
  const bindings: Binding[] = [];
  for (const b of value.bindings) {
    if (
      !object(b) ||
      Object.keys(b).some(
        (k) =>
          ![
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
          ].includes(k),
      ) ||
      !ref(b.agentId) ||
      !ref(b.connectionRef) ||
      !text(b.requesterSenderId) ||
      !text(b.messageChannel) ||
      !text(b.agentAccountId) ||
      !id(b.documentId) ||
      !id(b.primaryWorkspaceId) ||
      !id(b.workspaceId) ||
      (b.elementId !== undefined && !id(b.elementId)) ||
      (b.discordChannelId !== undefined &&
        (typeof b.discordChannelId !== 'string' ||
          !/^\d{16,22}$/.test(b.discordChannelId) ||
          b.messageChannel !== 'discord'))
    )
      throw new Error('invalid_binding');
    bindings.push(
      Object.freeze({
        agentId: b.agentId,
        requesterSenderId: b.requesterSenderId,
        messageChannel: b.messageChannel,
        agentAccountId: b.agentAccountId,
        connectionRef: b.connectionRef,
        documentId: b.documentId,
        primaryWorkspaceId: b.primaryWorkspaceId,
        workspaceId: b.workspaceId,
        ...(b.elementId ? {elementId: b.elementId} : {}),
        ...(b.discordChannelId ? {discordChannelId: b.discordChannelId} : {}),
      }),
    );
  }
  const keys = bindings.map((b) =>
    JSON.stringify([b.agentId, b.requesterSenderId, b.messageChannel, b.agentAccountId]),
  );
  if (new Set(keys).size !== keys.length) throw new Error('duplicate_binding');
  // A connection is owned by one authenticated requester/channel/account, even across agents.
  const owners = new Map<string, string>();
  for (const b of bindings) {
    const owner = JSON.stringify([b.requesterSenderId, b.messageChannel, b.agentAccountId]);
    if (owners.has(b.connectionRef) && owners.get(b.connectionRef) !== owner)
      throw new Error('connection_owner_conflict');
    owners.set(b.connectionRef, owner);
  }
  let oauth: Config['oauth'];
  if (value.oauth !== undefined) {
    const o = value.oauth;
    if (!object(o)) throw new Error('invalid_oauth_configuration');
    const permissions = o.applicationPermissions;
    if (
      Object.keys(o).some(
        (k) => !['clientId', 'clientSecretFile', 'dashboardRedirectUri', 'applicationPermissions'].includes(k),
      ) ||
      !text(o.clientId) ||
      !text(o.clientSecretFile) ||
      !o.clientSecretFile.startsWith('/') ||
      (o.dashboardRedirectUri !== undefined && !dashboardRedirect(o.dashboardRedirectUri)) ||
      (permissions !== undefined &&
        (!object(permissions) ||
          Object.keys(permissions).some(
            (k) =>
              ![
                'canReadDocuments',
                'canWriteDocuments',
                'canDeleteDocumentsAndWorkspaces',
                'canRequestPurchases',
                'canShareAndUnshareDocuments',
                'canReadProfileInformation',
              ].includes(k),
          ) ||
          (permissions.canReadDocuments !== undefined && typeof permissions.canReadDocuments !== 'boolean') ||
          (permissions.canWriteDocuments !== undefined && typeof permissions.canWriteDocuments !== 'boolean') ||
          (permissions.canDeleteDocumentsAndWorkspaces !== undefined &&
            typeof permissions.canDeleteDocumentsAndWorkspaces !== 'boolean') ||
          (permissions.canRequestPurchases !== undefined && typeof permissions.canRequestPurchases !== 'boolean') ||
          (permissions.canShareAndUnshareDocuments !== undefined &&
            typeof permissions.canShareAndUnshareDocuments !== 'boolean') ||
          (permissions.canReadProfileInformation !== undefined &&
            typeof permissions.canReadProfileInformation !== 'boolean')))
    )
      throw new Error('invalid_oauth_configuration');
    oauth = Object.freeze({
      clientId: o.clientId,
      clientSecretFile: o.clientSecretFile,
      // Operator attestations describe application settings; they grant no rights.
      // Absence means unknown, including the four normally disabled permissions.
      applicationPermissions: Object.freeze({...permissions}) as OnshapeApplicationPermissions,
      ...(o.dashboardRedirectUri ? {dashboardRedirectUri: o.dashboardRedirectUri as string} : {}),
    });
  }
  if (value.engineerAgentId !== undefined && !ref(value.engineerAgentId)) throw new Error('invalid_configuration');
  let delegation: Delegation | undefined;
  if (value.delegation !== undefined) {
    const d = value.delegation;
    if (
      !object(d) ||
      Object.keys(d).some(
        (k) =>
          !['leadAgentId', 'engineerAgentId', 'peerSenderId', 'accountId', 'keyFile', 'transportTokenFile'].includes(k),
      ) ||
      !ref(d.leadAgentId) ||
      !ref(d.engineerAgentId) ||
      d.leadAgentId === d.engineerAgentId ||
      !ref(d.peerSenderId) ||
      !ref(d.accountId) ||
      !text(d.keyFile) ||
      !d.keyFile.startsWith('/') ||
      (d.transportTokenFile !== undefined && (!text(d.transportTokenFile) || !d.transportTokenFile.startsWith('/'))) ||
      bindings.some((b) => b.agentId !== d.engineerAgentId)
    )
      throw new Error('invalid_delegation');
    delegation = Object.freeze({
      leadAgentId: d.leadAgentId,
      engineerAgentId: d.engineerAgentId,
      peerSenderId: d.peerSenderId,
      accountId: d.accountId,
      keyFile: d.keyFile,
      ...(d.transportTokenFile ? {transportTokenFile: d.transportTokenFile} : {}),
    });
  }
  let localMcp: LocalMcp | undefined;
  if (value.localMcp !== undefined) {
    const m = value.localMcp;
    if (
      !object(m) ||
      Object.keys(m).some((k) => !['connectionRef', 'credentialDirectory'].includes(k)) ||
      !ref(m.connectionRef) ||
      !text(m.credentialDirectory) ||
      !m.credentialDirectory.startsWith('/') ||
      !bindings.some((b) => b.connectionRef === m.connectionRef)
    )
      throw new Error('invalid_configuration');
    localMcp = Object.freeze({connectionRef: m.connectionRef, credentialDirectory: m.credentialDirectory});
  }
  return Object.freeze({
    ...(localMcp ? {localMcp} : {}),
    bindings: Object.freeze(bindings),
    oauth,
    liveReads: value.liveReads === true,
    ...(value.engineerAgentId ? {engineerAgentId: value.engineerAgentId as string} : {}),
    ...(delegation ? {delegation} : {}),
  });
}
export function dashboardRedirect(value: unknown): boolean {
  try {
    const u = new URL(value as string);
    return (
      typeof value === 'string' &&
      value === u.href &&
      ['http:', 'https:'].includes(u.protocol) &&
      ['localhost', '127.0.0.1'].includes(u.hostname) &&
      !!u.port &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/plugins/claw-onshape/oauth/callback'
    );
  } catch {
    return false;
  }
}
export type Identity = {
  agentId?: string;
  requesterSenderId?: string;
  messageChannel?: string;
  agentAccountId?: string;
  sessionKey?: string;
  assertInvocationCurrent?: () => void;
  deliveryContext?: {channel?: string; to?: string; accountId?: string};
};
export function channelMatches(b: Binding, ctx: Identity): boolean {
  return (
    !b.discordChannelId ||
    (ctx.deliveryContext?.channel === 'discord' &&
      [b.discordChannelId, `channel:${b.discordChannelId}`].includes(ctx.deliveryContext.to ?? ''))
  );
}
export function connectionOwner(b: Binding): string {
  return createHash('sha256')
    .update(JSON.stringify([b.requesterSenderId, b.messageChannel, b.agentAccountId]))
    .digest('hex');
}
export function bindingFor(config: Config, ctx: Identity): Binding | undefined {
  return config.bindings.find(
    (b) =>
      b.agentId === ctx.agentId &&
      b.requesterSenderId === ctx.requesterSenderId &&
      b.messageChannel === ctx.messageChannel &&
      b.agentAccountId === ctx.agentAccountId &&
      channelMatches(b, ctx),
  );
}
export function validateTarget(b: Binding, did: unknown, wid: unknown, write = false): void {
  if (!id(did) || !id(wid) || did !== b.documentId) throw new Error('target_denied');
  if (write && wid === b.primaryWorkspaceId) throw new Error('protected_primary_workspace');
  if (wid !== b.workspaceId) throw new Error('target_denied');
  if (write) throw new Error('writes_disabled');
}
