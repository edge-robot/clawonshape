import {createHash, createHmac, randomBytes, timingSafeEqual, randomUUID} from 'node:crypto';
import type {Config, Binding, Identity} from './config.ts';
import {bindingFor, channelMatches} from './config.ts';
import {privateSecret} from './credentials.ts';
import {assertPrivateFile} from './credentials.ts';
import {readFileSync} from 'node:fs';
import {jsonRequest} from './http.ts';

const ENDPOINT = 'http://clawcad-mechanical-engineer:18789/a2a/v1';
export const bindingDigest = (b: Binding) => createHash('sha256').update(canonicalResult(b)).digest('hex').slice(0, 32);
const mac = (key: string, payload: string) =>
  createHmac('sha256', Buffer.from(key, 'hex')).update(payload).digest('hex');
export async function delegationKey(c: Config) {
  if (!c.delegation) {
    throw new Error('delegation_denied');
  }
  const key = await privateSecret(c.delegation.keyFile);
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new Error('delegation_denied');
  }
  return key;
}
export function delegationKeySync(c: Config) {
  if (!c.delegation) {
    throw new Error('delegation_denied');
  }
  assertPrivateFile(c.delegation.keyFile);
  const key = readFileSync(c.delegation.keyFile, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new Error('delegation_denied');
  }
  return key;
}
export function mintContext(b: Binding, key: string, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new Error('delegation_denied');
  }
  const prefix = `cos1-${Math.floor((now + 300000) / 1000)
    .toString(16)
    .padStart(8, '0')}-${randomBytes(8).toString('hex')}-${bindingDigest(b)}`;
  return `${prefix}-${mac(key, prefix)}`; // exactly 128 lowercase characters, native A2A limit
}
export function verifyContext(
  c: Config,
  ctx: Identity,
  key: string,
  now = Date.now(),
): {binding: Binding; contextId: string} | undefined {
  const d = c.delegation;
  if (
    !d ||
    ctx.agentId !== d.engineerAgentId ||
    ctx.messageChannel !== 'a2a' ||
    ctx.requesterSenderId !== d.peerSenderId ||
    ctx.agentAccountId !== d.accountId ||
    !ctx.sessionKey
  ) {
    return;
  }
  const prefix = `agent:${d.engineerAgentId}:a2a:${d.accountId}:direct:${d.peerSenderId}:`;
  if (!ctx.sessionKey.startsWith(prefix)) {
    return;
  }
  const contextId = ctx.sessionKey.slice(prefix.length);
  const m = /^(cos1-([a-f0-9]{8})-[a-f0-9]{16}-([a-f0-9]{32}))-([a-f0-9]{64})$/.exec(contextId);
  if (!m || !/^[a-f0-9]{64}$/.test(key)) {
    return;
  }
  const expiry = parseInt(m[2], 16) * 1000;
  if (expiry <= now || expiry > now + 301000) {
    return;
  }
  if (!timingSafeEqual(Buffer.from(m[4], 'hex'), Buffer.from(mac(key, m[1]), 'hex'))) {
    return;
  }
  const binding = c.bindings.find((b) => b.agentId === d.engineerAgentId && bindingDigest(b) === m[3]);
  return binding ? {binding, contextId} : undefined;
}
export function authorizedBinding(c: Config, ctx: Identity): {binding: Binding; contextId?: string} | undefined {
  const direct = bindingFor(c, ctx);
  if (direct) {
    return {binding: direct};
  }
  if (!c.delegation || ctx.messageChannel !== 'a2a') {
    return;
  }
  try {
    return verifyContext(c, ctx, delegationKeySync(c));
  } catch {
    return;
  }
}
export function leadBinding(c: Config, ctx: Identity): Binding | undefined {
  const d = c.delegation;
  if (!d || ctx.agentId !== d.leadAgentId || ctx.messageChannel !== 'discord') {
    return;
  }
  return c.bindings.find(
    (b) =>
      b.agentId === d.engineerAgentId &&
      b.requesterSenderId === ctx.requesterSenderId &&
      b.messageChannel === ctx.messageChannel &&
      b.agentAccountId === ctx.agentAccountId &&
      channelMatches(b, ctx),
  );
}
// Sign every JSON field, including nested capabilities. An array replacer in
// JSON.stringify would silently filter nested keys instead of only sorting them.
export function canonicalResult(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  const encode = (v: unknown, depth: number): string => {
    if (depth > 32 || ++nodes > 10000) {
      throw new Error('delegation_result_invalid');
    }
    if (v === null) {
      return 'null';
    }
    if (typeof v === 'string' || typeof v === 'boolean') {
      return JSON.stringify(v);
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      return JSON.stringify(v);
    }
    if (typeof v !== 'object' || ancestors.has(v)) {
      throw new Error('delegation_result_invalid');
    }
    const array = Array.isArray(v),
      prototype = Object.getPrototypeOf(v);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new Error('delegation_result_invalid');
    }
    const keys = Reflect.ownKeys(v);
    if (keys.some((k) => typeof k !== 'string')) {
      throw new Error('delegation_result_invalid');
    }
    const field = (key: string): unknown => {
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d || !d.enumerable || !('value' in d)) {
        throw new Error('delegation_result_invalid');
      }
      return d.value;
    };
    ancestors.add(v);
    try {
      if (array) {
        if (v.length > 10000 || keys.length !== v.length + 1) {
          throw new Error('delegation_result_invalid');
        }
        return `[${Array.from({length: v.length}, (_, i) => encode(field(String(i)), depth + 1)).join(',')}]`;
      }
      return (
        '{' +
        (keys as string[])
          .sort()
          .map((k) => `${JSON.stringify(k)}:${encode(field(k), depth + 1)}`)
          .join(',') +
        '}'
      );
    } finally {
      ancestors.delete(v);
    }
  };
  return encode(value, 0);
}
export function signResult(value: object, contextId: string, key: string) {
  return mac(key, `${contextId}\n${canonicalResult(value)}`);
}
export function verifyResult(value: object, contextId: string, key: string, proof: unknown) {
  if (typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof)) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(signResult(value, contextId, key), 'hex'));
  } catch {
    return false;
  }
}
type AuditReason =
  | 'task_context_mismatch'
  | 'invalid_result_shape'
  | 'invalid_result_json'
  | 'invalid_result_object'
  | 'missing_result_proof'
  | 'invalid_result_proof_format'
  | 'result_signature_mismatch';
