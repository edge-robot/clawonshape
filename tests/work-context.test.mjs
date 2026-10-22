// work-context-1.0.0-draft (docs/interface/work-context.md) tests W1–W11, offline. The contract fixtures are read in
// place from docs/interface/work-context-fixtures/; Onshape REST is a local fake built from recorded-shape responses
// in tests/fixtures/work-context/ (synthetic IDs). No network: every fetch is routed and logged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {admin, BASE, binding, D, E, goalHarness, P, proposeVector, vector} from './fixtures/goal.mjs';
import {registerDashboard} from '../dist/dashboard.js';
import {credentials} from '../dist/credentials.js';
import {connectionOwner, parseConfig} from '../dist/config.js';
import {crc32} from '../dist/render.js';
import {RestClient} from '../dist/rest.js';
import {bindingKey, projectParts} from '../dist/work-context.js';
import {canonicalJson, goalHash, validateScope} from '../dist/goal-scope.js';
import {closeGoal, confirmGoal, goalStatus, stopGoal} from '../dist/goal-service.js';
import {goalStore} from '../dist/goal-store.js';
import {mutationStore, payloadDigest} from '../dist/mutation-workflow.js';
import {candidateAttempts} from '../dist/candidate-attempts.js';
import {messages} from '../dist/readiness.js';
import {delegateRender, signResult} from '../dist/delegation.js';
import plugin from '../dist/index.js';

const T0 = 1761116400000;
const T1 = 1761116460000;
const CANDIDATE = 'c'.repeat(24);
const MV2 = 'b'.repeat(24);
const VIEW_GOAL_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const READ_ADMIN = ['operator.read', 'operator.admin'];

const contract = async (name) =>
  JSON.parse(await readFile(new URL(`../docs/interface/work-context-fixtures/${name}`, import.meta.url), 'utf8'));
