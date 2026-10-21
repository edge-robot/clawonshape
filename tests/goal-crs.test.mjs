// Accepted change requests of the goal workflow (goal-workflow.md amended 2026-10-21): CR-1 confirmation nonce in the
// operator goal-status view only, CR-2 Lead-side delivery receipt (see goal-workflow.test.mjs T11), CR-3 goal-close
// and CLOSED, plus the server error data shape of §12.3 CR-5. Fixtures and mocks only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {admin, BASE, binding, C, D, E, featuresFixture, goalHarness, P, proposeVector} from './fixtures/goal.mjs';
import {closeGoal, confirmGoal, goalStatus, reconcileGoal, stopGoal, verifyGoal} from '../dist/goal-service.js';
import {goalStore} from '../dist/goal-store.js';
import {reportView} from '../dist/goal-lifecycle.js';
import {reconcileToolInput} from '../dist/goal-tools.js';
import {registerDashboard} from '../dist/dashboard.js';
import {credentials} from '../dist/credentials.js';
import {connectionOwner} from '../dist/config.js';
import plugin from '../dist/index.js';

const nonceOf = async (h, goalId) => (await h.record(goalId)).confirmation.nonce;
const rawConfig = (h, extra = {}) => ({
  bindings: [binding],
  liveReads: true,
  goals: {enabled: true, approvalDirectory: h.approvalDirectory},
  ...extra,
});

function dashboard(h, config) {
  const actions = [];
  registerDashboard(
    {
      session: {controls: {registerSessionAction: (a) => actions.push(a)}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {state: {resolveStateDir: () => h.root}, config: {current: () => ({})}},
    },
    () => config,
    undefined,
    h.ctx.fetcher,
    h.now,
  );
  return (id, payload = {}, scopes = ['operator.read', 'operator.admin']) =>
    actions.find((a) => a.id === id).handler({payload, client: {connId: 'conn-fixture', scopes}});
}

async function activate(h) {
  const proposed = await proposeVector(h);
  return confirmGoal(
    h.ctx,
    {goalId: proposed.goalId, nonce: await nonceOf(h, proposed.goalId), expectedGoalHash: proposed.goalHash},
    admin,
    h.creation,
  );
}

test('CR-1 the nonce is in the operator goal-status view only while AWAITING_CONFIRMATION', async () => {
  const h = await goalHarness();
  try {
    const action = dashboard(h, h.ctx.config);
    const proposed = await proposeVector(h);
    // Agent-facing projections (propose result, service status without the operator option) carry null.
    assert.equal(proposed.confirmation.nonce, null);
    assert.equal((await goalStatus(h.ctx)).goal.confirmation.nonce, null);
    assert.equal((await goalStatus(h.ctx, proposed.goalId)).goal.confirmation.nonce, null);
    const status = (await action('goal-status')).result;
    assert.equal(status.ok, true);
    assert.equal(status.goal.state, 'AWAITING_CONFIRMATION');
    assert.equal(status.goal.confirmation.nonce, await nonceOf(h, proposed.goalId));
    assert.match(status.goal.confirmation.nonce, /^[a-f0-9]{32}$/);
    // Every other state: null.
    const active = await confirmGoal(
      h.ctx,
      {goalId: proposed.goalId, nonce: status.goal.confirmation.nonce, expectedGoalHash: status.goal.goalHash},
      admin,
      h.creation,
    );
    assert.equal(active.confirmation.nonce, null);
    assert.equal((await action('goal-status')).result.goal.confirmation.nonce, null);
    const stopped = (await action('goal-stop', {goalId: proposed.goalId})).result;
    assert.equal(stopped.goal.state, 'STOPPED');
    assert.equal(stopped.goal.confirmation.nonce, null);
    assert.equal((await action('goal-status')).result.goal.confirmation.nonce, null);
    // A renew issues a new nonce, visible again to the operator only.
    await proposeVector(h, {goalId: proposed.goalId});
    const renewed = (await action('goal-status')).result.goal;
    assert.equal(renewed.state, 'AWAITING_CONFIRMATION');
    assert.equal(renewed.confirmation.nonce, await nonceOf(h, proposed.goalId));
    assert.notEqual(renewed.confirmation.nonce, status.goal.confirmation.nonce);
    // History entries (terminal goals) never carry it; the signed report part has no confirmation at all.
    const record = await h.record(proposed.goalId);
    const report = reportView((await goalStatus(h.ctx)).goal);
    assert(!JSON.stringify(report).includes(record.confirmation.nonce));
    assert.equal('confirmation' in report, false);
  } finally {
    await h.cleanup();
  }
});

test('CR-1 agent tools never see the nonce (Engineer onshape_goal_status through the registered plugin)', async (t) => {
  const h = await goalHarness();
  try {
    const proposed = await proposeVector(h);
    const cfg = rawConfig(h);
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
        state: {resolveStateDir: () => h.root},
      },
    });
    // Tools probe MCP with the global fetch; route it to the harness (no network).
    t.mock.method(globalThis, 'fetch', h.ctx.fetcher);
    const ctx = {
      agentId: binding.agentId,
      requesterSenderId: binding.requesterSenderId,
      messageChannel: binding.messageChannel,
      agentAccountId: binding.agentAccountId,
      assertInvocationCurrent: () => {},
    };
    const tool = factories.map((f) => f(ctx)).find((tl) => tl?.name === 'onshape_goal_status');
    const result = await tool.execute('call', {goalId: proposed.goalId});
    assert.equal(result.isError, undefined, JSON.stringify(result.details));
    assert.equal(result.details.goal.state, 'AWAITING_CONFIRMATION');
    assert.equal(result.details.goal.confirmation.nonce, null);
    assert(!result.content[0].text.includes(await nonceOf(h, proposed.goalId)));
  } finally {
    await h.cleanup();
  }
});

