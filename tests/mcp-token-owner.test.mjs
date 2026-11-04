import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {parseConfig, connectionOwner} from '../dist/config.js';
import {credentials} from '../dist/credentials.js';
import {publishMcpCredential} from '../dist/mcp-credentials.js';
import {mcpTokenOwner, MCP_TOKEN_SYNC_INTERVAL_MS} from '../dist/mcp-token-owner.js';
import plugin from '../dist/index.js';

// edge-robot/clawonshape#16: only the gateway runtime publishes or revokes access-token.json.
const B = {
  agentId: 'engineer',
  requesterSenderId: 'owner',
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
  documentId: 'a'.repeat(24),
  primaryWorkspaceId: 'b'.repeat(24),
  workspaceId: 'b'.repeat(24),
};
const token = (overrides = {}) => ({
  accessToken: 'fixture-owner-access-DO-NOT-LOG',
  refreshToken: 'fixture-owner-refresh-DO-NOT-LOG',
  expiresAt: Date.now() + 3600000,
  scopes: ['OAuth2Read'],
  resource: 'https://cad.onshape.com/api/',
  ...overrides,
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
// Polls with real setTimeout (only setInterval is mocked) because syncs do real file I/O.
async function until(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('condition not reached');
}
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'mcp-token-owner-state-')),
    handoff = await mkdtemp(path.join(tmpdir(), 'mcp-token-owner-handoff-'));
  const raw = {bindings: [B], localMcp: {connectionRef: 'owner-rest', credentialDirectory: handoff}};
  const config = parseConfig(raw);
  const store = () => credentials(root, B.connectionRef, connectionOwner(config.bindings[0]), handoff);
  const file = path.join(handoff, 'access-token.json');
  return {
    root,
    handoff,
    raw,
    config,
    store,
    file,
    handoffValue: async () => JSON.parse(await readFile(file, 'utf8')),
    cleanup: async () => {
      await rm(root, {recursive: true, force: true});
      await rm(handoff, {recursive: true, force: true});
    },
  };
}
function load(f, registrationMode, logs = []) {
  const services = [],
    lifecycles = [];
  plugin.register({
    registrationMode,
    logger: {warn: (m) => logs.push(m), info: () => {}, error: () => {}},
    pluginConfig: f.raw,
    registerTool: () => {},
    registerCli: () => {},
    registerService: (s) => services.push(s),
    session: {controls: {registerSessionAction: () => {}}},
    registerHttpRoute: () => {},
    lifecycle: {registerRuntimeLifecycle: (l) => lifecycles.push(l)},
    runtime: {
      state: {resolveStateDir: () => f.root},
      config: {current: () => ({plugins: {entries: {'claw-onshape': {enabled: true, config: f.raw}}}})},
    },
  });
  return {services, lifecycles, logs};
}

test('CLI-style plugin loads never start the MCP token owner or revoke access-token.json', async () => {
  // `openclaw onshape …` loads the plugin with activate:false and no runtimeSideEffects ("discovery"); the other
  // non-gateway modes must stay inert as well.
  for (const mode of ['discovery', 'cli-metadata', 'tool-discovery', 'setup-runtime', 'setup-only', undefined]) {
    const f = await fixture();
    try {
      await publishMcpCredential(f.handoff, token());
      const {services, lifecycles} = load(f, mode);
      assert.deepEqual(services, [], `no service in mode ${mode}`);
      assert(!lifecycles.some((l) => l.id === 'onshape-mcp-access-owner'), `no owner lifecycle in mode ${mode}`);
      for (const l of lifecycles) {
        await l.dispose?.();
        await l.cleanup?.();
      }
      for (let i = 0; i < 20; i++) {
        await flush();
      }
      assert.equal((await f.handoffValue()).accessToken, token().accessToken, `handoff kept in mode ${mode}`);
    } finally {
      await f.cleanup();
    }
  }
});

test('gateway load publishes through the registered service and writes null when the service stops', async () => {
  const f = await fixture();
  try {
    await (await f.store()).save(token());
    await publishMcpCredential(f.handoff, null);
    const {services, lifecycles, logs} = load(f, 'full');
    assert.deepEqual(
      services.map((s) => s.id),
      ['onshape-mcp-access-owner'],
    );
    assert(!lifecycles.some((l) => l.id === 'onshape-mcp-access-owner'));
    // Registration alone has no effect; the gateway starts services.
    for (let i = 0; i < 20; i++) {
      await flush();
    }
    assert.equal(await f.handoffValue(), null);
    await services[0].start({});
    await until(async () => (await f.handoffValue())?.accessToken === token().accessToken);
    const published = await f.handoffValue();
    assert.deepEqual(Object.keys(published).sort(), ['accessToken', 'expiresAt', 'scopes']);
    assert(!JSON.stringify(published).includes(token().refreshToken));
    await services[0].stop({});
    assert.equal(await f.handoffValue(), null);
    assert.deepEqual(logs, []);
  } finally {
    await f.cleanup();
  }
});

