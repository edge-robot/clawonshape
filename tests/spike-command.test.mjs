// Spike (docs/prompts/2026-10-16-plugin-command-spike.md, -spike-2.md and -spike-3.md, edge-robot/clawonshape#13): throwaway
// clawcad_spike plugin command. Only registration, redaction, the reply bound and the follow-up scheduling are
// tested here; Discord visibility and the real handler context are live checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../dist/index.js';

const LEAD = 'clawcad-robotics-lead';
const ENGINEER = 'clawcad-mechanical-engineer';
// Live values from docs/evidence/2026-10-16-plugin-command-spike.md (not secrets).
const SENDER = '1382988369553915990';
const DISCORD_CHANNEL = '1553026145803436056';
const binding = {
  agentId: ENGINEER,
  requesterSenderId: SENDER,
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
  documentId: 'a'.repeat(24),
  primaryWorkspaceId: 'b'.repeat(24),
  workspaceId: 'c'.repeat(24),
};
const pluginConfig = {
  bindings: [binding],
  liveReads: false,
  engineerAgentId: ENGINEER,
  delegation: {
    leadAgentId: LEAD,
    engineerAgentId: ENGINEER,
    peerSenderId: 'lead',
    accountId: 'default',
    keyFile: '/run/fixture-delegation/key',
  },
};

// Loads the plugin with a fake api. `agents` are the agent ids this gateway hosts (api.config.agents.entries).
// `loadAdapter` replaces the fake runtime lookup; by default it returns `outbound`.
function load({agents, cfg = pluginConfig, outbound, loadAdapter} = {}) {
  const commands = [],
    logs = [],
    adapters = [];
  plugin.register({
    config: {agents: {entries: Object.fromEntries((agents ?? []).map((id) => [id, {}]))}},
    pluginConfig: cfg,
    logger: {warn: (m) => logs.push(m), info: (m) => logs.push(m)},
    session: {controls: {registerSessionAction: () => {}}},
    registerHttpRoute: () => {},
    lifecycle: {registerRuntimeLifecycle: () => {}},
    registerTool: () => {},
    registerCli: () => {},
    registerCommand: (command) => commands.push(command),
    runtime: {
      config: {current: () => ({plugins: {entries: {'claw-onshape': {enabled: true, config: cfg}}}})},
      state: {resolveStateDir: () => '/tmp/fixture-openclaw'},
      channel: {
        outbound: {
          loadAdapter:
            loadAdapter ??
            (async (id) => {
              adapters.push(id);
              return outbound;
            }),
        },
      },
    },
  });
  return {commands, logs, adapters};
}

const SECRETS = [
  'SECRET-CONFIG-DO-NOT-LOG',
  'SESSION-KEY-DO-NOT-LOG',
  'SESSION-ID-DO-NOT-LOG',
  'BODY-DO-NOT-LOG',
  'TOKEN-DO-NOT-LOG',
  'SCOPE-DO-NOT-LOG',
  'DIAG-DO-NOT-LOG',
];
// Raw conversation targets; only their shapes may be reported.
const TO = `channel:${DISCORD_CHANNEL}`;
const FROM = `discord:${SENDER}`;
// A context shaped like the live PluginCommandContext, with extra secret-looking fields.
const context = (extra = {}) => ({
  senderId: SENDER,
  channel: 'discord',
  channelId: DISCORD_CHANNEL,
  isAuthorizedSender: true,
  senderIsOwner: true,
  assertOwnerCurrent: () => {},
  gatewayClientScopes: ['SCOPE-DO-NOT-LOG'],
  agentId: LEAD,
  sessionKey: 'SESSION-KEY-DO-NOT-LOG',
  sessionId: 'SESSION-ID-DO-NOT-LOG',
  args: 'hello',
  commandBody: '/clawcad_spike hello BODY-DO-NOT-LOG',
  config: {secret: 'SECRET-CONFIG-DO-NOT-LOG'},
  from: FROM,
  to: TO,
  accountId: 'default',
  messageThreadId: '',
  threadParentId: 'parent',
  diagnosticsSessions: [{key: 'DIAG-DO-NOT-LOG'}],
  token: 'TOKEN-DO-NOT-LOG',
  requestConversationBinding: async () => ({}),
  detachConversationBinding: async () => ({removed: false}),
  getCurrentConversationBinding: async () => null,
  ...extra,
});
const ALLOWED_VALUES = [
  'accountId',
  'agentId',
  'assertOwnerCurrentIsFunction',
  'channel',
  'channelId',
  'fromShape',
  'senderId',
  'senderIsOwner',
  'surface',
  'threadPresent',
  'toShape',
];
// Reply 1 (spike 2, finding S2): header, a fenced block with one compact JSON line, the field list and the echo.
const parseReply = (text) => {
  const lines = text.split('\n');
  assert(lines.length <= 17, `reply 1 has ${lines.length} lines`);
  assert(text.length <= 2000, `reply 1 has ${text.length} characters`);
  const m = /^clawcad_spike ([0-9a-f-]{36})\n```text\n(\{.*\})\nfields: (.*)\nargs: (.*)\n```$/.exec(text);
  assert(m, `unexpected reply shape: ${text.slice(0, 120)}`);
  return {invocationId: m[1], body: JSON.parse(m[2]), fields: m[3], args: m[4]};
};
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
const event = (line) => JSON.parse(line.slice(line.indexOf('{')));

