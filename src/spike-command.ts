// SPIKE ONLY (docs/prompts/2026-10-16-plugin-command-spike.md, -spike-2.md and -spike-3.md, edge-robot/clawonshape#13); not for release.
// Observes what a plugin command sees in Discord. No approval semantics, no mutation, delegation, MCP, REST,
// credential or token access. P3 of edge-robot/clawonshape#11 re-implements on the result.
import {randomUUID} from 'node:crypto';
import type {OpenClawPluginApi, PluginCommandContext, PluginCommandResult} from 'openclaw/plugin-sdk/core';
import type {Config} from './config.ts';

export const SPIKE_COMMAND = 'clawcad_spike';
export const SPIKE_FOLLOW_UP_MS = 120_000;
const MAX_ARGS = 200;
const MAX_VALUE = 128;
const MAX_FIELDS = 64;
// Reply 1 must fit into one Discord message: at most 17 lines (finding S2) and 2000 characters.
const MAX_FIELDS_LINE = 700;
const PROVIDER_ID = /^[a-z0-9_-]{1,32}$/;
const TARGET_PREFIX = /^[a-z_]{1,16}$/;
const ERROR_CLASS = /^[A-Za-z]{1,40}$/;

// Lead role at registration time: the plugin config names a Lead, and this gateway hosts that agent.
// engineerAgentId/delegation alone cannot decide it, because both gateways carry the same plugin config.
export function hostsLeadAgent(hostConfig: OpenClawPluginApi['config'] | undefined, config: Config): boolean {
  const lead = config.delegation?.leadAgentId;
  if (!lead) {
    return false;
  }
  const agents = hostConfig?.agents;
  const entries = agents?.entries;
  if (entries && Object.hasOwn(entries, lead)) {
    return true;
  }
  return Array.isArray(agents?.list) && agents.list.some((agent) => agent?.id === lead);
}

const boundedString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_VALUE ? value : null;
// Context keys are reported by name only; anything that does not look like an identifier is masked.
const fieldNames = (ctx: object): string[] =>
  Object.keys(ctx)
    .sort()
    .slice(0, MAX_FIELDS)
    .map((name) => (/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(name) ? name : '?'));