// Minimal Onshape REST stand-in for the existing candidate path and the goal reads (v10 and v16 paths).
async function onshapeRest() {
  const {before} = await featuresFixture();
  const workspaces = [{id: P, documentId: D}];
  const microversions = new Map([[P, BASE]]);
  const calls = [];
  const json = (value) => new Response(JSON.stringify(value), {headers: {'Content-Type': 'application/json'}});
  const fetcher = async (url, init = {}) => {
    const u = new URL(String(url));
    assert.equal(u.host, 'cad.onshape.com', `unexpected host ${u.host}`);
    const method = init.method ?? 'GET';
    const route = u.pathname.replace(/^\/api\/v1[06]\//, '');
    calls.push(`${method} ${route}`);
    if (method === 'POST' && route === `documents/d/${D}/workspaces`) {
      const body = JSON.parse(init.body);
      assert.equal(body.microversionId, BASE);
      workspaces.push({id: C, documentId: D});
      microversions.set(C, BASE);
      return json({id: C, documentId: D});
    }
    assert.equal(method, 'GET');
    if (route === `documents/${D}`) {
      return json({id: D, name: 'Fixture'});
    }
    if (route === `documents/d/${D}/workspaces`) {
      return json(workspaces);
    }
    if (route === `documents/d/${D}/m/${BASE}/elements`) {
      return json([{id: E, elementType: 'PARTSTUDIO', name: 'Part Studio 1'}]);
    }
    const mv = /^documents\/d\/[a-f0-9]{24}\/w\/([a-f0-9]{24})\/currentmicroversion$/.exec(route);
    if (mv) {
      return json({microversion: microversions.get(mv[1])});
    }
    const features = /^partstudios\/d\/[a-f0-9]{24}\/w\/([a-f0-9]{24})\/e\/[a-f0-9]{24}\/features$/.exec(route);
    if (features && microversions.has(features[1])) {
      return json({...structuredClone(before), sourceMicroversion: microversions.get(features[1])});
    }
    return assert.fail(`unexpected ${method} ${route}`);
  };
  return {fetcher, calls};
}

test('CR-1 end to end: propose → dashboard goal-status nonce → dashboard goal-confirm creates the Candidate once', async (t) => {
  const h = await goalHarness();
  try {
    const config = {
      ...h.ctx.config,
      engineerAgentId: 'engineer',
      oauth: {
        clientId: 'fixture-client',
        clientSecretFile: '/nonexistent/fixture-secret',
        applicationPermissions: {canReadDocuments: true, canWriteDocuments: true},
      },
    };
    const store = await credentials(h.root, binding.connectionRef, connectionOwner(binding));
    await store.save({
      accessToken: 'fixture-access-DO-NOT-LOG',
      refreshToken: 'fixture-refresh-DO-NOT-LOG',
      expiresAt: Date.now() + 3600000,
      resource: 'https://cad.onshape.com/api/',
      scopes: ['OAuth2Read', 'OAuth2Write'],
    });
    const rest = await onshapeRest();
    t.mock.method(globalThis, 'fetch', rest.fetcher);
    const action = dashboard(h, config);
    const proposed = await proposeVector(h);
    const shown = (await action('goal-status')).result.goal;
    // The operator confirms exactly what was displayed: goalHash and nonce from goal-status.
    const confirmed = (
      await action('goal-confirm', {
        goalId: shown.goalId,
        nonce: shown.confirmation.nonce,
        expectedGoalHash: shown.goalHash,
      })
    ).result;
    assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
    assert.equal(confirmed.goal.state, 'ACTIVE');
    assert.equal(confirmed.goal.target.candidateWorkspaceId, C);
    assert.deepEqual(confirmed.goal.confirmation.confirmedBy, {kind: 'dashboard-operator', clientId: 'conn-fixture'});
    assert.equal(rest.calls.filter((c) => c.startsWith('POST')).length, 1);
    const grant = await h.readGrant();
    assert.equal(grant.grantRevision, 1);
    assert.equal(grant.goalId, proposed.goalId);
    assert.deepEqual(grant.target, {documentId: D, workspaceId: C, elementId: E});
    // A replay of the same confirmation is refused without provider I/O.
    const calls = rest.calls.length;
    const replay = (
      await action('goal-confirm', {
        goalId: shown.goalId,
        nonce: shown.confirmation.nonce,
        expectedGoalHash: shown.goalHash,
      })
    ).result;
    assert.deepEqual([replay.ok, replay.code], [false, 'goal_state_invalid']);
    assert.equal(rest.calls.length, calls);
  } finally {
    await h.cleanup();
  }
});

test('CR-3 goal-close from STOPPED, EXPIRED and BLOCKED ends the goal and resets the grant to null', async () => {
  for (const from of ['STOPPED', 'EXPIRED', 'BLOCKED']) {
    const h = await goalHarness();
    try {
      const goal = await activate(h);
      if (from === 'STOPPED') {
        await stopGoal(h.ctx, goal.goalId, 'pause');
      } else if (from === 'EXPIRED') {
        h.advance(7_200_000);
        assert.equal((await goalStatus(h.ctx)).goal.state, 'EXPIRED');
      } else {
        const store = await goalStore(h.root);
        await store.save({...(await store.read(goal.goalId)), state: 'BLOCKED'});
      }
      const before = await h.record(goal.goalId);
      const closed = await closeGoal(h.ctx, goal.goalId);
      assert.equal(closed.state, 'CLOSED', from);
      const record = await h.record(goal.goalId);
      assert.equal(record.state, 'CLOSED');
      assert.equal(record.grant, null);
      assert.equal(record.lastGrantRevision, before.lastGrantRevision);
      assert.deepEqual(record.result, before.result);
      assert.equal(record.candidateWorkspaceId, C);
      assert.equal(await h.readGrant(), null);
      // Terminal: the goal leaves the current slot and appears in the history.
      const status = await goalStatus(h.ctx);
      assert.equal(status.goal, null);
      assert.equal(status.history.at(-1).state, 'CLOSED');
    } finally {
      await h.cleanup();
    }
  }
});

test('CR-3 goal-close is rejected from ACTIVE, RECONCILING, AWAITING_CONFIRMATION and every terminal state', async () => {
  const h = await goalHarness();
  try {
    const awaiting = await proposeVector(h);
    await assert.rejects(closeGoal(h.ctx, awaiting.goalId), /goal_state_invalid/);
    const active = await confirmGoal(
      h.ctx,
      {goalId: awaiting.goalId, nonce: await nonceOf(h, awaiting.goalId), expectedGoalHash: awaiting.goalHash},
      admin,
      h.creation,
    );
    await assert.rejects(closeGoal(h.ctx, active.goalId), /goal_state_invalid/);
    h.server.outcome = 'UNCERTAIN_NOT_APPLIED';
    const {data} = await h.dispatch(await h.request('update-depth'));
    await assert.rejects(reconcileGoal(h.ctx, data), /mutation_outcome_unknown/);
    assert.equal((await h.record(active.goalId)).state, 'RECONCILING');
    await assert.rejects(closeGoal(h.ctx, active.goalId), /goal_state_invalid/);
    const grant = await h.readGrant();
    assert.equal(grant.state, 'ACTIVE');
    // Terminal states: COMPLETED, FAILED and CLOSED.
    const store = await goalStore(h.root);
    for (const state of ['COMPLETED', 'FAILED', 'CLOSED']) {
      await store.save({...(await store.read(active.goalId)), state});
      await assert.rejects(closeGoal(h.ctx, active.goalId), /goal_state_invalid/, state);
    }
    assert.deepEqual(await h.readGrant(), grant);
  } finally {
    await h.cleanup();
  }
});

test('CR-3 goal-close waits for reconciliation and fails closed without a journal summary', async () => {
  const h = await goalHarness();
  try {
    const goal = await activate(h);
    h.server.outcome = 'UNCERTAIN_APPLIED';
    const {data} = await h.dispatch(await h.request('update-depth'));
    await stopGoal(h.ctx, goal.goalId, 'stop while uncertain');
    await assert.rejects(closeGoal(h.ctx, goal.goalId), /goal_reconciliation_required/);
    assert.equal((await h.record(goal.goalId)).state, 'STOPPED');
    assert.equal((await h.readGrant()).state, 'STOPPED');
    h.advance(60_000);
    await reconcileGoal(h.ctx, data);
    h.server.journalDown = true;
    await assert.rejects(closeGoal(h.ctx, goal.goalId), /mcp_discovery_failed/);
    assert.equal((await h.record(goal.goalId)).state, 'STOPPED');
    h.server.journalDown = false;
    assert.equal((await closeGoal(h.ctx, goal.goalId)).state, 'CLOSED');
    assert.equal(await h.readGrant(), null);
  } finally {
    await h.cleanup();
  }
});

test('CR-3 after CLOSED a new goal for the same binding can be proposed and gets a new Candidate', async () => {
  const h = await goalHarness();
  try {
    const first = await activate(h);
    await stopGoal(h.ctx, first.goalId, 'done for now');
    await assert.rejects(proposeVector(h), /goal_active_conflict/);
    const action = dashboard(h, h.ctx.config);
    // goal-close through the dashboard: operator.admin only.
    const denied = (await action('goal-close', {goalId: first.goalId}, ['operator.read'])).result;
    assert.deepEqual([denied.ok, denied.code], [false, 'authorization_changed']);
    const closed = (await action('goal-close', {goalId: first.goalId})).result;
    assert.equal(closed.ok, true);
    assert.equal(closed.goal.state, 'CLOSED');
    const extra = (await action('goal-close', {goalId: first.goalId, nonce: 'x'})).result;
    assert.deepEqual([extra.ok, extra.code], [false, 'invalid_arguments']);
    const second = await activate(h);
    assert.notEqual(second.goalId, first.goalId);
    assert.equal(second.state, 'ACTIVE');
    assert.equal(h.calls.creates, 2);
    assert.notEqual(second.target.candidateWorkspaceId, C);
    const grant = await h.readGrant();
    assert.equal(grant.goalId, second.goalId);
    assert.equal(grant.grantRevision, 1);
    assert.equal(grant.target.workspaceId, second.target.candidateWorkspaceId);
    // The closed goal keeps its Candidate and record.
    assert.equal((await h.record(first.goalId)).candidateWorkspaceId, C);
    // The new goal completes normally in its own Candidate.
    const candidate = second.target.candidateWorkspaceId;
    await h.dispatch(await h.request('update-depth', candidate));
    await h.dispatch(await h.request('update-fillet-radius', candidate));
    assert.equal((await verifyGoal(h.ctx, second.goalId)).state, 'COMPLETED');
  } finally {
    await h.cleanup();
  }
});

test('§12.3 CR-5: the unknown-outcome error data is accepted unchanged by onshape_goal_reconcile', async () => {
  // Shape asserted by onshape-mcp goal_behaviour.rs `uncertain` at 39815f8.
  const data = {
    goalId: '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b',
    sequence: 1,
    featureId: 'FabcDEF123_0',
    sourceMicroversion: 'a'.repeat(24),
    admittedAt: 4102444500000,
    outcome: 'UNKNOWN',
    retryAllowed: false,
    reconciliationRequired: true,
  };
  const {outcome: _o, retryAllowed: _r, reconciliationRequired: _q, ...expected} = data;
  assert.deepEqual(reconcileToolInput(data), expected);
  // goal_reconciliation_required / goal_dispatch_duplicate data: the journal entry fields only.
  assert.deepEqual(reconcileToolInput(expected), expected);
  for (const patch of [{outcome: 'OK'}, {retryAllowed: true}, {reconciliationRequired: false}, {other: 1}]) {
    assert.throws(() => reconcileToolInput({...data, ...patch}), /invalid_arguments/, JSON.stringify(patch));
  }
  // The full data passes the service validation end to end.
  const h = await goalHarness();
  try {
    const goal = await activate(h);
    h.server.outcome = 'UNCERTAIN_NOT_APPLIED';
    const uncertain = await h.dispatch(await h.request('update-depth'));
    const serverData = {...uncertain.data, outcome: 'UNKNOWN', retryAllowed: false, reconciliationRequired: true};
    h.advance(60_000);
    const reconciled = await reconcileGoal(h.ctx, reconcileToolInput(serverData));
    assert.equal(reconciled.state, 'ACTIVE');
    assert.equal((await h.readGrant()).reconciledThrough, 1);
    assert.equal(goal.goalId, serverData.goalId);
  } finally {
    await h.cleanup();
  }
});

test('the manifest version matches package.json', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = JSON.parse(await readFile('openclaw.plugin.json', 'utf8'));
  assert.equal(manifest.version, pkg.version);
});