test('clawcad_spike is registered only on the gateway that hosts the Lead agent', () => {
  const lead = load({agents: [LEAD]});
  assert.equal(lead.commands.length, 1);
  const [command] = lead.commands;
  assert.equal(command.name, 'clawcad_spike');
  assert.equal(command.requireAuth, true);
  assert.equal(command.acceptsArgs, true);
  assert.equal(typeof command.handler, 'function');
  assert.equal(typeof command.description, 'string');
  // Engineer gateway: same plugin config, but the Lead agent is not hosted here.
  assert.equal(load({agents: [ENGINEER]}).commands.length, 0);
  assert.equal(load({agents: []}).commands.length, 0);
  // No delegation (no Lead role configured) on a gateway that happens to host the Lead id.
  const {delegation: _d, ...withoutDelegation} = pluginConfig;
  assert.equal(load({agents: [LEAD], cfg: withoutDelegation}).commands.length, 0);
});

test('reply 1 is compact and with the log line carries only field names, allowed values and shapes', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {commands, logs} = load({agents: [LEAD]});
  const ctx = context();
  const result = await commands[0].handler(ctx);
  assert.equal(typeof result.text, 'string');
  for (const secret of [...SECRETS, TO, FROM]) {
    assert(!result.text.includes(secret), `reply must not contain ${secret}`);
  }
  const {invocationId, body, fields, args} = parseReply(result.text);
  assert.deepEqual(Object.keys(body).sort(), ['invocationId', 'values']);
  assert.equal(body.invocationId, invocationId);
  assert.deepEqual(Object.keys(body.values).sort(), ALLOWED_VALUES);
  assert.deepEqual(body.values, {
    senderId: SENDER,
    channelId: DISCORD_CHANNEL,
    channel: 'discord',
    accountId: 'default',
    agentId: LEAD,
    senderIsOwner: true,
    assertOwnerCurrentIsFunction: true,
    surface: null,
    toShape: {prefix: 'channel', segments: 2, endsWithChannelId: true, endsWithSenderId: false},
    fromShape: {prefix: 'discord', segments: 2, endsWithChannelId: false, endsWithSenderId: true},
    threadPresent: false,
  });
  assert.equal(fields, Object.keys(ctx).sort().join(','));
  assert.equal(args, 'hello');
  const invocation = logs.filter((m) => m.includes('"claw_onshape.spike_command_invoked"'));
  assert.equal(invocation.length, 1);
  const line = invocation[0];
  assert(!line.includes('\n'));
  for (const secret of [...SECRETS, TO, FROM, 'hello']) {
    assert(!line.includes(secret), `log must not contain ${secret}`);
  }
  const logged = event(line);
  assert.equal(logged.invocationId, invocationId);
  assert.deepEqual(logged.values, body.values);
  assert.deepEqual(logged.fields, Object.keys(ctx).sort());
  assert.equal(logged.argsLength, 5);
});

test('target shapes never carry raw values and mask unexpected prefixes', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {commands, logs} = load({agents: [LEAD]});
  const to = 'TO-DO-NOT-LOG:x:y';
  const from = `slash:TOKEN-DO-NOT-LOG:${SENDER}`;
  const result = await commands[0].handler(
    context({to, from, messageThreadId: 'thread-1', channel: 'Discord!', channelId: undefined}),
  );
  const {body} = parseReply(result.text);
  assert.deepEqual(body.values.toShape, {
    prefix: null,
    segments: 3,
    endsWithChannelId: false,
    endsWithSenderId: false,
  });
  assert.deepEqual(body.values.fromShape, {
    prefix: 'slash',
    segments: 3,
    endsWithChannelId: false,
    endsWithSenderId: true,
  });
  assert.equal(body.values.threadPresent, true);
  assert.equal(body.values.channel, null);
  for (const text of [result.text, ...logs]) {
    for (const secret of ['TO-DO-NOT-LOG', 'TOKEN-DO-NOT-LOG', to, from, 'thread-1', 'Discord!']) {
      assert(!text.includes(secret), `must not contain ${secret}`);
    }
  }
  // No separator: no prefix, one segment. Absent or non-string: null.
  const plain = parseReply((await commands[0].handler(context({to: 'abc', from: 7}))).text).body.values;
  assert.deepEqual(plain.toShape, {prefix: null, segments: 1, endsWithChannelId: false, endsWithSenderId: false});
  assert.equal(plain.fromShape, null);
});

