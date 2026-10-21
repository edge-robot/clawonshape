// goal-1.1.0-draft: GoalView.progress.unreconciledEntry and reconcile by goalId alone (server contract 1.2.0 §12.7).
// Fixtures and mocks only: MCP and Onshape REST are routed to the harness; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {admin, binding, C, goalHarness, proposeVector} from './fixtures/goal.mjs';
import {confirmGoal, goalStatus, reconcileGoal} from '../dist/goal-service.js';
import {registerDashboard} from '../dist/dashboard.js';
import {credentials} from '../dist/credentials.js';
import {connectionOwner} from '../dist/config.js';
import plugin from '../dist/index.js';

const nonceOf = async (h, goalId) => (await h.record(goalId)).confirmation.nonce;

async function active(h) {
  const proposed = await proposeVector(h);
  return confirmGoal(
    h.ctx,
    {goalId: proposed.goalId, nonce: await nonceOf(h, proposed.goalId), expectedGoalHash: proposed.goalHash},
    admin,
    h.creation,
  );
}

// An uncertain dispatch whose outcome was not applied, past the 60 s grace.
async function uncertain(h) {
  h.server.outcome = 'UNCERTAIN_NOT_APPLIED';
  const {data} = await h.dispatch(await h.request('update-depth'));
  h.server.outcome = 'OK';
  h.advance(60_000);
  return data;
}

// One fetch for everything the plugin may reach: MCP probes go to the harness, Onshape REST reads of the Candidate
// microversion are answered from the harness workspaces. Anything else fails the test.
function routedFetch(h) {
  return async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.host === 'clawonshape-mcp:8080') {
      return h.ctx.fetcher(url, init);
    }
    assert.equal(u.host, 'cad.onshape.com', `unexpected host ${u.host}`);
    const m = /^\/api\/v10\/documents\/d\/[a-f0-9]{24}\/w\/([a-f0-9]{24})\/currentmicroversion$/.exec(u.pathname);
    assert(m, `unexpected REST ${u.pathname}`);
    return new Response(JSON.stringify({microversion: h.workspaces.get(m[1]).sourceMicroversion}), {
      headers: {'Content-Type': 'application/json'},
    });
  };
}

async function saveGrant(h) {
  const store = await credentials(h.root, binding.connectionRef, connectionOwner(binding));
  await store.save({
    accessToken: 'fixture-access-DO-NOT-LOG',
    refreshToken: 'fixture-refresh-DO-NOT-LOG',
    expiresAt: Date.now() + 3600000,
    resource: 'https://cad.onshape.com/api/',
    scopes: ['OAuth2Read'],
  });
}

