// Shared offline work-context harness (docs/interface/work-context.md): a fake Onshape REST built from recorded-shape
// responses in tests/fixtures/work-context/ (synthetic IDs), the dashboard action caller and the setup helpers. Every
// fetch is routed and logged; no network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {BASE, binding, D, E, featuresFixture, goalHarness, P} from './goal.mjs';
import {registerDashboard} from '../../dist/dashboard.js';
import {credentials} from '../../dist/credentials.js';
import {connectionOwner} from '../../dist/config.js';
import {crc32, IMAGE_SIZE} from '../../dist/render.js';
import {RestClient} from '../../dist/rest.js';
import {unknownMcpReadiness} from '../../dist/readiness.js';

export const T0 = 1761116400000;
export const T1 = 1761116460000;
export const CANDIDATE = 'c'.repeat(24);
export const MV2 = 'b'.repeat(24);
export const READ_ADMIN = ['operator.read', 'operator.admin'];

export const contract = async (name) =>
  JSON.parse(await readFile(new URL(`../../docs/interface/work-context-fixtures/${name}`, import.meta.url), 'utf8'));
export const recorded = async (name) =>
  JSON.parse(await readFile(new URL(`./work-context/${name}`, import.meta.url), 'utf8'));
export const strip = ({_comment, ...rest}) => rest;
export const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});

export function png(size) {
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
export const HEX = '[a-f0-9]{24}';
export async function fakeOnshape(h) {
  const data = {
    document: await recorded('document.json'),
    workspaces: await recorded('workspaces.json'),
    elements: await recorded('elements-partstudio.json'),
    configuration: await recorded('configuration.json'),
    configured: await recorded('configuration-configured.json'),
    parts: new Map([[BASE, await recorded('parts.json')]]),
    // v10/v16 Part Studio features of any workspace unless state.features answers (render, sourceRevision, goals).
    features: (await featuresFixture()).before,
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
    // Per-request failure: (kind, route) → HTTP status or undefined. Narrower than `fail` (one studio, one call).
    failIf: undefined,
    // Override of data.features per workspace: (workspaceId) → features response, undefined → 404.
    features: undefined,
    renderImage: png(IMAGE_SIZE),
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
    // workspace-context (dashboard load): the element list of the bound workspace.
    if (new RegExp(`^documents/d/${HEX}/w/${HEX}/elements$`).test(route)) {
      return 'elements';
    }
    if (new RegExp(`^documents/d/${HEX}/w/${HEX}/currentmicroversion$`).test(route)) {
      return 'r1';
    }
    if (new RegExp(`^documents/d/${HEX}/m/${HEX}/elements$`).test(route)) {
      // render: the unfiltered element list at the rendered microversion.
      if (search === '') {
        return 'elements-at-mv';
      }
      assert.equal(search, '?elementType=PARTSTUDIO');
      return 'r2';
    }
    if (new RegExp(`^partstudios/d/${HEX}/w/${HEX}/e/${HEX}/features$`).test(route)) {
      return 'features';
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
      // R8 studio preview (128 px) or the cockpit/Engineer render (IMAGE_SIZE).
      return new URLSearchParams(search).get('outputWidth') === String(IMAGE_SIZE) ? 'render' : 'r8';
    }
    return assert.fail(`unexpected REST ${route}`);
  };
  const respond = (kind, route, u) => {
    if (state.fail[kind]) {
      return json({message: 'fixture failure'}, state.fail[kind]);
    }
    const failure = state.failIf?.(kind, route);
    if (failure) {
      return json({message: 'fixture failure'}, failure);
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
      case 'elements':
      case 'elements-at-mv':
        return json(data.elements);
      case 'features': {
        const features = state.features ? state.features(workspaceId) : data.features;
        return features ? json(features) : json({message: 'fixture: no features'}, 404);
      }
      case 'render':
        return json({images: [state.renderImage.toString('base64')]});
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
    const [, version, route] = /^\/api\/(v\d+)\/(.*)$/.exec(u.pathname) ?? assert.fail(`unexpected path ${u.pathname}`);
    const kind = kindOf(route, u.search);
    // Only the goal feature reads use v16 (goal-workflow.md §6); everything else stays on v10.
    assert(version === 'v10' || (version === 'v16' && kind === 'features'), `unexpected ${version} ${route}`);
    calls.push({method, kind, route, search: u.search, version});
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

export async function saveToken(root, b = binding, accessToken = 'fixture-access-DO-NOT-LOG') {
  const store = await credentials(root, b.connectionRef, connectionOwner(b));
  await store.save({
    accessToken,
    refreshToken: 'fixture-refresh-DO-NOT-LOG',
    expiresAt: Date.now() + 3600000,
    resource: 'https://cad.onshape.com/api/',
    scopes: ['OAuth2Read'],
  });
}

// The native `openclaw mcp status --json` read of the cockpit `status` action is stubbed: tests never run openclaw.
const offlineMcpReadiness = async () => unknownMcpReadiness();

export function dashboardActions(h, config, readMcp = offlineMcpReadiness) {
  const actions = [];
  registerDashboard(
    {
      session: {controls: {registerSessionAction: (a) => actions.push(a)}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {state: {resolveStateDir: () => h.root}, config: {current: () => ({})}},
    },
    config,
    readMcp,
    h.ctx.fetcher,
    h.now,
  );
  return async (id, payload = {}, scopes = READ_ADMIN) =>
    (await actions.find((a) => a.id === id).handler({payload, client: {scopes}})).result;
}

export async function setup(t, options = {}) {
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

export const OBSERVED_AT = 1761140000000;
export const OTHER_DOC = '1111111111111111111111aa';
export const OTHER_MAIN = '1111111111111111111111ee';
export const OTHER_BRANCH = '1111111111111111111111ff';
export const EXPERIMENT = 'd'.repeat(24);
export const FASTENERS = 'ab'.repeat(12);

export async function browseSetup(t, options) {
  const s = await setup(t, options);
  s.h.advance(OBSERVED_AT - s.h.now());
  s.rest.data.documentWorkspaces.set(OTHER_DOC, [
    {id: OTHER_MAIN, documentId: OTHER_DOC, name: 'Main', isReadOnly: false},
    {id: OTHER_BRANCH, documentId: OTHER_DOC, name: 'release', isReadOnly: true, protectionRule: 'MERGE'},
  ]);
  return s;
}
export const kinds = (s) => s.rest.calls.map((c) => c.kind);
export const count = (s, kind) => s.rest.calls.filter((c) => c.kind === kind).length;

// Route template of one logged request: IDs become {d}/{w}/{m}/{e}/{pid}, the query keeps only its keys.
export function routeTemplate(call) {
  const path = call.route
    .replace(new RegExp(`^documents/${HEX}$`), 'documents/{d}')
    .replace(new RegExp(`/d/${HEX}`, 'g'), '/d/{d}')
    .replace(new RegExp(`/w/${HEX}`, 'g'), '/w/{w}')
    .replace(new RegExp(`/m/${HEX}`, 'g'), '/m/{m}')
    .replace(new RegExp(`/e/${HEX}`, 'g'), '/e/{e}')
    .replace(/\/partid\/[^/]+/, '/partid/{pid}');
  const keys = [...new URLSearchParams(call.search).keys()];
  return `${call.method} ${call.version}/${path}${keys.length ? `?${keys.join('&')}` : ''}`;
}
