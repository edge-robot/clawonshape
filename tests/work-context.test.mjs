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

// Fake Onshape REST (GET R1–R8 and the document/workspace labels). Logs every request with its method.
const HEX = '[a-f0-9]{24}';
async function fakeOnshape(h) {
  const data = {
    document: await recorded('document.json'),
    workspaces: await recorded('workspaces.json'),
    elements: await recorded('elements-partstudio.json'),
    configuration: await recorded('configuration.json'),
    configured: await recorded('configuration-configured.json'),
    parts: new Map([[BASE, await recorded('parts.json')]]),
    // §11 browsing: R6 page, other documents' labels and workspaces, parts of non-bound Part Studios.
    search: await recorded('documents-search.json'),
    documents: new Map(),
    documentWorkspaces: new Map(),
    elementParts: new Map([['ab'.repeat(12), await recorded('parts-fasteners.json')]]),
  };
  const state = {
    // R1 answers of the bound Primary: the first entries are consumed one per read; the last one sticks.
    microversions: [BASE],
    // R1 answers of any other workspace, keyed "documentId/workspaceId"; default BASE.
    otherMicroversions: new Map(),
    isConfigured: false,
    fail: {},
    image: png(256),
    studioImage: png(128),
    onRequest: undefined,
    inFlight: 0,
    maxInFlight: 0,
  };
  const calls = [];
  const kindOf = (route, search) => {
    if (route === 'documents') {
      return 'r6';
    }
    if (new RegExp(`^documents/${HEX}$`).test(route)) {
      return 'document';
    }
    if (new RegExp(`^documents/d/${HEX}/workspaces$`).test(route)) {
      return 'workspaces';
    }
    if (new RegExp(`^documents/d/${HEX}/w/${HEX}/currentmicroversion$`).test(route)) {
      return 'r1';
    }
    if (new RegExp(`^documents/d/${HEX}/m/${HEX}/elements$`).test(route)) {
      assert.equal(search, '?elementType=PARTSTUDIO');
      return 'r2';
    }
    if (new RegExp(`^elements/d/${HEX}/m/${HEX}/e/${HEX}/configuration$`).test(route)) {
      return 'r3';
    }
    if (new RegExp(`^parts/d/${HEX}/m/${HEX}/e/${HEX}$`).test(route)) {
      assert.equal(search, '');
      return 'r4';
    }
    if (new RegExp(`^parts/d/${HEX}/m/${HEX}/e/${HEX}/partid/[^/]+/shadedviews$`).test(route)) {
      return 'r5';
    }
    if (new RegExp(`^partstudios/d/${HEX}/m/${HEX}/e/${HEX}/shadedviews$`).test(route)) {
      return 'r8';
    }
    return assert.fail(`unexpected REST ${route}`);
  };
  const respond = (kind, route, u) => {
    if (state.fail[kind]) {
      return json({message: 'fixture failure'}, state.fail[kind]);
    }
    const mv = /\/m\/([a-f0-9]{24})\//.exec(route)?.[1];
    const [documentId, workspaceId] = [
      /\/d\/([a-f0-9]{24})/.exec(route)?.[1],
      /\/w\/([a-f0-9]{24})\//.exec(route)?.[1],
    ];
    const elementId = /\/e\/([a-f0-9]{24})/.exec(route)?.[1];
    switch (kind) {
      case 'r6':
        return json(data.search);
      case 'document': {
        const id = route.slice('documents/'.length);
        return json(id === D ? data.document : (data.documents.get(id) ?? {id, name: null}));
      }
      case 'workspaces':
        return json(documentId === D ? data.workspaces : (data.documentWorkspaces.get(documentId) ?? []));
      case 'r1':
        if (documentId === D && workspaceId === P) {
          return json({
            microversion: state.microversions.length > 1 ? state.microversions.shift() : state.microversions[0],
          });
        }
        return json({microversion: state.otherMicroversions.get(`${documentId}/${workspaceId}`) ?? BASE});
      case 'r2':
        return json(data.elements);
      case 'r3':
        return json(state.isConfigured ? data.configured : data.configuration);
      case 'r4':
        return json(
          elementId === E ? (data.parts.get(mv) ?? data.parts.get(BASE)) : (data.elementParts.get(elementId) ?? []),
        );
      case 'r8':
        assert(u.searchParams.get('outputWidth') === '128' && u.searchParams.get('pixelSize') === '0');
        return json({images: [state.studioImage.toString('base64')]});
      default:
        assert(u.searchParams.get('outputWidth') === '256' && u.searchParams.get('pixelSize') === '0');
        return json({images: [state.image.toString('base64')]});
    }
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
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    try {
      await state.onRequest?.(kind, route);
      return respond(kind, route, u);
    } finally {
      state.inFlight -= 1;
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

// work-context-1.1.0 §11.2 extends the preview: any Part Studio of the workspace at observedMicroversion (W15); an
// element that is not a Part Studio there is still selection_observation_stale.
test('§4 work-context-preview: current revision and a Part Studio of that revision; provider failures are preview_unavailable', async (t) => {
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
    elementId: '9'.repeat(24),
    partId: 'JIF',
    observedMicroversion: BASE,
  });
  assert.equal(foreign.code, 'selection_observation_stale');
  assert.equal(
    (await s.call('work-context-preview', {elementId: E, partId: 'J/F', observedMicroversion: BASE})).code,
    'invalid_arguments',
  );
  // JIF is cached at BASE now (§11.4, immutable at mv); the failure cases use parts not previewed yet.
  for (const status of [404, 503]) {
    s.rest.state.fail.r5 = status;
    assert.equal(
      (await s.call('work-context-preview', {elementId: E, partId: 'JIG', observedMicroversion: BASE})).code,
      'preview_unavailable',
    );
  }
  delete s.rest.state.fail.r5;
  // A whole-studio sized image (800 px) or an oversized one is never substituted.
  s.rest.state.image = png(800);
  assert.equal(
    (await s.call('work-context-preview', {elementId: E, partId: 'JHD', observedMicroversion: BASE})).code,
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
  const viewReasons = new Set(codes.viewReasons);
  const emitted = new Set();
  // §11.3 view reasons are returned as values (never thrown); they must be listed as view reasons.
  const reasons = new Set();
  for (const name of ['work-context', 'work-context-store', 'work-context-service', 'work-context-cache']) {
    const source = await readFile(new URL(`../dist/${name}.js`, import.meta.url), 'utf8');
    for (const m of source.matchAll(/\b(?:Error|fail)\('([a-z0-9_]+)'\)/g)) {
      emitted.add(m[1]);
    }
    for (const m of source.matchAll(/return '([a-z0-9_]+)'/g)) {
      (viewReasons.has(m[1]) && !listed.has(m[1]) ? reasons : emitted).add(m[1]);
    }
    for (const pattern of [/\? '([a-z0-9_]+)' :/g, /: '([a-z0-9_]+)';/g]) {
      for (const m of source.matchAll(pattern)) {
        reasons.add(m[1]);
      }
    }
  }
  for (const reason of reasons) {
    assert(viewReasons.has(reason) || listed.has(reason), `unlisted view reason ${reason}`);
  }
  for (const reason of [
    'document_not_provisioned',
    'workspace_inspection_only',
    'candidate_inspection_only',
    'part_search_truncated',
  ]) {
    assert(reasons.has(reason), reason);
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
    // §11.5
    'document_not_accessible',
    'provider_quota_exhausted',
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

// ---------------------------------------------------------------------------------------------------------------------
// work-context-1.1.0-draft §11 browsing: W12–W18.
const OBSERVED_AT = 1761140000000;
const OTHER_DOC = '1111111111111111111111aa';
const OTHER_MAIN = '1111111111111111111111ee';
const OTHER_BRANCH = '1111111111111111111111ff';
const EXPERIMENT = 'd'.repeat(24);
const FASTENERS = 'ab'.repeat(12);

async function browseSetup(t, options) {
  const s = await setup(t, options);
  s.h.advance(OBSERVED_AT - s.h.now());
  s.rest.data.documentWorkspaces.set(OTHER_DOC, [
    {id: OTHER_MAIN, documentId: OTHER_DOC, name: 'Main', isReadOnly: false},
    {id: OTHER_BRANCH, documentId: OTHER_DOC, name: 'release', isReadOnly: true, protectionRule: 'MERGE'},
  ]);
  return s;
}
const kinds = (s) => s.rest.calls.map((c) => c.kind);
const count = (s, kind) => s.rest.calls.filter((c) => c.kind === kind).length;

test('W12 documents: page 0 pins the bound document, drops folders and trash, no owner data; equals document-page.json', async (t) => {
  const s = await browseSetup(t);
  const result = await s.call('work-context-documents', {query: '  mount '});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.documents, strip(await contract('document-page.json')));
  // One R6 read (GET, server-side q, modifiedAt desc, offset 0, 20 per page, no filter); the bound document came from
  // the page itself, so no R0 label read.
  assert.deepEqual(kinds(s), ['r6']);
  const r6 = new URLSearchParams(s.rest.calls[0].search);
  assert.deepEqual(Object.fromEntries(r6), {
    q: 'mount',
    sortColumn: 'modifiedAt',
    sortOrder: 'desc',
    offset: '0',
    limit: '20',
  });
  // Only id, name, modifiedAt (and defaultWorkspace.id internally) reach the view.
  const text = JSON.stringify(result);
  for (const secret of ['example.invalid', 'fixture-owner', 'permissionSet', 'READ', 'thumbnail', 'Mount folder']) {
    assert(!text.includes(secret), secret);
  }
  assert(!text.includes('4444444444444444444444dd'), 'trashed document listed');
  // Page 1: nothing pinned, the bound document is never repeated.
  const next = await s.call('work-context-documents', {query: 'mount', offset: 20});
  assert.deepEqual(
    next.documents.items.map((d) => [d.documentId, d.bound, d.reason]),
    [
      [OTHER_DOC, false, 'document_not_provisioned'],
      ['2222222222222222222222bb', false, 'document_not_provisioned'],
    ],
  );
  assert.deepEqual([next.documents.offset, next.documents.hasMore], [20, true]);
  assert.equal(new URLSearchParams(s.rest.calls.at(-1).search).get('offset'), '20');
  // Filters map to getDocuments filter values.
  for (const [filter, value] of [
    ['recent', '5'],
    ['mine', '0'],
    ['shared', '2'],
  ]) {
    await s.call('work-context-documents', {query: 'mount', filter});
    assert.equal(new URLSearchParams(s.rest.calls.at(-1).search).get('filter'), value, filter);
  }
  // The bound document is pinned even when the page does not contain it and hasMore follows `next`. Its labels come
  // from the R0 label read once the earlier listing has expired (TTL 60 s).
  s.h.advance(60_000);
  s.rest.data.search = {items: [s.rest.data.search.items[0]], next: null};
  const pinned = await s.call('work-context-documents', {query: 'library'});
  assert.deepEqual(
    pinned.documents.items.map((d) => [d.documentId, d.name, d.modifiedAt, d.bound]),
    [
      [D, 'Camera Mount', null, true],
      [OTHER_DOC, 'Mount Bracket Library', '2026-10-20T08:30:00Z', false],
    ],
  );
  assert.equal(pinned.documents.hasMore, false);
  assert.deepEqual(kinds(s).slice(-2), ['r6', 'document']);
  // Input validation (§11.2, §11.4).
  for (const payload of [
    {offset: 7},
    {offset: -20},
    {offset: '0'},
    {query: 'x'.repeat(101)},
    {query: 'a\u0000b'},
    {query: 5},
    {filter: 'trash'},
    {extra: true},
  ]) {
    assert.equal((await s.call('work-context-documents', payload)).code, 'invalid_arguments', JSON.stringify(payload));
  }
  // NFC normalization: a decomposed query is sent composed.
  await s.call('work-context-documents', {query: 'Gehäuse'});
  assert.equal(new URLSearchParams(s.rest.calls.at(-1).search).get('q'), 'Gehäuse');
  // More than one provider page or a malformed page fails closed.
  s.rest.data.search = {items: Array.from({length: 21}, () => ({jsonType: 'folder'})), next: null};
  assert.equal((await s.call('work-context-documents', {query: 'many'})).code, 'provider_protocol_error');
  s.rest.data.search = {items: [{jsonType: 'document-summary', id: 'not-an-id'}]};
  assert.equal((await s.call('work-context-documents', {query: 'bad'})).code, 'provider_protocol_error');
  assert(s.rest.calls.every((c) => c.method === 'GET'));
});

test('W13 workspaces: roles primary/candidate/default/other, eligibility from the binding only; equals workspace-list.json', async (t) => {
  const s = await browseSetup(t);
  await seedGoal(s.h, 'STOPPED', {candidateWorkspaceId: CANDIDATE});
  s.rest.data.workspaces = await recorded('workspaces-browse.json');
  const result = await s.call('work-context-workspaces', {documentId: D});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.workspaces, strip(await contract('workspace-list.json')));
  // Provider protection flags are labels: the MERGE-protected Primary and the OPEN workspaces are not re-ranked by it.
  assert.deepEqual(kinds(s), ['workspaces']);
  // A non-bound document: the provider default workspace (from the R6 listing, no extra read) is `default`; every
  // workspace is inspection-only with document_not_provisioned; isReadOnly is a label only.
  await s.call('work-context-documents', {query: 'mount'});
  const before = s.rest.calls.length;
  const other = await s.call('work-context-workspaces', {documentId: OTHER_DOC});
  assert.deepEqual(other.workspaces.items, [
    {
      workspaceId: OTHER_MAIN,
      name: 'Main',
      role: 'default',
      readOnly: false,
      goalEligible: false,
      reason: 'document_not_provisioned',
    },
    {
      workspaceId: OTHER_BRANCH,
      name: 'release',
      role: 'other',
      readOnly: true,
      goalEligible: false,
      reason: 'document_not_provisioned',
    },
  ]);
  assert.deepEqual(kinds(s).slice(before), ['workspaces']);
  // Without a prior listing the default workspace comes from the R0 label read.
  const unlisted = '5'.repeat(24);
  s.rest.data.documents.set(unlisted, {id: unlisted, name: 'Unlisted', defaultWorkspace: {id: '6'.repeat(24)}});
  s.rest.data.documentWorkspaces.set(unlisted, [
    {id: '7'.repeat(24), name: 'side'},
    {id: '6'.repeat(24), name: 'Main'},
  ]);
  const fresh = await s.call('work-context-workspaces', {documentId: unlisted});
  assert.deepEqual(
    fresh.workspaces.items.map((w) => [w.workspaceId, w.role]),
    [
      ['6'.repeat(24), 'default'],
      ['7'.repeat(24), 'other'],
    ],
  );
  assert.deepEqual(kinds(s).slice(-2), ['workspaces', 'document']);
  // A workspace of another document in the list, duplicates and a missing Primary fail closed.
  s.rest.data.documentWorkspaces.set('8'.repeat(24), [{id: '9'.repeat(24), documentId: OTHER_DOC}]);
  assert.equal((await s.call('work-context-workspaces', {documentId: '8'.repeat(24)})).code, 'provider_protocol_error');
  s.rest.data.workspaces = [{id: CANDIDATE, documentId: D, name: 'goal-candidate'}];
  // Cached for 30 s (§11.4): the earlier valid list is still served, then the malformed one fails closed.
  const cached = await s.call('work-context-workspaces', {documentId: D, connectionRef: 'owner-rest'});
  assert.equal(cached.ok, true, JSON.stringify(cached));
  assert.deepEqual(cached.workspaces.items, result.workspaces.items);
  s.h.advance(30_000);
  assert.equal((await s.call('work-context-workspaces', {documentId: D})).code, 'provider_protocol_error');
  for (const payload of [{}, {documentId: 'x'}, {documentId: D, extra: 1}]) {
    assert.equal((await s.call('work-context-workspaces', payload)).code, 'invalid_arguments', JSON.stringify(payload));
  }
});

test('W14 parts: per-studio R4 at m/{mv}, R1 recheck, name and part-number filter, order, reasons; equals part-search.json', async (t) => {
  const s = await browseSetup(t);
  const result = await s.call('work-context-parts', {documentId: D, workspaceId: P, query: 'clamp'});
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.parts, strip(await contract('part-search.json')));
  // R1 → R2 → R3 (bound studio only) → R4 × studios → R1, every pinned read at the R1 microversion.
  assert.deepEqual(kinds(s), ['r1', 'r2', 'r3', 'r4', 'r4', 'r1']);
  assert(s.rest.calls.filter((c) => ['r2', 'r3', 'r4'].includes(c.kind)).every((c) => c.route.includes(`/m/${BASE}`)));
  assert.deepEqual(
    s.rest.calls.filter((c) => c.kind === 'r4').map((c) => c.route.split('/e/')[1]),
    [E, FASTENERS],
  );
  // Part-number match, case-insensitive; the second search is served from the microversion cache (R1 twice only).
  const byNumber = await s.call('work-context-parts', {documentId: D, workspaceId: P, query: 'fb-004'});
  assert.deepEqual(
    byNumber.parts.hits.map((h) => [h.name, h.partNumber, h.reason]),
    [
      ['Clamp bolt', 'FB-0042', 'element_not_provisioned'],
      ['Washer', 'FB-0043', 'element_not_provisioned'],
    ],
  );
  assert.deepEqual(kinds(s).slice(6), ['r1', 'r1']);
  // No query: every part (bounded), same-name parts distinct by partId, kind and hidden flags kept.
  const all = await s.call('work-context-parts', {documentId: D, workspaceId: P});
  assert.deepEqual(
    all.parts.hits.map((h) => [h.name, h.partId, h.selectable, h.reason, h.hidden]),
    [
      ['Bracket', 'JHD', true, null, false],
      ['Bracket', 'JHH', true, null, true],
      ['Clamp bolt', 'JFD', false, 'element_not_provisioned', false],
      ['Clamp left', 'JIF', true, null, false],
      ['Clamp right', 'JIG', true, null, false],
      ['Cover surface', 'JKD', false, 'part_kind_unsupported', false],
      ['Washer', 'JFH', false, 'element_not_provisioned', false],
    ],
  );
  // One studio only; an element that is not a Part Studio at mv is refused.
  const one = await s.call('work-context-parts', {documentId: D, workspaceId: P, elementId: FASTENERS});
  assert.deepEqual(
    one.parts.hits.map((h) => h.partId),
    ['JFD', 'JFH'],
  );
  assert.equal(one.parts.studios.length, 2);
  assert.equal(
    (await s.call('work-context-parts', {documentId: D, workspaceId: P, elementId: '9'.repeat(24)})).code,
    'target_not_part_studio',
  );
  // NFC: a decomposed query matches a composed name.
  s.rest.data.elementParts.set(FASTENERS, [
    {...s.rest.data.elementParts.get(FASTENERS)[0], name: 'Gehäuse', partId: 'JGH'},
  ]);
  s.rest.state.otherMicroversions.set(`${D}/${EXPERIMENT}`, MV2);
  const nfc = await s.call('work-context-parts', {documentId: D, workspaceId: EXPERIMENT, query: 'GEHÄUSE'});
  assert.deepEqual(
    nfc.parts.hits.map((h) => [h.partId, h.reason]),
    [['JGH', 'workspace_inspection_only']],
  );
  // Reason order: a non-Primary workspace never reads R3; every studio and hit says workspace_inspection_only.
  assert.deepEqual(
    nfc.parts.studios.map((st) => [st.reason, st.configurationChecked, st.goalEligible]),
    [
      ['workspace_inspection_only', false, false],
      ['workspace_inspection_only', false, false],
    ],
  );
  assert(!s.rest.calls.some((c) => c.kind === 'r3' && c.route.includes(`/m/${MV2}/`)));
  // Equal partIds in different workspaces are different parts: the hit is tied to its own workspace and microversion.
  assert.deepEqual([nfc.parts.workspaceId, nfc.parts.observedMicroversion], [EXPERIMENT, MV2]);
  // The Candidate of the current goal says candidate_inspection_only.
  await seedGoal(s.h, 'STOPPED', {candidateWorkspaceId: CANDIDATE});
  const candidate = await s.call('work-context-parts', {documentId: D, workspaceId: CANDIDATE, query: 'clamp left'});
  assert.deepEqual(
    candidate.parts.hits.map((h) => [h.partId, h.selectable, h.reason]),
    [['JIF', false, 'candidate_inspection_only']],
  );
  // A non-bound document: document_not_provisioned first.
  const foreign = await s.call('work-context-parts', {documentId: OTHER_DOC, workspaceId: OTHER_MAIN, query: 'clamp'});
  assert(foreign.parts.hits.length > 0);
  assert(foreign.parts.hits.every((h) => h.reason === 'document_not_provisioned' && !h.selectable));
  assert(foreign.parts.studios.every((st) => st.reason === 'document_not_provisioned'));
  // Configured bound studio: configuration_unsupported comes before part_kind_unsupported.
  s.rest.state.otherMicroversions.clear();
  s.rest.state.microversions = [MV2];
  s.rest.data.parts.set(MV2, s.rest.data.parts.get(BASE));
  s.rest.state.isConfigured = true;
  const configured = await s.call('work-context-parts', {documentId: D, workspaceId: P, query: 'c'});
  assert.deepEqual(
    configured.parts.studios.map((st) => [st.reason, st.configurationChecked]),
    [
      ['configuration_unsupported', true],
      ['element_not_provisioned', false],
    ],
  );
  assert(
    configured.parts.hits
      .filter((h) => h.elementId === E)
      .every((h) => h.reason === 'configuration_unsupported' && !h.selectable),
  );
  s.rest.state.isConfigured = false;
});

test('W14 parts: R1 recheck, truncation limits and malformed parts', async (t) => {
  const s = await browseSetup(t);
  s.rest.state.microversions = [BASE, MV2];
  assert.equal(
    (await s.call('work-context-parts', {documentId: D, workspaceId: P})).code,
    'selection_observation_stale',
  );
  // More than 20 Part Studios: 20 are scanned, the result says part_search_truncated.
  s.rest.state.microversions = ['1'.repeat(24)];
  const studios = Array.from({length: 21}, (_, i) => ({
    id: `${String(i).padStart(2, '0')}${'f'.repeat(22)}`,
    name: `Studio ${i}`,
    elementType: 'PARTSTUDIO',
  }));
  s.rest.data.elements = studios;
  const r4Before = count(s, 'r4');
  let result = await s.call('work-context-parts', {documentId: D, workspaceId: P});
  assert.deepEqual([result.parts.truncated, result.parts.truncatedReason], [true, 'part_search_truncated']);
  assert.equal(result.parts.studios.length, 21);
  assert.equal(count(s, 'r4') - r4Before, 20);
  // More than 100 hits.
  s.rest.state.microversions = ['2'.repeat(24)];
  s.rest.data.elements = [{id: FASTENERS, name: 'Fasteners', elementType: 'PARTSTUDIO'}];
  const many = Array.from({length: 101}, (_, i) => ({
    name: `Pin ${String(i).padStart(3, '0')}`,
    partId: `P${i}`,
    bodyType: 'solid',
    isMesh: false,
    isFlattenedBody: false,
  }));
  s.rest.data.elementParts.set(FASTENERS, many);
  result = await s.call('work-context-parts', {documentId: D, workspaceId: P, query: 'pin'});
  assert.deepEqual([result.parts.hits.length, result.parts.truncated], [100, true]);
  assert.equal(result.parts.hits[0].name, 'Pin 000');
  // A narrower query is not truncated.
  result = await s.call('work-context-parts', {documentId: D, workspaceId: P, query: 'pin 05'});
  assert.deepEqual([result.parts.hits.length, result.parts.truncated, result.parts.truncatedReason], [10, false, null]);
  // More than 500 parts in one studio.
  s.rest.state.microversions = ['3'.repeat(24)];
  s.rest.data.elementParts.set(
    FASTENERS,
    Array.from({length: 501}, (_, i) => ({...many[0], partId: `Q${i}`, name: `Nut ${i}`})),
  );
  result = await s.call('work-context-parts', {documentId: D, workspaceId: P, query: 'zzz'});
  assert.deepEqual([result.parts.hits.length, result.parts.truncated], [0, true]);
  // An invalid partId fails the whole read.
  s.rest.state.microversions = ['4'.repeat(24)];
  s.rest.data.elementParts.set(FASTENERS, [{...many[0], partId: 'J H'}]);
  assert.equal((await s.call('work-context-parts', {documentId: D, workspaceId: P})).code, 'provider_protocol_error');
  for (const payload of [
    {documentId: D},
    {documentId: D, workspaceId: 'x'},
    {documentId: D, workspaceId: P, elementId: 'x'},
    {documentId: D, workspaceId: P, query: 'x'.repeat(101)},
    {documentId: D, workspaceId: P, partId: 'JIF'},
  ]) {
    assert.equal((await s.call('work-context-parts', payload)).code, 'invalid_arguments', JSON.stringify(payload));
  }
});

test('W15 preview of a non-bound part and of a Part Studio (R8) with the R1 rule of that workspace', async (t) => {
  const s = await browseSetup(t);
  // A non-bound Part Studio of the bound Primary.
  const part = await s.call('work-context-preview', {elementId: FASTENERS, partId: 'JFD', observedMicroversion: BASE});
  assert.equal(part.ok, true, JSON.stringify(part));
  assert.equal(part.preview.partId, 'JFD');
  assert(s.rest.calls.at(-1).route.startsWith(`parts/d/${D}/m/${BASE}/e/${FASTENERS}/partid/JFD/shadedviews`));
  // A part of a non-bound document: R1 of that workspace decides.
  const foreign = {
    documentId: OTHER_DOC,
    workspaceId: OTHER_MAIN,
    elementId: FASTENERS,
    partId: 'JFH',
    observedMicroversion: BASE,
  };
  assert.equal((await s.call('work-context-preview', foreign)).ok, true);
  const r1 = s.rest.calls.filter((c) => c.kind === 'r1').at(-1);
  assert.equal(r1.route, `documents/d/${OTHER_DOC}/w/${OTHER_MAIN}/currentmicroversion`);
  s.rest.state.otherMicroversions.set(`${OTHER_DOC}/${OTHER_MAIN}`, MV2);
  assert.equal((await s.call('work-context-preview', foreign)).code, 'selection_observation_stale');
  // The bound Primary's revision does not stand in for another workspace's revision.
  assert.equal((await s.call('work-context-preview', {...foreign, observedMicroversion: MV2})).ok, true);
  // Part Studio preview (no partId): R8 at 128 px, partId null.
  const studio = await s.call('work-context-preview', {elementId: E, observedMicroversion: BASE});
  assert.equal(studio.ok, true, JSON.stringify(studio));
  assert.deepEqual([studio.preview.partId, studio.preview.mimeType], [null, 'image/png']);
  assert.equal(Buffer.from(studio.preview.dataBase64, 'base64').readUInt32BE(16), 128);
  assert(s.rest.calls.at(-1).route.startsWith(`partstudios/d/${D}/m/${BASE}/e/${E}/shadedviews`));
  // R8 failures and a wrongly sized studio image are preview_unavailable, never a substitute.
  s.rest.state.fail.r8 = 500;
  assert.equal(
    (await s.call('work-context-preview', {elementId: FASTENERS, observedMicroversion: BASE})).code,
    'preview_unavailable',
  );
  delete s.rest.state.fail.r8;
  s.rest.state.studioImage = png(256);
  assert.equal(
    (await s.call('work-context-preview', {elementId: FASTENERS, observedMicroversion: BASE})).code,
    'preview_unavailable',
  );
  // A non-bound document needs its workspace; inputs are strict.
  for (const payload of [
    {documentId: OTHER_DOC, elementId: FASTENERS, observedMicroversion: BASE},
    {documentId: 'x', workspaceId: OTHER_MAIN, elementId: FASTENERS, observedMicroversion: BASE},
    {elementId: E, partId: 'JIF', observedMicroversion: BASE, query: 'x'},
  ]) {
    assert.equal((await s.call('work-context-preview', payload)).code, 'invalid_arguments', JSON.stringify(payload));
  }
  // Preview writes nothing.
  assert.equal(await readRecordFile(s.h), undefined);
  assert(s.rest.calls.every((c) => c.method === 'GET'));
});

test('W16 adopt of any hit outside §1 → selection_target_not_allowed, record unchanged', async (t) => {
  const s = await browseSetup(t);
  await adoptJif(s);
  const previous = await readRecordFile(s.h);
  s.rest.data.workspaces = await recorded('workspaces-browse.json');
  const searches = [
    {documentId: D, workspaceId: P, query: 'clamp bolt'},
    {documentId: D, workspaceId: EXPERIMENT, query: 'clamp'},
    {documentId: OTHER_DOC, workspaceId: OTHER_MAIN, query: 'clamp'},
  ];
  let tried = 0;
  for (const search of searches) {
    const {parts} = await s.call('work-context-parts', search);
    for (const hit of parts.hits) {
      assert.equal(hit.selectable, false, JSON.stringify(hit));
      const result = await s.call(
        'work-context-adopt',
        await adoptRequest({
          expectedSelectionRevision: 1,
          documentId: parts.documentId,
          workspaceId: parts.workspaceId,
          elementId: hit.elementId,
          partId: hit.partId,
          observedMicroversion: parts.observedMicroversion,
        }),
      );
      assert.deepEqual([result.ok, result.code], [false, 'selection_target_not_allowed'], JSON.stringify(hit));
      assert.equal(await readRecordFile(s.h), previous);
      tried += 1;
    }
  }
  assert(tried >= 5, String(tried));
});

// A dashboard whose runtime lifecycle registrations are captured (dispose of the browsing cache).
function lifecycleDashboard(s) {
  const actions = [];
  const lifecycles = [];
  registerDashboard(
    {
      session: {controls: {registerSessionAction: (a) => actions.push(a)}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: (l) => lifecycles.push(l)},
      runtime: {state: {resolveStateDir: () => s.h.root}, config: {current: () => ({})}},
    },
    s.config,
    undefined,
    s.h.ctx.fetcher,
    s.h.now,
  );
  const call = async (id, payload = {}) =>
    (await actions.find((a) => a.id === id).handler({payload, client: {scopes: READ_ADMIN}})).result;
  return {call, lifecycles};
}

test('W17 cache: hit within TTL, dropped on authorization change, reconnect, disconnect and dispose; one read in flight', async (t) => {
  const s = await browseSetup(t);
  const documents = () => s.call('work-context-documents', {query: 'mount'});
  await documents();
  await documents();
  assert.equal(count(s, 'r6'), 1);
  // TTL 60 s for R6.
  s.h.advance(59_999);
  await documents();
  assert.equal(count(s, 'r6'), 1);
  s.h.advance(1);
  await documents();
  assert.equal(count(s, 'r6'), 2);
  // TTL 30 s for R7.
  await s.call('work-context-workspaces', {documentId: D});
  s.h.advance(29_999);
  await s.call('work-context-workspaces', {documentId: D});
  assert.equal(count(s, 'workspaces'), 1);
  s.h.advance(1);
  await s.call('work-context-workspaces', {documentId: D});
  assert.equal(count(s, 'workspaces'), 2);
  // Microversion-keyed reads (R2/R3/R4) are reused; R1 is always read.
  await s.call('work-context-parts', {documentId: D, workspaceId: P});
  await s.call('work-context-parts', {documentId: D, workspaceId: P, query: 'x'});
  assert.deepEqual([count(s, 'r2'), count(s, 'r3'), count(s, 'r4'), count(s, 'r1')], [1, 1, 2, 4]);
  // Authorization change: a fresh partition.
  const original = s.config();
  s.setConfig(
    parseConfig({
      bindings: [binding],
      liveReads: true,
      goals: {enabled: true, approvalDirectory: join(s.h.root, 'approval-2')},
    }),
  );
  await documents();
  assert.equal(count(s, 'r6'), 3);
  await documents();
  assert.equal(count(s, 'r6'), 3);
  // Reconnect (another access token): a fresh partition.
  await saveToken(s.h.root, binding, 'fixture-access-reconnected-DO-NOT-LOG');
  await documents();
  assert.equal(count(s, 'r6'), 4);
  // Disconnect: nothing cached is served.
  const store = await credentials(s.h.root, binding.connectionRef, connectionOwner(binding));
  await store.save(null);
  assert.equal((await documents()).code, 'reconnect_required');
  assert.equal((await s.call('work-context-parts', {documentId: D, workspaceId: P})).code, 'reconnect_required');
  assert.equal(count(s, 'r6'), 4);
  await saveToken(s.h.root, binding, 'fixture-access-reconnected-DO-NOT-LOG');
  s.setConfig(original);
  // Live reads off: no cached data either.
  s.setConfig(parseConfig({...original, liveReads: false}));
  assert.equal((await documents()).code, 'live_reads_disabled');
  s.setConfig(original);
  // dispose clears the plugin instance's cache.
  const d = lifecycleDashboard(s);
  await d.call('work-context-documents', {query: 'dispose'});
  await d.call('work-context-documents', {query: 'dispose'});
  assert.equal(count(s, 'r6'), 5);
  const lifecycle = d.lifecycles.find((l) => l.id === 'work-context-browse-cache');
  await lifecycle.dispose();
  await d.call('work-context-documents', {query: 'dispose'});
  assert.equal(count(s, 'r6'), 6);
  await lifecycle.cleanup({reason: 'reset'});
  await d.call('work-context-documents', {query: 'dispose'});
  assert.equal(count(s, 'r6'), 7);
  // One provider read in flight per connection, even with concurrent browsing requests.
  s.rest.state.maxInFlight = 0;
  s.rest.state.onRequest = () => new Promise((resolve) => setTimeout(resolve, 2));
  const results = await Promise.all([
    s.call('work-context-documents', {query: 'parallel'}),
    s.call('work-context-workspaces', {documentId: OTHER_DOC}),
    s.call('work-context-parts', {documentId: OTHER_DOC, workspaceId: OTHER_MAIN}),
    s.call('work-context-parts', {documentId: OTHER_DOC, workspaceId: OTHER_MAIN}),
    s.call('work-context-preview', {elementId: E, partId: 'JHD', observedMicroversion: BASE}),
  ]);
  assert(
    results.every((r) => r.ok),
    JSON.stringify(results.map((r) => r.code)),
  );
  assert.equal(s.rest.state.maxInFlight, 1);
  // The second identical parts search was served from the cache after the first finished.
  assert.equal(s.rest.calls.filter((c) => c.kind === 'r4' && c.route.startsWith(`parts/d/${OTHER_DOC}/`)).length, 2);
  // Cached data never leaves memory: no browsing file in the state directory.
  const files = await readdir(join(s.h.root, 'claw-onshape'), {recursive: true});
  assert(!files.some((f) => /browse|cache|documents/.test(f)), JSON.stringify(files));
});

test('W18 402 → provider_quota_exhausted, 403/404 on a listed document → document_not_accessible, 429 without retry', async (t) => {
  const s = await browseSetup(t);
  const cases = [
    ['r6', 402, 'work-context-documents', {query: 'a'}, 'provider_quota_exhausted'],
    ['r6', 429, 'work-context-documents', {query: 'b'}, 'provider_rate_limited'],
    ['workspaces', 403, 'work-context-workspaces', {documentId: OTHER_DOC}, 'document_not_accessible'],
    ['workspaces', 404, 'work-context-workspaces', {documentId: '5'.repeat(24)}, 'document_not_accessible'],
    ['workspaces', 402, 'work-context-workspaces', {documentId: '6'.repeat(24)}, 'provider_quota_exhausted'],
    ['r1', 404, 'work-context-parts', {documentId: OTHER_DOC, workspaceId: OTHER_MAIN}, 'document_not_accessible'],
    ['r1', 403, 'work-context-parts', {documentId: OTHER_DOC, workspaceId: OTHER_BRANCH}, 'document_not_accessible'],
    ['r1', 429, 'work-context-parts', {documentId: D, workspaceId: EXPERIMENT}, 'provider_rate_limited'],
    ['r2', 403, 'work-context-parts', {documentId: OTHER_DOC, workspaceId: OTHER_MAIN}, 'document_not_accessible'],
    ['r4', 402, 'work-context-parts', {documentId: OTHER_DOC, workspaceId: OTHER_MAIN}, 'provider_quota_exhausted'],
    [
      'r1',
      404,
      'work-context-preview',
      {documentId: OTHER_DOC, workspaceId: OTHER_MAIN, elementId: E, observedMicroversion: BASE},
      'document_not_accessible',
    ],
    // The bound Primary keeps its 1.0 preview code for a missing document.
    ['r1', 404, 'work-context-preview', {elementId: E, observedMicroversion: BASE}, 'provider_not_found'],
  ];
  for (const [kind, status, action, payload, code] of cases) {
    const before = count(s, kind);
    s.rest.state.fail[kind] = status;
    const result = await s.call(action, payload);
    delete s.rest.state.fail[kind];
    assert.deepEqual([result.ok, result.code], [false, code], `${kind} ${status} ${action}`);
    // Exactly one failing read: no automatic retry.
    assert.equal(count(s, kind) - before, 1, `${kind} ${status} retried`);
    assert(Object.hasOwn(messages, code), code);
  }
  // Existing callers keep their codes: the catalog still reports 402 as provider_unavailable (http.ts unchanged).
  s.rest.state.fail.r2 = 402;
  assert.equal((await s.call('work-context-catalog')).code, 'provider_unavailable');
  delete s.rest.state.fail.r2;
  // Failures are not cached: the same read succeeds afterwards.
  assert.equal((await s.call('work-context-documents', {query: 'a'})).ok, true);
});

test('B6 browsing is dashboard-only: no agent tool or status path reaches the browsing reads', async () => {
  const index = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');
  for (const name of ['workContextDocuments', 'workContextWorkspaces', 'workContextParts', 'documentSearch']) {
    assert(!index.includes(name), name);
  }
  const manifest = JSON.parse(await readFile(new URL('../openclaw.plugin.json', import.meta.url), 'utf8'));
  assert(!JSON.stringify(manifest.contracts?.tools ?? []).includes('work-context'));
});

test('W17 BrowseCache: a superseded scope neither reads nor writes; LRU bounds by entries and bytes; TTL', async () => {
  const {BrowseCache, MV_CACHE_ENTRIES, MV_CACHE_BYTES} = await import('../dist/work-context-cache.js');
  let clock = 0;
  const cache = new BrowseCache(() => clock);
  const old = cache.access('owner-rest', 'scope-1');
  let release;
  const pending = old.pinned('k', () => new Promise((resolve) => (release = resolve)));
  // The authorization changed while the old read was in flight.
  const fresh = cache.access('owner-rest', 'scope-2');
  release('stale-value');
  assert.equal(await pending, 'stale-value');
  let loads = 0;
  assert.equal(
    await fresh.pinned('k', async () => {
      loads += 1;
      return 'fresh-value';
    }),
    'fresh-value',
  );
  assert.equal(loads, 1);
  // The old scope cannot read the new data either.
  assert.equal(await old.pinned('k', async () => 'old-load'), 'old-load');
  // Partitions are per connection.
  assert.equal(await cache.access('other-ref', 'scope-2').pinned('k', async () => 'other'), 'other');
  // Entry bound.
  const lru = cache.access('lru', 's');
  for (let i = 0; i <= MV_CACHE_ENTRIES; i += 1) {
    await lru.pinned(`e${i}`, async () => i);
  }
  assert.equal(await lru.pinned('e0', async () => 'reloaded'), 'reloaded');
  assert.equal(await lru.pinned(`e${MV_CACHE_ENTRIES}`, async () => 'reloaded'), MV_CACHE_ENTRIES);
  // Byte bound: two half-size buffers evict the oldest; an oversized value is never stored.
  const bytes = cache.access('bytes', 's');
  await bytes.pinned('a', async () => Buffer.alloc(MV_CACHE_BYTES / 2));
  await bytes.pinned('b', async () => Buffer.alloc(MV_CACHE_BYTES / 2));
  await bytes.pinned('c', async () => Buffer.alloc(1));
  assert.equal(await bytes.pinned('a', async () => 'evicted'), 'evicted');
  await bytes.pinned('huge', async () => Buffer.alloc(MV_CACHE_BYTES + 1));
  assert.equal(await bytes.pinned('huge', async () => 'not-stored'), 'not-stored');
  // TTL and clear().
  const timed = cache.access('ttl', 's');
  await timed.timed('t', 10, async () => 1);
  clock = 9;
  assert.equal(await timed.timed('t', 10, async () => 2), 1);
  clock = 10;
  assert.equal(await timed.timed('t', 10, async () => 3), 3);
  cache.clear();
  assert.equal(await cache.access('ttl', 's').timed('t', 10, async () => 4), 4);
  // A failing read does not block the per-connection queue.
  const queue = cache.access('queue', 's');
  await assert.rejects(queue.exclusive(async () => assert.fail('boom')));
  assert.equal(await queue.exclusive(async () => 'next'), 'next');
});
