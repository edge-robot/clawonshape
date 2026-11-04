import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {registerDashboard, DASHBOARD_PNG_MAX_BYTES} from '../dist/dashboard.js';
import {parseConfig, connectionOwner} from '../dist/config.js';
import {credentials} from '../dist/credentials.js';
import {RestClient, validatedDisplayNames} from '../dist/rest.js';
import {imageHash} from '../dist/render.js';
import {pngFixture} from './fixtures/png.mjs';
import {target} from './fixtures/cockpit.mjs';
const binding = {
  ...target,
  agentId: 'engineer',
  requesterSenderId: 'owner',
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
};
const tokens = {
  accessToken: 'fixture-access',
  refreshToken: 'fixture-refresh',
  expiresAt: Date.now() + 3600000,
  resource: 'https://cad.onshape.com/api/',
  scopes: ['OAuth2Read'],
};
const M = '1'.repeat(24);
async function harness(run, actionId = 'render') {
  const root = await mkdtemp(path.join(tmpdir(), 'cockpit-render-'));
  const originalFetch = globalThis.fetch;
  try {
    let config = parseConfig({bindings: [binding], liveReads: true});
    const store = await credentials(root, binding.connectionRef, connectionOwner(binding));
    await store.save(tokens);
    const actions = [];
    registerDashboard(
      {
        session: {controls: {registerSessionAction: (a) => actions.push(a)}},
        registerHttpRoute() {},
        lifecycle: {registerRuntimeLifecycle() {}},
        runtime: {state: {resolveStateDir: () => root}, config: {current: () => ({})}},
      },
      () => config,
    );
    const action = actions.find((a) => a.id === actionId);
    const call = (payload = {}, scopes = ['operator.read']) => action.handler({payload, client: {scopes}});
    await run({
      call,
      store,
      action,
      setConfig(c) {
        config = parseConfig(c);
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, {recursive: true, force: true});
  }
}
test('dashboard render is exact-binding GET-only, validated PNG and pinned metadata without secrets or paths', async () => {
  await harness(async ({call, action}) => {
    const bytes = pngFixture(),
      calls = [];
    const responses = [
      {id: target.documentId, name: ' Document '},
      [
        {id: '9'.repeat(24), name: 'Foreign'},
        {id: target.primaryWorkspaceId, name: 'Main'},
        {id: target.workspaceId, name: 'Candidate A'},
      ],
      [{id: target.elementId, elementType: 'PARTSTUDIO', name: 'Unpinned name'}],
      {sourceMicroversion: M, features: []},
      [
        {id: '8'.repeat(24), elementType: 'PARTSTUDIO', name: 'Wrong element'},
        {id: target.elementId, elementType: 'PARTSTUDIO', name: '<b>Pinned studio</b>'},
      ],
      {images: [bytes.toString('base64')]},
    ];
    globalThis.fetch = async (url, init) => {
      calls.push([url, init.method]);
      return new Response(JSON.stringify(responses.shift()), {headers: {'Content-Type': 'application/json'}});
    };
    const result = (await call()).result;
    assert.equal(result.status, 'ok');
    assert.equal(calls.length, 6, 'display names must reuse existing reads');
    assert.equal(result.documentName, 'Document');
    assert.equal(result.workspaceName, 'Candidate A');
    assert.equal(result.primaryWorkspaceName, 'Main');
    assert.equal(result.elementName, '<b>Pinned studio</b>');
    assert.equal(result.microversionId, M);
    assert.equal(
      result.revisionUrl,
      `https://cad.onshape.com/documents/${target.documentId}/w/${target.workspaceId}/m/${M}/e/${target.elementId}`,
    );
    assert.deepEqual(Buffer.from(result.pngBase64Chunks.join(''), 'base64'), bytes);
    assert.equal(result.sha256, imageHash(bytes));
    assert.equal(result.bytes, bytes.length);
    assert.equal(result.width, 800);
    assert.equal(result.height, 800);
    assert.match(calls.at(-1)[0], new RegExp(`/m/${M}/`));
    assert(calls.every(([, method]) => method === 'GET'));
    assert(!JSON.stringify(result).includes('fixture-access'));
    assert.equal(result.filePath, undefined);
    assert.deepEqual(action.requiredScopes, ['operator.read']);
    assert.equal(action.schema.additionalProperties, false);
  });
});
test('render rejects missing scopes, liveReads off, ambiguous/foreign binding and any target override before provider access', async () => {
  await harness(async ({call, setConfig, store}) => {
    globalThis.fetch = () => {
      assert.fail('no provider IO permitted');
    };
    assert.equal((await call({}, [])).result.code, 'authorization_changed');
    for (const field of ['documentId', 'workspaceId', 'elementId', 'microversionId']) {
      assert.equal((await call({[field]: M})).result.code, 'invalid_arguments');
    }
    assert.equal((await call({connectionRef: 'foreign'})).result.code, 'not_configured');
    setConfig({bindings: [binding], liveReads: false});
    assert.equal((await call()).result.code, 'live_reads_disabled');
    setConfig({
      bindings: [binding, {...binding, requesterSenderId: 'other', connectionRef: 'other-rest'}],
      liveReads: true,
    });
    assert.equal((await call()).result.code, 'not_configured');
    setConfig({bindings: [binding], liveReads: true});
    await store.save({...tokens, scopes: ['OAuth2Write']});
    assert.equal((await call()).result.code, 'oauth_read_scope_missing');
  });
});
test('revocation while rendering discards image; bounded encoding remains within host JSON limits', async () => {
  await harness(async ({call, setConfig, store}) => {
    const original = RestClient.prototype.render;
    try {
      RestClient.prototype.render = async () => {
        setConfig({bindings: [], liveReads: true});
        return {bytes: pngFixture(), metadata: {}};
      };
      assert.equal((await call()).result.code, 'authorization_changed');
      setConfig({bindings: [binding], liveReads: true});
      RestClient.prototype.render = async function () {
        await this.accessToken();
        await store.save(null);
        return {bytes: pngFixture(), metadata: {}};
      };
      assert.notEqual((await call()).result.status, 'ok');
      await store.save(tokens);
      RestClient.prototype.render = async function () {
        await this.accessToken();
        return {bytes: Buffer.alloc(DASHBOARD_PNG_MAX_BYTES + 1), metadata: {}};
      };
      assert.equal((await call()).result.code, 'dashboard_image_too_large');
      RestClient.prototype.render = async function () {
        await this.accessToken();
        return {
          bytes: Buffer.alloc(DASHBOARD_PNG_MAX_BYTES),
          metadata: {
            ...target,
            microversionId: M,
            revisionUrl: `https://cad.onshape.com/documents/${target.documentId}/w/${target.workspaceId}/m/${M}/e/${target.elementId}`,
          },
        };
      };
      const result = await call();
      assert.equal(result.result.pngBase64Chunks.length, 4);
      assert(result.result.pngBase64Chunks.every((c) => c.length <= 65536));
      assert(Buffer.byteLength(JSON.stringify(result)) < 262144);
    } finally {
      RestClient.prototype.render = original;
    }
  });
});

test('binding revocation after a provider read stops the render before further access', async () => {
  await harness(async ({call, setConfig}) => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      setConfig({bindings: [], liveReads: true});
      return new Response(JSON.stringify({id: target.documentId}), {headers: {'Content-Type': 'application/json'}});
    };
    const result = await call();
    assert.equal(result.result.code, 'authorization_changed');
    assert.equal(calls, 1);
    assert.equal(result.result.pngBase64Chunks, undefined);
  });
});

