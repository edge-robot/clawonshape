// SPIKE ONLY (docs/prompts/2026-10-16-plugin-command-spike.md, edge-robot/clawonshape#13); not for release.
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

type Observation = {
  invocationId: string;
  fields: string[];
  values: {
    senderId: string | null;
    channelId: string | null;
    accountId: string | null;
    agentId: string | null;
    senderIsOwner: boolean | null;
    assertOwnerCurrentIsFunction: boolean;
    // PluginCommandContext (openclaw 2026.9.9) has no native/text surface field.
    surface: null;
  };
};
function observe(ctx: PluginCommandContext): Observation {
  return {
    invocationId: randomUUID(),
    fields: fieldNames(ctx),
    values: {
      senderId: boundedString(ctx.senderId),
      channelId: boundedString(ctx.channelId),
      accountId: boundedString(ctx.accountId),
      agentId: boundedString(ctx.agentId),
      senderIsOwner: typeof ctx.senderIsOwner === 'boolean' ? ctx.senderIsOwner : null,
      assertOwnerCurrentIsFunction: typeof ctx.assertOwnerCurrent === 'function',
      surface: null,
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

// Reply 2: one message to the same conversation through the channel's outbound adapter. Never retried.
async function followUp(api: OpenClawPluginApi, ctx: PluginCommandContext, invocationId: string, warn: Warn) {
  const result = (outcome: 'sent' | 'not_sent', reason?: string) =>
    log(warn, 'claw_onshape.spike_follow_up', {invocationId, outcome, ...(reason ? {reason} : {})});
  try {
    const channel = boundedString(ctx.channelId) ?? boundedString(ctx.channel);
    const adapter = channel ? await api.runtime.channel.outbound.loadAdapter(channel) : undefined;
    if (!adapter) {
      return result('not_sent', 'outbound_adapter_unavailable');
    }
    if (typeof adapter.sendText !== 'function') {
      return result('not_sent', 'send_text_unavailable');
    }
    const to = boundedString(ctx.to);
    if (!to) {
      return result('not_sent', 'conversation_target_unavailable');
    }
    await adapter.sendText({
      cfg: ctx.config,
      to,
      text: `${SPIKE_COMMAND} follow-up ${invocationId}`,
      accountId: ctx.accountId ?? null,
      threadId: ctx.messageThreadId ?? null,
    });
    return result('sent');
  } catch {
    // The provider error text may carry request details; only the outcome is logged.
    return result('not_sent', 'send_failed');
  }
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
      const body = JSON.stringify({...observation, args}, null, 2);
      return {text: `${SPIKE_COMMAND} ${observation.invocationId}\n\`\`\`json\n${body}\n\`\`\``};
    },
  });
}
