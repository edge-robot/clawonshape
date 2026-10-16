// Contract tests against the read-only fixture copies in tests/contract/ (docs/interface/onshape-mcp.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {registerHooks} from 'node:module';
import {mutationStore} from '../dist/mutation-workflow.js';
import {connectionOwner} from '../dist/config.js';

// Only the private-file SDK is mocked, as in foundation.test.mjs. This file may load first.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'openclaw/plugin-sdk/secret-file-runtime') {
      return {url: 'mock:contract-safe-files', shortCircuit: true};
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'mock:contract-safe-files') {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
      import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
      import path from 'node:path';
      export function readSecretFileSync(p) {
        return readFileSync(p, 'utf8');
      }
      export async function writePrivateSecretFileAtomic(options) {
        mkdirSync(path.dirname(options.filePath), {recursive: true, mode: 0o700});
        writeFileSync(options.filePath, options.content, {mode: 0o600});
      }
    `,
      };
    }
    return next(url, context);
  },
});

const CONTRACT_VERSION = '0.3.0-draft';
const fixture = async (name) => JSON.parse(await readFile(new URL(`./contract/${name}`, import.meta.url), 'utf8'));

test('contract fixture copy has the version this plugin implements', async () => {
  const version = await readFile(new URL('./contract/VERSION', import.meta.url), 'utf8');
  assert.equal(version.split('\n')[0], CONTRACT_VERSION);
  assert.equal((await fixture('expectations.json')).contractVersion, CONTRACT_VERSION);
});

// Minimal, dependency-free check of the onshape_api_call inputSchema parts the execution context uses.
function validateApiCallInput(schema, input) {
  const errors = [];
  if (schema.type !== 'object' || !input || typeof input !== 'object' || Array.isArray(input)) {
    return ['input is not an object'];
  }
  for (const key of schema.required ?? []) {
    if (!(key in input)) {
      errors.push(`missing required ${key}`);
    }
  }
  for (const [key, value] of Object.entries(input)) {
    const property = schema.properties[key];
    if (!property) {
      errors.push(`unknown property ${key}`);
      continue;
    }
    if (property.type === 'string' && typeof value !== 'string') {
      errors.push(`${key} is not a string`);
    }
    if (property.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${key} is not an object`);
        continue;
      }
      const additional = property.additionalProperties;
      for (const [name, item] of Object.entries(value)) {
        if (additional === false) {
          errors.push(`${key}.${name} is not allowed`);
        } else if (additional?.type === 'string' && typeof item !== 'string') {
          errors.push(`${key}.${name} is not a string`);
        }
      }
    }
  }
  return errors;
}

test('the schema check rejects inputs the server rejects', async () => {
  const tool = (await fixture('mcp-tools.json')).find((t) => t.name === 'onshape_api_call');
  // The 0.2.x shape that failed live with "missing field endpoint" (G13).
  const legacy = {operation: 'updatePartStudioFeature', path_params: {did: 'x'}, body: {}};
  assert.deepEqual(validateApiCallInput(tool.inputSchema, legacy), [
    'missing required endpoint',
    'unknown property operation',
  ]);
  assert.deepEqual(validateApiCallInput(tool.inputSchema, {endpoint: 'x', path_params: {did: 1}}), [
    'path_params.did is not a string',
  ]);
});

async function fixtureReceiptStore() {
  const approval = await fixture('approved-update/valid/update-feature.json');
  const {target} = await fixture('expectations.json');
  const binding = {
    agentId: 'engineer',
    requesterSenderId: 'owner',
    messageChannel: 'discord',
    agentAccountId: 'default',
    connectionRef: 'owner-rest',
    documentId: target.document_id,
    primaryWorkspaceId: 'b'.repeat(24),
    workspaceId: target.workspace_id,
    elementId: target.element_id,
  };
  const root = await mkdtemp(join(tmpdir(), 'contract-context-'));
  const now = approval.expiresAt - 1000;
  const store = await mutationStore(root, binding, () => now);
  // The receipt that the paired approval fixture was issued for (§4 lifecycle: UNKNOWN after approve).
  await store.save({
    version: 1,
    id: approval.proposalId,
    ownerHash: connectionOwner(binding),
    requestHash: approval.requestHash,
    requestId: 'request-id-fixture',
    task: 'Contract fixture task',
    documentId: binding.documentId,
    workspaceId: binding.workspaceId,
    elementId: binding.elementId,
    primaryWorkspaceId: binding.primaryWorkspaceId,
    primaryMicroversionId: 'f'.repeat(24),
    featureId: approval.body.feature.featureId,
    sourceMicroversion: approval.body.sourceMicroversion,
    body: approval.body,
    payloadHash: approval.payloadHash,
    summary: 'Contract fixture',
    status: 'UNKNOWN',
    createdAt: new Date(now - 60000).toISOString(),
    approvedAt: new Date(now - 30000).toISOString(),
    expiresAt: approval.expiresAt,
  });
  return {store, root, approval};
}

test('executionContext for the paired approval equals the mutation-context fixture (§4.1)', async () => {
  const {store, root, approval} = await fixtureReceiptStore();
  try {
    const expected = await fixture('mutation-context/valid/update-feature.json');
    const context = await store.executionContext(approval.proposalId);
    const {expiresAt, ...rest} = context;
    const {expiresAt: _volatile, ...expectedRest} = expected;
    assert(Number.isSafeInteger(expiresAt));
    assert.deepEqual(rest, expectedRest);
    assert.deepEqual(Object.keys(context).sort(), Object.keys(expected).sort());
    for (const removed of ['operation', 'path_params', 'body']) {
      assert(!(removed in context), `0.2.x field ${removed} must not be emitted`);
    }
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('executionContext apiCall is a valid onshape_api_call input carrying the approved body', async () => {
  const {store, root, approval} = await fixtureReceiptStore();
  try {
    const tool = (await fixture('mcp-tools.json')).find((t) => t.name === 'onshape_api_call');
    const {apiCall} = await store.executionContext(approval.proposalId);
    assert.deepEqual(validateApiCallInput(tool.inputSchema, apiCall), []);
    assert.deepEqual(Object.keys(apiCall).sort(), ['body', 'endpoint', 'path_params']);
    assert.deepEqual(apiCall.body, approval.body);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