test('periodic sync failures log one bounded line per code change and never the token', async (t) => {
  t.mock.timers.enable({apis: ['setInterval']});
  const f = await fixture();
  const logs = [];
  const owner = mcpTokenOwner(
    () => f.config,
    () => f.root,
    (m) => logs.push(m),
  );
  try {
    // A stored grant with an empty scope list fails closed (reconnect_required), so the handoff is revoked.
    await (await f.store()).save(token({scopes: []}));
    owner.start();
    await until(() => logs.length === 1);
    assert.deepEqual(logs, ['mcp_credential_unavailable code=reconnect_required']);
    assert.equal(await f.handoffValue(), null);
    // The same failure on the next periodic syncs adds no line.
    for (let i = 0; i < 3; i++) {
      t.mock.timers.tick(MCP_TOKEN_SYNC_INTERVAL_MS);
      await owner.sync().catch(() => {
        // Waits for the in-flight periodic sync; its failure is reported by the owner itself.
      });
      for (let j = 0; j < 20; j++) {
        await flush();
      }
    }
    assert.equal(logs.length, 1);
    // A different code is a change and is logged once.
    await rm(path.join(f.root), {recursive: true, force: true});
    t.mock.timers.tick(MCP_TOKEN_SYNC_INTERVAL_MS);
    await until(() => logs.length === 2);
    assert.match(logs[1], /^mcp_credential_unavailable code=[a-z][a-z0-9_]*$/);
    assert.notEqual(logs[1], logs[0]);
    for (const line of logs) {
      assert(!line.includes('DO-NOT-LOG'));
      assert(!line.includes(f.root));
      assert(!line.includes(f.handoff));
      assert(!line.includes('\n'));
    }
  } finally {
    await owner.dispose();
    await f.cleanup();
  }
});

test('a recovered sync resets the rate limit and a failing logger does not stop the owner', async (t) => {
  t.mock.timers.enable({apis: ['setInterval']});
  const f = await fixture();
  const logs = [];
  let throwing = true;
  const owner = mcpTokenOwner(
    () => f.config,
    () => f.root,
    (m) => {
      logs.push(m);
      if (throwing) {
        throw new Error('logger-DO-NOT-LOG');
      }
    },
  );
  try {
    await (await f.store()).save(token({scopes: []}));
    owner.start();
    await until(() => logs.length === 1);
    throwing = false;
    await (await f.store()).save(token());
    t.mock.timers.tick(MCP_TOKEN_SYNC_INTERVAL_MS);
    // save() publishes on its own; join the in-flight periodic sync so its success is what resets the limit.
    await owner.sync();
    for (let j = 0; j < 20; j++) {
      await flush();
    }
    assert.equal((await f.handoffValue()).accessToken, token().accessToken);
    assert.equal(logs.length, 1);
    await (await f.store()).save(token({scopes: []}));
    t.mock.timers.tick(MCP_TOKEN_SYNC_INTERVAL_MS);
    await until(() => logs.length === 2);
    assert.deepEqual(logs, [
      'mcp_credential_unavailable code=reconnect_required',
      'mcp_credential_unavailable code=reconnect_required',
    ]);
  } finally {
    await owner.dispose();
    assert.equal(await f.handoffValue(), null);
    await f.cleanup();
  }
});

// Minimal commander stand-in: records the action of every `onshape <command>`.
function cliActions(f) {
  const actions = new Map();
  let registrar;
  plugin.register({
    registrationMode: 'discovery',
    logger: {warn: () => {}, info: () => {}, error: () => {}},
    pluginConfig: f.raw,
    registerTool: () => {},
    registerCli: (r) => {
      registrar = r;
    },
    registerService: () => assert.fail('no service outside the gateway'),
    session: {controls: {registerSessionAction: () => {}}},
    registerHttpRoute: () => {},
    lifecycle: {registerRuntimeLifecycle: () => {}},
    runtime: {
      state: {resolveStateDir: () => f.root},
      config: {current: () => ({plugins: {entries: {'claw-onshape': {enabled: true, config: f.raw}}}})},
    },
  });
  const command = (spec) => {
    const c = {
      command: (s) => command(s),
      description: () => c,
      option: () => c,
      action: (fn) => {
        actions.set(spec.split(' ')[0], fn);
        return c;
      },
    };
    return c;
  };
  registrar({program: command('')});
  return actions;
}
async function quietly(run) {
  const write = process.stdout.write;
  process.stdout.write = () => true;
  try {
    return await run();
  } finally {
    process.stdout.write = write;
  }
}

test('onshape status and disconnect CLI commands never write access-token.json; the gateway revokes', async () => {
  const f = await fixture();
  try {
    await (await f.store()).save(token());
    assert.equal((await f.handoffValue()).accessToken, token().accessToken);
    const actions = cliActions(f);
    await quietly(() => actions.get('status')('owner-rest'));
    assert.equal((await f.handoffValue()).accessToken, token().accessToken);
    await quietly(() => actions.get('disconnect')('owner-rest'));
    assert.equal((await f.store()).status(), 'disconnected');
    // The CLI process left the handoff alone ...
    assert.equal((await f.handoffValue()).accessToken, token().accessToken);
    // ... and the gateway owner's next sync publishes null.
    const owner = mcpTokenOwner(
      () => f.config,
      () => f.root,
      () => {},
    );
    await assert.rejects(owner.sync(), /mcp_credential_unavailable/);
    assert.equal(await f.handoffValue(), null);
    await owner.dispose();
  } finally {
    await f.cleanup();
  }
});
