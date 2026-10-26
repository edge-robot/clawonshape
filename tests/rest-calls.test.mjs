// Closure K2 call-cost baseline (docs/prompts/2026-10-26-closure-call-cost-baseline.md; work-context-1.2.0-draft
// §12.6 action list). Offline: every Onshape request goes to the shared fake REST, which routes and logs it. Each
// dashboard action, tool or goal path is measured on a fresh harness, cold (empty browsing cache) and warm (the same
// action again right after it), and the measured count is asserted as an upper bound. An increase must fail here.
// The measured behaviour is the deployed one (plugin 0.3.0-rc.3); these tests change no production code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {BASE, binding, D, E, P, proposeVector} from './fixtures/goal.mjs';
import {
  browseSetup,
  contract,
  FASTENERS,
  MV2,
  OTHER_DOC,
  OTHER_MAIN,
  routeTemplate,
  strip,
} from './fixtures/work-context-rest.mjs';
import {confirmGoal, goalStatus, verifyGoal} from '../dist/goal-service.js';
import {RestClient} from '../dist/rest.js';
import {parseConfig} from '../dist/config.js';
import plugin from '../dist/index.js';

const ADMIN = Object.freeze({kind: 'dashboard-operator', clientId: 'conn-fixture', scopes: ['operator.admin']});

// Provider calls of `run`, executed twice on one harness: `cold` = first run, `warm` = the second run right after it
// (same plugin instance, same browsing cache, clock unchanged). `routes` counts the route templates per run.
async function measure(t, row) {
  const s = await browseSetup(t);
  await row.prepare?.(s);
  const tally = (calls) => {
    const routes = {};
    for (const call of calls) {
      const key = routeTemplate(call);
      routes[key] = (routes[key] ?? 0) + 1;
    }
    return routes;
  };
  const start = s.rest.calls.length;
  await row.run(s);
  const middle = s.rest.calls.length;
  await (row.again ?? row.run)(s);
  const end = s.rest.calls.length;
  return {
    cold: middle - start,
    warm: end - middle,
    coldRoutes: tally(s.rest.calls.slice(start, middle)),
    warmRoutes: tally(s.rest.calls.slice(middle, end)),
  };
}

const ok = (result) => {
  assert.notEqual(result?.ok, false, JSON.stringify(result));
  assert.notEqual(result?.status, 'unavailable', JSON.stringify(result));
  return result;
};
const failed = (result) => {
  assert.equal(result?.ok, false, JSON.stringify(result));
  return result;
};

// The harness tracks the selection revision so that repeated adopt/clear calls pass the CAS.
const adopt = async (s) => {
  const expected = s.revision ?? 0;
  const request = {...strip(await contract('adopt-request.json')), expectedSelectionRevision: expected};
  const result = await s.call('work-context-adopt', request);
  assert.equal(result.ok, true, JSON.stringify(result));
  s.revision = expected + 1;
};

// A bound document with `n` Part Studios; the bound one (E) is last in R2 order, the others are empty.
const studioId = (i) => `${String(i).padStart(2, '0')}${'f'.repeat(22)}`;
const studios = (n) => async (s) => {
  s.rest.data.elements = [
    ...Array.from({length: n - 1}, (_, i) => ({id: studioId(i), name: `Studio ${i}`, elementType: 'PARTSTUDIO'})),
    {id: E, name: 'Mount Plate', elementType: 'PARTSTUDIO'},
  ];
};

// A deployed connection: OAuth configured with a private client secret file, so `status` reports "connected" and
// the cockpit loads workspace-context (the default harness has no OAuth configuration).
const connected = async (s) => {
  const clientSecretFile = join(s.h.root, 'client-secret');
  await writeFile(clientSecretFile, 'fixture-secret-DO-NOT-LOG', {mode: 0o600});
  s.setConfig(
    parseConfig({
      bindings: [binding],
      liveReads: true,
      goals: {enabled: true, approvalDirectory: s.h.approvalDirectory},
      oauth: {clientId: 'fixture-client', clientSecretFile, applicationPermissions: {canReadDocuments: true}},
    }),
  );
  assert.equal((await s.call('status')).code, 'connected');
};
const both =
  (...steps) =>
  async (s) => {
    for (const step of steps) {
      await step(s);
    }
  };