test('local workspace context remains readable when OAuth is disconnected, without granting writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cockpit-context-'));
  try {
    const actions = [],
      config = parseConfig({bindings: [binding], liveReads: true});
    registerDashboard(
      {
        session: {
          controls: {
            registerSessionAction(a) {
              actions.push(a);
            },
          },
        },
        registerHttpRoute() {},
        lifecycle: {registerRuntimeLifecycle() {}},
        runtime: {state: {resolveStateDir: () => root}, config: {current: () => ({})}},
      },
      () => config,
    );
    const result = await actions
      .find((a) => a.id === 'mutation-status')
      .handler({payload: {connectionRef: 'owner-rest'}, client: {scopes: ['operator.read']}});
    assert.equal(result.result.status, 'ok');
    assert.deepEqual(result.result.target, target);
    assert.equal(result.result.oauthWrite, false);
    assert.deepEqual(result.result.proposals, []);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('optional display names omit malformed values and bound Unicode code points', () => {
  for (const value of [
    undefined,
    null,
    42,
    {},
    '',
    '   ',
    'x'.repeat(257),
    'a\nb',
    'a\tb',
    'a\u0000b',
    'a\u202eb',
    '\ud800',
  ]) {
    assert.deepEqual(
      validatedDisplayNames({
        documentName: value,
        workspaceName: value,
        primaryWorkspaceName: value,
        elementName: value,
      }),
      {},
    );
  }
  const unicode = '🛠'.repeat(256);
  assert.deepEqual(
    validatedDisplayNames({documentName: ` ${unicode} `, workspaceName: 'Main', primaryWorkspaceName: 'Main'}),
    {documentName: unicode, workspaceName: 'Main', primaryWorkspaceName: 'Main'},
  );
});

test('missing or invalid optional provider names do not fail a valid render', async () => {
  await harness(async ({call}) => {
    const responses = [
      {id: target.documentId, name: 4},
      [
        {id: target.workspaceId, name: ''},
        {id: target.primaryWorkspaceId, name: 'bad\nname'},
      ],
      [{id: target.elementId, elementType: 'PARTSTUDIO'}],
      {sourceMicroversion: M, features: []},
      [{id: target.elementId, elementType: 'PARTSTUDIO', name: 'x'.repeat(257)}],
      {images: [pngFixture().toString('base64')]},
    ];
    globalThis.fetch = async () =>
      new Response(JSON.stringify(responses.shift()), {headers: {'Content-Type': 'application/json'}});
    const result = (await call()).result;
    assert.equal(result.status, 'ok');
    for (const key of ['documentName', 'workspaceName', 'primaryWorkspaceName', 'elementName']) {
      assert.equal(Object.hasOwn(result, key), false);
    }
    assert.equal(responses.length, 0);
  });
});

test('workspace context uses exactly three metadata GETs; optional current names are safe and no geometry is fetched', async () => {
  await harness(async ({call, action}) => {
    const paths = [];
    const responses = [
      {id: target.documentId, name: ' Current document '},
      [
        {id: target.workspaceId, name: 'Candidate'},
        {id: target.primaryWorkspaceId, name: 'Main'},
      ],
      [{id: target.elementId, elementType: 'PARTSTUDIO', name: '<b>Current studio</b>'}],
    ];
    globalThis.fetch = async (url, init) => {
      paths.push([url, init.method]);
      return new Response(JSON.stringify(responses.shift()), {headers: {'Content-Type': 'application/json'}});
    };
    const result = (await call()).result;
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.target, target);
    assert.equal(result.documentName, 'Current document');
    assert.equal(result.workspaceName, 'Candidate');
    assert.equal(result.primaryWorkspaceName, 'Main');
    assert.equal(result.elementName, '<b>Current studio</b>');
    assert.equal(result.connectionRef, 'owner-rest');
    assert(Number.isFinite(Date.parse(result.observedAt)));
    assert.deepEqual(
      paths.map(([url]) => url),
      [
        `https://cad.onshape.com/api/v10/documents/${target.documentId}`,
        `https://cad.onshape.com/api/v10/documents/d/${target.documentId}/workspaces`,
        `https://cad.onshape.com/api/v10/documents/d/${target.documentId}/w/${target.workspaceId}/elements`,
      ],
    );
    assert(paths.every(([, method]) => method === 'GET'));
    assert.deepEqual(action.requiredScopes, ['operator.read']);
    assert.equal(action.schema.additionalProperties, false);
    for (const field of ['pngBase64Chunks', 'microversionId', 'revisionUrl', 'accessToken', 'filePath', 'ancestry']) {
      assert.equal(result[field], undefined);
    }
  }, 'workspace-context');
});
test('workspace context gates scope, liveReads, single exact binding, target overrides and OAuth read before provider access', async () => {
  await harness(async ({call, setConfig, store}) => {
    globalThis.fetch = () => assert.fail('no provider IO');
    for (const scopes of [[], ['operator.write'], ['agent']]) {
      assert.equal((await call({}, scopes)).result.code, 'authorization_changed');
    }
    for (const payload of [[], 'bad', {workspaceId: M}, {connectionRef: 'foreign'}, {microversionId: M}]) {
      assert.notEqual((await call(payload)).result.status, 'ok');
    }
    setConfig({bindings: [binding], liveReads: false});
    assert.equal((await call()).result.code, 'live_reads_disabled');
    setConfig({
      bindings: [binding, {...binding, requesterSenderId: 'other', connectionRef: 'other-rest'}],
      liveReads: true,
    });
    assert.equal((await call()).result.code, 'not_configured');
    setConfig({bindings: [binding], liveReads: true});
    await store.save({...tokens, scopes: ['OAuth2Write']});
    assert.equal((await call()).result.code, 'oauth_read_scope_missing');
    await store.save(null);
    assert.notEqual((await call()).result.status, 'ok');
  }, 'workspace-context');
});
test('workspace context discards labels on revocation at every provider read and stops subsequent GETs', async () => {
  for (const stage of [1, 2, 3]) {
    await harness(async ({call, setConfig}) => {
      let calls = 0;
      const responses = [
        {id: target.documentId, name: 'private'},
        [{id: target.workspaceId}, {id: target.primaryWorkspaceId}],
        [{id: target.elementId, elementType: 'PARTSTUDIO', name: 'private'}],
      ];
      globalThis.fetch = async () => {
        calls++;
        if (calls === stage) {
          setConfig({bindings: [], liveReads: true});
        }
        return new Response(JSON.stringify(responses.shift()), {headers: {'Content-Type': 'application/json'}});
      };
      const result = (await call()).result;
      assert.equal(result.code, 'authorization_changed');
      assert.equal(result.documentName, undefined);
      assert.equal(calls, stage);
    }, 'workspace-context');
  }
});
test('workspace context rejects swapped document/workspace/element identity and bounds malformed labels', async () => {
  for (const kind of ['doc', 'workspace', 'duplicate', 'element', 'type', 'oversized', 'labels']) {
    await harness(async ({call}) => {
      const responses = [
        {id: kind === 'doc' ? M : target.documentId, name: 'bad\nname'},
        [
          {id: target.workspaceId, name: 'X'.repeat(257), ...(kind === 'workspace' ? {documentId: M} : {})},
          {id: target.primaryWorkspaceId, name: 'Main'},
        ],
        [
          {
            id: kind === 'element' ? M : target.elementId,
            elementType: kind === 'type' ? 'ASSEMBLY' : 'PARTSTUDIO',
            name: ' studio ',
          },
        ],
      ];
      if (kind === 'duplicate') {
        responses[1].push({id: target.workspaceId});
      }
      if (kind === 'oversized') {
        responses[1].push(...Array.from({length: 1000}, () => ({id: M})));
      }
      globalThis.fetch = async () =>
        new Response(JSON.stringify(responses.shift()), {headers: {'Content-Type': 'application/json'}});
      const result = (await call()).result;
      if (kind === 'labels') {
        assert.equal(result.status, 'ok');
        assert.equal(result.documentName, undefined);
        assert.equal(result.workspaceName, undefined);
        assert.equal(result.elementName, 'studio');
      } else {
        assert.notEqual(result.status, 'ok');
        assert.equal(result.documentName, undefined);
      }
    }, 'workspace-context');
  }
});

test('workspace context discards labels if the OAuth grant is revoked during the final GET', async () => {
  await harness(async ({call, store}) => {
    const responses = [
      {id: target.documentId, name: 'private'},
      [{id: target.workspaceId}, {id: target.primaryWorkspaceId}],
      [{id: target.elementId, elementType: 'PARTSTUDIO', name: 'private'}],
    ];
    globalThis.fetch = async () => {
      const value = responses.shift();
      if (!responses.length) {
        await store.save(null);
      }
      return new Response(JSON.stringify(value), {headers: {'Content-Type': 'application/json'}});
    };
    const result = (await call()).result;
    assert.notEqual(result.status, 'ok');
    assert.equal(result.documentName, undefined);
  }, 'workspace-context');
});
