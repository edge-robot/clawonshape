import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir, open, lstat, realpath, unlink, opendir} from 'node:fs/promises';
import path from 'node:path';
import {connectionOwner, id} from './config.ts';
import type {Binding} from './config.ts';

export const CANDIDATE_MAX_BYTES = 2048;
export const CANDIDATE_MAX_RECORDS = 64;
export type CandidateAttempt = Readonly<{
  schemaVersion: 1;
  attemptId: string;
  ownerHash: string;
  documentId: string;
  primaryWorkspaceId: string;
  sourceWorkspaceId: string;
  sourceElementId: string;
  sourceMicroversionId: string;
  requestDigest: string;
  featureCount: number;
  status: 'UNKNOWN' | 'CREATED_UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  candidateWorkspaceId?: string;
  code?: string;
}>;
export type CandidateAttemptWarning = (message: string) => void;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const codes = [
  'candidate_creation_unknown',
  'provider_protocol_error',
  'provider_transport_error',
  'provider_unavailable',
  'provider_forbidden',
  'provider_not_found',
  'provider_rate_limited',
  'provider_conflict',
  'reconnect_required',
  'protected_primary_workspace',
  'candidate_not_isolated',
  'workspace_not_in_document',
  'candidate_revision_conflict',
  'target_not_part_studio',
  'candidate_store_unavailable',
  'authorization_changed',
  'agent_policy_denied',
  'oauth_read_scope_missing',
  'oauth_write_scope_missing',
  'app_permission_read_disabled',
  'app_permission_write_disabled',
  'app_permission_write_unknown',
];
const date = (v: unknown) =>
  typeof v === 'string' && v.length === 24 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function validate(value: unknown, ownerHash: string, documentId: string): CandidateAttempt {
  const v = value as CandidateAttempt | null;
  const keys = [
    'schemaVersion',
    'attemptId',
    'ownerHash',
    'documentId',
    'primaryWorkspaceId',
    'sourceWorkspaceId',
    'sourceElementId',
    'sourceMicroversionId',
    'requestDigest',
    'featureCount',
    'status',
    'createdAt',
    'updatedAt',
    'candidateWorkspaceId',
    'code',
  ];
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    v.schemaVersion !== 1 ||
    !uuid(v.attemptId) ||
    !hash(v.ownerHash) ||
    v.ownerHash !== ownerHash ||
    v.documentId !== documentId ||
    ![v.documentId, v.primaryWorkspaceId, v.sourceWorkspaceId, v.sourceElementId, v.sourceMicroversionId].every(id) ||
    !hash(v.requestDigest) ||
    !Number.isInteger(v.featureCount) ||
    v.featureCount < 0 ||
    v.featureCount > 1000 ||
    !['UNKNOWN', 'CREATED_UNVERIFIED', 'VERIFIED', 'REJECTED'].includes(v.status) ||
    !date(v.createdAt) ||
    !date(v.updatedAt) ||
    (v.candidateWorkspaceId !== undefined && !id(v.candidateWorkspaceId)) ||
    (v.code !== undefined && !codes.includes(v.code)) ||
    (['CREATED_UNVERIFIED', 'VERIFIED'].includes(v.status) && !v.candidateWorkspaceId)
  ) {
    throw new Error('candidate_store_unavailable');
  }
  return Object.freeze(v);
}
async function privateDirectory(dir: string): Promise<void> {
  const info = await lstat(dir);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077 ||
    (await realpath(dir)) !== dir
  ) {
    throw new Error('candidate_store_unavailable');
  }
}

