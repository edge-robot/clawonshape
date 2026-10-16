// Spike (docs/prompts/2026-10-16-plugin-command-spike.md, edge-robot/clawonshape#13): throwaway clawcad_spike
// plugin command. Only registration, redaction, the argument bound and the follow-up scheduling are tested here;
// Discord visibility and the real handler context are live checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../dist/index.js';

const LEAD = 'clawcad-robotics-lead';
const ENGINEER = 'clawcad-mechanical-engineer';
const binding = {
  agentId: ENGINEER,
  requesterSenderId: '1111',
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
function load({agents, cfg = pluginConfig, outbound} = {}) {
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
          loadAdapter: async (id) => {
            adapters.push(id);
            return outbound;
          },
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
  'FROM-DO-NOT-LOG',
  'TO-DO-NOT-LOG',
  'TOKEN-DO-NOT-LOG',
  'SCOPE-DO-NOT-LOG',
  'DIAG-DO-NOT-LOG',
];
// A context shaped like PluginCommandContext with extra secret-looking fields.
const context = (extra = {}) => ({
  senderId: '1382988369553915990',
  channel: 'discord',
  channelId: 'discord',
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
  from: 'FROM-DO-NOT-LOG',
  to: 'TO-DO-NOT-LOG',
  accountId: 'default',
  messageThreadId: 42,
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
  'channelId',
  'senderId',
  'senderIsOwner',
  'surface',
];
const parseReply = (text) => {
  const m = /^clawcad_spike ([0-9a-f-]{36})\n```json\n([\s\S]*)\n```$/.exec(text);
  assert(m, `unexpected reply shape: ${text.slice(0, 80)}`);
  return {invocationId: m[1], body: JSON.parse(m[2])};
};

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

test('reply 1 and the log line carry only field names and the allowed values', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {commands, logs} = load({agents: [LEAD]});
  const result = await commands[0].handler(context());
  assert.equal(typeof result.text, 'string');
  for (const secret of SECRETS) {
    assert(!result.text.includes(secret), `reply must not contain ${secret}`);
  }
  const {invocationId, body} = parseReply(result.text);
  assert.deepEqual(Object.keys(body).sort(), ['args', 'fields', 'invocationId', 'values']);
  assert.equal(body.invocationId, invocationId);
  assert.deepEqual(Object.keys(body.values).sort(), ALLOWED_VALUES);
  assert.deepEqual(body.values, {
    senderId: '1382988369553915990',
    channelId: 'discord',
    accountId: 'default',
    agentId: LEAD,
    senderIsOwner: true,
    assertOwnerCurrentIsFunction: true,
    surface: null,
  });
  assert.deepEqual(body.fields, Object.keys(context()).sort());
  assert.equal(body.args, 'hello');
  const invocation = logs.filter((m) => m.includes('"claw_onshape.spike_command_invoked"'));
  assert.equal(invocation.length, 1);
  const line = invocation[0];
  assert(!line.includes('\n'));
  for (const secret of [...SECRETS, 'hello']) {
    assert(!line.includes(secret), `log must not contain ${secret}`);
  }
  const event = JSON.parse(line.slice(line.indexOf('{')));
  assert.equal(event.invocationId, invocationId);
  assert.deepEqual(event.values, body.values);
  assert.deepEqual(event.fields, body.fields);
  assert.equal(event.argsLength, 5);
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
  const {body} = parseReply(result.text);
  assert.deepEqual(body.values, {
    senderId: null,
    channelId: null,
    accountId: null,
    agentId: null,
    senderIsOwner: null,
    assertOwnerCurrentIsFunction: false,
    surface: null,
  });
  assert.equal(body.args, '');
  assert(!result.text.includes('TOKEN-DO-NOT-LOG'));
});

test('arguments are echoed bounded to 200 characters and cannot break the reply', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {commands} = load({agents: [LEAD]});
  const long = await commands[0].handler(context({args: 'y'.repeat(500)}));
  assert.equal(parseReply(long.text).body.args, 'y'.repeat(200));
  const hostile = await commands[0].handler(context({args: '```\n@everyone <@123> \u0000end'}));
  const echoed = parseReply(hostile.text).body.args;
  assert(!echoed.includes('`'));
  assert(!echoed.includes('\n'));
  assert(!echoed.includes('\u0000'));
  assert(!/@everyone/.test(echoed));
  assert(!/<@123>/.test(echoed));
  assert(echoed.length <= 200);
});

test('reply 2 is posted once to the same conversation 120 s later', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const sent = [];
  const outbound = {
    sendText: async (params) => {
      sent.push(params);
      return {channel: 'discord', messageId: 'm1'};
    },
  };
  const {commands, logs, adapters} = load({agents: [LEAD], outbound});
  const ctx = context();
  const result = await commands[0].handler(ctx);
  const {invocationId} = parseReply(result.text);
  t.mock.timers.tick(119_999);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, []);
  t.mock.timers.tick(1);
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(adapters, ['discord']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, `clawcad_spike follow-up ${invocationId}`);
  assert.equal(sent[0].to, 'TO-DO-NOT-LOG');
  assert.equal(sent[0].accountId, 'default');
  assert.equal(sent[0].threadId, 42);
  assert.equal(sent[0].cfg, ctx.config);
  const followUp = logs.filter((m) => m.includes('"claw_onshape.spike_follow_up"'));
  assert.equal(followUp.length, 1);
  const event = JSON.parse(followUp[0].slice(followUp[0].indexOf('{')));
  assert.equal(event.invocationId, invocationId);
  assert.equal(event.outcome, 'sent');
  for (const secret of SECRETS) {
    assert(!followUp[0].includes(secret));
  }
  t.mock.timers.tick(10 * 120_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 1, 'never retried or repeated');
});

test('reply 2 fails closed with a logged reason when no adapter, target or send is available', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const outcomes = async (outbound, extra = {}) => {
    const {commands, logs} = load({agents: [LEAD], outbound});
    await commands[0].handler(context(extra));
    t.mock.timers.tick(120_000);
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    return logs
      .filter((m) => m.includes('"claw_onshape.spike_follow_up"'))
      .map((m) => JSON.parse(m.slice(m.indexOf('{'))));
  };
  assert.deepEqual(
    (await outcomes(undefined)).map((e) => [e.outcome, e.reason]),
    [['not_sent', 'outbound_adapter_unavailable']],
  );
  assert.deepEqual(
    (await outcomes({})).map((e) => [e.outcome, e.reason]),
    [['not_sent', 'send_text_unavailable']],
  );
  const sender = {sendText: async () => ({})};
  assert.deepEqual(
    (await outcomes(sender, {to: undefined})).map((e) => [e.outcome, e.reason]),
    [['not_sent', 'conversation_target_unavailable']],
  );
  const failing = {
    sendText: async () => {
      throw new Error('provider-error-TOKEN-DO-NOT-LOG');
    },
  };
  const failed = await outcomes(failing);
  assert.deepEqual(
    failed.map((e) => [e.outcome, e.reason]),
    [['not_sent', 'send_failed']],
  );
  assert(!JSON.stringify(failed).includes('TOKEN-DO-NOT-LOG'));
});
