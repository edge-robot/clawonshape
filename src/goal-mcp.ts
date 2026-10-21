// Capability and journal-summary probes of onshape-mcp (contract §12.7). Egress only to MCP_URL, fixed 2 000 ms
// timeout, redirect: 'error', bounded bodies. No retries. Failures map to UNSUPPORTED/BLOCKED or null (unknown).
import {MCP_URL} from './mcp.ts';
import type {Capability, JournalSummary} from './goal-lifecycle.ts';
import {uuidV4} from './goal-lifecycle.ts';

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
  return {
    goalId,
    entries: value.entries,
    counted: value.counted,
    maxSequence: value.maxSequence,
    unreconciledSequence: value.unreconciledSequence,
    lastOutcome: value.lastOutcome,
    lastAdmittedAt: value.lastAdmittedAt,
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
