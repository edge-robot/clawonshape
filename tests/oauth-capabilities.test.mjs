import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {existsSync, readdirSync} from 'node:fs';
import {parseConfig, connectionOwner} from '../dist/config.js';
import {credentials} from '../dist/credentials.js';
import {candidateAuthorization} from '../dist/candidate-authorization.js';
import {RestClient} from '../dist/rest.js';
import {Consent, parseTokens} from '../dist/oauth.js';
import {accessToken} from '../dist/authorization.js';
import {assessCapabilities, capabilitySummary} from '../dist/capabilities.js';
import {connectionLifecycle} from '../dist/connections.js';
import {registerDashboard} from '../dist/dashboard.js';

const manifestText = await readFile(new URL('../openclaw.plugin.json', import.meta.url), 'utf8');
const D = 'a'.repeat(24),
  P = 'b'.repeat(24),
  W = 'c'.repeat(24),
  E = 'd'.repeat(24),
  M = 'e'.repeat(24),
  C = 'f'.repeat(24);
const B = {
  agentId: 'engineer',
  requesterSenderId: 'owner',
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
  documentId: D,
  primaryWorkspaceId: P,
  workspaceId: W,
  elementId: E,
};
const R = 'OAuth2Read',
  RW = [R, 'OAuth2Write'];
const base = {
  bindings: [B],
  engineerAgentId: B.agentId,
  liveReads: true,
  oauth: {clientId: 'fixture', clientSecretFile: '/private/fixture', applicationPermissions: {canWriteDocuments: true}},
};
const grant = {
  accessToken: 'access-DO-NOT-EXPOSE',
  refreshToken: 'refresh-DO-NOT-EXPOSE',
  expiresAt: Date.now() + 3600000,
  resource: 'https://cad.onshape.com/api/',
  scopes: RW,
};
const json = (value) => new Response(JSON.stringify(value), {headers: {'Content-Type': 'application/json'}});
const root = await mkdtemp(path.join(tmpdir(), 'onshape-capabilities-'));
test.after(() => rm(root, {recursive: true, force: true}));
async function fixture(options = {}) {
  const stateDir = await mkdtemp(path.join(root, 'state-')),
    store = await credentials(stateDir, B.connectionRef, connectionOwner(B));
  await store.save({...grant, scopes: options.scopes ?? RW});
  let config = parseConfig(options.config ?? base),
    calls = [],
    warnings = [];
  const authority = candidateAuthorization(
    () => config,
    options.identity ?? B,
    stateDir,
    options.consent ?? (() => {}),
  );
  const fetcher = async (url, init) => {
    calls.push({path: new URL(url).pathname, method: init.method});
    if (options.onFetch) {
      await options.onFetch(calls.at(-1), {
        store,
        setConfig: (v) => {
          config = v;
        },
      });
    }
    if (init.method === 'POST') {
      return json({id: C, documentId: D});
    }
    const p = new URL(url).pathname;
    if (p.endsWith('/currentmicroversion')) {
      return json({microversion: M});
    }
    if (p.endsWith('/features')) {
      return json({sourceMicroversion: M, features: []});
    }
    if (p.endsWith('/elements')) {
      return json([{id: E, elementType: 'PARTSTUDIO'}]);
    }
    if (p.endsWith('/workspaces')) {
      return json([
        {id: W, documentId: D},
        {id: P, documentId: D},
        {id: C, documentId: D},
      ]);
    }
    return json({id: D});
  };
  const client = new RestClient(options.token ?? (async () => grant.accessToken), fetcher, {
    stateDir,
    authorization: options.forged ? {} : authority,
    warn: (m) => warnings.push(m),
  });
  return {
    stateDir,
    store,
    client,
    calls,
    warnings,
    fetcher,
    setConfig: (v) => {
      config = v;
    },
  };
}
const prepare = (f, input = {}) => f.client.prepareCandidateWorkspace(B, {sourceMicroversionId: M, ...input});