// Engineer cockpit page load (ui/control-ui.js `load`): status → mutation-status → in parallel workspace-context
// (connected/ready only), goal-status and work-context-status. Run sequentially here; the count is the same.
const dashboardLoad = async (s) => {
  const status = ok(await s.call('status'));
  ok(await s.call('mutation-status'));
  if (status.code === 'connected' || status.code === 'ready') {
    ok(await s.call('workspace-context'));
  }
  ok(await s.call('goal-status'));
  ok(await s.call('work-context-status'));
};

// Selector open (ui/control-ui.js `open`): work-context-status, then readDocuments(0, restore) → readWorkspaces(bound
// or selected document, restore) → readParts(restore, empty query) → readPreview of the still selectable selection.
const selectorOpen = async (s) => {
  const status = ok(await s.call('work-context-status')).workContext;
  ok(await s.call('work-context-documents', {query: '', offset: 0}));
  const documentId = status.selection?.documentId ?? D;
  const workspaces = ok(await s.call('work-context-workspaces', {documentId})).workspaces;
  const workspace =
    workspaces.items.find((w) => w.workspaceId === status.selection?.workspaceId) ??
    workspaces.items.find((w) => w.role === 'primary');
  const parts = ok(
    await s.call('work-context-parts', {documentId, workspaceId: workspace.workspaceId, query: ''}),
  ).parts;
  const previous = status.validity === 'valid' ? status.selection : undefined;
  const hit = parts.hits.find(
    (h) => h.elementId === previous?.elementId && h.partId === previous?.partId && h.selectable === true,
  );
  if (hit) {
    ok(
      await s.call('work-context-preview', {
        documentId,
        workspaceId: workspace.workspaceId,
        elementId: hit.elementId,
        partId: hit.partId,
        observedMicroversion: parts.observedMicroversion,
      }),
    );
  }
};

const partSearch =
  (query = '') =>
  async (s) =>
    ok(await s.call('work-context-parts', {documentId: D, workspaceId: P, query}));

// Part search that fails at studio k of N: R4 of the k-th Part Studio (1-based, R2 order) answers HTTP `status`.
const failAtStudio = (k, status, persistent) => async (s) => {
  await studios(5)(s);
  const target = studioId(k - 1);
  let failures = 0;
  s.rest.state.failIf = (kind, route) => {
    if (kind === 'r4' && route.includes(`/e/${target}`) && (persistent || failures === 0)) {
      failures += 1;
      return status;
    }
    return undefined;
  };
};

// Engineer tools through the registered plugin (same wiring as the §6.3 test in work-context.test.mjs).
async function engineerTool(s, name) {
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
  const workspaceDir = join(s.h.root, 'engineer-workspace');
  await mkdir(workspaceDir, {recursive: true});
  const ctx = {
    agentId: binding.agentId,
    requesterSenderId: binding.requesterSenderId,
    messageChannel: binding.messageChannel,
    agentAccountId: binding.agentAccountId,
    workspaceDir,
    assertInvocationCurrent: () => {},
  };
  const tool = factories.map((f) => f(ctx)).find((candidate) => candidate?.name === name);
  assert(tool, name);
  return async () => {
    const result = await tool.execute('call', {});
    assert.equal(result.isError, undefined, JSON.stringify(result.details));
    return result.details;
  };
}
const tool = (name) => async (s) => {
  s.tools ??= {};
  s.tools[name] ??= await engineerTool(s, name);
  await s.tools[name]();
};

// Goal service paths with a real RestClient over the fake REST (the goal tools wrap the same service calls with a
// RestClient of their own; the signed-envelope checks of the wrappers make no provider call). Feature reads (v16)
// answer from the goal harness workspaces; Candidate creation is the harness stub (POST not measured here).
const goalReads = (s) => {
  s.h.ctx.client = new RestClient(async () => 'fixture-access-DO-NOT-LOG', s.rest.fetcher);
  s.rest.state.features = (workspaceId) => s.h.workspaces.get(workspaceId);
};
const activeGoal = async (s) => {
  goalReads(s);
  const proposed = await proposeVector(s.h);
  const nonce = (await s.h.record(proposed.goalId)).confirmation.nonce;
  const goal = await confirmGoal(
    s.h.ctx,
    {goalId: proposed.goalId, nonce, expectedGoalHash: proposed.goalHash},
    ADMIN,
    s.h.creation,
  );
  assert.equal(goal.state, 'ACTIVE');
  s.goalId = goal.goalId;
};
const propose = async (s) => {
  const view = await proposeVector(s.h);
  assert.equal(view.state, 'AWAITING_CONFIRMATION');
};

