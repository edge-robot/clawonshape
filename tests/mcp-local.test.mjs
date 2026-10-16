import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, chmod, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {publishMcpCredential} from '../dist/mcp-credentials.js';
import {localMcpReadiness} from '../dist/mcp.js';
import {unknownMcpReadiness} from '../dist/readiness.js';
import {credentials} from '../dist/credentials.js';
import {parseConfig} from '../dist/config.js';
const token = {
  accessToken: 'access-fixture',
  refreshToken: 'refresh-never-exported',
  expiresAt: Date.now() + 120000,
  scopes: ['OAuth2Read'],
  resource: 'https://cad.onshape.com/api/',
};

test('atomic handoff excludes refresh tokens and unrelated metadata; rotation and disconnect revoke', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mcp-credentials-'));
  try {
    await publishMcpCredential(root, token);
    const file = path.join(root, 'access-token.json');
    let c = JSON.parse(await readFile(file));
    assert.deepEqual(Object.keys(c).sort(), ['accessToken', 'expiresAt', 'scopes']);
    assert(!JSON.stringify(c).includes(token.refreshToken));
    await publishMcpCredential(root, {...token, accessToken: 'rotated'});
    assert.equal(JSON.parse(await readFile(file)).accessToken, 'rotated');
    await publishMcpCredential(root, null);
    assert.equal(JSON.parse(await readFile(file)), null);
    await chmod(root, 0o755);
    await assert.rejects(publishMcpCredential(root, token), /mcp_credential_handoff_unavailable/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('credential store invalidates handoff before owner disconnect and save rotates both', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mcp-owner-')),
    handoff = await mkdtemp(path.join(tmpdir(), 'mcp-handoff-'));
  try {
    const store = await credentials(root, 'owner', 'a'.repeat(64), handoff);
    await store.save(token);
    assert.equal(JSON.parse(await readFile(path.join(handoff, 'access-token.json'))).accessToken, token.accessToken);
    await store.save(null);
    assert.equal(store.status(), 'disconnected');
    assert.equal(JSON.parse(await readFile(path.join(handoff, 'access-token.json'))), null);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(handoff, {recursive: true, force: true});
  }
});
test('local status distinguishes missing, expired, available, unavailable and restart without exposing secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mcp-ready-')),
    config = {connectionRef: 'owner', credentialDirectory: root};
  const up = async () => new Response('', {status: 200}),
    down = async () => {
      throw Error('private-provider-secret');
    };
  try {
    let r = await localMcpReadiness(unknownMcpReadiness(), config, down);
    assert.equal(r.local.running, false);
    assert.equal(r.local.credential, 'MISSING');
    await publishMcpCredential(root, token);
    r = await localMcpReadiness(unknownMcpReadiness(), config, up);
    assert.equal(r.local.running, true);
    assert.equal(r.local.credential, 'AVAILABLE');
    assert.equal(r.mutation.status, 'BLOCKED');
    assert.equal(r.discovery.status, 'UNKNOWN');
    assert(!JSON.stringify(r).includes(token.accessToken));
    assert(!JSON.stringify(r).includes(token.refreshToken));
    await publishMcpCredential(root, {...token, expiresAt: 1});
    r = await localMcpReadiness(unknownMcpReadiness(), config, up);
    assert.equal(r.local.credential, 'EXPIRED');
    await publishMcpCredential(root, null);
    assert.equal((await localMcpReadiness(unknownMcpReadiness(), config, up)).local.credential, 'MISSING');
    await writeFile(path.join(root, 'access-token.json'), '{bad secret');
    assert.equal((await localMcpReadiness(unknownMcpReadiness(), config, up)).local.credential, 'UNKNOWN');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('external-token config requires existing connection and denies unknown secret fields', () => {
  const b = {
    agentId: 'engineer',
    requesterSenderId: 'owner',
    messageChannel: 'discord',
    agentAccountId: 'default',
    connectionRef: 'owner',
    documentId: 'a'.repeat(24),
    primaryWorkspaceId: 'b'.repeat(24),
    workspaceId: 'b'.repeat(24),
  };
  assert.equal(
    parseConfig({bindings: [b], localMcp: {connectionRef: 'owner', credentialDirectory: '/run/private'}}).localMcp
      .connectionRef,
    'owner',
  );
  for (const localMcp of [
    {connectionRef: 'foreign', credentialDirectory: '/run/private'},
    {connectionRef: 'owner', credentialDirectory: 'relative'},
    {connectionRef: 'owner', credentialDirectory: '/run/private', refreshToken: 'forbidden'},
  ]) {
    assert.throws(() => parseConfig({bindings: [b], localMcp}));
  }
});