// Fixed, bounded private receipts. A global non-waiting lock also serializes the
// capacity check across processes. It is independent of the OAuth refresh lock.
export async function candidateAttempts(stateDir: string, binding: Binding) {
  if (!path.isAbsolute(stateDir) || !id(binding.documentId)) {
    throw new Error('candidate_store_unavailable');
  }
  const ownerHash = connectionOwner(binding),
    documentId = binding.documentId;
  const slot = createHash('sha256')
    .update(JSON.stringify([ownerHash, documentId]))
    .digest('hex');
  const dir = path.join(stateDir, 'claw-onshape-candidate-attempts'),
    filePath = path.join(dir, slot + '.json');
  try {
    await privateDirectory(stateDir);
    await mkdir(dir, {mode: 0o700});
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw new Error('candidate_store_unavailable');
    }
  }
  await privateDirectory(dir);
  const parent = await open(stateDir, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  return {
    async exclusive<T>(
      action: (receipt: {
        read: () => Promise<CandidateAttempt | undefined>;
        save: (record: CandidateAttempt) => Promise<void>;
      }) => Promise<T>,
    ): Promise<T> {
      await privateDirectory(dir);
      const lockPath = path.join(dir, '.lock');
      let lock;
      try {
        lock = await open(
          lockPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
      } catch (e) {
        throw new Error(
          (e as NodeJS.ErrnoException).code === 'EEXIST' ? 'candidate_preparation_busy' : 'candidate_store_unavailable',
        );
      }
      try {
        // Stop at the hard cap rather than buffering an arbitrarily large listing.
        let count = 0;
        for await (const entry of await opendir(dir)) {
          if (entry.name === '.lock') {
            continue;
          }
          if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/.test(entry.name) || ++count > CANDIDATE_MAX_RECORDS) {
            throw new Error('candidate_store_unavailable');
          }
        }
        const read = async (): Promise<CandidateAttempt | undefined> => {
          let file;
          try {
            file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
              return undefined;
            }
            throw new Error('candidate_store_unavailable');
          }
          try {
            const info = await file.stat();
            if (
              !info.isFile() ||
              info.nlink !== 1 ||
              info.uid !== process.getuid?.() ||
              info.mode & 0o077 ||
              info.size > CANDIDATE_MAX_BYTES
            ) {
              throw new Error('candidate_store_unavailable');
            }
            const buffer = Buffer.alloc(CANDIDATE_MAX_BYTES + 1),
              {bytesRead} = await file.read(buffer, 0, buffer.length, 0);
            if (bytesRead > CANDIDATE_MAX_BYTES) {
              throw new Error('candidate_store_unavailable');
            }
            return validate(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')), ownerHash, documentId);
          } catch {
            throw new Error('candidate_store_unavailable');
          } finally {
            await file.close();
          }
        };
        const save = async (record: CandidateAttempt): Promise<void> => {
          const content = JSON.stringify(validate(record, ownerHash, documentId));
          if (Buffer.byteLength(content) > CANDIDATE_MAX_BYTES) {
            throw new Error('candidate_store_unavailable');
          }
          const previous = await read();
          if (!previous && count >= CANDIDATE_MAX_RECORDS) {
            throw new Error('candidate_store_full');
          }
          try {
            const native = await import('openclaw/plugin-sdk/secret-file-runtime');
            await native.writePrivateSecretFileAtomic({rootDir: stateDir, filePath, content, durable: 'file'});
            // The host overwrite fallback may suppress EPERM on file sync.
            // Strictly sync the exact private receipt before any provider POST.
            await privateDirectory(dir);
            const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
              const info = await file.stat();
              if (
                !info.isFile() ||
                info.nlink !== 1 ||
                info.uid !== process.getuid?.() ||
                info.mode & 0o077 ||
                info.size !== Buffer.byteLength(content)
              ) {
                throw new Error('candidate_store_unavailable');
              }
              const buffer = Buffer.alloc(CANDIDATE_MAX_BYTES + 1),
                {bytesRead} = await file.read(buffer, 0, buffer.length, 0);
              if (bytesRead !== info.size || !buffer.subarray(0, bytesRead).equals(Buffer.from(content))) {
                throw new Error('candidate_store_unavailable');
              }
              await file.sync();
              const published = await lstat(filePath);
              if (
                published.isSymbolicLink() ||
                published.dev !== info.dev ||
                published.ino !== info.ino ||
                published.nlink !== 1 ||
                published.uid !== info.uid ||
                published.mode & 0o077 ||
                published.size !== info.size
              ) {
                throw new Error('candidate_store_unavailable');
              }
            } finally {
              await file.close();
            }
            // Persist the directory entry too before allowing a provider dispatch.
            const directory = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY);
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
            if (!previous) {
              count++;
            }
          } catch {
            throw new Error('candidate_store_unavailable');
          }
        };
        return await action({read, save});
      } finally {
        await lock.close();
        await unlink(lockPath);
      }
    },
  };
}

export function warnCandidate(
  warn: CandidateAttemptWarning,
  event: 'outcome_unresolved' | 'repeat_blocked',
  record: CandidateAttempt,
): void {
  const message =
    'WARNING: Claw-Onshape candidate preparation requires reconciliation. ' +
    JSON.stringify({
      event: 'claw_onshape.candidate_' + event,
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      severity: 'WARNING',
      attemptId: record.attemptId,
      ownerHash: record.ownerHash,
      documentId: record.documentId,
      status: record.status,
      ...(record.code ? {code: record.code} : {}),
    });
  try {
    warn(message);
  } catch {
    console.warn(message);
  }
}
