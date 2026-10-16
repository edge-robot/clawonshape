import {randomUUID, createHash} from 'node:crypto';
import path from 'node:path';
import {mkdir, readdir, readFile, open, unlink} from 'node:fs/promises';
import {assertPrivateFile} from './credentials.ts';
import type {Binding} from './config.ts';
import {connectionOwner, id} from './config.ts';
import {canonicalResult} from './delegation.ts';
import type {TaskEnvelope} from './delegation.ts';
import type {RestClient} from './rest.ts';

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
};
export const payloadDigest = (body: unknown) => createHash('sha256').update(canonicalResult(body)).digest('hex');
const proposalId = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s);
export function validateUpdateBody(
  body: unknown,
  featureId: string,
  baseline: string,
): asserts body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body) || canonicalResult(body).length > 900000)
    throw new Error('invalid_arguments');
  const b = body as Record<string, unknown>,
    feature = b.feature as {featureId?: unknown} | undefined;
  if (
    !feature ||
    feature.featureId !== featureId ||
    b.sourceMicroversion !== baseline ||
    b.rejectMicroversionSkew !== true ||
    !id(baseline)
  )
    throw new Error('revision_policy_denied');
}
export async function mutationStore(stateDir: string, binding: Binding) {
  const root = path.join(stateDir, 'claw-onshape', 'mutations');
  await mkdir(root, {recursive: true, mode: 0o700});
  const native = await import('openclaw/plugin-sdk/secret-file-runtime');
  const file = (value: string) => {
    if (!proposalId(value)) throw new Error('invalid_arguments');
    return path.join(root, value + '.json');
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
    )
      throw new Error('authorization_changed');
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
    const entries = [];
    for (const f of await readdir(root)) {
      if (f.endsWith('.json')) entries.push(await read(f.slice(0, -5)));
    }
    return entries;
  };
  return {
    read,
    save,
    list,
    exclusive,
    async propose(request: TaskEnvelope, body: unknown, summary: string, client: RestClient) {
      if (binding.workspaceId === binding.primaryWorkspaceId) throw new Error('protected_primary_workspace');
      const featureId = (body as {feature?: {featureId?: unknown}})?.feature?.featureId;
      if (
        typeof featureId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(featureId) ||
        typeof summary !== 'string' ||
        !summary.trim() ||
        summary.length > 6000
      )
        throw new Error('invalid_arguments');
      const baseline = await client.featureUpdateBaseline(binding, featureId);
      validateUpdateBody(body, featureId, baseline.sourceMicroversion);
      if (
        body.serializationVersion !== baseline.body.serializationVersion ||
        body.libraryVersion !== baseline.body.libraryVersion
      )
        throw new Error('provider_protocol_error');
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
        elementId: binding.elementId!,
        primaryWorkspaceId: binding.primaryWorkspaceId,
        primaryMicroversionId: baseline.primaryMicroversionId,
        featureId,
        sourceMicroversion: baseline.sourceMicroversion,
        body,
        payloadHash: payloadDigest(body),
        summary,
        status: 'PROPOSED',
        createdAt: new Date().toISOString(),
      };
      await exclusive(async () => {
        if ((await list()).some((r) => r.status === 'UNKNOWN')) throw new Error('mutation_reconciliation_required');
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
        if (record.status !== 'PROPOSED' || record.payloadHash !== expectedHash)
          throw new Error('authorization_changed');
        if ((await list()).some((r) => r.status === 'UNKNOWN')) throw new Error('mutation_reconciliation_required');
        const current = await client.featureUpdateBaseline(binding, record.featureId);
        if (
          current.sourceMicroversion !== record.sourceMicroversion ||
          current.primaryMicroversionId !== record.primaryMicroversionId
        )
          throw new Error('source_revision_conflict');
        assertOperator();
        const approved = {
          ...record,
          status: 'UNKNOWN' as const,
          approvedAt: new Date().toISOString(),
          expiresAt: Date.now() + 300000,
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
    async executionContext(value: string) {
      const record = await read(value);
      if (record.status !== 'UNKNOWN' || !record.expiresAt || record.expiresAt <= Date.now())
        throw new Error('mutation_approval_unavailable');
      return {
        proposalId: record.id,
        approvedRequestHash: record.requestHash,
        payloadHash: record.payloadHash,
        expiresAt: record.expiresAt,
        operation: 'updatePartStudioFeature',
        path_params: {did: record.documentId, wid: record.workspaceId, eid: record.elementId, fid: record.featureId},
        body: record.body,
      };
    },
    async reconcile(value: string, client: RestClient, approvalDirectory: string) {
      return exclusive(async () => {
        const record = await read(value);
        if (record.status !== 'UNKNOWN') throw new Error('invalid_arguments');
        const current = await client.featureUpdateBaseline(binding, record.featureId);
        if (current.primaryMicroversionId !== record.primaryMicroversionId) throw new Error('primary_revision_changed');
        if (current.sourceMicroversion === record.sourceMicroversion) throw new Error('mutation_outcome_unknown');
        // Verify feature identity/state and approved expressions, not full geometry.
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
        )
          throw new Error('mutation_verification_mismatch');
        for (const parameter of approved.parameters ?? []) {
          if (parameter.expression !== undefined) {
            const matches = observed.parameters?.filter((p) => p.parameterId === parameter.parameterId);
            if (matches?.length !== 1 || matches[0].expression !== parameter.expression)
              throw new Error('mutation_verification_mismatch');
          }
        }
        const verified = {...record, status: 'VERIFIED' as const, resultMicroversion: current.sourceMicroversion};
        await save(verified);
        await native.writePrivateSecretFileAtomic({
          rootDir: approvalDirectory,
          filePath: path.join(approvalDirectory, 'approved-update.json'),
          content: 'null',
          durable: 'file',
        });
        return verified;
      });
    },
  };
}
