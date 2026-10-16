import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, lstat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {deflateSync} from 'node:zlib';
import {createHash, createHmac} from 'node:crypto';
import {parseConfig, connectionOwner, channelMatches} from '../dist/config.js';
import {RestClient} from '../dist/rest.js';
import {crc32, decodePng, validatePng, saveRender, readRender, imageHash} from '../dist/render.js';
import {mintContext, verifyContext, leadBinding, signResult, verifyResult, delegateRender} from '../dist/delegation.js';
import {connectionLifecycle} from '../dist/connections.js';
import {credentials} from '../dist/credentials.js';
import {registerDashboard} from '../dist/dashboard.js';
import plugin from '../dist/index.js';

const D = 'a'.repeat(24),
  W = 'b'.repeat(24),
  E = 'c'.repeat(24),
  M = 'd'.repeat(24);
const B = {
  agentId: 'engineer',
  requesterSenderId: 'owner',
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
  documentId: D,
  primaryWorkspaceId: W,
  workspaceId: W,
  elementId: E,
  discordChannelId: '123456789012345678',
};
const DC = {
  leadAgentId: 'lead-agent',
  engineerAgentId: 'engineer',
  peerSenderId: 'lead',
  accountId: 'default',
  keyFile: '/unused/private/key',
};
const key = 'ab'.repeat(32);
const json = (value) => new Response(JSON.stringify(value), {headers: {'Content-Type': 'application/json'}});
const delay = () => new Promise((r) => setImmediate(r));
const chunk = (kind, data) => {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  b.write(kind, 4);
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4);
  return b;
};
function png() {
  const h = Buffer.alloc(13);
  h.writeUInt32BE(800);
  h.writeUInt32BE(800, 4);
  h[8] = 8;
  h[9] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', h),
    chunk('IDAT', deflateSync(Buffer.alloc(801 * 800))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const tokens = {
  accessToken: 'fixture-product-access',
  refreshToken: 'fixture-refresh',
  resource: 'https://cad.onshape.com/api/',
  expiresAt: Date.now() + 3600000,
};
const response = () => ({
  status: 200,
  body: '',
  writeHead(n) {
    this.status = n;
    return this;
  },
  setHeader() {},
  end(s) {
    this.body = s;
    return this;
  },
});

test('REST render uses configured typed target and pinned source even if workspace changes', async () => {
  const bytes = png(),
    calls = [];
  const replies = [
    {id: D},
    [{id: W}],
    [{id: E, elementType: 'PARTSTUDIO'}],
    {sourceMicroversion: M, features: []},
    [{id: E, elementType: 'PARTSTUDIO'}],
    {images: [bytes.toString('base64')]},
  ];
  const result = await new RestClient(
    async () => tokens.accessToken,
    async (url, init) => {
      calls.push({url, init});
      return json(replies.shift());
    },
  ).render(B);
  assert.equal(result.metadata.microversionId, M);
  assert.deepEqual(result.bytes, bytes);
  const final = new URL(calls.at(-1).url);
  assert.equal(final.pathname, `/api/v10/partstudios/d/${D}/m/${M}/e/${E}/shadedviews`);
  assert.equal(final.searchParams.get('outputWidth'), '800');
  assert(calls.every((c) => c.init.method === 'GET' && c.init.redirect === 'error'));
  assert(!JSON.stringify(result.metadata).includes(tokens.accessToken));
  await assert.rejects(
    new RestClient(async () => tokens.accessToken).render({...B, elementId: undefined}),
    /target_missing/,
  );
  let n = 0;
  const wrong = [{id: D}, [{id: W}], [{id: E, elementType: 'DRAWING'}]];
  await assert.rejects(
    new RestClient(
      async () => tokens.accessToken,
      async () => {
        n++;
        return json(wrong.shift());
      },
    ).render(B),
    /target_not_part_studio/,
  );
  assert.equal(n, 3);
});
test('provider PNG accepts observed flat/documented nested shapes and rejects corruption/bombs', () => {
  const bytes = png();
  assert.deepEqual(decodePng({images: [bytes.toString('base64')]}), bytes);
  assert.deepEqual(decodePng({images: [[bytes.toString('base64')]]}), bytes);
  const corrupt = Buffer.from(bytes);
  corrupt[30] ^= 1;
  for (const v of [
    {images: ['invalid']},
    {images: ['YQ==', 'Yg==']},
    {images: [corrupt.toString('base64')]},
    {images: [Buffer.concat([bytes, Buffer.from('tail')]).toString('base64')]},
  ]) {
    assert.throws(() => decodePng(v), /provider_image_invalid/);
  }
  const h = Buffer.alloc(13);
  h.writeUInt32BE(800);
  h.writeUInt32BE(800, 4);
  h[8] = 8;
  const bomb = Buffer.concat([
    bytes.subarray(0, 8),
    chunk('IHDR', h),
    chunk('IDAT', deflateSync(Buffer.alloc(2_000_000))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.throws(() => validatePng(bomb), /provider_image_invalid/);
});
test('private render artifact can cross shared mount only by exact filename, PNG and hash', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'onshape-render-'));
  try {
    const bytes = png(),
      file = await saveRender(root, bytes);
    assert.equal((await lstat(file)).mode & 0o077, 0);
    assert.deepEqual(await readRender(root, file, imageHash(bytes)), bytes);
    await assert.rejects(readRender(root, file, 'a'.repeat(64)), /delegation_denied/);
    await assert.rejects(readRender(root, path.join(root, 'other.png'), imageHash(bytes)), /delegation_denied/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('signed A2A context restores exact authorized binding, not peer identity or prompt claims', () => {
  const c = parseConfig({bindings: [B], delegation: DC}),
    now = Date.now(),
    contextId = mintContext(c.bindings[0], key, now);
  assert.equal(contextId.length, 128);
  assert.match(contextId, /^[A-Za-z0-9._:-]{1,128}$/);
  const ctx = {
    agentId: 'engineer',
    messageChannel: 'a2a',
    requesterSenderId: 'lead',
    agentAccountId: 'default',
    sessionKey: `agent:engineer:a2a:default:direct:lead:${contextId}`,
  };
  assert.equal(verifyContext(c, ctx, key, now).binding.connectionRef, 'owner-rest');
  for (const bad of [
    {...ctx, requesterSenderId: 'owner'},
    {...ctx, agentAccountId: 'other'},
    {...ctx, agentId: 'lead-agent'},
    {...ctx, sessionKey: ctx.sessionKey.slice(0, -1) + (ctx.sessionKey.endsWith('0') ? '1' : '0')},
    {...ctx, messageChannel: 'discord'},
  ]) {
    assert.equal(verifyContext(c, bad, key, now), undefined);
  }
  assert.equal(verifyContext(c, ctx, key, now + 301000), undefined);
  assert.equal(
    verifyContext(parseConfig({bindings: [{...B, elementId: D}], delegation: DC}), ctx, key, now),
    undefined,
  );
  const direct = {...B, agentId: 'lead-agent', deliveryContext: {channel: 'discord', to: B.discordChannelId}};
  assert(leadBinding(c, direct));
  assert(!leadBinding(c, {...direct, deliveryContext: {channel: 'discord', to: '999999999999999999'}}));
  assert(!channelMatches(B, {}));
  const result = {status: 'ok', documentId: D, microversionId: M};
  const proof = signResult(result, contextId, key);
  assert(verifyResult({microversionId: M, documentId: D, status: 'ok'}, contextId, key, proof));
  assert(!verifyResult({...result, microversionId: D}, contextId, key, proof));
  assert(!verifyResult(result, `${contextId}x`, key, proof));
});
test('A2A result signatures cover nested fields and arrays independent of object key order', () => {
  const context = 'fixture-context';
  const result = {
    code: 'connected',
    capabilities: {
      create_candidate_workspace: {
        availability: 'UNAVAILABLE',
        reason: 'agent_policy_denied',
        requiredAction: 'Keep disabled',
        checks: {internalAuthorization: 'FAIL'},
      },
    },
    references: [{id: D, labels: ['first', 'second']}],
  };
  const proof = signResult(result, context, key);
  const reordered = {
    references: [{labels: ['first', 'second'], id: D}],
    capabilities: {
      create_candidate_workspace: {
        checks: {internalAuthorization: 'FAIL'},
        requiredAction: 'Keep disabled',
        reason: 'agent_policy_denied',
        availability: 'UNAVAILABLE',
      },
    },
    code: 'connected',
  };
  assert(verifyResult(reordered, context, key, proof));
  assert(verifyResult(JSON.parse(JSON.stringify(result)), context, key, proof));
  for (const mutate of [
    (r) => {
      r.capabilities.create_candidate_workspace.availability = 'AVAILABLE';
    },
    (r) => {
      r.capabilities.create_candidate_workspace.reason = 'all_known_checks_passed';
    },
    (r) => {
      r.capabilities.create_candidate_workspace.requiredAction = 'Request write access';
    },
    (r) => {
      r.capabilities.create_candidate_workspace.checks.internalAuthorization = 'PASS';
    },
    (r) => {
      r.capabilities.create_candidate_workspace.extra = true;
    },
    (r) => {
      delete r.capabilities.create_candidate_workspace.reason;
    },
    (r) => {
      r.references[0].id = E;
    },
    (r) => {
      r.references[0].labels.reverse();
    },
    (r) => {
      r.references.push({id: E});
    },
  ]) {
    const changed = structuredClone(result);
    mutate(changed);
    assert(!verifyResult(changed, context, key, proof));
  }
  assert(!verifyResult(result, `${context}other`, key, proof));
  assert(!verifyResult(result, context, 'cd'.repeat(32), proof));
  assert(!verifyResult(result, context, key, 'invalid-proof'));
  // Previously valid flat result signatures keep their existing representation.
  const flat = {status: 'ok', documentId: D, microversionId: M};
  const oldProof = createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`${context}\n${JSON.stringify(flat, Object.keys(flat).sort())}`)
    .digest('hex');
  assert(verifyResult({...flat}, context, key, oldProof));
});
test('A2A signing rejects non-JSON fields, cycles, accessors and excessive nesting', () => {
  const cycle = {};
  cycle.self = cycle;
  let deep = {};
  for (let i = 0; i < 34; i++) {
    deep = {nested: deep};
  }
  let getterCalls = 0;
  const getter = Object.defineProperty({}, 'field', {
    enumerable: true,
    get() {
      getterCalls++;
      return 'unsafe';
    },
  });
  const hidden = Object.defineProperty({}, 'field', {value: 'hidden'});
  const sparse = [];
  sparse.length = 1;
  const extraArray = [];
  extraArray.extra = 'unsigned';
  const values = [
    {field: undefined},
    {field: NaN},
    {field: Infinity},
    {field: 1n},
    {field: () => true},
    {field: Symbol('x')},
    new Date(),
    cycle,
    deep,
    getter,
    hidden,
    {[Symbol('key')]: 'value'},
    {field: sparse},
    {field: extraArray},
  ];
  for (const value of values) {
    assert.throws(() => signResult(value, 'context', key), /^Error: delegation_result_invalid$/);
    assert.equal(verifyResult(value, 'context', key, '0'.repeat(64)), false);
  }
  assert.equal(getterCalls, 0);
  assert(
    verifyResult(
      {field: null, items: [false, 0, '']},
      'context',
      key,
      signResult({items: [false, 0, ''], field: null}, 'context', key),
    ),
  );
});
test('native A2A adapter sends compact signed context, polls same task and rejects unsigned results', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'onshape-delegate-'));
  try {
    const keyFile = path.join(root, 'key'),
      transportTokenFile = path.join(root, 'transport');
    await writeFile(keyFile, key, {mode: 0o600});
    await writeFile(transportTokenFile, 'fixture-a2a', {mode: 0o600});
    const c = parseConfig({bindings: [B], delegation: {...DC, keyFile, transportTokenFile}});
    let contextId,
      calls = 0;
    const fetcher = async (url, init) => {
      assert.equal(url, 'http://clawcad-mechanical-engineer:18789/a2a/v1');
      const r = JSON.parse(init.body);
      calls++;
      if (r.method === 'SendMessage') {
        contextId = r.params.message.contextId;
        assert.equal(contextId.length, 128);
        assert(!JSON.stringify(r).includes('fixture-a2a'));
        return json({result: {task: {id: 'task', contextId, status: {state: 'TASK_STATE_WORKING'}}}});
      }
      const details = {status: 'unavailable', code: 'disconnected', message: 'Connect Onshape'};
      return json({
        result: {
          id: 'task',
          contextId,
          status: {state: 'TASK_STATE_COMPLETED'},
          artifacts: [
            {parts: [{text: JSON.stringify({...details, delegationProof: signResult(details, contextId, key)})}]},
          ],
        },
      });
    };
    assert.equal(
      (
        await delegateRender(
          c,
          c.bindings[0],
          () => {},
          fetcher,
          async () => {},
        )
      ).code,
      'disconnected',
    );
    assert.equal(calls, 2);
    await assert.rejects(
      delegateRender(
        c,
        c.bindings[0],
        () => {},
        async (_u, init) => {
          const r = JSON.parse(init.body);
          return json({
            result: {
              id: 'task',
              contextId: r.params.message.contextId,
              status: {state: 'TASK_STATE_COMPLETED'},
              artifacts: [{parts: [{text: '{"status":"ok"}'}]}],
            },
          });
        },
        async () => {},
        () => {},
      ),
      /delegation_result_invalid/,
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('rejected A2A results emit correlated warning audit records without sensitive payloads', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'onshape-audit-'));
  try {
    const keyFile = path.join(root, 'key'),
      transportTokenFile = path.join(root, 'transport');
    const token = 'fixture-transport-DO-NOT-LOG';
    await writeFile(keyFile, key, {mode: 0o600});
    await writeFile(transportTokenFile, token, {mode: 0o600});
    const c = parseConfig({bindings: [B], delegation: {...DC, keyFile, transportTokenFile}});
    const hash = (text) => createHash('sha256').update(text).digest('hex');
    const logs = [];
    let contextId, received;
    const fetcher = (mode) => async (_url, init) => {
      const req = JSON.parse(init.body);
      contextId = req.params.message.contextId;
      const details = {
        status: 'unavailable',
        code: 'connected',
        message: 'payload-DO-NOT-LOG\nFORGED WARNING',
        capabilities: {create_candidate_workspace: {availability: 'UNAVAILABLE', reason: 'agent_policy_denied'}},
      };
      const report = {...details, delegationProof: signResult(details, contextId, key)};
      if (mode === 'tampered') {
        report.capabilities.create_candidate_workspace.availability = 'AVAILABLE';
      }
      if (mode === 'missing') {
        delete report.delegationProof;
      }
      if (mode === 'format') {
        report.delegationProof = 'proof-DO-NOT-LOG';
      }
      received = mode === 'json' ? 'invalid-json-DO-NOT-LOG' : mode === 'object' ? '[]' : JSON.stringify(report);
      return json({
        result: {
          id: 'task-DO-NOT-LOG',
          contextId: mode === 'context' ? 'foreign-context-DO-NOT-LOG' : contextId,
          status: {state: 'TASK_STATE_COMPLETED'},
          artifacts: [{parts: [{text: received}]}],
        },
      });
    };
    for (const [mode, reason] of [
      ['tampered', 'result_signature_mismatch'],
      ['missing', 'missing_result_proof'],
      ['format', 'invalid_result_proof_format'],
      ['json', 'invalid_result_json'],
      ['object', 'invalid_result_object'],
      ['context', 'task_context_mismatch'],
    ]) {
      logs.length = 0;
      await assert.rejects(
        delegateRender(
          c,
          c.bindings[0],
          () => {},
          fetcher(mode),
          async () => {},
          (m) => logs.push(m),
        ),
        mode === 'context' ? /delegation_denied/ : /delegation_result_invalid/,
      );
      assert.equal(logs.length, 1);
      assert.match(logs[0], /^WARNING: Claw-Onshape rejected an unverified A2A result/);
      const event = JSON.parse(logs[0].slice(logs[0].indexOf('{')));
      assert.equal(event.event, 'claw_onshape.a2a_result_rejected');
      assert.equal(event.schemaVersion, 1);
      assert.equal(event.reason, reason);
      assert.equal(event.severity, 'WARNING');
      assert.equal(event.outcome, 'rejected');
      assert.equal(new Date(event.timestamp).toISOString(), event.timestamp);
      assert.match(event.eventId, /^[a-f0-9-]{36}$/);
      assert.match(event.bindingDigest, /^[a-f0-9]{32}$/);
      assert.equal(event.leadAgentId, DC.leadAgentId);
      assert.equal(event.engineerAgentId, DC.engineerAgentId);
      assert.equal(event.contextSha256, hash(contextId));
      if (mode !== 'context') {
        assert.equal(event.taskSha256, hash('task-DO-NOT-LOG'));
        assert.equal(event.receivedResultSha256, hash(received));
      }
      for (const secret of [key, token, contextId, 'DO-NOT-LOG', 'FORGED WARNING', 'delegationProof']) {
        assert(!logs[0].includes(secret));
      }
      assert(!logs[0].includes('\n'));
    }
    logs.length = 0;
    await delegateRender(
      c,
      c.bindings[0],
      () => {},
      fetcher('valid'),
      async () => {},
      (m) => logs.push(m),
    );
    assert.equal(logs.length, 0);
    const originalWarn = console.warn;
    console.warn = (m) => logs.push(m);
    try {
      await assert.rejects(
        delegateRender(
          c,
          c.bindings[0],
          () => {},
          fetcher('tampered'),
          async () => {},
          () => {
            throw new Error('logger-error-DO-NOT-LOG');
          },
        ),
        /delegation_result_invalid/,
      );
      assert.equal(logs.length, 1);
      assert(!logs[0].includes('DO-NOT-LOG'));
    } finally {
      console.warn = originalWarn;
    }
    logs.length = 0;
    // Exercise actual plugin logger wiring through the Lead tool, not only the callback.
    const factories = [];
    plugin.register({
      logger: {warn: (m) => logs.push(m)},
      pluginConfig: c,
      registerTool: (f) => factories.push(f.create ?? f),
      registerCli: () => {},
      session: {controls: {registerSessionAction: () => {}}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {
        state: {resolveStateDir: () => root},
        config: {current: () => ({plugins: {entries: {'claw-onshape': {enabled: true, config: c}}}})},
      },
    });
    const ctx = {
      agentId: DC.leadAgentId,
      requesterSenderId: B.requesterSenderId,
      messageChannel: B.messageChannel,
      agentAccountId: B.agentAccountId,
      deliveryContext: {channel: 'discord', to: B.discordChannelId},
    };
    const tool = factories.map((f) => f(ctx)).find((t) => t?.name === 'onshape_delegate_render');
    assert(tool);
    const previous = globalThis.fetch;
    globalThis.fetch = fetcher('tampered');
    try {
      const result = await tool.execute('audit-test', {});
      assert.equal(result.isError, true);
      assert.equal(result.details.code, 'delegation_result_invalid');
      assert.equal(logs.length, 1);
      assert(logs[0].includes('result_signature_mismatch'));
    } finally {
      globalThis.fetch = previous;
    }
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('dashboard consent shares private store, enforces state/origin and updates readiness', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'onshape-dashboard-'));
  try {
    const secretFile = path.join(root, 'app');
    await writeFile(secretFile, 'fixture-client-secret', {mode: 0o600});
    let c = parseConfig({
        bindings: [B],
        engineerAgentId: B.agentId,
        liveReads: true,
        oauth: {
          clientId: 'fixture-client',
          clientSecretFile: secretFile,
          dashboardRedirectUri: 'http://localhost:19489/plugins/claw-onshape/oauth/callback',
          applicationPermissions: {
            canWriteDocuments: true,
            canDeleteDocumentsAndWorkspaces: false,
            canShareAndUnshareDocuments: false,
            canRequestPurchases: false,
            canReadProfileInformation: false,
          },
        },
      }),
      exchanges = 0;
    const lifecycle = connectionLifecycle(
      () => c,
      () => root,
      () => ['http://localhost:19489'],
      async (_u, init) => {
        exchanges++;
        assert.equal(init.body.get('redirect_uri'), c.oauth.dashboardRedirectUri);
        return json({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'OAuth2Read OAuth2Write',
        });
      },
    );
    assert.equal((await lifecycle.status('owner-rest')).code, 'disconnected');
    const start = await lifecycle.start('owner-rest', {requestRestWriteAccess: true});
    assert.equal((await lifecycle.status('owner-rest')).code, 'authorization_in_progress');
    assert.equal(new URL(start.authorizationUrl).searchParams.get('scope'), 'OAuth2Read OAuth2Write');
    await assert.rejects(lifecycle.disconnect('owner-rest'), /connection_busy/);
    const wrong = response();
    await lifecycle.callback(
      {
        method: 'GET',
        url: '/plugins/claw-onshape/oauth/callback?state=forged&code=fixture',
        headers: {host: 'localhost:19489'},
      },
      wrong,
    );
    assert.equal(wrong.status, 400);
    assert.equal(exchanges, 0);
    const u = new URL(start.authorizationUrl),
      url =
        '/plugins/claw-onshape/oauth/callback?' +
        new URLSearchParams({state: u.searchParams.get('state'), code: 'fixture-code'});
    const r = response();
    await lifecycle.callback({method: 'GET', url, headers: {host: 'localhost:19489'}}, r);
    await delay();
    assert.equal(r.status, 200);
    assert.equal(exchanges, 1);
    assert.equal((await lifecycle.status('owner-rest')).code, 'connected');
    assert((await credentials(root, 'owner-rest', connectionOwner(B))).read().scopes.includes('OAuth2Write'));
    const readiness = await lifecycle.status('owner-rest');
    assert.equal(readiness.capabilities.read_document.availability, 'UNKNOWN');
    assert.equal(readiness.capabilities.create_candidate_workspace.reason, 'agent_policy_denied');
    assert.equal(readiness.capabilities.delete_workspace.reason, 'app_permission_delete_disabled');
    const replay = response();
    await lifecycle.callback({method: 'GET', url, headers: {host: 'localhost:19489'}}, replay);
    assert.equal(replay.status, 400);
    assert.equal(exchanges, 1);
    await lifecycle.disconnect('owner-rest');
    assert.equal((await lifecycle.status('owner-rest')).code, 'disconnected');
    assert(!JSON.stringify(start).includes('fixture-client-secret'));
    const denied = connectionLifecycle(
      () => c,
      () => root,
      () => [],
      async () => {
        throw Error('unexpected');
      },
    );
    await assert.rejects(denied.start('owner-rest'), /dashboard_callback_required/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('revocation or lifecycle cancellation during OAuth never persists late tokens and drains lock', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'onshape-cancel-'));
  try {
    const file = path.join(root, 'app');
    await writeFile(file, 'fixture-secret', {mode: 0o600});
    const c = parseConfig({
      bindings: [B],
      oauth: {
        clientId: 'fixture',
        clientSecretFile: file,
        dashboardRedirectUri: 'http://localhost:19489/plugins/claw-onshape/oauth/callback',
      },
    });
    let exchangeResolve;
    const fetcher = () =>
      new Promise((r) => {
        exchangeResolve = r;
      });
    const lifecycle = connectionLifecycle(
      () => c,
      () => root,
      () => ['http://localhost:19489'],
      fetcher,
    );
    const started = await lifecycle.start('owner-rest'),
      u = new URL(started.authorizationUrl),
      r = response();
    const callback = lifecycle.callback(
      {
        method: 'GET',
        url:
          '/plugins/claw-onshape/oauth/callback?' +
          new URLSearchParams({state: u.searchParams.get('state'), code: 'fixture'}),
        headers: {host: 'localhost:19489'},
      },
      r,
    );
    await delay();
    void lifecycle.cancel();
    await assert.rejects(lifecycle.disconnect('owner-rest'), /connection_busy/);
    exchangeResolve(
      json({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    );
    await callback;
    await delay();
    assert.equal(r.status, 400);
    const store = await credentials(root, 'owner-rest', connectionOwner(B));
    assert.equal(store.status(), 'disconnected');
    assert.equal((await lifecycle.status('owner-rest')).code, 'oauth_connect_expired');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('dashboard actions require actual operator admin authority and expose no config secrets', async () => {
  const actions = [],
    routes = [];
  const c = parseConfig({bindings: []});
  registerDashboard(
    {
      session: {controls: {registerSessionAction: (a) => actions.push(a)}},
      registerHttpRoute: (r) => routes.push(r),
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {state: {resolveStateDir: () => '/tmp'}, config: {current: () => ({})}},
    },
    () => c,
  );
  const result = await actions
    .find((a) => a.id === 'connect')
    .handler({payload: {}, client: {scopes: ['operator.write']}});
  assert.equal(result.result.code, 'authorization_changed');
  const status = await actions
    .find((a) => a.id === 'status')
    .handler({payload: {}, client: {scopes: ['operator.read']}});
  assert.equal(status.result.code, 'not_configured');
  assert.deepEqual(status.result.connections, []);
  assert.equal(routes[0].path, '/plugins/claw-onshape/oauth/callback');
  assert.equal(routes[0].auth, 'plugin');
});
test('read/render optional tools preserve Engineer/Lead isolation and unconfigured guidance', () => {
  const factories = [];
  const c = parseConfig({bindings: [], engineerAgentId: 'engineer'});
  plugin.register({
    pluginConfig: c,
    registerTool: (f) => factories.push(f.create ?? f),
    registerCli: () => {},
    session: {controls: {registerSessionAction: () => {}}},
    registerHttpRoute: () => {},
    lifecycle: {registerRuntimeLifecycle: () => {}},
    runtime: {
      state: {resolveStateDir: () => '/tmp'},
      config: {current: () => ({plugins: {entries: {'claw-onshape': {enabled: true, config: c}}}})},
    },
  });
  assert.deepEqual(
    factories
      .map((f) => f({agentId: 'engineer'}))
      .filter(Boolean)
      .map((t) => t.name),
    ['onshape_status'],
  );
  assert(factories.every((f) => !f({agentId: 'lead-agent'})));
});

test('operator provisioning writes a private secret once and refuses replacement or unsafe input', async () => {
  const {provisionSecret} = await import('../scripts/provision-oauth-secret.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'clawonshape-provision-'));
  const file = path.join(dir, 'client-secret');
  try {
    await provisionSecret('fixture-only', file);
    assert.equal((await lstat(file)).mode & 0o777, 0o600);
    await assert.rejects(provisionSecret('replacement-fixture', file), /EEXIST/);
    await assert.rejects(provisionSecret('invalid input', path.join(dir, 'other-secret')), /Invalid secret/);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('expired connection refreshes once under private lock and fails closed on uncertain exchange', async () => {
  const {accessToken} = await import('../dist/authorization.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'onshape-refresh-'));
  try {
    const secretFile = path.join(dir, 'client-secret');
    await writeFile(secretFile, 'fixture-secret', {mode: 0o600});
    const store = await credentials(dir, 'owner-rest', connectionOwner(B));
    const expired = {...tokens, expiresAt: Date.now() - 1000};
    await store.save(expired);
    let calls = 0;
    const oauth = {clientId: 'public-fixture', clientSecretFile: secretFile};
    const fetcher = async (url, init) => {
      calls++;
      assert.equal(url, 'https://oauth.onshape.com/oauth/token');
      assert.equal(init.body.get('grant_type'), 'refresh_token');
      assert.equal(init.body.get('refresh_token'), tokens.refreshToken);
      assert.equal(store.status(), 'disconnected');
      return json({
        access_token: 'renewed-access',
        refresh_token: 'rotated-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'OAuth2Read',
      });
    };
    assert.equal(await accessToken(store, oauth, () => {}, fetcher), 'renewed-access');
    assert.equal(await accessToken(store, oauth, () => {}, fetcher), 'renewed-access');
    assert.equal(calls, 1);
    assert.equal(store.read().refreshToken, 'rotated-refresh');
    await store.save(expired);
    await assert.rejects(
      accessToken(
        store,
        oauth,
        () => {},
        async () => {
          throw new Error('sensitive-provider-response');
        },
      ),
      /reconnect_required/,
    );
    assert.equal(store.status(), 'disconnected');
    await assert.rejects(
      accessToken(store, oauth, () => {}, fetcher),
      /reconnect_required/,
    );
    assert.equal(calls, 1);
    await store.save(expired);
    await assert.rejects(
      accessToken(
        store,
        oauth,
        () => {
          throw new Error('authorization_changed');
        },
        fetcher,
      ),
      /authorization_changed/,
    );
    assert.equal(store.status(), 'expired');
    await assert.rejects(
      accessToken(
        store,
        oauth,
        () => {},
        async () => new Response('{}', {status: 401, headers: {'Content-Type': 'application/json'}}),
      ),
      /oauth_refresh_rejected/,
    );
    assert.equal(store.status(), 'disconnected');
    await store.save(expired);
    await assert.rejects(
      accessToken(
        store,
        oauth,
        () => {},
        async () => json({access_token: 'sensitive-incomplete'}),
      ),
      /oauth_refresh_response_invalid/,
    );
    assert.equal(store.status(), 'disconnected');
    await store.save({...expired, scopes: ['OAuth2Read', 'OAuth2Write']});
    await assert.rejects(
      accessToken(
        store,
        oauth,
        () => {},
        async () =>
          json({
            access_token: 'renewed-access',
            refresh_token: 'rotated-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: 'OAuth2Read',
          }),
      ),
      /oauth_refresh_response_invalid/,
    );
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
test('delegated render failures and status preserve signed JSON through text-only host transport', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'onshape-error-proof-'));
  try {
    const keyFile = path.join(dir, 'key');
    await writeFile(keyFile, key, {mode: 0o600});
    const c = parseConfig({bindings: [B], liveReads: true, delegation: {...DC, keyFile}}),
      contextId = mintContext(c.bindings[0], key);
    const ctx = {
      agentId: 'engineer',
      messageChannel: 'a2a',
      requesterSenderId: 'lead',
      agentAccountId: 'default',
      sessionKey: `agent:engineer:a2a:default:direct:lead:${contextId}`,
      workspaceDir: dir,
    };
    const factories = [];
    plugin.register({
      pluginConfig: c,
      registerTool: (f) => factories.push(f.create ?? f),
      registerCli: () => {},
      session: {controls: {registerSessionAction: () => {}}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {
        state: {resolveStateDir: () => dir},
        config: {current: () => ({plugins: {entries: {'claw-onshape': {enabled: true, config: c}}}})},
      },
    });
    for (const name of ['onshape_render', 'onshape_status']) {
      const tool = factories.map((f) => f(ctx)).find((t) => t?.name === name);
      const result = await tool.execute('test', {});
      const report = JSON.parse(result.content[0].text);
      assert.deepEqual(report, result.details);
      const {delegationProof, ...details} = report;
      assert(verifyResult(details, contextId, key, delegationProof));
      assert.notEqual(details.code, 'delegation_denied');
      assert(!result.content[0].text.includes('fixture-secret'));
    }
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