test('missing or non-string context values are reported as null, never echoed raw', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {commands} = load({agents: [LEAD]});
  const result = await commands[0].handler({
    channel: 'discord',
    isAuthorizedSender: true,
    commandBody: '/clawcad_spike',
    config: {},
    senderId: {nested: 'TOKEN-DO-NOT-LOG'},
    accountId: 'x'.repeat(500),
    senderIsOwner: 'yes',
  });
  const {body, args} = parseReply(result.text);
  assert.deepEqual(body.values, {
    senderId: null,
    channelId: null,
    channel: 'discord',
    accountId: null,
    agentId: null,
    senderIsOwner: null,
    assertOwnerCurrentIsFunction: false,
    surface: null,
    toShape: null,
    fromShape: null,
    threadPresent: false,
  });
  assert.equal(args, '');
  assert(!result.text.includes('TOKEN-DO-NOT-LOG'));
});

test('arguments and the field list are bounded and cannot break the reply', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {commands} = load({agents: [LEAD]});
  const long = await commands[0].handler(context({args: 'y'.repeat(500)}));
  assert.equal(parseReply(long.text).args, 'y'.repeat(200));
  const hostile = await commands[0].handler(context({args: '```\n@everyone <@123> \u0000end'}));
  const echoed = parseReply(hostile.text).args;
  assert(!echoed.includes('`'));
  assert(!echoed.includes('\u0000'));
  assert(!/@everyone/.test(echoed));
  assert(!/<@123>/.test(echoed));
  assert(echoed.length <= 200);
  // Many long context keys: still one message within 17 lines and 2000 characters.
  const wide = Object.fromEntries(Array.from({length: 80}, (_, i) => [`k${i}${'z'.repeat(60)}`, i]));
  const bounded = await commands[0].handler(context({...wide, args: 'w'.repeat(500)}));
  parseReply(bounded.text);
});

test('reply 2 looks up the adapter by provider id and is posted once 120 s later', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const sent = [];
  const outbound = {
    sendText: async (params) => {
      sent.push(params);
      return {channel: 'discord', messageId: 'm1'};
    },
  };
  const {commands, logs, adapters} = load({agents: [LEAD], outbound});
  const ctx = context({messageThreadId: 'thread-1'});
  const {invocationId} = parseReply((await commands[0].handler(ctx)).text);
  t.mock.timers.tick(119_999);
  await settle();
  assert.deepEqual(sent, []);
  assert.deepEqual(adapters, []);
  t.mock.timers.tick(1);
  await settle();
  // The provider id, never the Discord channel id (spike 1 live defect).
  assert.deepEqual(adapters, ['discord']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, `clawcad_spike follow-up ${invocationId}`);
  assert.equal(sent[0].to, TO);
  assert.equal(sent[0].accountId, 'default');
  assert.equal(sent[0].threadId, 'thread-1');
  assert.equal(sent[0].cfg, ctx.config);
  const followUp = logs.filter((m) => m.includes('"claw_onshape.spike_follow_up"'));
  assert.equal(followUp.length, 1);
  assert.equal(event(followUp[0]).invocationId, invocationId);
  assert.equal(event(followUp[0]).outcome, 'sent');
  // The default `from` does not qualify (it ends with the sender id), so only `to` is tried.
  assert.equal(event(followUp[0]).source, 'to');
  assert.deepEqual(event(followUp[0]).attempts, [
    {source: 'from', outcome: 'skipped', reason: 'not_qualified'},
    {source: 'to', outcome: 'sent'},
  ]);
  for (const secret of [...SECRETS, TO, FROM]) {
    assert(!followUp[0].includes(secret));
  }
  t.mock.timers.tick(10 * 120_000);
  await settle();
  assert.equal(sent.length, 1, 'never retried or repeated');
});

