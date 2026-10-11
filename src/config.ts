import {createHash} from 'node:crypto';
export type Binding = Readonly<{
  agentId: string; requesterSenderId: string; messageChannel: string; agentAccountId: string;
  connectionRef: string; documentId: string; primaryWorkspaceId: string; workspaceId: string;
}>;
export type Config = Readonly<{bindings: readonly Binding[]; oauth?: Readonly<{clientId: string; clientSecretFile: string}>; liveReads: boolean}>;
export const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
export const ref = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\x00-\x1f]/.test(v);
export function parseConfig(value: unknown): Config {
  if (!object(value) || Object.keys(value).some(k => !['bindings','oauth','liveReads'].includes(k)) ||
      !Array.isArray(value.bindings) || value.bindings.length > 64 ||
      (value.liveReads !== undefined && typeof value.liveReads !== 'boolean')) throw new Error('invalid_configuration');
  const bindings: Binding[] = [];
  for (const b of value.bindings) {
    if (!object(b) || Object.keys(b).length !== 8 || !ref(b.agentId) || !ref(b.connectionRef) ||
      !text(b.requesterSenderId) || !text(b.messageChannel) || !text(b.agentAccountId) ||
      !id(b.documentId) || !id(b.primaryWorkspaceId) || !id(b.workspaceId)) throw new Error('invalid_binding');
    bindings.push(Object.freeze({
      agentId:b.agentId,requesterSenderId:b.requesterSenderId,messageChannel:b.messageChannel,agentAccountId:b.agentAccountId,
      connectionRef:b.connectionRef,documentId:b.documentId,primaryWorkspaceId:b.primaryWorkspaceId,workspaceId:b.workspaceId
    }));
  }
  const keys = bindings.map(b => JSON.stringify([b.agentId,b.requesterSenderId,b.messageChannel,b.agentAccountId]));
  if (new Set(keys).size !== keys.length) throw new Error('duplicate_binding');
  // A connection is owned by one authenticated requester/channel/account, even across agents.
  const owners = new Map<string,string>();
  for (const b of bindings) {
    const owner = JSON.stringify([b.requesterSenderId,b.messageChannel,b.agentAccountId]);
    if (owners.has(b.connectionRef) && owners.get(b.connectionRef) !== owner) throw new Error('connection_owner_conflict');
    owners.set(b.connectionRef,owner);
  }
  let oauth: Config['oauth'];
  if (value.oauth !== undefined) {
    const o = value.oauth;
    if (!object(o) || Object.keys(o).length !== 2 || !text(o.clientId) || !text(o.clientSecretFile) || !o.clientSecretFile.startsWith('/')) throw new Error('invalid_oauth_configuration');
    oauth = Object.freeze({clientId:o.clientId,clientSecretFile:o.clientSecretFile});
  }
  return Object.freeze({bindings:Object.freeze(bindings),oauth,liveReads:value.liveReads === true});
}
export type Identity = {agentId?: string; requesterSenderId?: string; messageChannel?: string; agentAccountId?: string};
export function connectionOwner(b:Binding):string {
  return createHash('sha256').update(JSON.stringify([b.requesterSenderId,b.messageChannel,b.agentAccountId])).digest('hex');
}
export function bindingFor(config: Config, ctx: Identity): Binding | undefined {
  return config.bindings.find(b => b.agentId === ctx.agentId && b.requesterSenderId === ctx.requesterSenderId &&
    b.messageChannel === ctx.messageChannel && b.agentAccountId === ctx.agentAccountId);
}
export function validateTarget(b: Binding, did: unknown, wid: unknown, write = false): void {
  if (!id(did) || !id(wid) || did !== b.documentId) throw new Error('target_denied');
  if (write && wid === b.primaryWorkspaceId) throw new Error('protected_primary_workspace');
  if (wid !== b.workspaceId) throw new Error('target_denied');
  if (write) throw new Error('writes_disabled');
}