test('dashboard administrator can prepare a Candidate for a Discord-channel-bound target without impersonating an agent', async () => {
  const config = parseConfig({...base, bindings: [{...B, workspaceId: P, discordChannelId: '123456789012345678'}]});
  const f = await fixture({config}),
    actions = [],
    originalFetch = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  try {
    registerDashboard(
      {
        session: {controls: {registerSessionAction: (a) => actions.push(a)}},
        registerHttpRoute: () => {},
        lifecycle: {registerRuntimeLifecycle: () => {}},
        runtime: {state: {resolveStateDir: () => f.stateDir}, config: {current: () => ({})}},
      },
      () => config,
    );
    const handler = actions.find((a) => a.id === 'candidate-prepare').handler;
    const denied = await handler({payload: {connectionRef: B.connectionRef}, client: {scopes: ['operator.read']}});
    assert.equal(denied.result.code, 'authorization_changed');
    assert.equal(f.calls.length, 0);
    const result = await handler({payload: {connectionRef: B.connectionRef}, client: {scopes: ['operator.admin']}});
    assert.equal(result.result.status, 'ok', JSON.stringify(result));
    assert.equal(result.result.references.candidateWorkspaceId, C);
    assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
    const again = await handler({payload: {connectionRef: B.connectionRef}, client: {scopes: ['operator.admin']}});
    assert.equal(again.result.status, 'ok');
    assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('candidate authorization uses actual grants, application attestations and explicit host consent', async () => {
  for (const [options, reason, availability] of [
    [{scopes: [R]}, 'oauth_write_scope_missing', 'UNAVAILABLE'],
    [
      {config: {...base, oauth: {...base.oauth, applicationPermissions: {canWriteDocuments: false}}}},
      'app_permission_write_disabled',
      'UNAVAILABLE',
    ],
    [
      {config: {...base, oauth: {...base.oauth, applicationPermissions: {}}}},
      'app_permission_write_unknown',
      'UNKNOWN',
    ],
    [
      {
        consent: () => {
          throw new Error('consent-DO-NOT-EXPOSE');
        },
      },
      'agent_policy_denied',
      'UNAVAILABLE',
    ],
    [{identity: {...B, requesterSenderId: 'intruder'}}, 'agent_policy_denied', 'UNAVAILABLE'],
    [{identity: {...B, agentId: 'lead'}}, 'agent_policy_denied', 'UNAVAILABLE'],
    [
      {identity: {...B, messageChannel: 'a2a', sessionKey: 'claimed-read-context'}},
      'agent_policy_denied',
      'UNAVAILABLE',
    ],
    [{forged: true}, 'agent_policy_denied', 'UNAVAILABLE'],
  ]) {
    const f = await fixture(options),
      result = await prepare(f);
    assert.equal(result.reason, reason);
    assert.equal(result.availability, availability);
    assert.equal(f.calls.length, 0);
    assert(f.warnings.length);
    for (const line of f.warnings) {
      assert.match(line, /^WARNING: /);
      assert(line.includes('candidate_authorization_rejected'));
      assert(!line.includes('DO-NOT-EXPOSE'));
      assert(!line.includes('\n'));
    }
    assert(!JSON.stringify(result).includes('DO-NOT-EXPOSE'));
  }
});

test('agent-supplied authorization and target overrides cannot impersonate host policy', async () => {
  for (const input of [
    {restWriteAuthorized: true},
    {authorization: {oauthWriteScope: true, applicationWritePermission: 'enabled', internalAuthorization: true}},
    {documentId: D},
    {workspaceId: W},
  ]) {
    const f = await fixture();
    await assert.rejects(prepare(f, input), /^Error: invalid_arguments$/);
    assert.equal(f.calls.length, 0);
    assert(f.warnings.some((m) => m.includes('invalid_arguments')));
  }
  const f = await fixture();
  const result = await f.client.prepareCandidateWorkspace(
    {...B, documentId: '9'.repeat(24)},
    {sourceMicroversionId: M},
  );
  assert.equal(result.reason, 'authorization_changed');
  assert.equal(f.calls.length, 0);
});

test('candidate authorization survives semantic config/binding reordering through POST dispatch', async () => {
  const f = await fixture({
    onFetch: async (_call, {setConfig}) => {
      const reverse = (value) => Object.fromEntries(Object.entries(value).reverse());
      setConfig(
        parseConfig({
          ...reverse(base),
          bindings: [reverse(B)],
          oauth: {...reverse(base.oauth), applicationPermissions: reverse(base.oauth.applicationPermissions)},
        }),
      );
    },
  });
  const result = await f.client.prepareCandidateWorkspace(Object.fromEntries(Object.entries(B).reverse()), {
    sourceMicroversionId: M,
  });
  assert.equal(result.status, 'ok');
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
});

test('revoked configuration, scopes, invocation authority and changed tokens prevent candidate POST', async () => {
  for (const change of ['config', 'scope', 'disconnect']) {
    const f = await fixture({
      onFetch: async (call, {store, setConfig}) => {
        if (call.path === `/api/v10/documents/d/${D}/w/${W}/currentmicroversion`) {
          if (change === 'config') {
            setConfig(parseConfig({...base, liveReads: false}));
          } else {
            await store.save(change === 'scope' ? {...grant, scopes: [R]} : null);
          }
        }
      },
    });
    await assert.rejects(prepare(f), /authorization_changed|oauth_write_scope_missing|reconnect_required/);
    assert.equal(f.calls.filter((c) => c.method === 'POST').length, 0);
    assert.deepEqual(await readdir(path.join(f.stateDir, 'claw-onshape-candidate-attempts')), []);
  }
  const token = await fixture({token: async () => 'different-DO-NOT-EXPOSE'});
  await assert.rejects(prepare(token), /authorization_changed/);
  assert.equal(token.calls.length, 0);
  let revoked = false;
  const identity = {
    ...B,
    assertInvocationCurrent: () => {
      if (revoked) {
        throw new Error('untrusted');
      }
    },
  };
  const invocation = await fixture({
    identity,
    onFetch: async (call) => {
      if (call.path.endsWith('/features')) {
        revoked = true;
      }
    },
  });
  await assert.rejects(prepare(invocation), /authorization_changed/);
  assert.equal(invocation.calls.filter((c) => c.method === 'POST').length, 0);
});

test('consent is rechecked after persisting the dispatch receipt', async () => {
  let f,
    denied = false;
  f = await fixture({
    consent: () => {
      const dir = f && path.join(f.stateDir, 'claw-onshape-candidate-attempts');
      if (!denied && dir && existsSync(dir) && readdirSync(dir).some((p) => p.endsWith('.json'))) {
        denied = true;
        throw new Error('revoked');
      }
    },
  });
  await assert.rejects(prepare(f), /agent_policy_denied/);
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 0);
  const files = await readdir(path.join(f.stateDir, 'claw-onshape-candidate-attempts'));
  assert.equal(files.length, 1);
  // Even a pre-dispatch crash/denial cannot cause an automatic second POST.
  const blocked = await prepare(f);
  assert.equal(blocked.status, 'unknown');
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 0);
});

test('read-only reconciliation requires trusted identity but no write consent or write scope', async () => {
  const f = await fixture();
  const created = await prepare(f);
  assert.equal(created.status, 'ok');
  await f.store.save({...grant, scopes: [R]});
  const before = f.calls.length;
  const result = await f.client.reconcileCandidateWorkspace(B, created.attemptId);
  assert.equal(result.status, 'ok');
  assert(f.calls.slice(before).every((c) => c.method === 'GET'));
});

test('capability checks preserve unknown settings, operation-specific evidence and disabled agent policies', () => {
  const config = parseConfig(base),
    input = {config, binding: config.bindings[0], connected: true, grantedScopes: RW};
  let matrix = assessCapabilities(input);
  assert.equal(matrix.read_document.availability, 'UNKNOWN');
  assert.equal(matrix.read_document.checks.applicationPermission, 'UNKNOWN');
  assert.equal(matrix.create_candidate_workspace.availability, 'UNAVAILABLE');
  assert.equal(matrix.create_candidate_workspace.reason, 'agent_policy_denied');
  assert.equal(matrix.delete_workspace.checks.applicationPermission, 'UNKNOWN');
  assert.equal(matrix.delete_workspace.checks.oauthScope, 'FAIL');
  matrix = assessCapabilities({...input, verifiedReadOperations: ['read_document']});
  assert.equal(matrix.read_document.availability, 'AVAILABLE');
  assert.equal(matrix.inspect_workspace.availability, 'UNKNOWN');
  assert.equal(matrix.render_part_studio.availability, 'UNKNOWN');
  const all = ['OAuth2Read', 'OAuth2Write', 'OAuth2Delete', 'OAuth2Share', 'OAuth2ReadPII', 'OAuth2Purchase'];
  const disabled = parseConfig({
    ...base,
    oauth: {
      ...base.oauth,
      applicationPermissions: {
        canDeleteDocumentsAndWorkspaces: false,
        canRequestPurchases: false,
        canShareAndUnshareDocuments: false,
        canReadProfileInformation: false,
      },
    },
  });
  matrix = assessCapabilities({...input, config: disabled, grantedScopes: all});
  for (const op of ['delete_workspace', 'request_purchases', 'share_unshare_document', 'read_user_profile']) {
    assert.equal(matrix[op].availability, 'UNAVAILABLE');
    assert.equal(matrix[op].checks.applicationPermission, 'FAIL');
    assert.equal(matrix[op].checks.oauthScope, 'PASS');
  }
  assert.equal(matrix.execute_mcp_cad_mutation.availability, 'UNAVAILABLE');
  assert.equal(matrix.execute_mcp_cad_mutation.checks.oauthScope, 'UNKNOWN');
  assert.equal(
    assessCapabilities({...input, connected: false, verifiedReadOperations: ['read_document']}).read_document
      .availability,
    'UNAVAILABLE',
  );
  assert.equal(assessCapabilities({...input, grantedScopes: undefined}).read_document.checks.oauthScope, 'UNKNOWN');
  assert.equal(
    assessCapabilities({...input, binding: {...B, agentId: 'lead'}}).read_document.availability,
    'UNAVAILABLE',
  );
  const noElement = parseConfig({...base, bindings: [{...B, elementId: undefined}]});
  assert.equal(
    assessCapabilities({...input, config: noElement, binding: noElement.bindings[0]}).render_part_studio.reason,
    'target_missing',
  );
  const summary = capabilitySummary(input);
  assert(Buffer.byteLength(JSON.stringify(summary)) <= 2048);
  assert(!JSON.stringify(summary).includes('checks'));
  for (const flag of [undefined, false, true]) {
    for (const connected of [false, true]) {
      for (const grantedScopes of [undefined, [], [R], all]) {
        const permissions = Object.fromEntries(
          [
            'canReadDocuments',
            'canWriteDocuments',
            'canDeleteDocumentsAndWorkspaces',
            'canRequestPurchases',
            'canShareAndUnshareDocuments',
            'canReadProfileInformation',
          ]
            .filter(() => flag !== undefined)
            .map((k) => [k, flag]),
        );
        const c = parseConfig({...base, oauth: {...base.oauth, applicationPermissions: permissions}});
        assert(
          Buffer.byteLength(JSON.stringify(capabilitySummary({...input, config: c, connected, grantedScopes}))) <= 2048,
        );
      }
    }
  }
  const manifest = JSON.parse(manifestText);
  assert.deepEqual(
    Object.keys(manifest.configSchema.properties.oauth.properties.applicationPermissions.properties).sort(),
    [
      'canReadDocuments',
      'canWriteDocuments',
      'canDeleteDocumentsAndWorkspaces',
      'canRequestPurchases',
      'canShareAndUnshareDocuments',
      'canReadProfileInformation',
    ].sort(),
  );
});

test('known read permission or scope denial fails before refresh or REST access', async () => {
  const f = await fixture();
  const fetcher = async () => assert.fail('no token exchange');
  await assert.rejects(
    accessToken(f.store, {...base.oauth, applicationPermissions: {canReadDocuments: false}}, () => {}, fetcher),
    /app_permission_read_disabled/,
  );
  await f.store.save({...grant, scopes: ['OAuth2Write']});
  await assert.rejects(
    accessToken(f.store, base.oauth, () => {}, fetcher),
    /oauth_read_scope_missing/,
  );
  await f.store.save({...grant, scopes: ['OAuth2Write'], expiresAt: Date.now() - 1});
  await assert.rejects(
    accessToken(f.store, base.oauth, () => {}, fetcher),
    /oauth_read_scope_missing/,
  );
});

test('write consent requires application confirmation before starting a connection exchange', async () => {
  for (const permission of [false, undefined]) {
    const f = await fixture(),
      secret = path.join(f.stateDir, 'secret');
    await writeFile(secret, 'fixture-secret', {mode: 0o600});
    const config = parseConfig({
      ...base,
      oauth: {
        ...base.oauth,
        clientSecretFile: secret,
        dashboardRedirectUri: 'http://localhost:19489/plugins/claw-onshape/oauth/callback',
        applicationPermissions: permission === undefined ? {} : {canWriteDocuments: permission},
      },
    });
    const lifecycle = connectionLifecycle(
      () => config,
      () => f.stateDir,
      () => ['http://localhost:19489'],
      async () => assert.fail('no exchange'),
    );
    await assert.rejects(
      lifecycle.start(B.connectionRef, {requestRestWriteAccess: true}),
      new RegExp(permission === false ? 'app_permission_write_disabled' : 'app_permission_write_unknown'),
    );
    assert.equal(f.store.status(), 'connected');
    assert.equal((await lifecycle.status(B.connectionRef)).code, 'connected');
    await lifecycle.cancel();
  }
});

test('token scopes cannot be fabricated by standalone parsing, refreshed upward or normalized from malformed records', async () => {
  const response = {
    access_token: grant.accessToken,
    refresh_token: grant.refreshToken,
    expires_in: 3600,
    token_type: 'Bearer',
  };
  assert.throws(() => parseTokens(response), /oauth_response_invalid/);
  assert.throws(() => parseTokens({...response, scope: RW.join(' ')}), /oauth_response_invalid/);
  assert.deepEqual(parseTokens(response, Date.now(), RW, 'consent').scopes, RW);
  assert.deepEqual(parseTokens(response, Date.now(), [R], 'refresh').scopes, [R]);
  for (const scope of ['', null, {}, 'OAuth2Unknown', 'OAuth2Read OAuth2Share']) {
    assert.throws(() => parseTokens({...response, scope}), /oauth_response_invalid/);
  }
  const consent = new Consent('fixture', 'fixture-secret', async () => json(response), Date.now, undefined, RW);
  const u = new URL(consent.authorizationUrl());
  const tokens = await consent.complete(
    '/?' + new URLSearchParams({state: u.searchParams.get('state'), code: 'fixture'}),
    'localhost:8765',
  );
  assert.deepEqual(tokens.scopes, RW);
  for (const scopes of [[], null, 'OAuth2Read', ['OAuth2Unknown'], Array(33).fill(R)]) {
    const f = await fixture();
    await f.store.save({...grant, scopes});
    assert.equal(f.store.status(), 'unavailable');
    assert.throws(() => f.store.read(true), /reconnect_required/);
  }
  const f = await fixture();
  await f.store.save({...grant, scopes: undefined});
  assert.deepEqual(f.store.read().scopes, [R]);
  assert.equal((await prepare(f)).reason, 'oauth_write_scope_missing');
  const secret = path.join(f.stateDir, 'secret');
  await writeFile(secret, 'fixture-secret', {mode: 0o600});
  await f.store.save({...grant, expiresAt: Date.now() - 1, scopes: [R]});
  await assert.rejects(
    accessToken(
      f.store,
      {...base.oauth, clientSecretFile: secret},
      () => {},
      async () => json({...response, scope: RW.join(' ')}),
    ),
    /oauth_refresh_response_invalid/,
  );
  assert.equal(f.store.status(), 'disconnected');
  await f.store.save({...grant, expiresAt: Date.now() - 1, scopes: RW});
  await accessToken(
    f.store,
    {...base.oauth, clientSecretFile: secret},
    () => {},
    async () => json(response),
  );
  assert.deepEqual(f.store.read().scopes, RW);
});
