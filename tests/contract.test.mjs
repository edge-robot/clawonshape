// Contract tests against the read-only fixture copies in tests/contract/ (docs/interface/onshape-mcp.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {registerHooks} from 'node:module';
import {mutationStore} from '../dist/mutation-workflow.js';
import {connectionOwner} from '../dist/config.js';
import {messages, userError} from '../dist/readiness.js';
import {canonicalJson, goalHash, validateScope} from '../dist/goal-scope.js';
import {goalView, grantDocument, grantViolations} from '../dist/goal-lifecycle.js';
import {goalCapability, validateJournalSummary} from '../dist/goal-mcp.js';
import {createHash} from 'node:crypto';

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

const CONTRACT_VERSION = '1.2.0-draft';
const CONTRACT_DIGEST = 'sha256:f60bfa0df9e3d76bb78f6a13e1231f64ac9c15c71d54465287b9ebd54e771cba';
const fixture = async (name) => JSON.parse(await readFile(new URL(`./contract/${name}`, import.meta.url), 'utf8'));

test('contract fixture copy has the version this plugin implements', async () => {
  const version = await readFile(new URL('./contract/VERSION', import.meta.url), 'utf8');
  assert.equal(version.split('\n')[0], CONTRACT_VERSION);
  assert.equal(version.split('\n')[1], CONTRACT_DIGEST);
  assert.equal((await fixture('expectations.json')).contractVersion, CONTRACT_VERSION);
});

test('every code the mutation workflow can emit is listed in error-codes.json', async () => {
  const codes = await fixture('error-codes.json');
  const listed = new Set([...codes.plugin, ...codes.server]);
  const source = await readFile(new URL('../dist/mutation-workflow.js', import.meta.url), 'utf8');
  const emitted = new Set([...source.matchAll(/\bError\('([a-z0-9_]+)'\)/g)].map((m) => m[1]));
  for (const m of source.matchAll(/\breason: '([a-z0-9_]+)'/g)) {
    emitted.add(m[1]);
  }
  assert(emitted.has('approval_expired_not_dispatched'), 'REJECTED reason must be emitted by the workflow');
  assert(emitted.has('mutation_outcome_unknown'));
  assert(emitted.has('proposal_body_invalid'));
  const unlisted = [...emitted].filter((code) => !listed.has(code)).sort();
  assert.deepEqual(unlisted, []);
});

test('every code the goal modules can emit is listed in error-codes.json or is an existing plugin code', async () => {
  const codes = await fixture('error-codes.json');
  const listed = new Set([...codes.plugin, ...codes.server]);
  const emitted = new Set();
  for (const name of ['goal-scope', 'goal-lifecycle', 'goal-store', 'goal-mcp', 'goal-service', 'goal-delivery']) {
    const source = await readFile(new URL(`../dist/${name}.js`, import.meta.url), 'utf8');
    for (const m of source.matchAll(/\b(?:Error|fail)\('([a-z0-9_]+)'\)/g)) {
      emitted.add(m[1]);
    }
  }
  for (const code of ['goal_unsupported', 'goal_active_conflict', 'goal_hash_mismatch', 'goal_confirmation_expired']) {
    assert(emitted.has(code), code);
  }
  // Pre-existing plugin codes outside the contract list (readiness model) are allowed; everything must have a text.
  for (const code of emitted) {
    assert(listed.has(code) || Object.hasOwn(messages, code), `unlisted code ${code}`);
    assert(Object.hasOwn(messages, code), `missing message for ${code}`);
  }
});