export type DelegationAuditEvent = Readonly<{
  event: 'claw_onshape.a2a_result_rejected';
  schemaVersion: 1;
  eventId: string;
  timestamp: string;
  severity: 'WARNING';
  outcome: 'rejected';
  reason: AuditReason;
  leadAgentId: string;
  engineerAgentId: string;
  bindingDigest: string;
  contextSha256: string;
  taskSha256?: string;
  receivedResultSha256?: string;
}>;
// Fixed A2A operation, not a generic RPC passthrough. Secrets never enter agent text.
export async function delegateRender(
  c: Config,
  b: Binding,
  guard: () => void,
  fetcher: typeof fetch = fetch,
  wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  warn: (message: string) => void = (message) => console.warn(message),
  inspection = false,
  request?: EngineeringTask,
) {
  if (!c.delegation) {
    throw new Error('delegation_denied');
  }
  const key = await delegationKey(c),
    token = c.delegation.transportTokenFile
      ? await privateSecret(c.delegation.transportTokenFile)
      : process.env.A2A_LEAD_TO_MECHANICAL,
    contextId = mintContext(b, key);
  if (!token || /\s/.test(token)) {
    throw new Error('delegation_denied');
  }
  const digest = (text: string) => createHash('sha256').update(text).digest('hex');
  let taskId: string | undefined;
  const rejectResult = (reason: AuditReason, text?: string): never => {
    const event: DelegationAuditEvent = {
      event: 'claw_onshape.a2a_result_rejected',
      schemaVersion: 1,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
      severity: 'WARNING',
      outcome: 'rejected',
      reason,
      leadAgentId: c.delegation!.leadAgentId,
      engineerAgentId: c.delegation!.engineerAgentId,
      bindingDigest: bindingDigest(b),
      contextSha256: digest(contextId),
      ...(taskId ? {taskSha256: digest(taskId)} : {}),
      ...(text !== undefined ? {receivedResultSha256: digest(text)} : {}),
    };
    const message =
      'WARNING: Claw-Onshape rejected an unverified A2A result; possible tampering or protocol mismatch. ' +
      JSON.stringify(event);
    try {
      warn(message);
    } catch {
      console.warn(message);
    } // Logging failure never permits the result.
    throw new Error(reason === 'task_context_mismatch' ? 'delegation_denied' : 'delegation_result_invalid');
  };
  const rpc = async (method: string, params: object) => {
    guard();
    const r = (await jsonRequest(fetcher, ENDPOINT, {
      method: 'POST',
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: randomUUID(), method, params}),
    })) as {error?: unknown; result?: {task?: unknown}};
    if (r.error) {
      throw new Error('delegation_denied');
    }
    return (r.result?.task ?? r.result) as {
      id?: string;
      contextId?: string;
      status?: {state?: string};
      artifacts?: {parts?: {text?: unknown}[]}[];
    };
  };
  const envelope = request ? createTaskEnvelope(b, request, contextId, key) : undefined;
  const instruction = envelope
    ? JSON.stringify(envelope)
    : inspection
      ? `Inspect the current Camera Mount Plate through native OpenClaw MCP tools directly. Call onshape_auth_status with validate:false, onshape_api_explain for getPartStudioFeatures, and onshape_api_call for getPartStudioFeatures with path_params ${JSON.stringify({did: b.documentId, wvm: 'w', wvmid: b.workspaceId, eid: b.elementId})}. Use onshape_api_schema only if needed. Find the feature containing parameterId plateWidth; read its expression and featureStates[featureId].featureStatus and sourceMicroversion from this live response. Do not use historical memory and do not modify CAD. Then call onshape_verify_feature_read with microversionId, featureId, plateWidth and featureStatus from the native response. Return the complete verification tool details unchanged as one plain JSON object, including delegationProof. If unavailable use onshape_status and return its complete details. Do not send a message or start another task.`
      : 'Use onshape_render to show the configured Camera Mount Plate. If unavailable, use onshape_status. Return the complete tool details as one plain JSON object in your final A2A answer, including delegationProof when present. Do not send a message or start another task.';
  let task = await rpc('SendMessage', {
    configuration: {returnImmediately: true},
    message: {messageId: randomUUID(), contextId, role: 'ROLE_USER', parts: [{text: instruction}]},
  });
  if (typeof task?.id !== 'string' || !task.id || task.contextId !== contextId) {
    rejectResult('task_context_mismatch');
  }
  taskId = task.id;
  for (let n = 0; n < 45 && ['TASK_STATE_WORKING', 'TASK_STATE_SUBMITTED'].includes(task.status?.state ?? ''); n++) {
    await wait(2000);
    task = await rpc('GetTask', {id: taskId});
    if (task?.id !== taskId || task.contextId !== contextId) {
      rejectResult('task_context_mismatch');
    }
  }
  guard();
  if (task.status?.state !== 'TASK_STATE_COMPLETED') {
    throw new Error('provider_unavailable');
  }
  const parts = task.artifacts?.flatMap((a) => a.parts ?? []) ?? [];
  if (parts.length !== 1 || typeof parts[0].text !== 'string' || parts[0].text.length > 32768) {
    rejectResult('invalid_result_shape');
  }
  const text = parts[0].text as string;
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(text);
  } catch {
    return rejectResult('invalid_result_json', text);
  }
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    rejectResult('invalid_result_object', text);
  }
  const {delegationProof, ...details} = report;
  if (delegationProof === undefined) {
    rejectResult('missing_result_proof', text);
  }
  if (typeof delegationProof !== 'string' || !/^[a-f0-9]{64}$/.test(delegationProof)) {
    rejectResult('invalid_result_proof_format', text);
  }
  if (!verifyResult(details, contextId, key, delegationProof)) {
    rejectResult('result_signature_mismatch', text);
  }
  if (envelope && (details.requestHash !== envelope.requestHash || details.requestId !== envelope.requestId)) {
    throw new Error('delegation_result_invalid');
  }
  return inspection || envelope ? {...details, a2aTaskId: taskId} : details;
}

