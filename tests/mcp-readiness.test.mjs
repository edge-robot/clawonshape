import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mcpReadiness, projectMcpStatus} from '../dist/mcp.js';
import {registerDashboard} from '../dist/dashboard.js';
import {parseConfig, connectionOwner} from '../dist/config.js';
import {credentials} from '../dist/credentials.js';
import ui from '../ui/control-ui.js';
const native = (authStatus = {hasTokens: true, requiresAuthorization: false}, enabled = false) => ({
  servers: [{name: 'onshape', configured: true, enabled, ok: enabled, auth: 'oauth', authStatus}],
});
// Allowlisted output captured from the actual disabled 2026.9.9 Engineer runtime.
const nativeDisabled = JSON.parse(
  await readFile(new URL('./fixtures/native-mcp-status-2026.9.9.json', import.meta.url), 'utf8'),
);

test('captured native disabled-server record preserves configuration, grant and expired-action metadata', async () => {
  const result = await mcpReadiness(async (args) => {
    assert.deepEqual(args, ['mcp', 'status', '--json']);
    return JSON.stringify(nativeDisabled);
  });
  assert.equal(result.configured, true);
  assert.equal(result.enabled, false);
  assert.equal(result.oauth.status, 'UNKNOWN');
  assert.equal(result.oauth.storedGrant, true);
  assert.equal(result.oauth.expiresAt, '2026-10-09T14:52:55.598Z');
  assert.equal(result.oauth.expired, true);
  assert.equal(result.oauth.requiresOperatorAction, true);
  assert.match(result.oauth.reason, /No refresh was attempted/);
  assert.equal(result.discovery.status, 'HISTORICAL');
  assert.equal(result.mutation.status, 'BLOCKED');
  assert.equal(result.mutation.blockers.length, 4);
});

test('native ok describes transport configuration, not authorization; malformed metadata still fails closed', () => {
  const enabled = native();
  enabled.servers[0].enabled = true;
  enabled.servers[0].ok = false;
  assert.equal(projectMcpStatus(enabled).enabled, true);
  assert.equal(projectMcpStatus(enabled).oauth.status, 'UNKNOWN');
  for (const ok of [undefined, null, 'false', 0]) {
    const invalid = structuredClone(nativeDisabled);
    invalid.servers[0].ok = ok;
    assert.equal(projectMcpStatus(invalid).configured, null);
    assert.equal(projectMcpStatus(invalid).oauth.storedGrant, null);
  }
  const incomplete = structuredClone(nativeDisabled);
  delete incomplete.servers[0].authStatus.requiresAuthorization;
  assert.equal(projectMcpStatus(incomplete).enabled, false);
  assert.equal(projectMcpStatus(incomplete).oauth.storedGrant, null);
});