// §6 (0.4.0): plugin tools return every listed code unchanged in details.code, with an operator text.
test('every contract error code has a message and passes through userError unchanged', async () => {
  const codes = await fixture('error-codes.json');
  for (const code of [...codes.plugin, ...codes.server]) {
    assert(Object.hasOwn(messages, code), `missing message for ${code}`);
    assert.equal(typeof messages[code], 'string');
    assert(messages[code].length > 0);
    assert.deepEqual(userError(new Error(code)), {code, message: messages[code]});
  }
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

// T1 (goal-workflow.md §2): the goalHash test vector.
test('T1 goalHash and canonical JSON equal the goal-hash vector; any scope field change changes the hash', async () => {
  const vector = await fixture('goal-workflow/goal-hash/vector.json');
  const scope = validateScope(vector.scope);
  assert.equal(canonicalJson(scope), vector.canonical);
  assert.equal(canonicalJson(vector.scope), vector.canonical);
  assert.equal(goalHash(scope), vector.goalHash);
  // featureIds are sorted before hashing.
  assert.equal(goalHash({...scope, featureIds: [...scope.featureIds].reverse()}), vector.goalHash);
  const variants = [
    {...scope, goalText: `${scope.goalText} `},
    {...scope, maxDispatches: 11},
    {...scope, lifetimeMs: 3600000},
    {...scope, featureIds: ['FabcDEF123_0']},
    {...scope, target: {...scope.target, baseMicroversion: 'b'.repeat(24)}},
    {...scope, candidate: {mode: 'reuse', workspaceId: '8'.repeat(24)}},
    {...scope, origin: {...scope.origin, target: 'channel:other'}},
    {...scope, requester: {...scope.requester, senderId: 'other'}},
    {...scope, goalConditions: [{...scope.goalConditions[0], expression: '61 mm'}, ...scope.goalConditions.slice(1)]},
    {...scope, preservationConditions: scope.preservationConditions.slice(0, 1)},
  ];
  const hashes = new Set(variants.map(goalHash));
  assert.equal(hashes.size, variants.length);
  assert(!hashes.has(vector.goalHash));
});

function typeShape(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, typeShape(value[key])]),
    );
  }
  return typeof value;
}

async function activeGoalRecord() {
  const vector = await fixture('goal-workflow/goal-hash/vector.json');
  const view = await fixture('goal-workflow/goal-view/active.json');
  const scope = validateScope(vector.scope);
  return {
    goalId: view.goalId,
    scopeRevision: 1,
    scope,
    goalHash: goalHash(scope),
    state: 'ACTIVE',
    binding: {
      agentId: 'engineer',
      documentId: scope.target.documentId,
      elementId: scope.target.elementId,
      primaryWorkspaceId: scope.target.primaryWorkspaceId,
    },
    candidateWorkspaceId: view.target.candidateWorkspaceId,
    baseline: {microversionId: scope.target.baseMicroversion, features: {}},
    confirmation: {
      nonce: 'c'.repeat(32),
      issuedAt: view.confirmation.confirmedAt - 1000,
      expiresAt: view.confirmation.expiresAt,
      confirmedAt: view.confirmation.confirmedAt,
      confirmedBy: {kind: 'dashboard-operator'},
    },
    grant: {
      grantRevision: 1,
      state: 'ACTIVE',
      issuedAt: view.confirmation.confirmedAt,
      expiresAt: view.grant.expiresAt,
      maxDispatches: 10,
      reconciledThrough: 0,
    },
    reconciliations: [],
    verifications: [],
    result: null,
    origin: {...scope.origin},
    requester: {...scope.requester},
    createdAt: view.confirmation.confirmedAt - 2000,
    updatedAt: view.confirmation.confirmedAt,
    lastGrantRevision: 1,
    candidatePreparation: null,
  };
}

test('GoalView of an ACTIVE goal after two OK dispatches has exactly the fixture keys and types (§9)', async () => {
  const shared = await fixture('goal-workflow/goal-view/active.json');
  // goal-1.2.0: target.focus is absent from the shared fixture; consumers treat an absent key as null (changelog).
  assert(!('focus' in shared.target));
  const expected = {...shared, target: {...shared.target, focus: null}};
  const record = await activeGoalRecord();
  const summary = {
    goalId: record.goalId,
    entries: 2,
    counted: 2,
    maxSequence: 2,
    unreconciledSequence: null,
    lastOutcome: 'OK',
    lastAdmittedAt: expected.observedAt - 1000,
  };
  const view = goalView(record, summary, 'AVAILABLE', expected.observedAt);
  assert.deepEqual(typeShape(view), typeShape(expected));
  // Non-volatile values of the fixture are reproduced exactly.
  assert.deepEqual(view, expected);
});