test('reply 2 fails closed with one logged reason per missing piece or failure', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const outcomes = async (options, extra = {}) => {
    const {commands, logs} = load({agents: [LEAD], ...options});
    await commands[0].handler(context(extra));
    t.mock.timers.tick(120_000);
    await settle();
    return logs.filter((m) => m.includes('"claw_onshape.spike_follow_up"')).map(event);
  };
  const reasons = async (options, extra) => (await outcomes(options, extra)).map((e) => [e.outcome, e.reason]);
  const sender = {sendText: async () => ({})};
  assert.deepEqual(await reasons({outbound: sender}, {channel: undefined}), [['not_sent', 'provider_unavailable']]);
  assert.deepEqual(await reasons({outbound: sender}, {channel: 'Discord!'}), [['not_sent', 'provider_unavailable']]);
  const throwing = async () => {
    throw new Error('lookup-TOKEN-DO-NOT-LOG');
  };
  const lookupFailed = await outcomes({loadAdapter: throwing});
  assert.deepEqual(
    lookupFailed.map((e) => [e.outcome, e.reason]),
    [['not_sent', 'adapter_lookup_failed']],
  );
  assert(!JSON.stringify(lookupFailed).includes('TOKEN-DO-NOT-LOG'));
  assert.deepEqual(await reasons({outbound: undefined}), [['not_sent', 'outbound_adapter_unavailable']]);
  assert.deepEqual(await reasons({outbound: {}}), [['not_sent', 'send_text_unavailable']]);
  assert.deepEqual(await reasons({outbound: sender}, {to: undefined}), [
    ['not_sent', 'conversation_target_unavailable'],
  ]);
  const failing = {
    sendText: async () => {
      throw new Error('provider-error-TOKEN-DO-NOT-LOG');
    },
  };
  const failed = await outcomes({outbound: failing});
  assert.deepEqual(
    failed.map((e) => [e.outcome, e.reason]),
    [['not_sent', 'send_failed']],
  );
  assert.equal(failed[0].source, null);
  assert.deepEqual(failed[0].attempts.at(-1), {source: 'to', outcome: 'send_failed', errorClass: 'Error'});
  assert(!JSON.stringify(failed).includes('TOKEN-DO-NOT-LOG'));
});

// Spike 3: live native slash shapes (evidence row 3b). `from` names the channel, `to` the interaction user.
const LIVE_FROM = `discord:channel:${DISCORD_CHANNEL}`;
const LIVE_TO = `slash:${SENDER}`;
// Runs one invocation through the 120 s timer. `behaviour(target, call)` decides per sendText call.
async function runFollowUp(t, extra, behaviour) {
  t.mock.timers.enable({apis: ['setTimeout']});
  const calls = [];
  const outbound = {
    sendText: async (params) => {
      calls.push(params);
      return behaviour(params.to, calls.length);
    },
  };
  const {commands, logs} = load({agents: [LEAD], outbound});
  const ctx = context({from: LIVE_FROM, to: LIVE_TO, ...extra});
  await commands[0].handler(ctx);
  t.mock.timers.tick(120_000);
  await settle();
  t.mock.timers.tick(10 * 120_000);
  await settle();
  const lines = logs.filter((m) => m.includes('"claw_onshape.spike_follow_up"'));
  assert.equal(lines.length, 1);
  for (const raw of [LIVE_FROM, LIVE_TO, ctx.from, ctx.to, ...SECRETS].filter((v) => typeof v === 'string')) {
    assert(!lines[0].includes(raw), `follow-up log must not contain ${raw}`);
  }
  // No target string is ever constructed: every call gets exactly the host-provided value.
  for (const params of calls) {
    assert(params.to === ctx.from || params.to === ctx.to, 'sendText target must be ctx.from or ctx.to');
    assert.equal(params.cfg, ctx.config);
  }
  return {ctx, calls, logged: event(lines[0])};
}
class ProviderRejectError extends Error {
  name = 'ProviderRejectError';
}

test('reply 2 prefers a qualifying ctx.from and stops after it is sent', async (t) => {
  const {calls, logged} = await runFollowUp(t, {}, () => ({messageId: 'm1'}));
  assert.deepEqual(
    calls.map((c) => c.to),
    [LIVE_FROM],
  );
  assert.equal(logged.outcome, 'sent');
  assert.equal(logged.source, 'from');
  assert.equal(logged.reason, undefined);
  assert.deepEqual(logged.attempts, [{source: 'from', outcome: 'sent'}]);
});