test('native status reports absent configuration, disabled integration and stored grant without claiming connected', () => {
  const absent = projectMcpStatus({servers: []});
  assert.equal(absent.configured, false);
  assert.equal(absent.enabled, null);
  const disabled = projectMcpStatus(native());
  assert.equal(disabled.configured, true);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.oauth.storedGrant, true);
  assert.equal(disabled.oauth.status, 'UNKNOWN');
  assert.equal(disabled.oauth.expiresAt, undefined);
  const missing = projectMcpStatus(native({hasTokens: false, requiresAuthorization: true}, true));
  assert.equal(missing.oauth.status, 'DISCONNECTED');
  assert.equal(missing.oauth.requiresOperatorAction, true);
  assert.equal(
    projectMcpStatus({servers: [{name: 'onshape', configured: true, enabled: false, ok: true}]}).oauth.storedGrant,
    null,
  );
});
test('native expiry metadata is bounded; expired or unexpired stored grants never establish provider validity', () => {
  for (const expiry of [1000, 3000]) {
    const result = projectMcpStatus(native({hasTokens: true, requiresAuthorization: false, expiresAt: expiry}), 2000);
    assert.equal(result.oauth.expiresAt, new Date(expiry).toISOString());
    assert.equal(result.oauth.expired, expiry === 1000);
    assert.equal(result.oauth.status, 'UNKNOWN');
    assert.equal(result.oauth.requiresOperatorAction, expiry === 1000);
  }
  for (const expiry of ['secret', NaN, -1, Infinity, 8640000000000001])
    assert.equal(
      projectMcpStatus(native({hasTokens: true, requiresAuthorization: false, expiresAt: expiry})).oauth.storedGrant,
      null,
    );
});
test('historical discovery and mutation gates are independent of all native OAuth/config states', () => {
  for (const input of [
    {servers: []},
    native(),
    native({hasTokens: false, requiresAuthorization: true}, true),
    native({hasTokens: true, requiresAuthorization: false, hasDiscoveryState: true}, true),
    {},
  ]) {
    const r = projectMcpStatus(input);
    assert.equal(r.discovery.status, 'HISTORICAL');
    assert.match(r.discovery.reason, /no current catalog/);
    assert.equal(r.mutation.status, 'BLOCKED');
    assert.equal(r.mutation.blockers.length, 4);
  }
});
test('bounded public CLI adapter calls only status and sanitizes failures, unknown fields and other providers', async () => {
  const fixture = native({
    hasTokens: true,
    requiresAuthorization: false,
    accessToken: 'fixture-secret',
    refreshToken: 'fixture-secret',
    lastAuthorizationUrl: 'fixture-secret',
  });
  fixture.path = '/fixture-secret';
  fixture.servers[0].launch = 'fixture-secret';
  fixture.servers.push({name: 'other', authStatus: {accessToken: 'fixture-secret'}});
  const result = await mcpReadiness(async (args) => {
    assert.deepEqual(args, ['mcp', 'status', '--json']);
    return JSON.stringify(fixture);
  });
  assert(!JSON.stringify(result).includes('fixture-secret'));
  assert(!JSON.stringify(result).includes('other'));
  for (const raw of [
    'bad json',
    'x'.repeat(1024 * 1024 + 1),
    JSON.stringify({servers: [fixture.servers[0], fixture.servers[0]]}),
    JSON.stringify({ok: false, error: {message: 'fixture-secret'}}),
  ]) {
    const r = await mcpReadiness(async () => raw);
    assert.equal(r.configured, null);
    assert.equal(r.oauth.status, 'UNKNOWN');
    assert(!JSON.stringify(r).includes('fixture-secret'));
  }
  assert.equal(
    (
      await mcpReadiness(async () => {
        throw Error('fixture-secret');
      })
    ).configured,
    null,
  );
});
const B = {
  agentId: 'engineer',
  requesterSenderId: 'owner',
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
  documentId: 'a'.repeat(24),
  primaryWorkspaceId: 'b'.repeat(24),
  workspaceId: 'b'.repeat(24),
  elementId: 'c'.repeat(24),
};
function dashboard(c, root, read) {
  const actions = [];
  const lifecycle = registerDashboard(
    {
      session: {controls: {registerSessionAction: (a) => actions.push(a)}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {state: {resolveStateDir: () => root}, config: {current: () => ({})}},
    },
    () => c,
    read,
  );
  return {
    actions,
    lifecycle,
    status: (scopes) => actions.find((a) => a.id === 'status').handler({payload: {}, client: {scopes}}),
  };
}
test('operator scope is checked before native reads; no native metadata enters shared agent lifecycle', async () => {
  let calls = 0;
  const d = dashboard(parseConfig({bindings: []}), '/tmp', async () => {
    calls++;
    return projectMcpStatus(native());
  });
  assert.deepEqual(
    d.actions.map((a) => [a.id, a.requiredScopes]),
    [
      ['status', ['operator.read']],
      ['connect', ['operator.admin']],
      ['disconnect', ['operator.admin']],
      ['candidate-prepare', ['operator.admin']],
      ['candidate-check', ['operator.admin']],
      ['mutation-status', ['operator.read']],
      ['mutation-approve', ['operator.admin']],
      ['mutation-reconcile', ['operator.admin']],
    ],
  );
  for (const scopes of [[], ['operator.write'], ['agent']])
    assert.equal((await d.status(scopes)).result.code, 'authorization_changed');
  assert.equal(calls, 0);
  const status = await d.status(['operator.read']);
  assert.equal(status.result.code, 'not_configured');
  assert.equal(status.result.mcp.enabled, false);
  assert.equal(calls, 1);
  assert.equal((await d.lifecycle.status()).mcp, undefined);
  assert.equal(calls, 1);
});
test('REST connected/disconnected statuses remain independent with no network, refresh or grant modification', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'onshape-mcp-status-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    assert.fail('status must not use the network');
  };
  try {
    const secret = path.join(root, 'client-secret');
    await writeFile(secret, 'fixture-secret', {mode: 0o600});
    const c = parseConfig({bindings: [B], liveReads: true, oauth: {clientId: 'fixture', clientSecretFile: secret}});
    const store = await credentials(root, B.connectionRef, connectionOwner(B));
    const tokens = {
      accessToken: 'fixture-access',
      refreshToken: 'fixture-refresh',
      expiresAt: Date.now() + 60000,
      resource: 'https://cad.onshape.com/api/',
      scopes: ['OAuth2Read'],
    };
    await store.save(tokens);
    const d = dashboard(c, root, () => mcpReadiness(async () => JSON.stringify(native())));
    let result = (await d.status(['operator.read'])).result;
    assert.equal(result.code, 'connected');
    assert.equal(result.mcp.oauth.status, 'UNKNOWN');
    assert.deepEqual(store.read(true), tokens);
    assert.equal(result.capabilities.read_document.availability, 'UNKNOWN');
    assert.equal(result.capabilities.create_candidate_workspace.availability, 'UNAVAILABLE');
    assert(!JSON.stringify(result).includes('fixture-'));
    assert.deepEqual(result.connections, ['owner-rest']);
    const unavailable = dashboard(c, root, () =>
      mcpReadiness(async () => {
        throw Error('fixture-secret');
      }),
    );
    const independent = (await unavailable.status(['operator.read'])).result;
    assert.equal(independent.code, 'connected');
    assert.equal(independent.mcp.configured, null);
    await store.save({...tokens, expiresAt: 1});
    result = (await d.status(['operator.read'])).result;
    assert.equal(result.code, 'reconnect_required');
    assert.equal(result.mcp.oauth.storedGrant, true);
    assert.equal(store.read(true).expiresAt, 1);
    await store.save(null);
    result = (await d.status(['operator.read'])).result;
    assert.equal(result.code, 'disconnected');
    assert.equal(result.mcp.configured, true);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, {recursive: true, force: true});
  }
});
test('dashboard preserves successful REST status and offers native read/write consent', async () => {
  const originalDocument = globalThis.document;
  class Element {
    children = [];
    value = '';
    textContent = '';
    attrs = {};
    append(...items) {
      this.children.push(...items);
      if (this.attrs['aria-label'] === 'Configured Onshape connection' && !this.value && items.length)
        this.value = items[0].value;
    }
    replaceChildren(...items) {
      this.children = items;
    }
    setAttribute(k, v) {
      this.attrs[k] = v;
    }
    removeAttribute(k) {
      delete this.attrs[k];
    }
    remove() {}
  }
  globalThis.document = {createElement: () => new Element()};
  try {
    let page;
    ui.activate({ui: {registerNavigation: () => {}, registerPage: (p) => (page = p)}});
    const container = new Element(),
      requests = [];
    const view = page.mount(container, {
      signal: {aborted: false},
      host: {
        request: async (method, args) => {
          requests.push([method, args.actionId, args.payload]);
          return {
            ok: true,
            result: {
              code: 'connected',
              message: 'REST fixture',
              connections: ['owner-rest'],
              mcp: projectMcpStatus(native()),
            },
          };
        },
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const nodes = (e) => [e, ...e.children.flatMap(nodes)],
      all = nodes(container),
      text = all.map((e) => e.textContent).join('\n');
    for (const label of [
      'Onshape REST',
      'Onshape MCP',
      'CAD mutation: approved Candidate payload and bound MCP execution policy required.',
      'Disabled',
      'HISTORICAL',
      'UNKNOWN',
    ])
      assert(text.includes(label));
    assert(!text.includes('Connect MCP'));
    assert(!text.includes('Disconnect MCP'));
    assert(text.includes('Connect Onshape'));
    assert(text.includes('Status: connected'));
    assert(!text.includes('plugin_unavailable'));
    const connectWrite = all.find((e) => e.textContent === 'Connect Onshape read/write');
    const disconnect = all.find((e) => e.textContent === 'Disconnect Onshape');
    assert.equal(connectWrite.disabled, false);
    assert.equal(disconnect.disabled, false);
    assert.deepEqual(requests, [['plugins.sessionAction', 'status', {}]]);
    all.find((e) => e.attrs['aria-label'] === 'Configured Onshape connection').value = 'owner-rest';
    await connectWrite.onclick();
    assert.deepEqual(requests.at(-1), [
      'plugins.sessionAction',
      'connect',
      {connectionRef: 'owner-rest', requestRestWriteAccess: true},
    ]);
    view.dispose();
  } finally {
    globalThis.document = originalDocument;
  }
});