// §12.6 rows plus the closure K2 extras. `max` = [cold, warm] upper bounds, set to the measured deployed counts.
const ROWS = [
  // Step 2: dashboard and selector.
  {action: 'dashboard load (no selection)', prepare: connected, run: dashboardLoad, max: [3, 3]},
  {action: 'dashboard load (with selection)', prepare: both(connected, adopt), run: dashboardLoad, max: [9, 9]},
  {action: 'selector open (no selection)', run: selectorOpen, max: [8, 2]},
  {action: 'selector open (with selection)', prepare: adopt, run: selectorOpen, max: [16, 9]},
  {
    action: 'work-context-status (no selection)',
    run: async (s) => ok(await s.call('work-context-status')),
    max: [0, 0],
  },
  {
    action: 'work-context-status (with selection)',
    prepare: adopt,
    run: async (s) => ok(await s.call('work-context-status')),
    max: [6, 6],
  },
  {action: 'work-context-catalog', run: async (s) => ok(await s.call('work-context-catalog')), max: [7, 7]},
  {
    action: 'document search page',
    run: async (s) => ok(await s.call('work-context-documents', {query: 'mount'})),
    max: [1, 0],
  },
  {
    action: 'workspace list (bound document)',
    run: async (s) => ok(await s.call('work-context-workspaces', {documentId: D})),
    max: [1, 0],
  },
  {
    action: 'workspace list (other document)',
    run: async (s) => ok(await s.call('work-context-workspaces', {documentId: OTHER_DOC})),
    max: [2, 0],
  },
  {action: 'part search (bound Primary, 1 studio)', prepare: studios(1), run: partSearch(), max: [5, 2]},
  {action: 'part search (bound Primary, 2 studios)', run: partSearch(), max: [6, 2]},
  {action: 'part search (bound Primary, 5 studios)', prepare: studios(5), run: partSearch(), max: [9, 2]},
  {action: 'part search (bound Primary, 21 studios)', prepare: studios(21), run: partSearch(), max: [23, 2]},
  {
    action: 'part search (bound Primary, 21 studios, bound studio refined)',
    prepare: studios(21),
    run: async (s) => ok(await s.call('work-context-parts', {documentId: D, workspaceId: P, elementId: E})),
    max: [5, 2],
  },
  {
    action: 'part search (bound Primary, 2 studios, new query each run)',
    run: partSearch('clamp'),
    again: partSearch('plate'),
    max: [6, 2],
  },
  {
    action: 'part search (bound Primary, 5 studios, after a new Primary revision)',
    prepare: async (s) => {
      await studios(5)(s);
      await partSearch()(s);
      s.rest.state.microversions = [MV2];
    },
    run: partSearch(),
    max: [9, 2],
  },
  {
    action: 'part search (other document, 2 studios)',
    run: async (s) =>
      ok(await s.call('work-context-parts', {documentId: OTHER_DOC, workspaceId: OTHER_MAIN, query: 'clamp'})),
    max: [5, 2],
  },
  {
    action: 'part search fails at studio 3 of 5 (persistent), then "Erneut laden"',
    prepare: failAtStudio(3, 500, true),
    run: async (s) => failed(await s.call('work-context-parts', {documentId: D, workspaceId: P, query: ''})),
    max: [5, 2],
  },
  {
    action: 'part search fails at studio 3 of 5 (transient), then "Erneut laden"',
    prepare: failAtStudio(3, 500, false),
    run: async (s) => failed(await s.call('work-context-parts', {documentId: D, workspaceId: P, query: ''})),
    again: partSearch(),
    max: [5, 6],
  },
  {
    action: 'part preview',
    run: async (s) =>
      ok(await s.call('work-context-preview', {elementId: E, partId: 'JIF', observedMicroversion: BASE})),
    max: [3, 1],
  },
  {
    action: 'studio preview',
    run: async (s) => ok(await s.call('work-context-preview', {elementId: FASTENERS, observedMicroversion: BASE})),
    max: [3, 1],
  },
  {action: 'adopt', run: adopt, max: [6, 6]},
  {
    action: 'clear',
    prepare: adopt,
    run: async (s) => {
      ok(await s.call('work-context-clear', {expectedSelectionRevision: s.revision}));
      s.revision += 1;
    },
    max: [0, 0],
  },
  {
    // A short operator session as the cockpit drives it: page load, selector open, three debounced part searches,
    // one part preview, adopt, CAD view, page reload. `warm` = the same session again on the same plugin instance;
    // it costs more than `cold` because the selection adopted in the first run is revalidated on every status read.
    action: 'example session (load, select, three searches, preview, adopt, CAD view, reload)',
    prepare: connected,
    run: async (s) => {
      await dashboardLoad(s);
      await selectorOpen(s);
      for (const query of ['c', 'cl', 'clamp']) {
        await partSearch(query)(s);
      }
      ok(await s.call('work-context-preview', {elementId: E, partId: 'JIF', observedMicroversion: BASE}));
      await adopt(s);
      ok(await s.call('render'));
      await dashboardLoad(s);
    },
    max: [40, 46],
  },
  // Step 3: main non-browsing paths.
  {action: 'cockpit status', prepare: connected, run: async (s) => ok(await s.call('status')), max: [0, 0]},
  {action: 'cockpit CAD view (render action)', run: async (s) => ok(await s.call('render')), max: [6, 6]},
  {action: 'onshape_status (no selection)', run: tool('onshape_status'), max: [0, 0]},
  {action: 'onshape_status (with selection)', prepare: adopt, run: tool('onshape_status'), max: [6, 6]},
  {action: 'onshape_inspect', run: tool('onshape_inspect'), max: [3, 3]},
  {action: 'onshape_render', run: tool('onshape_render'), max: [6, 6]},
  // A second propose while the first awaits confirmation fails with goal_active_conflict; measured cold only.
  {action: 'goal propose (no selection)', prepare: goalReads, run: propose, again: async () => {}, max: [1, 0]},
  {
    action: 'goal propose (with selection)',
    prepare: async (s) => {
      await adopt(s);
      goalReads(s);
    },
    run: propose,
    again: async () => {},
    max: [4, 0],
  },
  {
    action: 'goal confirm (Candidate creation stubbed)',
    prepare: async (s) => {
      goalReads(s);
      s.proposed = await proposeVector(s.h);
    },
    run: async (s) => {
      const {goalId, goalHash} = s.proposed;
      const nonce = (await s.h.record(goalId)).confirmation.nonce;
      const goal = await confirmGoal(s.h.ctx, {goalId, nonce, expectedGoalHash: goalHash}, ADMIN, s.h.creation);
      assert.equal(goal.state, 'ACTIVE');
    },
    // A confirmed goal cannot be confirmed again; measured cold only.
    again: async () => {},
    max: [1, 0],
  },
  {
    action: 'goal status (service, active goal)',
    prepare: activeGoal,
    run: async (s) => assert.equal((await goalStatus(s.h.ctx)).goal.state, 'ACTIVE'),
    max: [0, 0],
  },
  {
    action: 'goal-status (dashboard action, active goal)',
    prepare: activeGoal,
    run: async (s) => ok(await s.call('goal-status')),
    max: [0, 0],
  },
  {
    action: 'goal verify (service, active goal)',
    prepare: activeGoal,
    run: async (s) => assert.ok(await verifyGoal(s.h.ctx, s.goalId)),
    again: async () => {},
    max: [1, 0],
  },
];

test('closure K2 call-cost baseline: measured provider calls per action stay within the deployed upper bounds', async (t) => {
  const table = [];
  for (const row of ROWS) {
    await t.test(row.action, async (st) => {
      const measured = await measure(st, row);
      table.push({action: row.action, ...measured});
      assert(measured.cold <= row.max[0], `${row.action}: cold ${measured.cold} > ${row.max[0]}`);
      assert(measured.warm <= row.max[1], `${row.action}: warm ${measured.warm} > ${row.max[1]}`);
    });
  }
  // Report aid: REST_CALLS_TABLE=<file outside the repo> writes the measured table (counts and route templates).
  if (process.env.REST_CALLS_TABLE) {
    await writeFile(process.env.REST_CALLS_TABLE, `${JSON.stringify(table, null, 2)}\n`);
  }
});
