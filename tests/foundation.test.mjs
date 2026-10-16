import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, chmod, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {registerHooks} from 'node:module';
import {parseConfig, bindingFor, validateTarget, connectionOwner} from '../dist/config.js';
import {
  Consent,
  AUTHORIZE_URL,
  TOKEN_URL,
  REDIRECT_URI,
  parseTokens,
  OAUTH_SCOPE_READ,
  OAUTH_SCOPE_WRITE,
} from '../dist/oauth.js';
import {candidateAuthorization} from '../dist/candidate-authorization.js';
import {RestClient} from '../dist/rest.js';
import {filterCatalog, discover, rejectMcpCall} from '../dist/mcp.js';
import {credentials, assertPrivateFile} from '../dist/credentials.js';
import plugin from '../dist/index.js';
import {connect} from '../dist/cli.js';

// Only the private-file SDK is mocked. This is NOT a native OpenClaw loader test.
globalThis.__nativeFiles = new Map();
globalThis.__nativeWrites = [];
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'openclaw/plugin-sdk/secret-file-runtime') {
      return {url: 'mock:safe-files', shortCircuit: true};
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'mock:safe-files') {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
      import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
      import path from 'node:path';
      export function readSecretFileSync(p) {return readFileSync(p,'utf8');}
      export async function writePrivateSecretFileAtomic(options) {
        globalThis.__nativeWrites.push(options);
        mkdirSync(path.dirname(options.filePath),{recursive:true,mode:0o700});
        writeFileSync(options.filePath,options.content,{mode:0o600});
      }
    `,
      };
    }
    return next(url, context);
  },
});
const D = 'a'.repeat(24),
  P = 'b'.repeat(24),
  W = 'c'.repeat(24),
  E = 'd'.repeat(24);
const binding = {
  agentId: 'mechanical-engineer',
  requesterSenderId: 'owner-1',
  messageChannel: 'discord',
  agentAccountId: 'robotics',
  connectionRef: 'owner-rest',
  documentId: D,
  primaryWorkspaceId: P,
  workspaceId: W,
};
const config = (extra = {}) => ({bindings: [binding], liveReads: true, ...extra});
const json = (v, status = 200) =>
  new Response(JSON.stringify(v), {status, headers: {'Content-Type': 'application/json'}});
const tokens = () => ({
  accessToken: 'fixture-access-DO-NOT-LOG',
  refreshToken: 'fixture-refresh-DO-NOT-LOG',
  expiresAt: Date.now() + 3600000,
  resource: 'https://cad.onshape.com/api/',
});
const fixtureStore = async (root) => {
  const store = await credentials(root, binding.connectionRef, connectionOwner(binding));
  await store.save(tokens());
  return store;
};
const capture = (cfg = config()) => {
  let entry = {enabled: true, config: cfg};
  const factories = [],
    cli = [];
  plugin.register({
    session: {controls: {registerSessionAction: () => {}}},
    registerHttpRoute: () => {},
    lifecycle: {registerRuntimeLifecycle: () => {}},
    pluginConfig: cfg,
    registerTool: (factory, opts) => factories.push({factory: factory.create ?? factory, opts}),
    registerCli: (f, opts) => cli.push({f, opts}),
    runtime: {
      config: {current: () => ({plugins: {entries: {'claw-onshape': entry}}})},
      state: {resolveStateDir: () => '/tmp/fixture-openclaw'},
    },
  });
  return {
    factories,
    cli,
    setEntry: (v) => {
      entry = v;
    },
  };
};

test('package entry loads; manifest/optional tool/CLI metadata agree (mock registration)', async () => {
  const pkg = JSON.parse(await readFile('package.json'));
  const manifest = JSON.parse(await readFile('openclaw.plugin.json'));
  assert.deepEqual(pkg.openclaw.extensions, ['./dist/index.js']);
  assert.equal(pkg.peerDependencies.openclaw, '2026.9.9');
  assert.equal(plugin.id, manifest.id);
  const host = capture();
  assert.equal(host.factories.length, manifest.contracts.tools.length);
  assert.equal(host.factories[0].opts.optional, true);
  assert.equal(host.factories[0].factory(binding).name, manifest.contracts.tools[0]);
  assert.equal(host.cli[0].opts.descriptors[0].name, manifest.cliCommands[0].name);
  assert.equal(manifest.enabledByDefault, false);
});
test('exact trusted user/agent/channel/account exposure and connection ownership', () => {
  const factory = capture().factories[0].factory;
  for (const ctx of [
    {},
    {...binding, agentId: 'robotics-lead'},
    {...binding, requesterSenderId: 'other'},
    {...binding, messageChannel: 'slack'},
    {...binding, agentAccountId: 'other'},
  ]) {
    assert.equal(factory(ctx), null);
  }
  assert.equal(bindingFor(parseConfig(config()), {...binding, sessionKey: 'unrelated'}).documentId, D);
  assert.throws(
    () => parseConfig(config({bindings: [binding, {...binding, requesterSenderId: 'other'}]})),
    /connection_owner_conflict/,
  );
});
test('strict config denies unknowns, invalid IDs, missing identity, duplicate bindings', () => {
  for (const bad of [
    undefined,
    {},
    config({secret: 'fixture-secret'}),
    config({liveReads: 'true'}),
    config({bindings: [{...binding, documentId: '../escape'}]}),
    config({bindings: [{...binding, requesterSenderId: ''}]}),
    config({bindings: [binding, binding]}),
    config({oauth: {clientId: 'x', clientSecretFile: 'relative'}}),
  ]) {
    assert.throws(() => parseConfig(bad));
  }
  assert.deepEqual(parseConfig({bindings: []}).bindings, []);
  assert.equal(parseConfig({bindings: []}).liveReads, false);
  const c = parseConfig(config());
  assert(Object.isFrozen(c.bindings[0]));
});
test('primary rejection, unrelated document/workspace denial, merge and writes disabled', () => {
  validateTarget(binding, D, W);
  assert.throws(() => validateTarget(binding, D, P, true), /protected_primary_workspace/);
  assert.throws(() => validateTarget(binding, E, W, true), /target_denied/);
  assert.throws(() => validateTarget(binding, D, E), /target_denied/);
  assert.throws(() => validateTarget(binding, D, W, true), /writes_disabled/);
  // Reads of primary are allowed only when the operator selected it as active.
  validateTarget({...binding, workspaceId: P}, D, P);
});
test('REST fixed GET paths and workspace membership; outputs exclude provider text', async () => {
  const calls = [];
  const responses = [
    {id: D, name: tokens().accessToken},
    [{id: W}, {id: P}],
    [{id: E, name: tokens().accessToken, access_token: 'secret'}],
  ];
  const client = new RestClient(
    async () => tokens().accessToken,
    async (url, init) => {
      calls.push({url, init});
      return json(responses.shift());
    },
  );
  const result = await client.inspect(binding);
  assert.deepEqual(
    calls.map((c) => c.url),
    [
      `https://cad.onshape.com/api/v10/documents/${D}`,
      `https://cad.onshape.com/api/v10/documents/d/${D}/workspaces`,
      `https://cad.onshape.com/api/v10/documents/d/${D}/w/${W}/elements`,
    ],
  );
  for (const {init} of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${tokens().accessToken}`);
    assert(init.signal);
  }
  assert.deepEqual(result, {documentId: D, workspaceId: W, elementIds: [E]});
  assert(!JSON.stringify(result).includes('fixture-access'));
});
test('REST rejects absent workspace before elements and wrong provider document', async () => {
  let n = 0;
  const client = new RestClient(
    async () => 'fixture',
    async () => json(++n === 1 ? {id: D} : [{id: P}]),
  );
  await assert.rejects(client.inspect(binding), /workspace_not_in_document/);
  assert.equal(n, 2);
  await assert.rejects(
    new RestClient(
      async () => 'fixture',
      async () => json({id: E}),
    ).inspect(binding),
    /provider_protocol_error/,
  );
});
test('REST failures are bounded, sanitized and never retried', async () => {
  for (const [status, error] of [
    [401, 'reconnect_required'],
    [403, 'provider_forbidden'],
    [404, 'provider_not_found'],
    [429, 'provider_rate_limited'],
    [500, 'provider_unavailable'],
  ]) {
    let calls = 0;
    await assert.rejects(
      new RestClient(
        async () => 'fixture',
        async () => {
          calls++;
          return json({error: 'fixture-access'}, status);
        },
      ).inspect(binding),
      new RegExp(`^Error: ${error}$`),
    );
    assert.equal(calls, 1);
  }
  for (const fetcher of [
    async () => {
      throw Error('fixture-access');
    },
    async () => new Response('fixture-access'),
    async () => new Response('not-json', {headers: {'Content-Type': 'application/json'}}),
    async () => json('x'.repeat(1024 * 1024)),
  ]) {
    await assert.rejects(
      new RestClient(async () => 'fixture', fetcher).inspect(binding),
      (e) => !e.message.includes('fixture-access'),
    );
  }
});
test('OAuth exact authorization and client_secret_post exchange; only REST resource', async () => {
  let calls = 0;
  const c = new Consent('fixture-client', 'fixture-client-secret', async (url, init) => {
    calls++;
    assert.equal(url, TOKEN_URL);
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.deepEqual(Object.fromEntries(init.body), {
      grant_type: 'authorization_code',
      code: 'fixture-code',
      client_id: 'fixture-client',
      client_secret: 'fixture-client-secret',
      redirect_uri: REDIRECT_URI,
    });
    return json({
      access_token: 'fixture-access',
      refresh_token: 'fixture-refresh',
      expires_in: 3600,
      scope: 'OAuth2Read',
      token_type: 'Bearer',
    });
  });
  const u = new URL(c.authorizationUrl());
  assert.equal(u.origin + u.pathname, AUTHORIZE_URL);
  assert.equal(u.searchParams.get('scope'), 'OAuth2Read');
  assert.equal(u.searchParams.get('redirect_uri'), REDIRECT_URI);
  const callback = `/?${new URLSearchParams({state: u.searchParams.get('state'), code: 'fixture-code'})}`;
  const t = await c.complete(callback, 'localhost:8765');
  assert.equal(t.resource, 'https://cad.onshape.com/api/');
  assert.equal(calls, 1);
  assert.deepEqual(t.scopes, [OAUTH_SCOPE_READ]);
  await assert.rejects(c.complete(callback, 'localhost:8765'), /oauth_callback_invalid/);
  assert.equal(calls, 1);
});
test('OAuth explicit write consent requests and validates read+write scope', async () => {
  const c = new Consent(
    'fixture-client',
    'fixture-client-secret',
    async () =>
      json({
        access_token: 'fixture-access',
        refresh_token: 'fixture-refresh',
        expires_in: 3600,
        scope: 'OAuth2Read OAuth2Write',
        token_type: 'Bearer',
      }),
    Date.now,
    REDIRECT_URI,
    [OAUTH_SCOPE_READ, OAUTH_SCOPE_WRITE],
  );
  const u = new URL(c.authorizationUrl());
  assert.equal(u.searchParams.get('scope'), 'OAuth2Read OAuth2Write');
  const callback = `/?${new URLSearchParams({state: u.searchParams.get('state'), code: 'fixture-code'})}`;
  const t = await c.complete(callback, 'localhost:8765');
  assert(t.scopes.includes(OAUTH_SCOPE_READ));
  assert(t.scopes.includes(OAUTH_SCOPE_WRITE));
});
test('OAuth wrong state/host/path/duplicates/expiry/cancellation rejected before fetch', async () => {
  let calls = 0;
  let now = 0;
  const c = new Consent(
    'client',
    'secret',
    async () => {
      calls++;
      return json({});
    },
    () => now,
  );
  const state = new URL(c.authorizationUrl()).searchParams.get('state');
  for (const [url, host] of [
    ['/?state=wrong&code=x', 'localhost:8765'],
    [`/?state=${state}&state=${state}&code=x`, 'localhost:8765'],
    [`/?state=${state}&code=x&code=y`, 'localhost:8765'],
    [`/?state=${state}&code=x&extra=y`, 'localhost:8765'],
    [`/other?state=${state}&code=x`, 'localhost:8765'],
    [`/?state=${state}&code=x`, 'attacker.invalid'],
    [`/?state=${state}&code=x#fragment`, 'localhost:8765'],
  ]) {
    await assert.rejects(c.complete(url, host), /oauth_callback_invalid/);
  }
  assert.equal(calls, 0);
  now = 300000;
  await assert.rejects(c.complete(`/?state=${state}&code=x`, 'localhost:8765'), /oauth_callback_invalid/);
  const d = new Consent('client', 'secret');
  d.cancel();
  await assert.rejects(d.complete('/?code=x', 'localhost:8765'));
});
test('OAuth denied consent consumes state, unsafe responses and errors never leak', async () => {
  for (const response of [
    () => json({access_token: 'fixture-leak'}),
    () => json({error: 'fixture-leak'}, 401),
    () => {
      throw Error('fixture-leak');
    },
  ]) {
    const c = new Consent('client', 'fixture-secret', async () => response());
    const state = new URL(c.authorizationUrl()).searchParams.get('state');
    await assert.rejects(c.complete(`/?state=${state}&code=x`, 'localhost:8765'), /^Error: oauth_reconnect_required$/);
    await assert.rejects(c.complete(`/?state=${state}&code=x`, 'localhost:8765'), /oauth_callback_invalid/);
  }
  const c = new Consent('client', 'secret', async () => assert.fail('no exchange'));
  const state = new URL(c.authorizationUrl()).searchParams.get('state');
  await assert.rejects(
    c.complete(`/?state=${state}&error=denied&error_description=fixture-leak`, 'localhost:8765'),
    /^Error: oauth_consent_denied$/,
  );
  await assert.rejects(c.complete(`/?state=${state}&code=x`, 'localhost:8765'), /oauth_callback_invalid/);
  for (const extra of [{token_type: 'other'}, {expires_in: Infinity}, {access_token: 'a\nb'}]) {
    assert.throws(
      () => parseTokens({access_token: 'a', refresh_token: 'b', expires_in: 3600, ...extra}),
      /oauth_response_invalid/,
    );
  }
  const write = parseTokens(
    {access_token: 'a', refresh_token: 'b', expires_in: 3600, token_type: 'Bearer', scope: 'OAuth2Read OAuth2Write'},
    Date.now(),
    [OAUTH_SCOPE_READ, OAUTH_SCOPE_WRITE],
  );
  assert(write.scopes.includes(OAUTH_SCOPE_WRITE));
  assert.throws(
    () =>
      parseTokens(
        {access_token: 'a', refresh_token: 'b', expires_in: 3600, token_type: 'Bearer', scope: 'OAuth2Read'},
        Date.now(),
        [OAUTH_SCOPE_READ, OAUTH_SCOPE_WRITE],
      ),
    /oauth_response_invalid/,
  );
});
test('MCP native discovery has no REST credentials, every catalog operation disabled', async () => {
  const names = [
    'create_feature_studio',
    'create_geometry',
    'edit_featurescript_notes',
    'get_api_usage',
    'get_featurescript',
    'list_feature_studios',
    'logout',
    'put_featurescript',
    'read_featurescript_notes',
    'search_featurescript_documentation',
    'set_api_allocation',
    'test_feature',
    'test_featurescript',
    'whoami',
  ];
  const caps = await discover('onshape', async (args) => {
    assert.deepEqual(args, ['mcp', 'probe', 'onshape', '--json']);
    return JSON.stringify({tools: names, diagnostics: []});
  });
  assert.equal(caps.length, 14);
  assert(caps.every((t) => t.enabled === false));
  for (const name of [...names, 'future_unknown_write']) {
    assert.throws(() => rejectMcpCall(name, {did: D, wid: P, approval: 'human said yes'}), /mcp_execution_disabled/);
  }
  for (const v of [
    {tools: names, diagnostics: [{message: 'fixture-secret'}]},
    {tools: ['bad secret name'], diagnostics: []},
    {tools: ['same', 'same'], diagnostics: []},
    {},
  ]) {
    assert.throws(() => filterCatalog(v), /^Error: mcp_discovery_failed$/);
  }
  await assert.rejects(
    discover('../escape', async () => assert.fail()),
    /invalid_mcp_server/,
  );
  await assert.rejects(
    discover('onshape', async () => {
      throw Error('fixture-secret');
    }),
    /^Error: mcp_discovery_failed$/,
  );
});
test('credential SDK contract: private atomic storage, resource/expiry, disconnect and reconnect', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'clawonshape-'));
  try {
    const store = await fixtureStore(root);
    assert.equal(store.read().accessToken, tokens().accessToken);
    const write = globalThis.__nativeWrites.at(-1);
    assert.equal(write.rootDir, root);
    assert.equal(write.durable, 'file');
    assert.equal(write.filePath, path.join(root, 'claw-onshape', 'credentials', 'owner-rest.json'));
    await store.exclusive(() => store.save(null));
    assert.throws(() => store.read(), /^Error: reconnect_required$/);
    await store.exclusive(() => store.save(tokens()));
    assert(store.read());
    await store.save({...tokens(), expiresAt: 0});
    assert.throws(() => store.read(), /reconnect_required/);
    await store.save({...tokens(), resource: 'https://fs-mcp.labs.onshape.app/mcp'});
    assert.throws(() => store.read(), /reconnect_required/);
    await assert.rejects(credentials(root, '../escape', connectionOwner(binding)), /invalid_connection/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('connection lifecycle lock refuses overlapping connect/disconnect and releases after failure', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'clawonshape-'));
  try {
    const store = await credentials(root, 'owner-rest', connectionOwner(binding));
    let release;
    let started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const pending = store.exclusive(async () => {
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
    });
    await ready;
    await assert.rejects(
      store.exclusive(() => store.save(null)),
      /connection_busy_or_state_unavailable/,
    );
    release();
    await pending;
    await assert.rejects(
      store.exclusive(async () => {
        throw Error('synthetic');
      }),
      /synthetic/,
    );
    await store.exclusive(() => store.save(null));
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('private credential/app files reject relaxed modes, symlinks and public parent directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'clawonshape-'));
  const file = path.join(root, 'secret');
  try {
    await writeFile(file, 'fixture-secret', {mode: 0o600});
    assertPrivateFile(file);
    await chmod(file, 0o644);
    assert.throws(() => assertPrivateFile(file), /private_file_required/);
    await chmod(file, 0o600);
    const link = path.join(root, 'link');
    await symlink(file, link);
    assert.throws(() => assertPrivateFile(link), /private_file_required/);
    await chmod(root, 0o755);
    assert.throws(() => assertPrivateFile(file), /private_file_required/);
    await chmod(root, 0o700);
    const store = await fixtureStore(root);
    const credential = path.join(root, 'claw-onshape', 'credentials', 'owner-rest.json');
    await chmod(credential, 0o644);
    assert.throws(() => store.read(), /^Error: reconnect_required$/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('credential owner binding survives config reload and rejects reassigned connection references', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'clawonshape-'));
  try {
    await fixtureStore(root);
    const another = await credentials(
      root,
      binding.connectionRef,
      connectionOwner({...binding, requesterSenderId: 'different-owner'}),
    );
    assert.throws(() => another.read(), /^Error: reconnect_required$/);
    const restored = await credentials(root, binding.connectionRef, connectionOwner(binding));
    assert(restored.read());
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('mock listener binds loopback, and timeout drains in-flight exchange before releasing lifecycle', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let handler,
    releaseExchange,
    cancelled = false,
    closed = false,
    saved = false;
  const consent = {
    authorizationUrl: () => AUTHORIZE_URL,
    complete: () =>
      new Promise((resolve) => {
        releaseExchange = resolve;
      }),
    cancel: () => {
      cancelled = true;
    },
  };
  const factory = (fn) => {
    handler = fn;
    return {
      on() {},
      listen(port, host, ready) {
        assert.equal(port, 8765);
        assert.equal(host, '127.0.0.1');
        ready();
      },
      close() {
        closed = true;
      },
    };
  };
  const connection = connect(
    consent,
    async () => {
      saved = true;
    },
    factory,
    () => {},
  );
  let settled = false;
  const outcome = connection.then(
    () => {
      settled = true;
      return 'ok';
    },
    (e) => {
      settled = true;
      return e.message;
    },
  );
  const headers = {};
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
    writeHead() {
      return this;
    },
    end() {},
  };
  const request = handler({method: 'GET', url: '/?state=fixture&code=fixture', headers: {host: 'localhost:8765'}}, res);
  t.mock.timers.tick(300000);
  await Promise.resolve();
  assert.equal(settled, false);
  assert(closed);
  assert(cancelled);
  releaseExchange(tokens());
  await request;
  assert.equal(await outcome, 'oauth_connect_expired');
  assert.equal(saved, false);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
});
test('tool execution rechecks authorization and arguments before credential/network access', async () => {
  const host = capture();
  const tool = host.factories[0].factory(binding);
  assert.equal((await tool.execute('call', {workspaceId: P})).details.error, 'invalid_arguments');
  host.setEntry({enabled: true, config: config({liveReads: false})});
  assert.equal((await tool.execute('call', {})).details.error, 'live_reads_disabled');
  host.setEntry({enabled: true, config: config({bindings: []})});
  assert.equal((await tool.execute('call', {})).details.error, 'authorization_changed');
  host.setEntry({enabled: false, config: config()});
  assert.equal((await tool.execute('call', {})).details.error, 'authorization_changed');
});
test('mock integration: registered authorized tool -> private credential -> REST, no token in result', async () => {
  await fixtureStore('/tmp/fixture-openclaw');
  const host = capture();
  const tool = host.factories[0].factory({...binding, assertInvocationCurrent: () => {}});
  const previous = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => json([{id: D}, [{id: W}, {id: P}], [{id: E, name: tokens().accessToken}]][n++]);
  try {
    const result = await tool.execute('call', {});
    assert.deepEqual(result.details, {documentId: D, workspaceId: W, elementIds: [E]});
    assert(!JSON.stringify(result).includes('fixture-access'));
    assert.equal(n, 3);
  } finally {
    globalThis.fetch = previous;
  }
});
test('mock integration: revocation during REST blocks final result', async () => {
  await fixtureStore('/tmp/fixture-openclaw');
  const host = capture();
  const tool = host.factories[0].factory(binding);
  const previous = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    if (n === 3) {
      host.setEntry({enabled: true, config: config({bindings: []})});
    }
    return json(n === 1 ? {id: D} : n === 2 ? [{id: W}, {id: P}] : [{id: E}]);
  };
  try {
    assert.equal((await tool.execute('call', {})).details.error, 'authorization_changed');
  } finally {
    globalThis.fetch = previous;
  }
});

const candidateTestRoot = await mkdtemp(path.join(tmpdir(), 'onshape-candidate-tests-'));
test.after(() => rm(candidateTestRoot, {recursive: true, force: true}));
async function candidateClient(token, fetcher) {
  const stateDir = await mkdtemp(path.join(candidateTestRoot, 'state-')),
    b = {...binding, elementId: E};
  const store = await credentials(stateDir, b.connectionRef, connectionOwner(b));
  await store.save({...tokens(), scopes: [OAUTH_SCOPE_READ, OAUTH_SCOPE_WRITE]});
  const c = parseConfig({
    bindings: [b],
    engineerAgentId: b.agentId,
    liveReads: true,
    oauth: {
      clientId: 'fixture',
      clientSecretFile: '/private/fixture',
      applicationPermissions: {canWriteDocuments: true},
    },
  });
  return new RestClient(token, fetcher, {
    stateDir,
    authorization: candidateAuthorization(
      () => c,
      b,
      stateDir,
      () => {},
    ),
    warn: () => {},
  });
}

test('prepareCandidateWorkspace creates candidate from exact source revision and captures baseline', async () => {
  const M = 'e'.repeat(24),
    C = 'f'.repeat(24),
    F = '1'.repeat(24);
  const b = {...binding, elementId: E};
  const calls = [];
  const replies = [
    {id: D},
    [
      {id: W, documentId: D},
      {id: P, documentId: D},
    ],
    {sourceMicroversion: M, features: [{featureId: F}]},
    [{id: E, elementType: 'PARTSTUDIO'}],
    {microversion: M},
    {id: C, documentId: D},
    [
      {id: W, documentId: D},
      {id: P, documentId: D},
      {id: C, documentId: D},
    ],
    {microversion: M},
  ];
  const client = await candidateClient(
    async () => tokens().accessToken,
    async (url, init) => {
      calls.push({url, init});
      if (init.method === 'POST') {
        assert.deepEqual(JSON.parse(init.body), {name: 'candidate-workspace', microversionId: M});
      }
      return json(replies.shift());
    },
  );
  const result = await client.prepareCandidateWorkspace(b, {
    sourceMicroversionId: M,
    candidateWorkspaceName: 'candidate-workspace',
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.created, true);
  assert.equal(result.references.candidateWorkspaceId, C);
  assert.equal(result.references.candidateBaselineMicroversionId, M);
  assert.equal(result.references.sourceElementId, E);
  assert.deepEqual(result.featureMetadata, {featureCount: 1});
  assert.deepEqual(
    calls.map((c) => new URL(c.url).pathname),
    [
      `/api/v10/documents/${D}`,
      `/api/v10/documents/d/${D}/workspaces`,
      `/api/v10/partstudios/d/${D}/w/${W}/e/${E}/features`,
      `/api/v10/documents/d/${D}/m/${M}/elements`,
      `/api/v10/documents/d/${D}/w/${W}/currentmicroversion`,
      `/api/v10/documents/d/${D}/workspaces`,
      `/api/v10/documents/d/${D}/workspaces`,
      `/api/v10/documents/d/${D}/w/${C}/currentmicroversion`,
    ],
  );
});

test('prepareCandidateWorkspace resolves existing candidate membership and rejects primary candidate', async () => {
  const M = 'e'.repeat(24),
    C = 'f'.repeat(24),
    F = '1'.repeat(24);
  const b = {...binding, elementId: E};
  const existing = [
    {id: W, documentId: D},
    {id: P, documentId: D},
    {id: C, documentId: D},
  ];
  const calls = [];
  const replies = [
    {id: D},
    existing,
    {sourceMicroversion: M, features: [{featureId: F}]},
    [{id: E, elementType: 'PARTSTUDIO'}],
    {microversion: M},
    {microversion: M},
  ];
  const client = await candidateClient(
    async () => tokens().accessToken,
    async (url, init) => {
      calls.push({url, init});
      return json(replies.shift());
    },
  );
  const result = await client.prepareCandidateWorkspace(b, {sourceMicroversionId: M, candidateWorkspaceId: C});
  assert.equal(result.status, 'ok');
  assert.equal(result.created, false);
  assert.equal(result.references.candidateWorkspaceId, C);
  const clientPrimary = await candidateClient(
    async () => tokens().accessToken,
    async () => json({id: D}),
  );
  await assert.rejects(
    clientPrimary.prepareCandidateWorkspace(b, {sourceMicroversionId: M, candidateWorkspaceId: P}),
    /protected_primary_workspace/,
  );
  assert(calls.every((c) => c.init.method === 'GET'));
});

test('candidate preparation refuses claimed authorization and missing host authority before network access', async () => {
  const M = 'e'.repeat(24),
    b = {...binding, elementId: E};
  let calls = 0;
  const client = await candidateClient(
    async () => tokens().accessToken,
    async () => {
      calls++;
      return json({id: E});
    },
  );
  await assert.rejects(
    client.prepareCandidateWorkspace(b, {sourceMicroversionId: M, restWriteAuthorized: true}),
    /invalid_arguments/,
  );
  assert.equal(calls, 0);
  const denied = await new RestClient(
    async () => assert.fail('no credential access'),
    async () => assert.fail('no network'),
  ).prepareCandidateWorkspace(b, {sourceMicroversionId: M});
  assert.equal(denied.availability, 'UNAVAILABLE');
  assert.equal(denied.reason, 'agent_policy_denied');
});

test('prepareCandidateWorkspace detects source revision drift conflicts and avoids POST mutations', async () => {
  const M = 'e'.repeat(24),
    N = '9'.repeat(24),
    F = '1'.repeat(24);
  const b = {...binding, elementId: E};
  const calls = [];
  const client = await candidateClient(
    async () => tokens().accessToken,
    async (url, init) => {
      calls.push({url, init});
      const p = new URL(url).pathname;
      if (p === `/api/v10/documents/${D}`) {
        return json({id: D});
      }
      if (p === `/api/v10/documents/d/${D}/workspaces`) {
        return json([
          {id: W, documentId: D},
          {id: P, documentId: D},
        ]);
      }
      if (p === `/api/v10/partstudios/d/${D}/w/${W}/e/${E}/features`) {
        return json({sourceMicroversion: N, features: [{featureId: F}]});
      }
      if (p === `/api/v10/documents/d/${D}/w/${W}/currentmicroversion`) {
        return json({microversion: N});
      }
      return json({});
    },
  );
  await assert.rejects(client.prepareCandidateWorkspace(b, {sourceMicroversionId: M}), /source_revision_conflict/);
  assert.equal(
    calls.some((c) => c.init.method === 'POST'),
    false,
  );
  calls.length = 0;
  const client2 = await candidateClient(
    async () => tokens().accessToken,
    async (url, init) => {
      calls.push({url, init});
      const p = new URL(url).pathname;
      if (p === `/api/v10/documents/${D}`) {
        return json({id: D});
      }
      if (p === `/api/v10/documents/d/${D}/workspaces`) {
        return json([
          {id: W, documentId: D},
          {id: P, documentId: D},
        ]);
      }
      if (p === `/api/v10/partstudios/d/${D}/w/${W}/e/${E}/features`) {
        return json({sourceMicroversion: M, features: [{featureId: F}]});
      }
      if (p === `/api/v10/documents/d/${D}/m/${M}/elements`) {
        return json([{id: E, elementType: 'PARTSTUDIO'}]);
      }
      if (p === `/api/v10/documents/d/${D}/w/${W}/currentmicroversion`) {
        return json({microversion: N});
      }
      return json({});
    },
  );
  await assert.rejects(client2.prepareCandidateWorkspace(b, {sourceMicroversionId: M}), /source_revision_conflict/);
  assert.equal(
    calls.some((c) => c.init.method === 'POST'),
    false,
  );
});

test('prepareCandidateWorkspace returns UNKNOWN on uncertain POST outcome without retrying', async () => {
  const M = 'e'.repeat(24),
    F = '1'.repeat(24);
  const b = {...binding, elementId: E};
  let posts = 0;
  const client = await candidateClient(
    async () => tokens().accessToken,
    async (url, init) => {
      const p = new URL(url).pathname;
      if (p === `/api/v10/documents/${D}`) {
        return json({id: D});
      }
      if (p === `/api/v10/documents/d/${D}/workspaces`) {
        if (init.method === 'POST') {
          posts++;
          throw new Error('socket timeout');
        }
        return json([
          {id: W, documentId: D},
          {id: P, documentId: D},
        ]);
      }
      if (p === `/api/v10/partstudios/d/${D}/w/${W}/e/${E}/features`) {
        return json({sourceMicroversion: M, features: [{featureId: F}]});
      }
      if (p === `/api/v10/documents/d/${D}/m/${M}/elements`) {
        return json([{id: E, elementType: 'PARTSTUDIO'}]);
      }
      if (p === `/api/v10/documents/d/${D}/w/${W}/currentmicroversion`) {
        return json({microversion: M});
      }
      return json({});
    },
  );
  const result = await client.prepareCandidateWorkspace(b, {sourceMicroversionId: M});
  assert.equal(result.status, 'unknown');
  assert.equal(result.code, 'candidate_creation_unknown');
  assert.equal(result.attemptStatus, 'UNKNOWN');
  assert.equal(result.reconciliationRequired, true);
  assert.match(result.attemptId, /^[a-f0-9-]{36}$/);
  assert(Buffer.byteLength(JSON.stringify(result)) <= 2048);
  assert.equal(posts, 1);
});

// Route-based fixtures deliberately keep mutable workspace elements separate
// from immutable revision elements, and permit hostile candidate responses.
async function candidateFixture(options = {}) {
  const M = 'e'.repeat(24),
    C = 'f'.repeat(24),
    N = '9'.repeat(24);
  const b = Object.freeze({...binding, elementId: E});
  const workspaces = options.workspaces ?? [
    {id: W, documentId: D},
    {id: P, documentId: D},
    {id: C, documentId: D},
  ];
  const calls = [];
  const client = await candidateClient(
    async () => tokens().accessToken,
    async (url, init) => {
      calls.push({url, method: init.method});
      const p = new URL(url).pathname;
      if (p === `/api/v10/documents/${D}`) {
        return json({id: D});
      }
      if (p === `/api/v10/documents/d/${D}/workspaces`) {
        if (init.method === 'POST') {
          assert.equal(JSON.parse(init.body).microversionId, M);
          return json(options.createResponse ?? {id: C, documentId: D});
        }
        return json(workspaces);
      }
      if (p === `/api/v10/partstudios/d/${D}/w/${W}/e/${E}/features`) {
        return json({sourceMicroversion: M, features: []});
      }
      if (p === `/api/v10/documents/d/${D}/m/${M}/elements`) {
        return json('sourceElements' in options ? options.sourceElements : [{id: E, elementType: 'PARTSTUDIO'}]);
      }
      if (p === `/api/v10/documents/d/${D}/w/${W}/currentmicroversion`) {
        return json({microversion: M});
      }
      if (p === `/api/v10/documents/d/${D}/w/${C}/currentmicroversion`) {
        return json({microversion: options.candidateRevision ?? M});
      }
      throw new Error('Unexpected fixture route');
    },
  );
  return {M, C, N, b, calls, client, input: {sourceMicroversionId: M}};
}

test('candidate preparation requires the same exact baseline for existing and newly created workspaces', async () => {
  for (const existing of [true, false]) {
    const fixture = await candidateFixture({candidateRevision: '9'.repeat(24)});
    if (existing) {
      await assert.rejects(
        fixture.client.prepareCandidateWorkspace(fixture.b, {...fixture.input, candidateWorkspaceId: fixture.C}),
        /^Error: candidate_revision_conflict$/,
      );
    } else {
      const result = await fixture.client.prepareCandidateWorkspace(fixture.b, fixture.input);
      assert.equal(result.status, 'created_unverified');
      assert.equal(result.candidateWorkspaceId, fixture.C);
    }
    assert.equal(fixture.calls.filter((c) => c.method === 'POST').length, existing ? 0 : 1);
  }
});

test('candidate preparation rejects primary and source targets before network access and in create responses', async () => {
  for (const [workspaceId, code] of [
    [P, 'protected_primary_workspace'],
    [W, 'candidate_not_isolated'],
  ]) {
    const fixture = await candidateFixture();
    await assert.rejects(
      fixture.client.prepareCandidateWorkspace(fixture.b, {...fixture.input, candidateWorkspaceId: workspaceId}),
      new RegExp(`^Error: ${code}$`),
    );
    assert.equal(fixture.calls.length, 0);
    const created = await candidateFixture({createResponse: {id: workspaceId, documentId: D}});
    const result = await created.client.prepareCandidateWorkspace(created.b, created.input);
    assert.equal(result.status, 'unknown');
    assert.equal(result.candidateWorkspaceId, workspaceId);
    assert.equal(created.calls.filter((c) => c.method === 'POST').length, 1);
    assert(
      !created.calls.some(
        (c) =>
          new URL(c.url).pathname === `/api/v10/documents/d/${D}/w/${workspaceId}/currentmicroversion` &&
          workspaceId === P,
      ),
    );
  }
});

test('candidate preparation verifies the configured Part Studio at the exact immutable source before any POST', async () => {
  for (const sourceElements of [
    [],
    [{id: D, elementType: 'PARTSTUDIO'}],
    [{id: E, elementType: 'DRAWING'}],
    [{id: E}],
  ]) {
    for (const existing of [true, false]) {
      const fixture = await candidateFixture({sourceElements});
      await assert.rejects(
        fixture.client.prepareCandidateWorkspace(fixture.b, {
          ...fixture.input,
          ...(existing ? {candidateWorkspaceId: fixture.C} : {}),
        }),
        /^Error: target_not_part_studio$/,
      );
      assert.equal(fixture.calls.filter((c) => c.method === 'POST').length, 0);
      assert(
        fixture.calls.some((c) => new URL(c.url).pathname === `/api/v10/documents/d/${D}/m/${fixture.M}/elements`),
      );
    }
  }
  for (const sourceElements of [null, {}, [{id: 'invalid', elementType: 'PARTSTUDIO'}]]) {
    const fixture = await candidateFixture({sourceElements});
    await assert.rejects(
      fixture.client.prepareCandidateWorkspace(fixture.b, fixture.input),
      /^Error: provider_protocol_error$/,
    );
    assert.equal(fixture.calls.filter((c) => c.method === 'POST').length, 0);
  }
});

test('candidate preparation rejects foreign or absent candidate membership in both result paths', async () => {
  for (const candidate of [[], [{id: 'f'.repeat(24), documentId: '9'.repeat(24)}]]) {
    for (const existing of [true, false]) {
      const fixture = await candidateFixture({
        workspaces: [{id: W, documentId: D}, {id: P, documentId: D}, ...candidate],
      });
      if (existing) {
        await assert.rejects(
          fixture.client.prepareCandidateWorkspace(fixture.b, {...fixture.input, candidateWorkspaceId: fixture.C}),
          /^Error: workspace_not_in_document$/,
        );
      } else {
        const result = await fixture.client.prepareCandidateWorkspace(fixture.b, fixture.input);
        assert.equal(result.status, 'created_unverified');
        assert.equal(result.candidateWorkspaceId, fixture.C);
      }
      assert.equal(fixture.calls.filter((c) => c.method === 'POST').length, existing ? 0 : 1);
      assert(
        !fixture.calls.some(
          (c) => new URL(c.url).pathname === `/api/v10/documents/d/${D}/w/${fixture.C}/currentmicroversion`,
        ),
      );
    }
  }
  const foreign = await candidateFixture({createResponse: {id: 'f'.repeat(24), documentId: '9'.repeat(24)}});
  assert.equal((await foreign.client.prepareCandidateWorkspace(foreign.b, foreign.input)).status, 'unknown');
});

test('candidate preparation rejects missing source/primary membership and returns isolated exact references without changing bindings', async () => {
  for (const workspaces of [[{id: P, documentId: D}], [{id: W, documentId: D}]]) {
    const fixture = await candidateFixture({workspaces});
    await assert.rejects(
      fixture.client.prepareCandidateWorkspace(fixture.b, fixture.input),
      /^Error: workspace_not_in_document$/,
    );
    assert.equal(fixture.calls.filter((c) => c.method === 'POST').length, 0);
  }
  for (const existing of [true, false]) {
    const fixture = await candidateFixture(),
      before = JSON.stringify(fixture.b);
    const result = await fixture.client.prepareCandidateWorkspace(fixture.b, {
      ...fixture.input,
      ...(existing ? {candidateWorkspaceId: fixture.C} : {}),
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.created, !existing);
    assert.equal(result.references.candidateBaselineMicroversionId, fixture.M);
    assert.equal(result.references.sourceMicroversionId, fixture.M);
    assert.equal(result.references.candidateWorkspaceId, fixture.C);
    assert.notEqual(result.references.candidateWorkspaceId, fixture.b.workspaceId);
    assert.notEqual(result.references.candidateWorkspaceId, fixture.b.primaryWorkspaceId);
    assert.equal(JSON.stringify(fixture.b), before);
    assert.equal(fixture.calls.filter((c) => c.method === 'POST').length, existing ? 0 : 1);
  }
});