// Echo for the reply only: no fences, line breaks, control characters or mentions, at most 200 characters.
function echo(args: unknown): string {
  if (typeof args !== 'string') {
    return '';
  }
  return args
    .replace(/[\p{Cc}`]/gu, ' ')
    .replace(/@/g, '(at)')
    .replace(/<(?=[@#&!])/g, '(')
    .slice(0, MAX_ARGS);
}

// Provider id such as "discord"; ctx.channelId is the provider's channel id (spike 1 live evidence).
const providerId = (value: unknown): string | null =>
  typeof value === 'string' && PROVIDER_ID.test(value) ? value : null;

// Shape of a raw conversation target (ctx.to / ctx.from). The raw value is never reported.
type TargetShape = {prefix: string | null; segments: number; endsWithChannelId: boolean; endsWithSenderId: boolean};
function targetShape(value: unknown, channelId: string | null, senderId: string | null): TargetShape | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const separator = value.indexOf(':');
  const head = separator >= 0 ? value.slice(0, separator) : null;
  return {
    prefix: head !== null && TARGET_PREFIX.test(head) ? head : null,
    segments: value.split(':').length,
    endsWithChannelId: channelId !== null && value.endsWith(channelId),
    endsWithSenderId: senderId !== null && value.endsWith(senderId),
  };
}

type Observation = {
  invocationId: string;
  fields: string[];
  values: {
    senderId: string | null;
    channelId: string | null;
    channel: string | null;
    accountId: string | null;
    agentId: string | null;
    senderIsOwner: boolean | null;
    assertOwnerCurrentIsFunction: boolean;
    // PluginCommandContext (openclaw 2026.9.9) has no native/text surface field.
    surface: null;
    toShape: TargetShape | null;
    fromShape: TargetShape | null;
    threadPresent: boolean;
  };
};
function observe(ctx: PluginCommandContext): Observation {
  const senderId = boundedString(ctx.senderId);
  const channelId = boundedString(ctx.channelId);
  return {
    invocationId: randomUUID(),
    fields: fieldNames(ctx),
    values: {
      senderId,
      channelId,
      channel: providerId(ctx.channel),
      accountId: boundedString(ctx.accountId),
      agentId: boundedString(ctx.agentId),
      senderIsOwner: typeof ctx.senderIsOwner === 'boolean' ? ctx.senderIsOwner : null,
      assertOwnerCurrentIsFunction: typeof ctx.assertOwnerCurrent === 'function',
      surface: null,
      toShape: targetShape(ctx.to, channelId, senderId),
      fromShape: targetShape(ctx.from, channelId, senderId),
      threadPresent: typeof ctx.messageThreadId === 'string' && ctx.messageThreadId.length > 0,
    },
  };
}

type Warn = (message: string) => void;
function log(warn: Warn, event: string, fields: Record<string, unknown>) {
  const message =
    'WARNING: Claw-Onshape spike command. ' +
    JSON.stringify({event, schemaVersion: 1, timestamp: new Date().toISOString(), ...fields});
  try {
    warn(message);
  } catch {
    // Diagnostics are best effort; a failing logger must not change the command reply.
  }
}

type Source = 'from' | 'to';
type Attempt =
  | {source: Source; outcome: 'sent'}
  | {source: Source; outcome: 'send_failed'; errorClass: string | null}
  | {source: Source; outcome: 'skipped'; reason: 'not_qualified' | 'conversation_target_unavailable'};

// Only the class name of a provider error is logged; message and stack may carry request details.
function errorClass(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  try {
    const name: unknown = Reflect.get(error, 'name');
    return typeof name === 'string' && ERROR_CLASS.test(name) ? name : null;
  } catch {
    // A throwing name getter yields no class; the attempt is still logged as send_failed.
    return null;
  }
}

// ctx.from names the conversation for native slash invocations (spike 2 live evidence, row 3b). It is used as is,
// and only if it is a Discord target for exactly this channel.
function qualifyingFrom(ctx: PluginCommandContext, provider: string): string | null {
  const from = boundedString(ctx.from);
  const channelId = boundedString(ctx.channelId);
  const shape = targetShape(from, channelId, null);
  return from !== null && provider === 'discord' && shape?.prefix === 'discord' && shape.endsWithChannelId
    ? from
    : null;
}

// Reply 2: one message to the same conversation through the channel's outbound adapter. Host-provided targets only
// (ctx.from, then ctx.to), each tried at most once; never rewritten, never retried.
async function followUp(api: OpenClawPluginApi, ctx: PluginCommandContext, invocationId: string, warn: Warn) {
  const attempts: Attempt[] = [];
  const result = (outcome: 'sent' | 'not_sent', source: Source | null, reason?: string) =>
    log(warn, 'claw_onshape.spike_follow_up', {
      invocationId,
      outcome,
      source,
      ...(reason ? {reason} : {}),
      attempts,
    });
  const provider = providerId(ctx.channel);
  if (!provider) {
    return result('not_sent', null, 'provider_unavailable');
  }
  let adapter: Awaited<ReturnType<OpenClawPluginApi['runtime']['channel']['outbound']['loadAdapter']>>;
  try {
    adapter = await api.runtime.channel.outbound.loadAdapter(provider);
  } catch {
    // Only the outcome is logged; the lookup error text is not needed for the spike answer.
    return result('not_sent', null, 'adapter_lookup_failed');
  }
  if (!adapter) {
    return result('not_sent', null, 'outbound_adapter_unavailable');
  }
  const sendText = adapter.sendText;
  if (typeof sendText !== 'function') {
    return result('not_sent', null, 'send_text_unavailable');
  }
  const candidates: Array<[Source, string | null, 'not_qualified' | 'conversation_target_unavailable']> = [
    ['from', qualifyingFrom(ctx, provider), 'not_qualified'],
    ['to', boundedString(ctx.to), 'conversation_target_unavailable'],
  ];
  let tried = false;
  for (const [source, target, skipReason] of candidates) {
    if (target === null) {
      attempts.push({source, outcome: 'skipped', reason: skipReason});
      continue;
    }
    tried = true;
    try {
      await sendText.call(adapter, {
        cfg: ctx.config,
        to: target,
        text: `${SPIKE_COMMAND} follow-up ${invocationId}`,
        accountId: ctx.accountId ?? null,
        threadId: ctx.messageThreadId ?? null,
      });
    } catch (error) {
      attempts.push({source, outcome: 'send_failed', errorClass: errorClass(error)});
      continue;
    }
    attempts.push({source, outcome: 'sent'});
    return result('sent', source);
  }
  return result('not_sent', null, tried ? 'send_failed' : 'conversation_target_unavailable');
}

// Reply 1: header, then one fenced block with a single-line JSON, the field list and the echo (6 lines).
function compactReply(observation: Observation, args: string): string {
  const json = JSON.stringify({invocationId: observation.invocationId, values: observation.values});
  let fields = observation.fields.join(',');
  if (fields.length > MAX_FIELDS_LINE) {
    fields = `${fields.slice(0, MAX_FIELDS_LINE)},…`;
  }
  return [
    `${SPIKE_COMMAND} ${observation.invocationId}`,
    '```text',
    json,
    `fields: ${fields}`,
    `args: ${args}`,
    '```',
  ].join('\n');
}

export function registerSpikeCommand(api: OpenClawPluginApi, config: Config) {
  if (!hostsLeadAgent(api.config, config)) {
    return;
  }
  const warn: Warn = (message) => api.logger.warn(message);
  api.registerCommand({
    name: SPIKE_COMMAND,
    description: 'ClawCAD spike: show which command context fields arrive (no CAD effect).',
    acceptsArgs: true,
    requireAuth: true,
    handler: (ctx: PluginCommandContext): PluginCommandResult => {
      const observation = observe(ctx);
      const args = echo(ctx.args);
      log(warn, 'claw_onshape.spike_command_invoked', {
        ...observation,
        argsLength: typeof ctx.args === 'string' ? ctx.args.length : 0,
      });
      const timer = setTimeout(() => {
        void followUp(api, ctx, observation.invocationId, warn);
      }, SPIKE_FOLLOW_UP_MS);
      timer.unref();
      return {text: compactReply(observation, args)};
    },
  });
}