test('T10 grant documents match the valid golden fixtures; invalid structural fixtures are rejected', async () => {
  const record = await activeGoalRecord();
  for (const name of ['active', 'stopped', 'reconciled-through-1']) {
    const golden = await fixture(`goal-grant/valid/${name}.json`);
    assert.deepEqual(grantViolations(golden), [], name);
    const produced = grantDocument(
      {...record, goalHash: golden.goalHash},
      {
        grantRevision: golden.grantRevision,
        state: golden.state,
        issuedAt: golden.issuedAt,
        expiresAt: golden.expiresAt,
        maxDispatches: golden.maxDispatches,
        reconciledThrough: golden.reconciledThrough,
      },
    );
    assert.deepEqual(produced, golden, name);
    assert.deepEqual(Object.keys(produced), Object.keys(golden));
  }
  assert.deepEqual(grantViolations(null), []);
  // Structural defects (server code goal_grant_invalid) are rejected by the writer. Expiry and static bounds are
  // server-side admission checks of a structurally valid document.
  for (const name of [
    'budget-over-25',
    'budget-zero',
    'duplicate-feature-ids',
    'empty-feature-ids',
    'lifetime-over-8h',
    'missing-target',
    'operation-add-feature',
    'state-unknown',
    'unknown-field',
    'version-2',
  ]) {
    assert.notDeepEqual(grantViolations(await fixture(`goal-grant/invalid/${name}.json`)), [], name);
  }
  for (const name of ['expired', 'document-outside-bounds', 'workspace-excluded-primary']) {
    assert.deepEqual(grantViolations(await fixture(`goal-grant/invalid/${name}.json`)), [], name);
  }
});

test('capability fixtures: goal-grant-v1 listed → AVAILABLE, approval-v2 only → UNSUPPORTED (§12.7)', async () => {
  const serve =
    (body, status = 200) =>
    async (url, init) => {
      assert.equal(new URL(url).pathname, '/capabilities');
      assert.equal(init.redirect, 'error');
      return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
    };
  assert.equal(await goalCapability(serve(await fixture('capabilities/approval-v2-and-goal.json'))), 'AVAILABLE');
  assert.equal(await goalCapability(serve(await fixture('capabilities/approval-v2-only.json'))), 'UNSUPPORTED');
  assert.equal(await goalCapability(serve({}, 404)), 'UNSUPPORTED');
  // Unknown fields are ignored.
  const extended = {...(await fixture('capabilities/approval-v2-and-goal.json')), future: {x: 1}};
  assert.equal(await goalCapability(serve(extended)), 'AVAILABLE');
});

// Server contract 1.2.0 §12.7: journal summary with unreconciledEntry (fixture goal-grant/journal-summary/uncertain.json).
test('journal summary parser: uncertain fixture, 1.1.0 server without the key, malformed entries fail closed', async () => {
  const sample = await fixture('goal-grant/journal-summary/uncertain.json');
  const request = await fixture('goal-grant/requests/update-depth.request.json');
  const requestHash = createHash('sha256')
    .update(canonicalJson({path: request.path, body: request.body}))
    .digest('hex');
  const computed = {...sample, unreconciledEntry: {...sample.unreconciledEntry, requestHash}};
  const parsed = validateJournalSummary(computed, sample.goalId);
  assert.deepEqual(parsed, computed);
  assert.deepEqual(Object.keys(parsed.unreconciledEntry), Object.keys(sample.unreconciledEntry));
  // The placeholder hash is not a sha256 hex string: the strict parser rejects it.
  assert.equal(validateJournalSummary(sample, sample.goalId), null);
  // A 1.1.0 server does not send the key: the entry is null, the rest stays usable.
  const {unreconciledEntry: _entry, ...legacy} = computed;
  assert.deepEqual(validateJournalSummary(legacy, sample.goalId), {...legacy, unreconciledEntry: null});
  assert.equal(
    validateJournalSummary({...computed, unreconciledSequence: null, unreconciledEntry: null}, sample.goalId)
      .unreconciledEntry,
    null,
  );
  const entry = computed.unreconciledEntry;
  const {httpStatus: _status, ...sevenKeys} = entry;
  for (const [name, bad] of [
    ['extra key', {...entry, body: {}}],
    ['missing key', sevenKeys],
    ['outcome', {...entry, outcome: 'OK'}],
    ['sequence type', {...entry, sequence: '1'}],
    ['grantRevision', {...entry, grantRevision: 0}],
    ['featureId', {...entry, featureId: 'bad id'}],
    ['sourceMicroversion', {...entry, sourceMicroversion: 'A'.repeat(24)}],
    ['admittedAt', {...entry, admittedAt: -1}],
    ['httpStatus', {...entry, httpStatus: '503'}],
    ['other sequence', {...entry, sequence: 2}],
    ['not an object', 'entry'],
  ]) {
    assert.equal(validateJournalSummary({...computed, unreconciledEntry: bad}, sample.goalId), null, name);
  }
  // Entry and unreconciledSequence must agree.
  assert.equal(validateJournalSummary({...computed, unreconciledEntry: null}, sample.goalId), null);
  assert.equal(validateJournalSummary({...computed, unreconciledSequence: null}, sample.goalId), null);
});
