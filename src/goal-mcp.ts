// Capability and journal-summary probes of onshape-mcp (contract §12.7). Egress only to MCP_URL, fixed 2 000 ms
// timeout, redirect: 'error', bounded bodies. No retries. Failures map to UNSUPPORTED/BLOCKED or null (unknown).
import {MCP_URL} from './mcp.ts';
import type {Capability, JournalSummary, UnreconciledEntry} from './goal-lifecycle.ts';
import {uuidV4} from './goal-lifecycle.ts';
import {GOAL_FEATURE_ID, hex24} from './goal-scope.ts';

export const GOAL_PROBE_TIMEOUT_MS = 2000;
const MAX_PROBE_BYTES = 16 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

type Probe = {status: number; body: unknown};

async function probe(fetcher: typeof fetch, pathname: string): Promise<Probe> {
  const response = await fetcher(new URL(pathname, MCP_URL), {
    method: 'GET',
    headers: {Accept: 'application/json'},
    redirect: 'error',
    signal: AbortSignal.timeout(GOAL_PROBE_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    return {status: response.status, body: undefined};
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('mcp_discovery_failed');
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) {
        break;
      }
      size += value.length;
      if (size > MAX_PROBE_BYTES) {
        await reader.cancel();
        throw new Error('mcp_discovery_failed');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return {status: 200, body: JSON.parse(Buffer.concat(chunks).toString('utf8'))};
}

// AVAILABLE only if the server lists goal-grant-v1 (unknown fields ignored). 404 (pre-1.1.0) → UNSUPPORTED.
// Anything else that is not a valid 200 (timeout, reset, redirect, 5xx, malformed JSON) → BLOCKED.
export async function goalCapability(fetcher: typeof fetch = fetch): Promise<Capability> {
  try {
    const {status, body} = await probe(fetcher, '/capabilities');
    if (status === 404) {
      return 'UNSUPPORTED';
    }
    if (
      status !== 200 ||
      !isRecord(body) ||
      !Array.isArray(body.mutationAuthorities) ||
      body.mutationAuthorities.length > 64 ||
      body.mutationAuthorities.some((entry) => typeof entry !== 'string')
    ) {
      return 'BLOCKED';
    }
    return body.mutationAuthorities.includes('goal-grant-v1') ? 'AVAILABLE' : 'UNSUPPORTED';
  } catch {
    return 'BLOCKED';
  }
}

const ENTRY_KEYS = [
  'sequence',
  'grantRevision',
  'requestHash',
  'featureId',
  'sourceMicroversion',
  'admittedAt',
  'outcome',
  'httpStatus',
];

// Exactly the eight keys and types of §12.7 (1.2.0). Anything else makes the whole summary unavailable.
function validateEntry(value: unknown): UnreconciledEntry | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== ENTRY_KEYS.length ||
    !ENTRY_KEYS.every((key) => Object.hasOwn(value, key)) ||
    !count(value.sequence) ||
    value.sequence < 1 ||
    !count(value.grantRevision) ||
    value.grantRevision < 1 ||
    typeof value.requestHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.requestHash) ||
    typeof value.featureId !== 'string' ||
    !GOAL_FEATURE_ID.test(value.featureId) ||
    !hex24(value.sourceMicroversion) ||
    !count(value.admittedAt) ||
    (value.outcome !== 'PENDING' && value.outcome !== 'UNCERTAIN') ||
    !(value.httpStatus === null || (count(value.httpStatus) && value.httpStatus <= 999))
  ) {
    return undefined;
  }
  return {
    sequence: value.sequence,
    grantRevision: value.grantRevision,
    requestHash: value.requestHash,
    featureId: value.featureId,
    sourceMicroversion: value.sourceMicroversion,
    admittedAt: value.admittedAt,
    outcome: value.outcome,
    httpStatus: value.httpStatus,
  };
}

export function validateJournalSummary(value: unknown, goalId: string): JournalSummary | null {
  if (
    !isRecord(value) ||
    value.goalId !== goalId ||
    !count(value.entries) ||
    !count(value.counted) ||
    !count(value.maxSequence) ||
    value.counted > value.entries ||
    !(value.unreconciledSequence === null || (count(value.unreconciledSequence) && value.unreconciledSequence >= 1)) ||
    !(value.lastOutcome === null || (typeof value.lastOutcome === 'string' && value.lastOutcome.length <= 64)) ||
    !(value.lastAdmittedAt === null || count(value.lastAdmittedAt))
  ) {
    return null;
  }
  // A 1.1.0 server does not send the key: null. When present, it is null exactly when nothing is unreconciled and
  // otherwise names the same sequence.
  let unreconciledEntry: UnreconciledEntry | null = null;
  if (Object.hasOwn(value, 'unreconciledEntry')) {
    if (value.unreconciledEntry === null) {
      if (value.unreconciledSequence !== null) {
        return null;
      }
    } else {
      const entry = validateEntry(value.unreconciledEntry);
      if (!entry || entry.sequence !== value.unreconciledSequence) {
        return null;
      }
      unreconciledEntry = entry;
    }
  }
  return {
    goalId,
    entries: value.entries,
    counted: value.counted,
    maxSequence: value.maxSequence,
    unreconciledSequence: value.unreconciledSequence,
    lastOutcome: value.lastOutcome,
    lastAdmittedAt: value.lastAdmittedAt,
    unreconciledEntry,
  };
}

// Authoritative progress (§12.7). null = unavailable (503, timeout, malformed): progress is unknown, never zero.
export async function journalSummary(goalId: string, fetcher: typeof fetch = fetch): Promise<JournalSummary | null> {
  if (!uuidV4(goalId)) {
    return null;
  }
  try {
    const {status, body} = await probe(fetcher, `/goals/${goalId}/journal-summary`);
    return status === 200 ? validateJournalSummary(body, goalId) : null;
  } catch {
    return null;
  }
}