test('reply 2 falls back to ctx.to once when ctx.from fails, never retrying a source', async (t) => {
  const {calls, logged} = await runFollowUp(t, {}, (target) => {
    if (target === LIVE_FROM) {
      throw new ProviderRejectError('rejected TOKEN-DO-NOT-LOG');
    }
    return {messageId: 'm2'};
  });
  assert.deepEqual(
    calls.map((c) => c.to),
    [LIVE_FROM, LIVE_TO],
  );
  assert.equal(logged.outcome, 'sent');
  assert.equal(logged.source, 'to');
  assert.deepEqual(logged.attempts, [
    {source: 'from', outcome: 'send_failed', errorClass: 'ProviderRejectError'},
    {source: 'to', outcome: 'sent'},
  ]);
  assert(!JSON.stringify(logged).includes('TOKEN-DO-NOT-LOG'));
});

test('reply 2 logs both failures with bounded error classes only', async (t) => {
  const {calls, logged} = await runFollowUp(t, {}, (target) => {
    throw target === LIVE_FROM ? new TypeError('from TOKEN-DO-NOT-LOG') : new ProviderRejectError('to');
  });
  assert.equal(calls.length, 2);
  assert.equal(logged.outcome, 'not_sent');
  assert.equal(logged.reason, 'send_failed');
  assert.equal(logged.source, null);
  assert.deepEqual(logged.attempts, [
    {source: 'from', outcome: 'send_failed', errorClass: 'TypeError'},
    {source: 'to', outcome: 'send_failed', errorClass: 'ProviderRejectError'},
  ]);
  assert(!JSON.stringify(logged).includes('TOKEN-DO-NOT-LOG'));
  assert(!JSON.stringify(logged).includes('stack'));
});

test('error class is null unless it is a short alphabetic name', async (t) => {
  const named = (name) => Object.assign(new Error('x'), {name});
  const getterThrows = {
    get name() {
      throw new Error('TOKEN-DO-NOT-LOG');
    },
  };
  const cases = [
    [named('A'.repeat(40)), 'A'.repeat(40)],
    [named('A'.repeat(41)), null],
    [named('Bad Name'), null],
    [named('Err1'), null],
    [named(''), null],
    [named('TOKEN-DO-NOT-LOG'), null],
    ['TOKEN-DO-NOT-LOG', null],
    [null, null],
    [{name: 7}, null],
    [getterThrows, null],
  ];
  for (const [thrown, expected] of cases) {
    const {logged} = await runFollowUp(t, {from: undefined}, () => {
      throw thrown;
    });
    assert.deepEqual(logged.attempts.at(-1), {source: 'to', outcome: 'send_failed', errorClass: expected});
    assert(!JSON.stringify(logged).includes('TOKEN-DO-NOT-LOG'));
  }
});

test('ctx.from qualifies only with the discord prefix and the channel id at its end', async (t) => {
  const notQualified = [
    {from: `slash:${DISCORD_CHANNEL}`},
    {from: `discord:${SENDER}`},
    {from: `discord:channel:${DISCORD_CHANNEL}`, channelId: undefined},
    {from: `discord:channel:${DISCORD_CHANNEL}`, channelId: '999'},
    {from: `discord:${'x'.repeat(200)}:${DISCORD_CHANNEL}`},
    {from: 42},
    {from: undefined},
  ];
  for (const extra of notQualified) {
    const {calls, logged} = await runFollowUp(t, extra, () => ({}));
    assert.deepEqual(
      calls.map((c) => c.to),
      [LIVE_TO],
    );
    assert.equal(logged.source, 'to');
    assert.deepEqual(logged.attempts, [
      {source: 'from', outcome: 'skipped', reason: 'not_qualified'},
      {source: 'to', outcome: 'sent'},
    ]);
  }
  // Qualifying from that fails, no usable to: from is tried once, to is reported as unavailable.
  const {calls, logged} = await runFollowUp(t, {to: undefined}, () => {
    throw new TypeError('x');
  });
  assert.equal(calls.length, 1);
  assert.equal(logged.outcome, 'not_sent');
  assert.equal(logged.reason, 'send_failed');
  assert.deepEqual(logged.attempts, [
    {source: 'from', outcome: 'send_failed', errorClass: 'TypeError'},
    {source: 'to', outcome: 'skipped', reason: 'conversation_target_unavailable'},
  ]);
  // Neither source usable: nothing is sent.
  const none = await runFollowUp(t, {from: undefined, to: undefined}, () => ({}));
  assert.equal(none.calls.length, 0);
  assert.equal(none.logged.reason, 'conversation_target_unavailable');
  assert.equal(none.logged.source, null);
});
