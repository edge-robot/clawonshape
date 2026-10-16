import {randomUUID, createHash} from 'node:crypto';
import path from 'node:path';
import {mkdir, readdir, readFile, open, unlink} from 'node:fs/promises';
import {assertPrivateFile} from './credentials.ts';
import type {Binding} from './config.ts';
import {connectionOwner, id} from './config.ts';
import {canonicalResult} from './delegation.ts';
import type {TaskEnvelope} from './delegation.ts';
import type {RestClient} from './rest.ts';
import {ProviderHttpError} from './http.ts';
import {userError} from './readiness.ts';

export type MutationProposal = {
  version: 1;
  id: string;
  ownerHash: string;
  requestHash: string;
  requestId: string;
  task: string;
  documentId: string;
  workspaceId: string;
  elementId: string;
  primaryWorkspaceId: string;
  primaryMicroversionId: string;
  featureId: string;
  sourceMicroversion: string;
  body: Record<string, unknown>;
  payloadHash: string;
  summary: string;
  status: 'PROPOSED' | 'UNKNOWN' | 'VERIFIED' | 'REJECTED';
  createdAt: string;
  approvedAt?: string;
  expiresAt?: number;
  resultMicroversion?: string;
  // Only on REJECTED receipts (contract §4 reconcile rule 4).
  reason?: 'approval_expired_not_dispatched';
  rejectedAt?: string;
};
// Contract §4 reconcile rule 4: wait 60 s past expiresAt, which covers the server's 30 s Onshape
// timeout (§7), so that a dispatch admitted just before expiry has finished before REJECTED.
export const APPROVAL_DISPATCH_GRACE_MS = 60_000;
// Contract §4.1: the Engineer passes `apiCall` unchanged as the onshape_api_call arguments.
export type ExecutionContext = {
  status: 'ok';
  proposalId: string;
  approvedRequestHash: string;
  payloadHash: string;
  expiresAt: number;
  apiCall: {
    endpoint: 'updatePartStudioFeature';
    path_params: {did: string; wid: string; eid: string; fid: string};
    body: Record<string, unknown>;
  };
};
// Where a mutation tool call was rejected; only used for the bounded diagnostic line.
export type MutationStage = 'body_validation' | 'baseline_read' | 'reconcile_read';
export class MutationStageError extends Error {
  readonly stage: MutationStage;
  readonly httpStatus: number | undefined;
  constructor(code: string, stage: MutationStage, httpStatus?: number) {
    super(code);
    this.stage = stage;
    this.httpStatus = httpStatus;
  }
}
// Keeps the code (the error message) unchanged and records the stage. Non-Error throws carry no code.
async function staged<T>(stage: MutationStage, action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    if (e instanceof MutationStageError) {
      throw e;
    }
    const code = e instanceof Error ? e.message : 'onshape_unavailable';
    throw new MutationStageError(code, stage, e instanceof ProviderHttpError ? e.status : undefined);
  }
}
const DIAGNOSED_CODES: ReadonlySet<string> = new Set([
  'provider_protocol_error',
  'proposal_body_invalid',
  'revision_policy_denied',
  'provider_transport_error',
]);
// Tool result for a rejected mutation tool call (contract §6: details.code unchanged). For the diagnosed codes it
// writes one structured warning line. The line carries no body, token or provider text.
export function mutationToolFailure(tool: string, error: unknown, binding: Binding, warn: (message: string) => void) {
  const details = userError(error);
  if (DIAGNOSED_CODES.has(details.code)) {
    const stageError = error instanceof MutationStageError ? error : undefined;
    const message =
      'WARNING: Claw-Onshape mutation tool rejected. ' +
      JSON.stringify({
        event: 'claw_onshape.mutation_tool_rejected',
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        severity: 'WARNING',
        tool,
        code: details.code,
        stage: stageError?.stage ?? 'tool',
        ownerHash: connectionOwner(binding),
        documentId: binding.documentId,
        ...(stageError?.httpStatus === undefined ? {} : {httpStatus: stageError.httpStatus}),
      });
    try {
      warn(message);
    } catch {
      // Diagnostics are best effort: the tool result below already carries the code, and the logger's own
      // error text must not reach the agent.
    }
  }
  return {content: [{type: 'text' as const, text: details.message}], details, isError: true as const};
}
export const payloadDigest = (body: unknown) => createHash('sha256').update(canonicalResult(body)).digest('hex');
const proposalId = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const MAX_PROPOSAL_BODY_CHARS = 900000;
const FEATURE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SERIALIZATION_VERSION = /^\d+\.\d+\.\d+$/;
// Structural shape of a complete native v16 feature update. Every defect here can be fixed by re-reading the
// feature natively and resubmitting it, so it is proposal_body_invalid (contract §6, 0.4.0). The versions must be
// present and well-formed but are not compared with the plugin's own REST read: Onshape reports different
// serializationVersion values for the same microversion to different clients (M21).
export function proposalFeatureId(body: unknown): string {
  if (!isRecord(body) || canonicalResult(body).length > MAX_PROPOSAL_BODY_CHARS) {
    throw new Error('invalid_arguments');
  }
  const feature = body.feature;
  const serializationVersion = body.serializationVersion;
  const libraryVersion = body.libraryVersion;
  if (
    !isRecord(feature) ||
    typeof feature.featureId !== 'string' ||
    !FEATURE_ID.test(feature.featureId) ||
    typeof serializationVersion !== 'string' ||
    !SERIALIZATION_VERSION.test(serializationVersion) ||
    typeof libraryVersion !== 'number' ||
    !Number.isSafeInteger(libraryVersion) ||
    libraryVersion <= 0
  ) {
    throw new Error('proposal_body_invalid');
  }
  return feature.featureId;
}
// Baseline and skew policy against the live Candidate read (contract §2.5 step 4).
export function validateUpdateBody(
  body: unknown,
  featureId: string,
  baseline: string,
): asserts body is Record<string, unknown> {
  if (proposalFeatureId(body) !== featureId) {
    throw new Error('revision_policy_denied');
  }
  if (!isRecord(body)) {
    throw new Error('invalid_arguments');
  }
  if (body.sourceMicroversion !== baseline || body.rejectMicroversionSkew !== true || !id(baseline)) {
    throw new Error('revision_policy_denied');
  }
}
export async function mutationStore(stateDir: string, binding: Binding, now: () => number = Date.now) {
  const root = path.join(stateDir, 'claw-onshape', 'mutations');
  await mkdir(root, {recursive: true, mode: 0o700});
  const native = await import('openclaw/plugin-sdk/secret-file-runtime');
  const file = (value: string) => {
    if (!proposalId(value)) {
      throw new Error('invalid_arguments');
    }
    return path.join(root, `${value}.json`);
  };
  const read = async (value: string): Promise<MutationProposal> => {
    const p = file(value);
    assertPrivateFile(p);
    const record = JSON.parse(await readFile(p, 'utf8')) as MutationProposal;
    if (
      record.version !== 1 ||
      record.id !== value ||
      record.ownerHash !== connectionOwner(binding) ||
      record.documentId !== binding.documentId ||
      record.workspaceId !== binding.workspaceId ||
      record.elementId !== binding.elementId ||
      record.primaryWorkspaceId !== binding.primaryWorkspaceId ||
      record.payloadHash !== payloadDigest(record.body)
    ) {
      throw new Error('authorization_changed');
    }
    return record;
  };
  const save = async (record: MutationProposal) => {
    await native.writePrivateSecretFileAtomic({
      rootDir: stateDir,
      filePath: file(record.id),
      content: JSON.stringify(record),
      durable: 'file',
    });
    const fd = await open(file(record.id), 'r');
    try {
      await fd.sync();
    } finally {
      await fd.close();
    }
    const dir = await open(root, 'r');
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  };
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    const lock = path.join(root, 'operation.lock');
    const fd = await open(lock, 'wx', 0o600);
    try {
      return await action();
    } finally {
      await fd.close();
      await unlink(lock);
    }
  };
  // Never omit an unreadable receipt: it could contain an unresolved attempt.
  const list = async () => {
    const entries: Awaited<ReturnType<typeof read>>[] = [];
    for (const f of await readdir(root)) {
      if (f.endsWith('.json')) {
        entries.push(await read(f.slice(0, -5)));
      }
    }
    return entries;
  };
  return {
    read,
    save,
    list,
    exclusive,
    async propose(request: TaskEnvelope, body: unknown, summary: string, client: RestClient) {
      if (binding.workspaceId === binding.primaryWorkspaceId) {
        throw new Error('protected_primary_workspace');
      }
      if (typeof summary !== 'string' || !summary.trim() || summary.length > 6000) {
        throw new Error('invalid_arguments');
      }
      // Structural checks first: a broken body causes no provider read.
      const featureId = await staged('body_validation', () => proposalFeatureId(body));
      const baseline = await staged('baseline_read', () => client.featureUpdateBaseline(binding, featureId));
      await staged('body_validation', () => validateUpdateBody(body, featureId, baseline.sourceMicroversion));
      // The assertion inside the closure does not narrow here; re-check instead of casting.
      if (!isRecord(body)) {
        throw new Error('invalid_arguments');
      }
      // A complete native v16 feature/payload is prepared by Engineer, reviewed by operator.
      const record: MutationProposal = {
        version: 1,
        id: randomUUID(),
        ownerHash: connectionOwner(binding),
        requestHash: request.requestHash,
        requestId: request.requestId,
        task: request.task,
        documentId: binding.documentId,
        workspaceId: binding.workspaceId,
        // biome-ignore lint/style/noNonNullAssertion: TODO(#9): invariant not provable locally; replace with an explicit fail-closed check
        elementId: binding.elementId!,
        primaryWorkspaceId: binding.primaryWorkspaceId,
        primaryMicroversionId: baseline.primaryMicroversionId,
        featureId,
        sourceMicroversion: baseline.sourceMicroversion,
        body,
        payloadHash: payloadDigest(body),
        summary,
        status: 'PROPOSED',
        createdAt: new Date(now()).toISOString(),
      };
      await exclusive(async () => {
        if ((await list()).some((r) => r.status === 'UNKNOWN')) {
          throw new Error('mutation_reconciliation_required');
        }
        await save(record);
      });
      return record;
    },
    async approve(
      value: string,
      expectedHash: string,
      approvalDirectory: string,
      client: RestClient,
      assertOperator: () => void,
    ) {
      return exclusive(async () => {
        assertOperator();
        const record = await read(value);
        if (record.status !== 'PROPOSED' || record.payloadHash !== expectedHash) {
          throw new Error('authorization_changed');
        }
        if ((await list()).some((r) => r.status === 'UNKNOWN')) {
          throw new Error('mutation_reconciliation_required');
        }
        const current = await client.featureUpdateBaseline(binding, record.featureId);
        if (
          current.sourceMicroversion !== record.sourceMicroversion ||
          current.primaryMicroversionId !== record.primaryMicroversionId
        ) {
          throw new Error('source_revision_conflict');
        }
        assertOperator();
        const approvedAt = now();
        const approved = {
          ...record,
          status: 'UNKNOWN' as const,
          approvedAt: new Date(approvedAt).toISOString(),
          expiresAt: approvedAt + 300000,
        };
        // Persist uncertainty before publishing authority. No automatic re-approval/retry.
        await save(approved);
        await mkdir(approvalDirectory, {recursive: true, mode: 0o700});
        await native.writePrivateSecretFileAtomic({
          rootDir: approvalDirectory,
          filePath: path.join(approvalDirectory, 'approved-update.json'),
          content: JSON.stringify({
            version: 1,
            proposalId: record.id,
            expiresAt: approved.expiresAt,
            requestHash: record.requestHash,
            payloadHash: record.payloadHash,
            body: record.body,
          }),
          durable: 'file',
        });
        return approved;
      });
    },
    // Contract §4.1: available only for an UNKNOWN receipt with now < expiresAt; no MCP call, no provider I/O.
    async executionContext(value: string): Promise<ExecutionContext> {
      const record = await read(value);
      const expiresAt = record.expiresAt;
      if (record.status !== 'UNKNOWN' || expiresAt === undefined || !Number.isSafeInteger(expiresAt)) {
        throw new Error('mutation_approval_unavailable');
      }
      if (now() >= expiresAt) {
        throw new Error('mutation_approval_unavailable');
      }
      return {
        status: 'ok',
        proposalId: record.id,
        approvedRequestHash: record.requestHash,
        payloadHash: record.payloadHash,
        expiresAt,
        apiCall: {
          endpoint: 'updatePartStudioFeature',
          path_params: {
            did: record.documentId,
            wid: record.workspaceId,
            eid: record.elementId,
            fid: record.featureId,
          },
          body: record.body,
        },
      };
    },
    // Contract §4: on an UNKNOWN receipt apply rules 1–4 in order. VERIFIED and REJECTED are terminal and
    // are the only transitions; both persist the receipt first and then reset the approval file to null.
    async reconcile(value: string, client: RestClient, approvalDirectory: string) {
      const finish = async (terminal: MutationProposal) => {
        await save(terminal);
        await native.writePrivateSecretFileAtomic({
          rootDir: approvalDirectory,
          filePath: path.join(approvalDirectory, 'approved-update.json'),
          content: 'null',
          durable: 'file',
        });
        return terminal;
      };
      return exclusive(async () => {
        const record = await read(value);
        if (record.status !== 'UNKNOWN') {
          throw new Error('invalid_arguments');
        }
        const current = await staged('reconcile_read', () => client.featureUpdateBaseline(binding, record.featureId));
        // Rule 1: Primary changed. Stays UNKNOWN.
        if (current.primaryMicroversionId !== record.primaryMicroversionId) {
          throw new Error('primary_revision_changed');
        }
        // Rule 2: Candidate changed. Verify feature identity/state and approved expressions, not full geometry.
        if (current.sourceMicroversion !== record.sourceMicroversion) {
          const approved = record.body.feature as {
            featureId?: unknown;
            featureType?: unknown;
            suppressed?: unknown;
            parameters?: {parameterId?: unknown; expression?: unknown}[];
          };
          const observed = current.feature as typeof approved;
          if (
            observed.featureId !== approved.featureId ||
            observed.featureType !== approved.featureType ||
            observed.suppressed !== approved.suppressed ||
            current.featureStatus !== 'OK'
          ) {
            throw new Error('mutation_verification_mismatch');
          }
          for (const parameter of approved.parameters ?? []) {
            if (parameter.expression !== undefined) {
              const matches = observed.parameters?.filter((p) => p.parameterId === parameter.parameterId);
              if (matches?.length !== 1 || matches[0].expression !== parameter.expression) {
                throw new Error('mutation_verification_mismatch');
              }
            }
          }
          return finish({...record, status: 'VERIFIED', resultMicroversion: current.sourceMicroversion});
        }
        // Rule 3: Candidate unchanged within the grace. A receipt without a valid expiry stays UNKNOWN.
        const at = now();
        const expiresAt = record.expiresAt;
        if (
          expiresAt === undefined ||
          !Number.isSafeInteger(expiresAt) ||
          at < expiresAt + APPROVAL_DISPATCH_GRACE_MS
        ) {
          throw new Error('mutation_outcome_unknown');
        }
        // Rule 4: Candidate unchanged after the grace; the approval expired without a dispatch.
        return finish({
          ...record,
          status: 'REJECTED',
          reason: 'approval_expired_not_dispatched',
          rejectedAt: new Date(at).toISOString(),
        });
      });
    },
  };
}