function dashboard(h) {
  const actions = [];
  registerDashboard(
    {
      session: {controls: {registerSessionAction: (a) => actions.push(a)}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {state: {resolveStateDir: () => h.root}, config: {current: () => ({})}},
    },
    () => h.ctx.config,
    undefined,
    h.ctx.fetcher,
    h.now,
  );
  return async (id, payload = {}) =>
    (await actions.find((a) => a.id === id).handler({payload, client: {scopes: ['operator.read', 'operator.admin']}}))
      .result;
}

// The Engineer tools of the registered plugin. The global fetch must be stubbed before register(): the tools take
// the MCP fetcher at registration.
function engineerTools(h) {
  const cfg = {bindings: [binding], liveReads: true, goals: {enabled: true, approvalDirectory: h.approvalDirectory}};
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
  const ctx = {
    agentId: binding.agentId,
    requesterSenderId: binding.requesterSenderId,
    messageChannel: binding.messageChannel,
    agentAccountId: binding.agentAccountId,
    assertInvocationCurrent: () => {},
  };
  return (name) => factories.map((f) => f(ctx)).find((tool) => tool?.name === name);
}

test('A1 GoalView.progress.unreconciledEntry mirrors the server entry and clears after reconciliation', async () => {
  const h = await goalHarness();
  try {
    const goal = await active(h);
    assert.equal((await goalStatus(h.ctx)).goal.progress.unreconciledEntry, null);
    const data = await uncertain(h);
    const view = (await goalStatus(h.ctx)).goal;
    const server = (await h.summaryOf(goal.goalId)).unreconciledEntry;
    assert.deepEqual(view.progress.unreconciledEntry, server);
    assert.deepEqual(Object.keys(view.progress.unreconciledEntry).sort(), [
      'admittedAt',
      'featureId',
      'grantRevision',
      'httpStatus',
      'outcome',
      'requestHash',
      'sequence',
      'sourceMicroversion',
    ]);
    assert.equal(view.progress.unreconciledEntry.sequence, data.sequence);
    assert.equal(view.progress.unreconciledSequence, data.sequence);
    await reconcileGoal(h.ctx, {goalId: goal.goalId});
    assert.equal((await goalStatus(h.ctx)).goal.progress.unreconciledEntry, null);
  } finally {
    await h.cleanup();
  }
});

test('A1 a 1.1.0 server without the key yields null; a malformed entry makes the summary unavailable', async () => {
  const h = await goalHarness();
  try {
    const goal = await active(h);
    const data = await uncertain(h);
    h.server.summaryVersion = '1.1';
    const legacy = (await goalStatus(h.ctx)).goal.progress;
    assert.equal(legacy.unreconciledEntry, null);
    assert.equal(legacy.unreconciledSequence, data.sequence);
    assert.equal(legacy.dispatches, 1);
    // Reconcile by goalId alone has nothing to take its input from; the explicit error data still works.
    await assert.rejects(reconcileGoal(h.ctx, {goalId: goal.goalId}), /goal_state_invalid/);
    assert.equal((await h.record(goal.goalId)).state, 'ACTIVE');
    h.server.summaryVersion = '1.2';
    h.server.malformedEntry = true;
    const unknown = (await goalStatus(h.ctx)).goal.progress;
    assert.deepEqual([unknown.dispatches, unknown.unreconciledEntry, unknown.unreconciledSequence], [null, null, null]);
    await assert.rejects(reconcileGoal(h.ctx, {goalId: goal.goalId}), /mcp_discovery_failed/);
    assert.equal((await h.record(goal.goalId)).state, 'ACTIVE');
    h.server.summaryVersion = '1.1';
    h.server.malformedEntry = false;
    assert.equal((await reconcileGoal(h.ctx, data)).state, 'ACTIVE');
    assert.equal((await h.readGrant()).reconciledThrough, data.sequence);
  } finally {
    await h.cleanup();
  }
});

test('A2 reconcile by goalId alone (service); explicit input must equal the entry; no entry → goal_state_invalid', async () => {
  const h = await goalHarness();
  try {
    const goal = await active(h);
    // Nothing unreconciled: nothing to reconcile, no state change.
    await assert.rejects(reconcileGoal(h.ctx, {goalId: goal.goalId}), /goal_state_invalid/);
    assert.equal((await h.record(goal.goalId)).state, 'ACTIVE');
    assert.equal((await h.readGrant()).grantRevision, 1);
    const data = await uncertain(h);
    // Explicit input that differs from the entry in any of the four fields.
    for (const patch of [
      {admittedAt: data.admittedAt + 1},
      {sourceMicroversion: 'c'.repeat(24)},
      {sequence: data.sequence + 1},
      {featureId: 'FfedCBA321_1'},
    ]) {
      await assert.rejects(reconcileGoal(h.ctx, {...data, ...patch}), /goal_state_invalid/, JSON.stringify(patch));
    }
    assert.equal((await h.readGrant()).grantRevision, 1);
    // Partial explicit input is malformed, not a goalId-only call.
    await assert.rejects(reconcileGoal(h.ctx, {goalId: goal.goalId, sequence: data.sequence}), /invalid_arguments/);
    const reconciled = await reconcileGoal(h.ctx, {goalId: goal.goalId});
    assert.equal(reconciled.state, 'ACTIVE');
    const record = await h.record(goal.goalId);
    assert.deepEqual(
      {...record.reconciliations[0], reconciledAt: 0, observedMicroversion: ''},
      {
        sequence: data.sequence,
        featureId: data.featureId,
        sourceMicroversion: data.sourceMicroversion,
        admittedAt: data.admittedAt,
        observedMicroversion: '',
        outcome: 'NOT_APPLIED',
        reconciledAt: 0,
      },
    );
    assert.equal((await h.readGrant()).reconciledThrough, data.sequence);
    // After reconciliation the entry is gone: a second goalId-only call has nothing to reconcile.
    await assert.rejects(reconcileGoal(h.ctx, {goalId: goal.goalId}), /goal_state_invalid/);
    // A goalId-only call with an unavailable summary fails closed without a state change.
    await uncertain(h);
    h.server.journalDown = true;
    await assert.rejects(reconcileGoal(h.ctx, {goalId: goal.goalId}), /mcp_discovery_failed/);
    assert.equal((await h.record(goal.goalId)).state, 'ACTIVE');
  } finally {
    await h.cleanup();
  }
});

test('A2 dashboard goal-reconcile with only goalId reconciles from the summary entry end to end', async (t) => {
  const h = await goalHarness();
  try {
    await saveGrant(h);
    const goal = await active(h);
    const data = await uncertain(h);
    t.mock.method(globalThis, 'fetch', routedFetch(h));
    const action = dashboard(h);
    const status = await action('goal-status');
    assert.deepEqual(status.goal.progress.unreconciledEntry, (await h.summaryOf(goal.goalId)).unreconciledEntry);
    const mismatch = await action('goal-reconcile', {...data, admittedAt: data.admittedAt + 1, goalId: goal.goalId});
    assert.deepEqual([mismatch.ok, mismatch.code], [false, 'goal_state_invalid']);
    const result = await action('goal-reconcile', {connectionRef: binding.connectionRef, goalId: goal.goalId});
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.goal.state, 'ACTIVE');
    assert.equal(result.goal.progress.unreconciledEntry, null);
    assert.equal((await h.readGrant()).reconciledThrough, data.sequence);
    const nothing = await action('goal-reconcile', {goalId: goal.goalId});
    assert.deepEqual([nothing.ok, nothing.code], [false, 'goal_state_invalid']);
  } finally {
    await h.cleanup();
  }
});