export type EngineeringTask = {workflow: 'inspect' | 'edit' | 'verify'; task: string; approvalId?: string};
export type TaskEnvelope = EngineeringTask & {
  kind: 'engineering-request';
  version: 1;
  requestId: string;
  contextId: string;
  bindingDigest: string;
  target: {documentId: string; workspaceId: string; elementId: string};
  requestHash: string;
  requestProof: string;
};
export function validateEngineeringTask(value: unknown): asserts value is EngineeringTask {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !['task', 'workflow', 'approvalId'].includes(k))
  ) {
    throw new Error('invalid_arguments');
  }
  const v = value as EngineeringTask;
  if (
    !['inspect', 'edit', 'verify'].includes(v.workflow) ||
    typeof v.task !== 'string' ||
    !v.task.trim() ||
    v.task.length > 8000 ||
    (v.approvalId !== undefined &&
      (v.workflow !== 'edit' || typeof v.approvalId !== 'string' || !/^[a-f0-9-]{36}$/.test(v.approvalId)))
  ) {
    throw new Error('invalid_arguments');
  }
}
export function createTaskEnvelope(b: Binding, task: EngineeringTask, contextId: string, key: string): TaskEnvelope {
  validateEngineeringTask(task);
  if (!b.elementId) {
    throw new Error('target_missing');
  }
  const request = {
    kind: 'engineering-request' as const,
    version: 1 as const,
    requestId: randomUUID(),
    contextId,
    bindingDigest: bindingDigest(b),
    target: {documentId: b.documentId, workspaceId: b.workspaceId, elementId: b.elementId},
    ...task,
  };
  const requestHash = createHash('sha256').update(canonicalResult(request)).digest('hex');
  return {...request, requestHash, requestProof: signResult({...request, requestHash}, contextId, key)};
}
export function verifyTaskEnvelope(
  value: unknown,
  b: Binding,
  contextId: string,
  key: string,
): asserts value is TaskEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('delegation_denied');
  }
  const {requestProof, requestHash, ...request} = value as TaskEnvelope;
  validateEngineeringTask({workflow: request.workflow, task: request.task});
  if (
    request.kind !== 'engineering-request' ||
    request.version !== 1 ||
    typeof request.requestId !== 'string' ||
    request.requestId.length !== 36 ||
    request.contextId !== contextId ||
    request.bindingDigest !== bindingDigest(b) ||
    canonicalResult(request.target) !==
      canonicalResult({documentId: b.documentId, workspaceId: b.workspaceId, elementId: b.elementId}) ||
    requestHash !== createHash('sha256').update(canonicalResult(request)).digest('hex') ||
    !verifyResult({...request, requestHash}, contextId, key, requestProof)
  ) {
    throw new Error('delegation_denied');
  }
}
export async function delegateTask(
  c: Config,
  b: Binding,
  guard: () => void,
  task: EngineeringTask,
  fetcher: typeof fetch = fetch,
  wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  warn: (message: string) => void = (message) => console.warn(message),
) {
  validateEngineeringTask(task);
  return delegateRender(c, b, guard, fetcher, wait, warn, false, task);
}
