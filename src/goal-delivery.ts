// Lead-side result delivery (docs/interface/goal-workflow.md §7). One attempt per Lead turn, never a loop.
// The target is the host-provided conversation target recorded as the goal origin, never a self-built one.
import {createHash} from 'node:crypto';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {assertPrivateFile} from './credentials.ts';
import type {GoalOrigin} from './delegation.ts';
import type {GoalResult, ResultDelivery} from './goal-lifecycle.ts';
import {uuidV4} from './goal-lifecycle.ts';
import {canonicalJson} from './goal-scope.ts';

export type OutboundText = (params: {to: string; text: string; accountId?: string}) => Promise<void>;
// Resolves the outbound sendText of a channel, or undefined when the channel has none.
export type OutboundLoader = (channel: string) => Promise<OutboundText | undefined>;
export type CurrentConversation = {channel?: string; to?: string} | undefined;

type DeliveryEntry = {
  goalId: string;
  origin: GoalOrigin;
  resultDigest?: string;
  delivery?: ResultDelivery;
  failedAt?: number;
};

const MAX_ENTRY_BYTES = 16 * 1024;
const directory = (stateDir: string) => path.join(stateDir, 'claw-onshape', 'goal-deliveries');
const entryPath = (stateDir: string, goalId: string) => {
  if (!uuidV4(goalId)) {
    throw new Error('invalid_arguments');
  }
  return path.join(directory(stateDir), `${goalId}.json`);
};

async function readEntry(stateDir: string, goalId: string): Promise<DeliveryEntry | undefined> {
  const file = entryPath(stateDir, goalId);
  try {
    assertPrivateFile(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw new Error('goal_result_delivery_failed');
  }
  const raw = await readFile(file, 'utf8');
  if (Buffer.byteLength(raw) > MAX_ENTRY_BYTES) {
    throw new Error('goal_result_delivery_failed');
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || (value as DeliveryEntry).goalId !== goalId) {
    throw new Error('goal_result_delivery_failed');
  }
  // Private plugin-owned file; goalId checked above, origin re-validated by the caller's use as a plain target.
  return value as DeliveryEntry;
}

async function writeEntry(stateDir: string, entry: DeliveryEntry): Promise<void> {
  await mkdir(directory(stateDir), {recursive: true, mode: 0o700});
  const native = await import('openclaw/plugin-sdk/secret-file-runtime');
  await native.writePrivateSecretFileAtomic({
    rootDir: stateDir,
    filePath: entryPath(stateDir, entry.goalId),
    content: JSON.stringify(entry),
    durable: 'file',
  });
}

// The first delegation that returns a goalId records the conversation that delegated it. Later delegations of the
// same goal from other conversations do not move the origin.
export async function rememberGoalOrigin(stateDir: string, goalId: string, origin: GoalOrigin): Promise<GoalOrigin> {
  const existing = await readEntry(stateDir, goalId);
  if (existing) {
    return existing.origin;
  }
  await writeEntry(stateDir, {goalId, origin});
  return origin;
}

const resultDigest = (result: GoalResult) => {
  const {delivery: _delivery, ...rest} = result;
  return createHash('sha256').update(canonicalJson(rest)).digest('hex');
};

export function resultText(result: GoalResult): string {
  const lines = [`Onshape goal ${result.state}: ${result.summary}`];
  if (result.revisionUrl) {
    lines.push(`Candidate revision: ${result.revisionUrl}`);
  }
  if (result.openLimits.length) {
    lines.push(`Open limits: ${result.openLimits.join('; ')}`);
  }
  return lines.join('\n').slice(0, 1900);
}

const sameConversation = (origin: GoalOrigin, current: CurrentConversation) =>
  !!current && current.channel === origin.channel && current.to === origin.target;

// Delivers a terminal or paused goal result once. Returns the recorded delivery; a failure is recorded and surfaces
// as goal_result_delivery_failed. The next Lead turn may call this again; nothing here retries.
export async function deliverGoalResult(options: {
  stateDir: string;
  goalId: string;
  result: GoalResult;
  current: CurrentConversation;
  loadOutbound: OutboundLoader;
  now: () => number;
}): Promise<ResultDelivery> {
  const {stateDir, goalId, result, current, loadOutbound, now} = options;
  const entry = await readEntry(stateDir, goalId);
  if (!entry) {
    // Without a recorded origin there is no host-provided target to deliver to.
    throw new Error('goal_result_delivery_failed');
  }
  const digest = resultDigest(result);
  if (entry.delivery && entry.resultDigest === digest) {
    return entry.delivery;
  }
  const origin = entry.origin;
  let delivery: ResultDelivery;
  if (sameConversation(origin, current)) {
    // The Lead's reply in this conversation carries the result.
    delivery = {deliveredAt: now(), via: 'lead-reply', channel: origin.channel, target: origin.target};
  } else {
    try {
      const send = await loadOutbound(origin.channel);
      if (!send) {
        throw new Error('goal_result_delivery_failed');
      }
      await send({
        to: origin.target,
        text: resultText(result),
        ...(origin.accountId ? {accountId: origin.accountId} : {}),
      });
    } catch {
      // Record the failure without the provider text; the code is the only result.
      await writeEntry(stateDir, {goalId, origin, resultDigest: digest, failedAt: now()});
      throw new Error('goal_result_delivery_failed');
    }
    delivery = {deliveredAt: now(), via: 'outbound', channel: origin.channel, target: origin.target};
  }
  await writeEntry(stateDir, {goalId, origin, resultDigest: digest, delivery});
  return delivery;
}