const recorded = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/work-context/${name}`, import.meta.url), 'utf8'));
const strip = ({_comment, ...rest}) => rest;
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});

function png(size) {
  const chunk = (kind, data) => {
    const bytes = Buffer.alloc(data.length + 12);
    bytes.writeUInt32BE(data.length);
    bytes.write(kind, 4);
    data.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
    return bytes;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((size + 1) * size))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Fake Onshape REST (GET R1–R5 and the document/workspace labels). Logs every request with its method.
async function fakeOnshape(h) {
  const data = {
    document: await recorded('document.json'),
    workspaces: await recorded('workspaces.json'),
    elements: await recorded('elements-partstudio.json'),
    configuration: await recorded('configuration.json'),
    configured: await recorded('configuration-configured.json'),
    parts: new Map([[BASE, await recorded('parts.json')]]),
  };
  const state = {
    // R1 answers: the first entries are consumed one per read; the last one sticks.
    microversions: [BASE],
    isConfigured: false,
    fail: {},
    image: png(256),
    onRequest: undefined,
  };
  const calls = [];
  const kindOf = (route, search) => {
    if (route === `documents/${D}`) {
      return 'document';
    }
    if (route === `documents/d/${D}/workspaces`) {
      return 'workspaces';
    }
    if (route === `documents/d/${D}/w/${P}/currentmicroversion`) {
      return 'r1';
    }
    if (/^documents\/d\/[a-f0-9]{24}\/m\/[a-f0-9]{24}\/elements$/.test(route)) {
      assert.equal(search, '?elementType=PARTSTUDIO');
      return 'r2';
    }
    if (new RegExp(`^elements/d/${D}/m/[a-f0-9]{24}/e/${E}/configuration$`).test(route)) {
      return 'r3';
    }
    if (new RegExp(`^parts/d/${D}/m/[a-f0-9]{24}/e/${E}$`).test(route)) {
      assert.equal(search, '');
      return 'r4';
    }
    if (new RegExp(`^parts/d/${D}/m/[a-f0-9]{24}/e/${E}/partid/[^/]+/shadedviews$`).test(route)) {
      return 'r5';
    }
    return assert.fail(`unexpected REST ${route}`);
  };
  const fetcher = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.host === 'clawonshape-mcp:8080') {
      return h.ctx.fetcher(url, init);
    }
    assert.equal(u.host, 'cad.onshape.com', `unexpected host ${u.host}`);
    assert.equal(init.redirect, 'error');
    const method = init.method ?? 'GET';
    const route = u.pathname.replace(/^\/api\/v10\//, '');
    const kind = kindOf(route, u.search);
    calls.push({method, kind, route, search: u.search});
    await state.onRequest?.(kind, route);
    if (state.fail[kind]) {
      return json({message: 'fixture failure'}, state.fail[kind]);
    }
    const mv = /\/m\/([a-f0-9]{24})\//.exec(route)?.[1];
    switch (kind) {
      case 'document':
        return json(data.document);
      case 'workspaces':
        return json(data.workspaces);
      case 'r1':
        return json({
          microversion: state.microversions.length > 1 ? state.microversions.shift() : state.microversions[0],
        });
      case 'r2':
        return json(data.elements);
      case 'r3':
        return json(state.isConfigured ? data.configured : data.configuration);
      case 'r4':
        return json(data.parts.get(mv) ?? data.parts.get(BASE));
      default:
        assert(u.searchParams.get('outputWidth') === '256' && u.searchParams.get('pixelSize') === '0');
        return json({images: [state.image.toString('base64')]});
    }
  };
  return {data, state, calls, fetcher};
}

async function saveToken(root, b = binding, accessToken = 'fixture-access-DO-NOT-LOG') {
  const store = await credentials(root, b.connectionRef, connectionOwner(b));
  await store.save({
    accessToken,
    refreshToken: 'fixture-refresh-DO-NOT-LOG',
    expiresAt: Date.now() + 3600000,
    resource: 'https://cad.onshape.com/api/',
    scopes: ['OAuth2Read'],
  });
}

function dashboardActions(h, config) {
  const actions = [];
  registerDashboard(
    {
      session: {controls: {registerSessionAction: (a) => actions.push(a)}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {state: {resolveStateDir: () => h.root}, config: {current: () => ({})}},
    },
    config,
    undefined,
    h.ctx.fetcher,
    h.now,
  );
  return async (id, payload = {}, scopes = READ_ADMIN) =>
    (await actions.find((a) => a.id === id).handler({payload, client: {scopes}})).result;
}

async function setup(t, options = {}) {
  const h = await goalHarness({clock: T0, ...options});
  t.after(() => h.cleanup());
  const rest = await fakeOnshape(h);
  t.mock.method(globalThis, 'fetch', rest.fetcher);
  await saveToken(h.root, options.binding ?? binding);
  let config = h.ctx.config;
  const call = dashboardActions(h, () => config);
  // The goal service reaches the work-context reads (focus, §7) through the same fake REST.
  const reads = new RestClient(async () => 'fixture-access-DO-NOT-LOG', rest.fetcher);
  Object.assign(h.client, {
    partStudiosAt: (b, mv) => reads.partStudiosAt(b, mv),
    configuredAt: (b, mv) => reads.configuredAt(b, mv),
    partsAt: (b, mv) => reads.partsAt(b, mv),
  });
  return {
    h,
    rest,
    call,
    setConfig: (next) => {
      config = next;
    },
    config: () => config,
  };
}

const adoptRequest = async (overrides = {}) => ({...strip(await contract('adopt-request.json')), ...overrides});
const recordPath = (h, b = binding) => join(h.root, 'claw-onshape', 'work-context', `${bindingKey(b)}.json`);
const readRecordFile = async (h, b = binding) => {
  try {
    return await readFile(recordPath(h, b), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return undefined;
    }
    throw e;
  }
};
const listJson = async (dir) => {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }
};

async function adoptJif(s) {
  s.h.advance(T1 - s.h.now());
  const adopted = await s.call('work-context-adopt', await adoptRequest());
  assert.equal(adopted.ok, true, JSON.stringify(adopted));
  return adopted;
}

// A goal record of this binding in the given state (propose, then the state is set directly on the stored record).
async function seedGoal(h, state, {goalId, candidateWorkspaceId} = {}) {
  const proposed = await proposeVector(h);
  const store = await goalStore(h.root);
  const record = {...(await store.read(proposed.goalId)), state};
  if (candidateWorkspaceId) {
    record.candidateWorkspaceId = candidateWorkspaceId;
  }
  if (goalId) {
    await unlink(join(store.root, `${proposed.goalId}.json`));
    record.goalId = goalId;
  }
  await store.save(record);
  return record;
}

test('W1 catalog from recorded R1–R4 responses equals catalog.json; same-name parts stay distinct', async (t) => {
  const s = await setup(t);
  // The Candidate of the current goal is listed for information only.
  await seedGoal(s.h, 'STOPPED', {candidateWorkspaceId: CANDIDATE});
  const result = await s.call('work-context-catalog');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.catalog, strip(await contract('catalog.json')));
  const brackets = result.catalog.partStudios[0].parts.filter((p) => p.name === 'Bracket');
  assert.deepEqual(
    brackets.map((p) => p.partId),
    ['JHD', 'JHH'],
  );
  // R1 twice (start and recheck), R2–R4 at the R1 microversion, GET only.
  assert.deepEqual(
    s.rest.calls.map((c) => c.kind),
    ['document', 'workspaces', 'r1', 'r2', 'r3', 'r4', 'r1'],
  );
  assert(s.rest.calls.every((c) => c.method === 'GET'));
  assert(s.rest.calls.filter((c) => ['r2', 'r3', 'r4'].includes(c.kind)).every((c) => c.route.includes(`/m/${BASE}`)));
  assert.equal(await readRecordFile(s.h), undefined);
});

test('W1 configured Part Studio → configuration_unsupported, parts not enumerated', async (t) => {
  const s = await setup(t);
  s.rest.state.isConfigured = true;
  const {catalog} = await s.call('work-context-catalog');
  assert.deepEqual(catalog.partStudios[0], {
    elementId: E,
    name: 'Mount Plate',
    goalEligible: false,
    reason: 'configuration_unsupported',
    truncated: false,
    parts: null,
  });
  assert.equal(catalog.partStudios[1].reason, 'element_not_provisioned');
  assert(!s.rest.calls.some((c) => c.kind === 'r4'));
});

test('W1 part validation: invalid partId or name → provider_protocol_error; more than 500 parts are truncated', async (t) => {
  const s = await setup(t);
  const parts = s.rest.data.parts.get(BASE);
  for (const bad of [
    {partId: 'J H'},
    {partId: 'x'.repeat(65)},
    {name: ''},
    {name: 'x'.repeat(201)},
    {name: 'a\u0007'},
  ]) {
    s.rest.data.parts.set(BASE, [{...parts[0], ...bad}, ...parts.slice(1)]);
    assert.equal((await s.call('work-context-catalog')).code, 'provider_protocol_error', JSON.stringify(bad));
  }
  s.rest.data.parts.set(BASE, [parts[0], {...parts[1], partId: parts[0].partId}]);
  assert.equal((await s.call('work-context-catalog')).code, 'provider_protocol_error');
  const many = Array.from({length: 501}, (_, i) => ({
    ...parts[0],
    partId: `P${i}`,
    name: `Part ${String(i).padStart(3, '0')}`,
  }));
  s.rest.data.parts.set(BASE, many);
  const {catalog} = await s.call('work-context-catalog');
  assert.equal(catalog.partStudios[0].truncated, true);
  assert.equal(catalog.partStudios[0].parts.length, 500);
  // Mesh, flattened and flag-less bodies are listed, never selectable.
  assert.deepEqual(
    projectParts([
      {...parts[0], partId: 'M', isMesh: true},
      {...parts[0], partId: 'F', isFlattenedBody: true},
      {partId: 'U', name: 'Unknown', bodyType: 'solid'},
    ]).map((p) => [p.partId, p.selectable, p.reason]),
    [
      ['F', false, 'part_kind_unsupported'],
      ['M', false, 'part_kind_unsupported'],
      ['U', false, 'part_kind_unsupported'],
    ],
  );
});

test('W2 R1 changes between start and end of the catalog read → selection_observation_stale', async (t) => {
  const s = await setup(t);
  s.rest.state.microversions = [BASE, MV2];
  const result = await s.call('work-context-catalog');
  assert.deepEqual([result.ok, result.code], [false, 'selection_observation_stale']);
  assert.equal(await readRecordFile(s.h), undefined);
});

test('W3 adopt happy path: revision 0 → 1, view equals view-valid.json, no provider write, no goal/Candidate/approval/grant file', async (t) => {
  const s = await setup(t);
  const adopted = await adoptJif(s);
  assert.deepEqual(adopted.workContext, strip(await contract('view-valid.json')));
  // Durable private record (§3).
  const raw = await readRecordFile(s.h);
  const record = JSON.parse(raw);
  assert.equal(record.selectionRevision, 1);
  assert.equal(record.bindingKey, bindingKey(binding));
  assert.equal((await stat(recordPath(s.h))).mode & 0o777, 0o600);
  assert(!raw.includes('fixture-access') && !raw.includes('fixture-refresh'));
  // A8: GET only; nothing of the goal, Candidate, approval or grant paths exists.
  assert(s.rest.calls.length > 0);
  assert(s.rest.calls.every((c) => c.method === 'GET'));
  assert.deepEqual(await listJson(join(s.h.root, 'claw-onshape', 'goals')), []);
  assert.deepEqual(await listJson(join(s.h.root, 'claw-onshape', 'mutations')), []);
  assert.deepEqual(await listJson(join(s.h.root, 'claw-onshape-candidate-attempts')), []);
  assert.deepEqual(await listJson(s.h.approvalDirectory), []);
  assert.equal(s.h.calls.creates, 0);
  // Status right after adoption shows the same view.
  const status = await s.call('work-context-status');
  assert.deepEqual(status.workContext, strip(await contract('view-valid.json')));
  // Catalog, preview and status write nothing.
  const before = await readRecordFile(s.h);
  await s.call('work-context-catalog');
  await s.call('work-context-preview', {elementId: E, partId: 'JIF', observedMicroversion: BASE});
  assert.equal(await readRecordFile(s.h), before);
  assert(s.rest.calls.every((c) => c.method === 'GET'));
  assert.deepEqual(await listJson(s.h.approvalDirectory), []);
});

test('W4 adopt rejects every invalid case; the previous record stays unchanged', async (t) => {
  const s = await setup(t);
  await adoptJif(s);
  const previous = await readRecordFile(s.h);
  const expected = 1;
  const cases = [
    ['missing operator.admin', {expectedSelectionRevision: expected}, 'authorization_changed', ['operator.read']],
    [
      'foreign document',
      {expectedSelectionRevision: expected, documentId: '1'.repeat(24)},
      'selection_target_not_allowed',
    ],
    [
      'foreign workspace',
      {expectedSelectionRevision: expected, workspaceId: CANDIDATE},
      'selection_target_not_allowed',
    ],
    [
      'foreign element',
      {expectedSelectionRevision: expected, elementId: 'ab'.repeat(12)},
      'selection_target_not_allowed',
    ],
    ['unsupported part', {expectedSelectionRevision: expected, partId: 'JKD'}, 'selection_part_unsupported'],
    ['missing part', {expectedSelectionRevision: expected, partId: 'ZZZ'}, 'selection_part_missing'],
    [
      'stale microversion',
      {expectedSelectionRevision: expected, observedMicroversion: MV2},
      'selection_observation_stale',
    ],
    ['stale expectedSelectionRevision', {expectedSelectionRevision: 0, partId: 'JIG'}, 'selection_revision_conflict'],
    ['unknown input key', {expectedSelectionRevision: expected, extra: true}, 'invalid_arguments'],
    ['malformed partId', {expectedSelectionRevision: expected, partId: 'J/IG'}, 'invalid_arguments'],
  ];
  for (const [name, overrides, code, scopes] of cases) {
    const result = await s.call('work-context-adopt', await adoptRequest(overrides), scopes);
    assert.deepEqual([result.ok, result.code], [false, code], name);
    assert.equal(await readRecordFile(s.h), previous, name);
  }
  // Configured element.
  s.rest.state.isConfigured = true;
  let result = await s.call('work-context-adopt', await adoptRequest({expectedSelectionRevision: 1, partId: 'JIG'}));
  assert.equal(result.code, 'configuration_unsupported');
  s.rest.state.isConfigured = false;
  // Authorization changed between the reads (binding removed from the configuration during R4).
  const original = s.config();
  s.rest.state.onRequest = (kind) => {
    if (kind === 'r4') {
      s.setConfig(parseConfig({...original, bindings: [{...binding, requesterSenderId: 'someone-else'}]}));
    }
  };
  result = await s.call('work-context-adopt', await adoptRequest({expectedSelectionRevision: 1, partId: 'JIG'}));
  assert.equal(result.code, 'authorization_changed');
  s.setConfig(original);
  // Late reply: the access token rotated while R4 was in flight (§5 step 7 fence).
  s.rest.state.onRequest = async (kind) => {
    if (kind === 'r4') {
      await saveToken(s.h.root, binding, 'fixture-access-rotated-DO-NOT-LOG');
    }
  };
  result = await s.call('work-context-adopt', await adoptRequest({expectedSelectionRevision: 1, partId: 'JIG'}));
  assert.equal(result.code, 'authorization_changed');
  s.rest.state.onRequest = undefined;
  // Live reads disabled.
  s.setConfig(parseConfig({...original, liveReads: false}));
  result = await s.call('work-context-adopt', await adoptRequest({expectedSelectionRevision: 1, partId: 'JIG'}));
  assert.equal(result.code, 'live_reads_disabled');
  s.setConfig(original);
  assert.equal(await readRecordFile(s.h), previous);
  // Clear follows the same CAS.
  result = await s.call('work-context-clear', {expectedSelectionRevision: 0});
  assert.equal(result.code, 'selection_revision_conflict');
  assert.equal(
    (await s.call('work-context-clear', {expectedSelectionRevision: 1}, ['operator.read'])).code,
    'authorization_changed',
  );
  assert.equal(await readRecordFile(s.h), previous);
  result = await s.call('work-context-clear', {expectedSelectionRevision: 1});
  assert.equal(result.ok, true);
  assert.deepEqual(
    [result.workContext.selectionRevision, result.workContext.validity, result.workContext.selection],
    [2, 'none', null],
  );
  // A cleared record keeps its revision; the next adoption continues with 3 (never reused).
  result = await s.call('work-context-adopt', await adoptRequest({expectedSelectionRevision: 2, partId: 'JIG'}));
  assert.equal(result.workContext.selectionRevision, 3);
  assert.equal(result.workContext.selection.partName, 'Clamp right');
});

test('W5 interlock: every non-terminal goal state, UNKNOWN receipt, active approval and unresolved attempt refuse adopt and clear', async (t) => {
  for (const state of ['AWAITING_CONFIRMATION', 'ACTIVE', 'RECONCILING', 'BLOCKED', 'STOPPED', 'EXPIRED']) {
    const s = await setup(t);
    const goal = await seedGoal(s.h, state);
    const adopt = await s.call('work-context-adopt', await adoptRequest());
    assert.deepEqual([adopt.ok, adopt.code], [false, 'goal_active_conflict'], state);
    assert.equal((await s.call('work-context-clear', {expectedSelectionRevision: 0})).code, 'goal_active_conflict');
    const status = await s.call('work-context-status');
    assert.deepEqual(status.workContext.interlock, {blocked: true, code: 'goal_active_conflict', goalId: goal.goalId});
    assert.equal(await readRecordFile(s.h), undefined, state);
    // No provider read happens before the interlock (§5 step 3).
    assert(!s.rest.calls.some((c) => c.kind === 'r1'), state);
  }
});

test('W5 interlock: legacy UNKNOWN receipt, active approval v2, candidate attempt UNKNOWN; allowed after goal-close', async (t) => {
  const s = await setup(t);
  // Legacy UNKNOWN payload receipt.
  const proposals = await mutationStore(s.h.root, binding);
  const body = {feature: {featureId: 'FabcDEF123_0'}};
  const receipt = {
    version: 1,
    id: '11111111-1111-4111-8111-111111111111',
    ownerHash: connectionOwner(binding),
    requestHash: 'a'.repeat(64),
    requestId: 'request',
    task: 'legacy',
    documentId: D,
    workspaceId: P,
    elementId: E,
    primaryWorkspaceId: P,
    primaryMicroversionId: BASE,
    featureId: 'FabcDEF123_0',
    sourceMicroversion: BASE,
    body,
    payloadHash: payloadDigest(body),
    summary: 'legacy',
    status: 'UNKNOWN',
    createdAt: new Date(s.h.now()).toISOString(),
  };
  await proposals.save(receipt);
  assert.equal((await s.call('work-context-adopt', await adoptRequest())).code, 'mutation_reconciliation_required');
  await proposals.save({...receipt, status: 'VERIFIED'});
  // Active approval file (v2) in the goal approval directory.
  await mkdir(s.h.approvalDirectory, {recursive: true, mode: 0o700});
  const approval = join(s.h.approvalDirectory, 'approved-update.json');
  await writeFile(approval, JSON.stringify({version: 2, expiresAt: s.h.now() + 60_000}), {mode: 0o600});
  assert.equal((await s.call('work-context-adopt', await adoptRequest())).code, 'mutation_reconciliation_required');
  await writeFile(approval, 'null', {mode: 0o600});
  // Unresolved candidate attempt of the Primary source.
  const attempts = await candidateAttempts(s.h.root, binding);
  const now = new Date().toISOString();
  const attempt = {
    schemaVersion: 1,
    attemptId: randomUUID(),
    ownerHash: connectionOwner(binding),
    documentId: D,
    primaryWorkspaceId: P,
    sourceWorkspaceId: P,
    sourceElementId: E,
    sourceMicroversionId: BASE,
    requestDigest: '1'.repeat(64),
    featureCount: 1,
    status: 'UNKNOWN',
    createdAt: now,
    updatedAt: now,
  };
  await attempts.exclusive(async (r) => r.save(attempt));
  assert.equal((await s.call('work-context-adopt', await adoptRequest())).code, 'mutation_reconciliation_required');
  assert.equal((await s.call('work-context-status')).workContext.interlock.code, 'mutation_reconciliation_required');
  await attempts.exclusive(async (r) =>
    r.save({...attempt, status: 'CREATED_UNVERIFIED', candidateWorkspaceId: CANDIDATE}),
  );
  assert.equal((await s.call('work-context-adopt', await adoptRequest())).code, 'mutation_reconciliation_required');
  await attempts.exclusive(async (r) => r.save({...attempt, status: 'VERIFIED', candidateWorkspaceId: CANDIDATE}));
  assert.equal(await readRecordFile(s.h), undefined);
  // A STOPPED goal blocks until goal-close; after close, adoption is allowed.
  const proposed = await proposeVector(s.h);
  await stopGoal(s.h.ctx, proposed.goalId, 'operator stop');
  assert.equal((await s.call('work-context-adopt', await adoptRequest())).code, 'goal_active_conflict');
  await closeGoal(s.h.ctx, proposed.goalId);
  const adopted = await s.call('work-context-adopt', await adoptRequest());
  assert.equal(adopted.ok, true, JSON.stringify(adopted));
  assert.deepEqual(adopted.workContext.interlock, {blocked: false, code: null, goalId: null});
});

test('W5 unreadable goal or candidate state fails closed with goal_state_invalid', async (t) => {
  const s = await setup(t);
  const goals = join(s.h.root, 'claw-onshape', 'goals');
  await mkdir(goals, {recursive: true, mode: 0o700});
  await writeFile(join(goals, `${randomUUID()}.json`), '{not json', {mode: 0o600});
  assert.equal((await s.call('work-context-adopt', await adoptRequest())).code, 'goal_state_invalid');
  assert.deepEqual((await s.call('work-context-status')).workContext.interlock, {
    blocked: true,
    code: 'goal_state_invalid',
    goalId: null,
  });
  await rm(goals, {recursive: true});
  // Corrupt selection record: status is unverified, adoption refuses, nothing is deleted.
  await adoptJif(s);
  await writeFile(recordPath(s.h), '{"version":1}', {mode: 0o600});
  const status = await s.call('work-context-status');
  assert.deepEqual([status.workContext.validity, status.workContext.reason], ['unverified', 'goal_state_invalid']);
  assert.equal(
    (await s.call('work-context-adopt', await adoptRequest({expectedSelectionRevision: 1}))).code,
    'goal_state_invalid',
  );
  assert.equal(await readRecordFile(s.h), '{"version":1}');
});

test('W6 two concurrent adopts with the same expectedSelectionRevision: exactly one wins', async (t) => {
  const s = await setup(t);
  const results = await Promise.all([
    s.call('work-context-adopt', await adoptRequest({partId: 'JIF'})),
    s.call('work-context-adopt', await adoptRequest({partId: 'JIG'})),
  ]);
  const winners = results.filter((r) => r.ok);
  assert.equal(winners.length, 1, JSON.stringify(results));
  const loser = results.find((r) => !r.ok);
  assert(['selection_revision_conflict', 'connection_busy_or_state_unavailable'].includes(loser.code), loser.code);
  const record = JSON.parse(await readRecordFile(s.h));
  assert.equal(record.selectionRevision, 1);
  assert.equal(record.selection.partId, winners[0].workContext.selection.partId);
  // Sequentially, the CAS decides.
  const again = await s.call('work-context-adopt', await adoptRequest({partId: 'JHD'}));
  assert.equal(again.code, 'selection_revision_conflict');
});

test('W7 adopt racing propose/goal-confirm is serialized; a confirmed goal never has a focus other than the record', async (t) => {
  const s = await setup(t);
  await adoptJif(s);
  // A: adoption passed its interlock and is in its R4 read while a goal is proposed; the adoption then fails at step 8.
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let paused = false;
  s.rest.state.onRequest = async (kind) => {
    if (kind === 'r4' && !paused) {
      paused = true;
      await gate;
    }
  };
  const adopting = s.call('work-context-adopt', await adoptRequest({expectedSelectionRevision: 1, partId: 'JIG'}));
  while (!paused) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const proposed = await proposeVector(s.h);
  release();
  const adopted = await adopting;
  assert.deepEqual([adopted.ok, adopted.code], [false, 'goal_active_conflict']);
  const record = JSON.parse(await readRecordFile(s.h));
  assert.deepEqual(proposed.target.focus, {
    partId: record.selection.partId,
    partName: record.selection.partName,
    elementId: E,
    selectionRevision: record.selectionRevision,
  });
  // B: goal-confirm holds the store lock; an adoption reaching step 8 is refused, never interleaved.
  let releaseCreate;
  const creating = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  let inCreate = false;
  const creation = {
    readAttempt: s.h.creation.readAttempt,
    async create(input) {
      inCreate = true;
      await creating;
      return s.h.creation.create(input);
    },
  };
  const confirming = confirmGoal(
    s.h.ctx,
    {
      goalId: proposed.goalId,
      nonce: (await s.h.record(proposed.goalId)).confirmation.nonce,
      expectedGoalHash: proposed.goalHash,
    },
    admin,
    creation,
  );
  while (!inCreate) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const during = await s.call('work-context-clear', {expectedSelectionRevision: 1});
  assert.equal(during.ok, false);
  assert(['goal_active_conflict', 'connection_busy_or_state_unavailable'].includes(during.code), during.code);
  releaseCreate();
  const confirmed = await confirming;
  assert.equal(confirmed.state, 'ACTIVE');
  assert.deepEqual(confirmed.target.focus, proposed.target.focus);
  assert.equal(JSON.parse(await readRecordFile(s.h)).selectionRevision, record.selectionRevision);
});

test('W8 restart/reload: the record survives; status revalidates valid, revision_advanced, invalid, unverified', async (t) => {
  const s = await setup(t);
  await adoptJif(s);
  const stored = await readRecordFile(s.h);
  // "Restart": a fresh dashboard registration reads the durable record.
  const restarted = dashboardActions(s.h, s.config);
  assert.deepEqual((await restarted('work-context-status')).workContext, strip(await contract('view-valid.json')));
  // Primary advanced, part still present and selectable.
  const parts = s.rest.data.parts.get(BASE);
  s.rest.state.microversions = [MV2];
  s.rest.data.parts.set(MV2, parts);
  let view = (await restarted('work-context-status')).workContext;
  assert.deepEqual(
    [view.validity, view.reason, view.selection.currentMicroversion, view.selection.observedMicroversion],
    ['valid', 'revision_advanced', MV2, BASE],
  );
  // Part removed at the new revision while a goal of this binding is open → view-invalid.json.
  await seedGoal(s.h, 'ACTIVE', {goalId: VIEW_GOAL_ID});
  s.rest.data.parts.set(
    MV2,
    parts.filter((p) => p.partId !== 'JIF'),
  );
  assert.deepEqual((await restarted('work-context-status')).workContext, strip(await contract('view-invalid.json')));
  // Part kind changed / element configured.
  s.rest.data.parts.set(
    MV2,
    parts.map((p) => (p.partId === 'JIF' ? {...p, bodyType: 'sheet'} : p)),
  );
  view = (await restarted('work-context-status')).workContext;
  assert.deepEqual([view.validity, view.reason], ['invalid', 'selection_part_unsupported']);
  s.rest.state.isConfigured = true;
  view = (await restarted('work-context-status')).workContext;
  assert.deepEqual([view.validity, view.reason], ['invalid', 'configuration_unsupported']);
  s.rest.state.isConfigured = false;
  // Reads impossible: provider failure, live reads off, reconnect required → unverified, record kept.
  s.rest.state.fail.r4 = 503;
  view = (await restarted('work-context-status')).workContext;
  assert.deepEqual(
    [view.validity, view.reason, view.selection.currentMicroversion],
    ['unverified', 'provider_unavailable', null],
  );
  delete s.rest.state.fail.r4;
  s.setConfig(parseConfig({...s.config(), liveReads: false}));
  view = (await restarted('work-context-status')).workContext;
  assert.deepEqual([view.validity, view.reason], ['unverified', 'live_reads_disabled']);
  s.setConfig(s.h.ctx.config);
  s.rest.state.fail.r1 = 401;
  view = (await restarted('work-context-status')).workContext;
  assert.deepEqual([view.validity, view.reason], ['unverified', 'reconnect_required']);
  assert.equal(view.selection.partId, 'JIF');
  delete s.rest.state.fail.r1;
  assert.equal(await readRecordFile(s.h), stored);
  // A status call by a client without operator.read is refused.
  assert.equal((await restarted('work-context-status', {}, [])).code, 'authorization_changed');
});

test('W9 a changed binding sees no selection; an element-only binding has selection null', async (t) => {
  const s = await setup(t);
  // Element-only binding, never adopted.
  assert.deepEqual((await s.call('work-context-status')).workContext, strip(await contract('view-none.json')));
  await adoptJif(s);
  // Same connection, different requester: a different binding key; the old record is not visible or migrated.
  const changed = {...binding, requesterSenderId: 'requester-other'};
  await saveToken(s.h.root, changed);
  s.setConfig(parseConfig({...s.config(), bindings: [changed]}));
  const view = (await s.call('work-context-status')).workContext;
  assert.deepEqual(view, {...strip(await contract('view-none.json')), observedAt: T1});
  assert.notEqual(bindingKey(changed), bindingKey(binding));
  assert.equal(await readRecordFile(s.h, changed), undefined);
  assert.notEqual(await readRecordFile(s.h), undefined);
});

test('§3 bindingKey matches the binding-key.json test vector', async () => {
  const v = await contract('binding-key.json');
  const b = {...v.binding, workspaceId: v.binding.primaryWorkspaceId};
  assert.equal(canonicalJson(v.binding), v.canonical);
  assert.equal(bindingKey(b), v.bindingKey);
  // The legacy assigned workspace is not part of the key; every one of the eight fields is.
  assert.equal(bindingKey({...b, workspaceId: CANDIDATE}), v.bindingKey);
  for (const key of Object.keys(v.binding)) {
    const other = key.endsWith('Id') && /^[a-f0-9]{24}$/.test(v.binding[key]) ? '1'.repeat(24) : 'other';
    assert.notEqual(bindingKey({...b, [key]: other}), v.bindingKey, key);
  }
});

test('W10 goal hand-off: focus iff valid; goalHash equals goal-hash-focus.json; part missing at base fails', async (t) => {
  const s = await setup(t);
  // No selection: no focus key, the goal-1.1.0 hash is unchanged (T1 vector).
  const plain = await proposeVector(s.h);
  assert.equal(plain.target.focus, null);
  assert(!('focus' in (await s.h.record(plain.goalId)).scope));
  assert.equal(plain.goalHash, (await vector()).goalHash);
  await stopGoal(s.h.ctx, plain.goalId, 'next');
  await closeGoal(s.h.ctx, plain.goalId);
  // Valid selection → focus, part of goalHash.
  await adoptJif(s);
  const fixture = await contract('goal-hash-focus.json');
  assert.equal(canonicalJson(validateScope(fixture.scope)), fixture.canonical);
  assert.equal(goalHash(validateScope(fixture.scope)), fixture.goalHash);
  const focused = await proposeVector(s.h);
  assert.deepEqual(focused.target.focus, fixture.scope.focus);
  assert.equal(focused.goalHash, fixture.goalHash);
  assert.deepEqual((await s.h.record(focused.goalId)).scope, validateScope(fixture.scope));
  // Renew after STOP keeps the focus (unchanged scope, same goalHash).
  await stopGoal(s.h.ctx, focused.goalId, 'pause');
  const renewed = await proposeVector(s.h, {goalId: focused.goalId}, {goalId: focused.goalId});
  assert.equal(renewed.goalHash, focused.goalHash);
  assert.equal(renewed.scopeRevision, 1);
  await stopGoal(s.h.ctx, focused.goalId, 'pause');
  await closeGoal(s.h.ctx, focused.goalId);
  // Part missing at the goal's base microversion.
  s.h.workspaces.get(P).sourceMicroversion = MV2;
  s.rest.data.parts.set(
    MV2,
    s.rest.data.parts.get(BASE).filter((p) => p.partId !== 'JIF'),
  );
  const goalsBefore = await listJson(join(s.h.root, 'claw-onshape', 'goals'));
  await assert.rejects(proposeVector(s.h), /selection_part_missing/);
  // Unverified selection (read failure) and invalid kind fail with that reason.
  s.rest.data.parts.set(MV2, s.rest.data.parts.get(BASE));
  s.rest.state.fail.r4 = 503;
  await assert.rejects(proposeVector(s.h), /provider_unavailable/);
  delete s.rest.state.fail.r4;
  s.rest.state.isConfigured = true;
  await assert.rejects(proposeVector(s.h), /configuration_unsupported/);
  s.rest.state.isConfigured = false;
  assert.deepEqual(await listJson(join(s.h.root, 'claw-onshape', 'goals')), goalsBefore);
  // After clear the next goal has no focus again.
  assert.equal((await s.call('work-context-clear', {expectedSelectionRevision: 1})).ok, true);
  const cleared = await proposeVector(s.h);
  assert.equal(cleared.target.focus, null);
  assert.equal((await goalStatus(s.h.ctx)).goal.target.focus, null);
});

test('§4 work-context-preview: bound element and current revision only; provider failures are preview_unavailable', async (t) => {
  const s = await setup(t);
  const ok = await s.call('work-context-preview', {elementId: E, partId: 'JIF', observedMicroversion: BASE});
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(Object.keys(ok.preview).sort(), ['dataBase64', 'mimeType', 'observedMicroversion', 'partId']);
  assert.equal(ok.preview.mimeType, 'image/png');
  assert.equal(Buffer.from(ok.preview.dataBase64, 'base64').subarray(1, 4).toString(), 'PNG');
  const r5 = s.rest.calls.find((c) => c.kind === 'r5');
  assert(r5.route.startsWith(`parts/d/${D}/m/${BASE}/e/${E}/partid/JIF/shadedviews`));
  const stale = await s.call('work-context-preview', {elementId: E, partId: 'JIF', observedMicroversion: MV2});
  assert.equal(stale.code, 'selection_observation_stale');
  const foreign = await s.call('work-context-preview', {
    elementId: 'ab'.repeat(12),
    partId: 'JIF',
    observedMicroversion: BASE,
  });
  assert.equal(foreign.code, 'selection_observation_stale');
  assert.equal(
    (await s.call('work-context-preview', {elementId: E, partId: 'J/F', observedMicroversion: BASE})).code,
    'invalid_arguments',
  );
  for (const status of [404, 503]) {
    s.rest.state.fail.r5 = status;
    assert.equal(
      (await s.call('work-context-preview', {elementId: E, partId: 'JIF', observedMicroversion: BASE})).code,
      'preview_unavailable',
    );
  }
  delete s.rest.state.fail.r5;
  // A whole-studio sized image (800 px) or an oversized one is never substituted.
  s.rest.state.image = png(800);
  assert.equal(
    (await s.call('work-context-preview', {elementId: E, partId: 'JIF', observedMicroversion: BASE})).code,
    'preview_unavailable',
  );
});

test('§6.3 Engineer onshape_status carries workContext; WC4 the Lead projection drops it', async (t) => {
  const s = await setup(t);
  await adoptJif(s);
  const cfg = {bindings: [binding], liveReads: true, goals: {enabled: true, approvalDirectory: s.h.approvalDirectory}};
  const factories = [];
  plugin.register({
    session: {controls: {registerSessionAction: () => {}}},
    registerHttpRoute: () => {},
    lifecycle: {registerRuntimeLifecycle: () => {}},
    pluginConfig: cfg,
    registerTool: (factory) => factories.push(factory.create ?? factory),
    registerCli: () => {},
    logger: {warn: () => {}},
    runtime: {
      config: {current: () => ({plugins: {entries: {'claw-onshape': {enabled: true, config: cfg}}}})},
      state: {resolveStateDir: () => s.h.root},
    },
  });
  const ctx = {
    agentId: binding.agentId,
    requesterSenderId: binding.requesterSenderId,
    messageChannel: binding.messageChannel,
    agentAccountId: binding.agentAccountId,
    assertInvocationCurrent: () => {},
  };
  const tool = factories.map((f) => f(ctx)).find((candidate) => candidate?.name === 'onshape_status');
  const result = await tool.execute('call', {});
  assert.equal(result.isError, undefined, JSON.stringify(result.details));
  const view = result.details.workContext;
  assert.deepEqual([view.validity, view.selection.partId, view.selectionRevision], ['valid', 'JIF', 1]);
  assert.deepEqual(Object.keys(view).sort(), Object.keys(strip(await contract('view-valid.json'))).sort());

  // WC4: a signed Engineer status result reaching the Lead keeps its other fields; workContext is not shown.
  const root = await mkdtemp(join(tmpdir(), 'wc-lead-'));
  try {
    const key = 'ab'.repeat(32);
    const keyFile = join(root, 'key');
    const transportTokenFile = join(root, 'transport');
    await writeFile(keyFile, key, {mode: 0o600});
    await writeFile(transportTokenFile, 'fixture-a2a', {mode: 0o600});
    const c = parseConfig({
      bindings: [{...binding, discordChannelId: '123456789012345678'}],
      delegation: {
        leadAgentId: 'lead-agent',
        engineerAgentId: binding.agentId,
        peerSenderId: 'lead',
        accountId: 'default',
        keyFile,
        transportTokenFile,
      },
    });
    let contextId;
    const details = {status: 'unavailable', code: 'disconnected', message: 'Connect Onshape', workContext: view};
    const fetcher = async (_url, init) => {
      const r = JSON.parse(init.body);
      if (r.method === 'SendMessage') {
        contextId = r.params.message.contextId;
        return json({result: {task: {id: 'task', contextId, status: {state: 'TASK_STATE_WORKING'}}}});
      }
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
    const lead = await delegateRender(
      c,
      c.bindings[0],
      () => {},
      fetcher,
      async () => {},
    );
    assert.deepEqual(lead, {status: 'unavailable', code: 'disconnected', message: 'Connect Onshape'});
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('W11 every code the work-context modules emit is in error-codes.json or an existing plugin code', async () => {
  const codes = await contract('error-codes.json');
  const listed = new Set([...codes.plugin, ...codes.reused]);
  const emitted = new Set();
  for (const name of ['work-context', 'work-context-store', 'work-context-service']) {
    const source = await readFile(new URL(`../dist/${name}.js`, import.meta.url), 'utf8');
    for (const m of source.matchAll(/\b(?:Error|fail)\('([a-z0-9_]+)'\)/g)) {
      emitted.add(m[1]);
    }
    for (const m of source.matchAll(/return '([a-z0-9_]+)'/g)) {
      emitted.add(m[1]);
    }
  }
  for (const code of [
    'selection_observation_stale',
    'selection_part_missing',
    'selection_part_unsupported',
    'configuration_unsupported',
    'selection_target_not_allowed',
    'selection_revision_conflict',
    'preview_unavailable',
    'goal_state_invalid',
  ]) {
    assert(emitted.has(code), code);
  }
  for (const code of emitted) {
    assert(listed.has(code) || Object.hasOwn(messages, code), `unlisted code ${code}`);
    assert(Object.hasOwn(messages, code), `missing message for ${code}`);
  }
  // Every contract code (new and reused) has an operator text; view reasons are not error codes.
  for (const code of [...codes.plugin, ...codes.reused]) {
    assert(Object.hasOwn(messages, code), `missing message for ${code}`);
  }
  // The dashboard and rest wiring add only listed or existing codes.
  const rest = await readFile(new URL('../dist/rest.js', import.meta.url), 'utf8');
  assert(rest.includes("'preview_unavailable'"));
});