test('A2/A3 onshape_goal_reconcile with only goalId; agents see the entry and never the nonce', async (t) => {
  // The registered tool uses the real clock; the dispatch must lie before the 60 s grace in real time.
  const h = await goalHarness({clock: Date.now() - 10 * 60_000});
  try {
    await saveGrant(h);
    const goal = await active(h);
    t.mock.method(globalThis, 'fetch', routedFetch(h));
    const tool = engineerTools(h);
    const data = await uncertain(h);
    const status = await tool('onshape_goal_status').execute('call', {goalId: goal.goalId});
    assert.equal(status.isError, undefined, JSON.stringify(status.details));
    assert.deepEqual(
      status.details.goal.progress.unreconciledEntry,
      (await h.summaryOf(goal.goalId)).unreconciledEntry,
    );
    assert.equal(status.details.goal.confirmation.nonce, null);
    const reconcile = tool('onshape_goal_reconcile');
    const mismatch = await reconcile.execute('call', {...data, sourceMicroversion: 'c'.repeat(24)});
    assert.equal(mismatch.details.code, 'goal_state_invalid');
    const result = await reconcile.execute('call', {goalId: goal.goalId});
    assert.equal(result.isError, undefined, JSON.stringify(result.details));
    assert.equal(result.details.goal.state, 'ACTIVE');
    assert.equal(result.details.goal.progress.unreconciledEntry, null);
    assert.equal((await h.readGrant()).reconciledThrough, data.sequence);
    // The raw MCP error data (CR-5 tolerance) still works for the next uncertain dispatch.
    const next = await uncertain(h);
    const raw = {...next, outcome: 'UNKNOWN', retryAllowed: false, reconciliationRequired: true};
    assert.equal((await reconcile.execute('call', raw)).details.goal.state, 'ACTIVE');
    // The agent view never contains the confirmation nonce.
    const record = await h.record(goal.goalId);
    const awaiting = await tool('onshape_goal_status').execute('call', {goalId: goal.goalId});
    assert(!awaiting.content[0].text.includes(record.confirmation.nonce));
  } finally {
    await h.cleanup();
  }
});

test('A3 the operator view of an uncertain goal carries the entry; the nonce stays null outside AWAITING_CONFIRMATION', async () => {
  const h = await goalHarness();
  try {
    const goal = await active(h);
    await uncertain(h);
    const action = dashboard(h);
    const status = await action('goal-status');
    assert.equal(status.goal.state, 'ACTIVE');
    assert.notEqual(status.goal.progress.unreconciledEntry, null);
    assert.equal(status.goal.confirmation.nonce, null);
    const text = JSON.stringify(status.goal.progress.unreconciledEntry);
    assert(!text.includes((await h.record(goal.goalId)).confirmation.nonce));
    assert(!/fixture-access|"body"|"path"/.test(text));
    assert.equal(status.goal.target.candidateWorkspaceId, C);
  } finally {
    await h.cleanup();
  }
});
