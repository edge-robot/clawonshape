// Goal workflow tests T2–T11 (docs/interface/goal-workflow.md §11) with fixtures and mocked REST/MCP. No live CAD.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  admin,
  BASE,
  binding,
  C,
  D,
  E,
  featuresFixture,
  goalHarness,
  origin,
  P,
  proposeVector,
  vector,
} from './fixtures/goal.mjs';
import {canonicalFeatureHash, goalHash, VOLATILE_FEATURE_KEYS, validateScope} from '../dist/goal-scope.js';
import {
  evaluateVerification,
  grantViolations,
  reconcilePrecheck,
  verifyGoalConfirmation,
} from '../dist/goal-lifecycle.js';
import {confirmGoal, goalStatus, proposeGoal, reconcileGoal, stopGoal, verifyGoal} from '../dist/goal-service.js';
import {goalAuthorityActive, goalStore} from '../dist/goal-store.js';
import {goalCapability, journalSummary} from '../dist/goal-mcp.js';
import {deliverGoalResult, rememberGoalOrigin} from '../dist/goal-delivery.js';
import {leadOrigin} from '../dist/goal-tools.js';
import {createTaskEnvelope, delegateGoalTask, mintContext, signResult, verifyTaskEnvelope} from '../dist/delegation.js';
import {mutationStore, payloadDigest} from '../dist/mutation-workflow.js';
import {registerDashboard} from '../dist/dashboard.js';
import {credentials} from '../dist/credentials.js';
import {connectionOwner, parseConfig} from '../dist/config.js';

const nonceOf = async (h, goalId) => (await h.record(goalId)).confirmation.nonce;
async function activeGoal(h) {
  const proposed = await proposeVector(h);
  const goal = await confirmGoal(
    h.ctx,
    {goalId: proposed.goalId, nonce: await nonceOf(h, proposed.goalId), expectedGoalHash: proposed.goalHash},
    admin,
    h.creation,
  );
  return goal;
}
// T10: every grant revision on disk is a valid §12.2 document; revisions strictly increase per goal.
function grantTracker(h) {
  const seen = [];
  return {
    async check() {
      const grant = await h.readGrant();
      assert.notEqual(grant, undefined, 'grant file exists');
      assert.deepEqual(grantViolations(grant), []);
      if (grant !== null) {
        const last = seen.filter((g) => g && g.goalId === grant.goalId).at(-1);
        if (last && last.grantRevision !== grant.grantRevision) {
          assert(grant.grantRevision > last.grantRevision, 'grantRevision strictly increases');
        }
      }
      seen.push(grant);
      return grant;
    },
    seen,
  };
}

test('T2 one confirmation, two different permitted updates in the same Candidate, grant revision 1 written once', async () => {
  const h = await goalHarness();
  const grants = grantTracker(h);
  try {
    const proposed = await proposeVector(h);
    const v = await vector();
    // The proposal reproduces the contract scope exactly (Primary at BASE, origin and requester signed).
    assert.equal(proposed.goalHash, v.goalHash);
    assert.equal(proposed.state, 'AWAITING_CONFIRMATION');
    assert.equal(proposed.confirmationRequired, true);
    assert.equal(proposed.target.baseMicroversion, BASE);
    assert.equal(await h.readGrant(), undefined, 'propose publishes no grant');
    const active = await confirmGoal(
      h.ctx,
      {goalId: proposed.goalId, nonce: await nonceOf(h, proposed.goalId), expectedGoalHash: v.goalHash},
      admin,
      h.creation,
    );
    assert.equal(active.state, 'ACTIVE');
    assert.equal(active.target.candidateWorkspaceId, C);
    assert.deepEqual(active.confirmation.confirmedBy, {kind: 'dashboard-operator', clientId: 'conn-fixture'});
    const first = await grants.check();
    assert.equal(first.grantRevision, 1);
    assert.equal(first.state, 'ACTIVE');
    assert.deepEqual(first.target, {documentId: D, workspaceId: C, elementId: E});
    assert.equal(first.goalHash, v.goalHash);
    assert.equal(first.expiresAt - first.issuedAt, 7200000);
    assert.equal(h.calls.creates, 1);

    assert.equal((await h.dispatch(await h.request('update-depth'))).code, 'admitted');
    assert.equal((await h.dispatch(await h.request('update-fillet-radius'))).code, 'admitted');
    // No second confirmation or grant revision was needed for the second change.
    assert.deepEqual(await grants.check(), first);
    const record = await h.record(proposed.goalId);
    assert.equal(record.lastGrantRevision, 1);
    assert.equal(record.candidateWorkspaceId, C);
    const status = await goalStatus(h.ctx);
    assert.equal(status.goal.progress.dispatches, 2);
    assert.equal(status.goal.progress.remaining, 8);
    assert.equal(status.goal.progress.lastOutcome, 'OK');
    assert.deepEqual(status.execution, {
      candidateWorkspaceId: C,
      featureIds: ['FabcDEF123_0', 'FfedCBA321_1'],
      operation: 'updatePartStudioFeature',
      remaining: 8,
      grantExpiresAt: first.expiresAt,
    });

    const done = await verifyGoal(h.ctx, proposed.goalId);
    assert.equal(done.state, 'COMPLETED');
    assert.equal(done.progress.lastVerification.passed, true);
    assert.deepEqual(done.result.openLimits, ['Overall appearance stays compact']);
    assert.match(done.result.revisionUrl, new RegExp(`/documents/${D}/w/${C}/m/[a-f0-9]{24}/e/${E}$`));
    // COMPLETED: revision STOPPED, then null (journal has no unreconciled entry).
    const final = await h.record(proposed.goalId);
    assert.equal(final.lastGrantRevision, 2);
    assert.equal(final.grant, null);
    assert.equal(await grants.check(), null);
  } finally {
    await h.cleanup();
  }
});

test('T3 refresh, plugin restart and resume after STOP + new confirmation create no second Candidate', async () => {
  const h = await goalHarness();
  const grants = grantTracker(h);
  try {
    const goal = await activeGoal(h);
    await grants.check();
    // Refresh: a repeated confirmation of the same goal is refused before any provider I/O.
    const reads = h.calls.reads.length;
    await assert.rejects(
      confirmGoal(h.ctx, {goalId: goal.goalId, nonce: 'x', expectedGoalHash: goal.goalHash}, admin, h.creation),
      /goal_state_invalid/,
    );
    assert.equal(h.calls.reads.length, reads);
    // Restart: a fresh store instance reloads the durable record.
    const reloaded = await (await goalStore(h.root)).read(goal.goalId);
    assert.equal(reloaded.state, 'ACTIVE');
    assert.equal(reloaded.candidateWorkspaceId, C);
    assert.equal((await goalStatus({...h.ctx})).goal.goalId, goal.goalId);
    // STOP, renew with the unchanged scope, confirm again: same Candidate, higher grant revision.
    await stopGoal(h.ctx, goal.goalId, 'operator pause');
    assert.equal((await grants.check()).state, 'STOPPED');
    const renewed = await proposeVector(h, {goalId: goal.goalId});
    assert.equal(renewed.state, 'AWAITING_CONFIRMATION');
    assert.equal(renewed.scopeRevision, 1, 'renew keeps the scope revision');
    assert.equal(renewed.goalHash, goal.goalHash);
    const resumed = await confirmGoal(
      h.ctx,
      {goalId: goal.goalId, nonce: await nonceOf(h, goal.goalId), expectedGoalHash: goal.goalHash},
      admin,
      h.creation,
    );
    assert.equal(resumed.state, 'ACTIVE');
    assert.equal(resumed.target.candidateWorkspaceId, C);
    const grant = await grants.check();
    assert.equal(grant.grantRevision, 3);
    assert.equal(grant.state, 'ACTIVE');
    assert.equal(h.calls.creates, 1);
    // A revised scope reuses the Candidate (mode reuse) and needs a new confirmation.
    await stopGoal(h.ctx, goal.goalId, 'change of plan');
    const revised = await proposeVector(h, {goalId: goal.goalId, maxDispatches: 5});
    assert.equal(revised.scopeRevision, 2);
    assert.notEqual(revised.goalHash, goal.goalHash);
    assert.equal((await h.record(goal.goalId)).scope.candidate.mode, 'reuse');
    await confirmGoal(
      h.ctx,
      {goalId: goal.goalId, nonce: await nonceOf(h, goal.goalId), expectedGoalHash: revised.goalHash},
      admin,
      h.creation,
    );
    assert.equal((await grants.check()).maxDispatches, 5);
    assert.equal(h.calls.creates, 1);
  } finally {
    await h.cleanup();
  }
});

test('T3 an interrupted confirmation adopts its own Candidate attempt instead of creating a second one', async () => {
  const h = await goalHarness();
  try {
    const proposed = await proposeVector(h);
    const input = {goalId: proposed.goalId, expectedGoalHash: proposed.goalHash};
    h.fail.crashAfterCreate = true;
    await assert.rejects(
      confirmGoal(h.ctx, {...input, nonce: await nonceOf(h, proposed.goalId)}, admin, h.creation),
      /provider_transport_error/,
    );
    assert.equal(h.calls.creates, 1);
    assert.equal(await h.readGrant(), undefined);
    h.fail.crashAfterCreate = false;
    const active = await confirmGoal(h.ctx, {...input, nonce: await nonceOf(h, proposed.goalId)}, admin, h.creation);
    assert.equal(active.state, 'ACTIVE');
    assert.equal(active.target.candidateWorkspaceId, C);
    assert.equal(h.calls.creates, 1);
    // An unresolved attempt blocks creation instead of guessing.
    const h2 = await goalHarness();
    try {
      const p2 = await proposeVector(h2);
      h2.setAttempt({attemptId: 'a', status: 'UNKNOWN', sourceWorkspaceId: P, sourceMicroversionId: BASE});
      await assert.rejects(
        confirmGoal(
          h2.ctx,
          {goalId: p2.goalId, nonce: await nonceOf(h2, p2.goalId), expectedGoalHash: p2.goalHash},
          admin,
          h2.creation,
        ),
        /candidate_creation_unknown/,
      );
      assert.equal(h2.calls.creates, 0);
    } finally {
      await h2.cleanup();
    }
  } finally {
    await h.cleanup();
  }
});

test('T4 wrong nonce, wrong goalHash, expired confirmation, stale binding, missing operator.admin: no grant, no Candidate', async () => {
  const h = await goalHarness();
  try {
    const proposed = await proposeVector(h);
    const nonce = await nonceOf(h, proposed.goalId);
    const goalId = proposed.goalId;
    const cases = [
      [{goalId, nonce: '0'.repeat(32), expectedGoalHash: proposed.goalHash}, admin, /goal_state_invalid/],
      [{goalId, nonce: nonce.slice(1), expectedGoalHash: proposed.goalHash}, admin, /goal_state_invalid/],
      [{goalId, nonce, expectedGoalHash: '0'.repeat(64)}, admin, /goal_hash_mismatch/],
      [
        {goalId, nonce, expectedGoalHash: proposed.goalHash},
        {...admin, scopes: ['operator.read']},
        /authorization_changed/,
      ],
    ];
    for (const [input, confirmer, code] of cases) {
      await assert.rejects(confirmGoal(h.ctx, input, confirmer, h.creation), code);
    }
    // Stale binding: the bound Primary changed since the proposal.
    const moved = {...binding, primaryWorkspaceId: 'd'.repeat(24)};
    await assert.rejects(
      confirmGoal({...h.ctx, binding: moved}, {goalId, nonce, expectedGoalHash: proposed.goalHash}, admin, h.creation),
      /goal_not_found/,
    );
    const record = await h.record(goalId);
    assert.throws(
      () =>
        verifyGoalConfirmation({
          record,
          nonce,
          expectedGoalHash: proposed.goalHash,
          confirmer: admin,
          now: h.now(),
          currentBinding: {agentId: 'engineer', documentId: D, elementId: E, primaryWorkspaceId: 'd'.repeat(24)},
        }),
      /authorization_changed/,
    );
    h.advance(1_800_000);
    await assert.rejects(
      confirmGoal(h.ctx, {goalId, nonce, expectedGoalHash: proposed.goalHash}, admin, h.creation),
      /goal_confirmation_expired/,
    );
    assert.equal(h.calls.creates, 0);
    assert.equal(await h.readGrant(), undefined);
    assert.deepEqual(h.calls.reads, [P], 'only the propose read of Primary happened');
    // The expiry is recorded by the next status read.
    assert.equal((await goalStatus(h.ctx)).goal.state, 'EXPIRED');
  } finally {
    await h.cleanup();
  }
});

test('T4 dashboard goal-confirm requires operator.admin before touching state', async () => {
  const actions = [];
  registerDashboard(
    {
      session: {controls: {registerSessionAction: (a) => actions.push(a)}},
      registerHttpRoute: () => {},
      lifecycle: {registerRuntimeLifecycle: () => {}},
      runtime: {
        state: {
          resolveStateDir: () => {
            assert.fail('unauthorized state access');
          },
        },
        config: {current: () => ({})},
      },
    },
    () => parseConfig({bindings: [binding]}),
    undefined,
    async () => assert.fail('unauthorized MCP access'),
  );
  for (const name of ['goal-confirm', 'goal-stop', 'goal-reconcile']) {
    const result = await actions.find((a) => a.id === name).handler({payload: {}, client: {scopes: ['operator.read']}});
    assert.deepEqual(Object.keys(result.result).sort(), ['code', 'message', 'ok']);
    assert.equal(result.result.ok, false);
    assert.equal(result.result.code, 'authorization_changed');
  }
  const status = await actions.find((a) => a.id === 'goal-status').handler({payload: {}, client: {scopes: []}});
  assert.equal(status.result.code, 'authorization_changed');
});

test('T5 STOP in each non-terminal state persists STOPPED and the grant before it is reported', async () => {
  for (const from of ['AWAITING_CONFIRMATION', 'ACTIVE', 'RECONCILING', 'BLOCKED']) {
    const h = await goalHarness();
    try {
      let goalId;
      if (from === 'AWAITING_CONFIRMATION') {
        goalId = (await proposeVector(h)).goalId;
      } else {
        goalId = (await activeGoal(h)).goalId;
      }
      if (from === 'RECONCILING') {
        h.server.outcome = 'UNCERTAIN_NOT_APPLIED';
        const {data} = await h.dispatch(await h.request('update-depth'));
        await assert.rejects(reconcileGoal(h.ctx, data), /mutation_outcome_unknown/);
        assert.equal((await h.record(goalId)).state, 'RECONCILING');
      }
      if (from === 'BLOCKED') {
        const store = await goalStore(h.root);
        await store.save({...(await store.read(goalId)), state: 'BLOCKED'});
      }
      const before = await h.record(goalId);
      const stopped = await stopGoal(h.ctx, goalId, 'Stop requested');
      assert.equal(stopped.state, 'STOPPED');
      const record = await h.record(goalId);
      assert.equal(record.state, 'STOPPED');
      assert.equal(record.result.state, 'STOPPED');
      assert.equal(record.result.summary, 'Stop requested');
      if (before.grant) {
        const grant = await h.readGrant();
        assert.equal(grant.state, 'STOPPED');
        assert.equal(grant.grantRevision, before.grant.grantRevision + 1);
        assert.deepEqual(record.grant, {...before.grant, state: 'STOPPED', grantRevision: grant.grantRevision});
        assert.equal((await h.dispatch(await h.request('update-depth'))).code, 'goal_grant_stopped');
      } else {
        assert.equal(await h.readGrant(), undefined);
      }
      // Idempotent and never re-activating.
      assert.equal((await stopGoal(h.ctx, goalId, 'again')).state, 'STOPPED');
    } finally {
      await h.cleanup();
    }
  }
});

test('T5 the record is persisted before the grant publish: a failing grant write leaves a STOPPED record', async () => {
  const h = await goalHarness();
  try {
    const goal = await activeGoal(h);
    // Make the grant directory unwritable for the publish: replace it with a file.
    await rm(h.approvalDirectory, {recursive: true, force: true});
    await writeFile(h.approvalDirectory, 'not a directory', {mode: 0o600});
    await assert.rejects(stopGoal(h.ctx, goal.goalId, 'stop'));
    const record = await h.record(goal.goalId);
    assert.equal(record.state, 'STOPPED');
    assert.equal(record.grant.state, 'STOPPED');
    // After the operator fixes the directory, STOP re-publishes the STOPPED mirror.
    await rm(h.approvalDirectory, {force: true});
    await mkdir(h.approvalDirectory, {mode: 0o700});
    await stopGoal(h.ctx, goal.goalId, 'stop');
    assert.equal((await h.readGrant()).state, 'STOPPED');
    assert.equal((await h.readGrant()).grantRevision, record.grant.grantRevision);
  } finally {
    await h.cleanup();
  }
});

test('T5 STOP during RECONCILING writes STOPPED at once; reconciliation still completes and the goal ends STOPPED', async () => {
  const h = await goalHarness();
  try {
    const goal = await activeGoal(h);
    h.server.outcome = 'UNCERTAIN_APPLIED';
    const {data} = await h.dispatch(await h.request('update-depth'));
    await assert.rejects(reconcileGoal(h.ctx, data), /mutation_outcome_unknown/);
    await stopGoal(h.ctx, goal.goalId, 'operator stop');
    assert.equal((await h.readGrant()).state, 'STOPPED');
    h.advance(60_000);
    const after = await reconcileGoal(h.ctx, data);
    assert.equal(after.state, 'STOPPED');
    const grant = await h.readGrant();
    assert.equal(grant.state, 'STOPPED');
    assert.equal(grant.reconciledThrough, 1);
    const record = await h.record(goal.goalId);
    assert.equal(record.reconciliations.at(-1).outcome, 'APPLIED_OR_SUPERSEDED');
  } finally {
    await h.cleanup();
  }
});

test('T6 reconciliation rules 1–5: stale sequence, grace period, NOT_APPLIED and APPLIED_OR_SUPERSEDED', async () => {
  const h = await goalHarness();
  try {
    const goal = await activeGoal(h);
    h.server.outcome = 'UNCERTAIN_NOT_APPLIED';
    const {code, data} = await h.dispatch(await h.request('update-depth'));
    assert.equal(code, 'mutation_outcome_unknown_reconcile_required');
    assert.equal((await h.dispatch(await h.request('update-fillet-radius'))).code, 'goal_reconciliation_required');
    // Rule 2: stale data (another sequence) → goal_state_invalid; state RECONCILING.
    await assert.rejects(reconcileGoal(h.ctx, {...data, sequence: 2}), /goal_state_invalid/);
    assert.equal((await h.record(goal.goalId)).state, 'RECONCILING');
    // Rule 2: summary unavailable → mcp_discovery_failed; stays RECONCILING.
    h.server.journalDown = true;
    await assert.rejects(reconcileGoal(h.ctx, data), /mcp_discovery_failed/);
    h.server.journalDown = false;
    // Rule 3: inside the 60 s grace → mutation_outcome_unknown.
    h.advance(59_999);
    await assert.rejects(reconcileGoal(h.ctx, data), /mutation_outcome_unknown/);
    // Rule 4: read failure → stays RECONCILING.
    h.advance(1);
    h.fail.microversion = 'provider_unavailable';
    await assert.rejects(reconcileGoal(h.ctx, data), /provider_unavailable/);
    assert.equal((await h.record(goal.goalId)).state, 'RECONCILING');
    assert.equal((await h.readGrant()).grantRevision, 1);
    h.fail.microversion = undefined;
    // Rule 4 + 5: unchanged Candidate → NOT_APPLIED; new revision with reconciledThrough = sequence; ACTIVE.
    const reconciled = await reconcileGoal(h.ctx, data);
    assert.equal(reconciled.state, 'ACTIVE');
    const grant = await h.readGrant();
    assert.deepEqual([grant.grantRevision, grant.state, grant.reconciledThrough], [2, 'ACTIVE', 1]);
    assert.equal((await h.record(goal.goalId)).reconciliations[0].outcome, 'NOT_APPLIED');
    // Rule 1: sequence <= reconciledThrough → idempotent success, no grant change.
    assert.equal((await reconcileGoal(h.ctx, data)).state, 'ACTIVE');
    assert.equal((await h.readGrant()).grantRevision, 2);
    // The next request on the re-read revision is admitted again.
    h.server.outcome = 'OK';
    assert.equal((await h.dispatch(await h.request('update-depth'))).code, 'admitted');
    // An applied uncertain dispatch is classified APPLIED_OR_SUPERSEDED.
    h.server.outcome = 'UNCERTAIN_APPLIED';
    const second = await h.dispatch(await h.request('update-fillet-radius'));
    h.advance(60_000);
    await reconcileGoal(h.ctx, second.data);
    const record = await h.record(goal.goalId);
    assert.equal(record.reconciliations[1].outcome, 'APPLIED_OR_SUPERSEDED');
    assert.equal((await h.readGrant()).reconciledThrough, second.data.sequence);
    // Wrong feature for this goal → goal_state_invalid (pure precheck).
    assert.throws(
      () => reconcilePrecheck(record, {...data, sequence: 9, featureId: 'FholeAAA111_2'}, null, h.now()),
      /goal_state_invalid/,
    );
  } finally {
    await h.cleanup();
  }
});

test('T7 verification: pass, fail, note never passes, implicit preservation, unverifiable and unreconciled entry', async () => {
  const h = await goalHarness();
  try {
    // An extra feature outside the scope proves implicit preservation.
    const primary = h.workspaces.get(P);
    primary.features.push({...structuredClone(primary.features[2]), featureId: 'FextraBBB_3', name: 'Rib'});
    primary.featureStates.FextraBBB_3 = {featureStatus: 'OK'};
    const goal = await activeGoal(h);
    // Fail: nothing applied yet; stays ACTIVE.
    const failed = await verifyGoal(h.ctx, goal.goalId);
    assert.equal(failed.state, 'ACTIVE');
    const checks = failed.progress.lastVerification.checks;
    assert.equal(failed.progress.lastVerification.passed, false);
    assert.equal(checks.find((c) => c.conditionId === 'depth').result, 'fail');
    assert.equal(checks.find((c) => c.conditionId === 'depth').observed, '50 mm');
    assert.equal(checks.find((c) => c.conditionId === 'holes').result, 'pass');
    assert.equal(checks.find((c) => c.conditionId === 'look').result, 'unverifiable');
    assert.equal(checks.find((c) => c.conditionId === 'implicit:FextraBBB_3').result, 'pass');
    await h.dispatch(await h.request('update-depth'));
    await h.dispatch(await h.request('update-fillet-radius'));
    const record = await h.record(goal.goalId);
    const read = await h.client.goalFeatures(binding, C);
    const summary = await h.summaryOf(goal.goalId);
    // Pass (pure evaluation) while the note stays an open limit.
    const pass = evaluateVerification(record, read, summary, h.now());
    assert.equal(pass.passed, true);
    assert.deepEqual(pass.openLimits, ['Overall appearance stays compact']);
    // A goal whose only non-note condition passes still never counts the note as passed.
    assert.equal(pass.checks.find((c) => c.kind === 'note').result, 'unverifiable');
    // Implicit preservation failure: a feature outside featureIds changed, or was removed.
    const changed = structuredClone(read);
    changed.features.find((f) => f.featureId === 'FextraBBB_3').suppressed = true;
    assert.equal(evaluateVerification(record, changed, summary, h.now()).passed, false);
    const removed = {...read, features: read.features.filter((f) => f.featureId !== 'FextraBBB_3')};
    const verdict = evaluateVerification(record, removed, summary, h.now());
    assert.equal(verdict.passed, false);
    assert.deepEqual(
      verdict.checks.find((c) => c.conditionId === 'implicit:FextraBBB_3'),
      {
        conditionId: 'implicit:FextraBBB_3',
        kind: 'featureUnchanged',
        result: 'fail',
        observed: 'feature missing',
      },
    );
    // Unverifiable → not passed: a missing feature state cannot be evaluated.
    const noState = {...read, featureStates: {}};
    const unverifiable = evaluateVerification(record, noState, summary, h.now());
    assert.equal(unverifiable.passed, false);
    assert.equal(unverifiable.checks.find((c) => c.conditionId === 'fillet-ok').result, 'unverifiable');
    // Unreconciled entry or unavailable summary → not passed.
    assert.equal(evaluateVerification(record, read, {...summary, unreconciledSequence: 3}, h.now()).passed, false);
    assert.equal(evaluateVerification(record, read, null, h.now()).passed, false);
    // Service: an unavailable summary makes the verification incomplete, never COMPLETED.
    h.server.journalDown = true;
    await assert.rejects(verifyGoal(h.ctx, goal.goalId), /goal_verification_incomplete/);
    assert.equal((await h.record(goal.goalId)).state, 'ACTIVE');
    h.server.journalDown = false;
    assert.equal((await verifyGoal(h.ctx, goal.goalId)).state, 'COMPLETED');
  } finally {
    await h.cleanup();
  }
});

test('T7 a failed verification with the budget used up blocks the goal and narrows the grant', async () => {
  const h = await goalHarness();
  try {
    const goal = await (async () => {
      const proposed = await proposeVector(h, {maxDispatches: 1});
      return confirmGoal(
        h.ctx,
        {goalId: proposed.goalId, nonce: await nonceOf(h, proposed.goalId), expectedGoalHash: proposed.goalHash},
        admin,
        h.creation,
      );
    })();
    await h.dispatch(await h.request('update-depth'));
    assert.equal((await h.dispatch(await h.request('update-fillet-radius'))).code, 'goal_budget_exhausted');
    const blocked = await verifyGoal(h.ctx, goal.goalId);
    assert.equal(blocked.state, 'BLOCKED');
    assert.equal(blocked.result.state, 'BLOCKED');
    assert.equal((await h.readGrant()).state, 'STOPPED');
  } finally {
    await h.cleanup();
  }
});

test('T8 exclusivity: one non-terminal goal; legacy UNKNOWN receipt or active approval file blocks confirmation', async () => {
  const h = await goalHarness({
    localMcp: (root) => ({connectionRef: 'owner-rest', credentialDirectory: join(root, 'mcp')}),
  });
  try {
    const proposed = await proposeVector(h);
    await assert.rejects(proposeVector(h), /goal_active_conflict/);
    const input = {
      goalId: proposed.goalId,
      nonce: await nonceOf(h, proposed.goalId),
      expectedGoalHash: proposed.goalHash,
    };
    // An active approval file (legacy directory) blocks confirmation.
    const legacyDirectory = join(h.root, 'mcp', 'mutation-approvals');
    await mkdir(legacyDirectory, {recursive: true, mode: 0o700});
    await writeFile(
      join(legacyDirectory, 'approved-update.json'),
      JSON.stringify({version: 2, expiresAt: h.now() + 1}),
      {
        mode: 0o600,
      },
    );
    await assert.rejects(confirmGoal(h.ctx, input, admin, h.creation), /mutation_reconciliation_required/);
    await writeFile(join(legacyDirectory, 'approved-update.json'), 'null', {mode: 0o600});
    // An UNKNOWN legacy receipt blocks confirmation.
    const proposals = await mutationStore(h.root, binding);
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
      body: {feature: {featureId: 'FabcDEF123_0'}},
      payloadHash: payloadDigest({feature: {featureId: 'FabcDEF123_0'}}),
      summary: 'legacy',
      status: 'UNKNOWN',
      createdAt: new Date(h.now()).toISOString(),
    };
    await proposals.save(receipt);
    await assert.rejects(confirmGoal(h.ctx, input, admin, h.creation), /mutation_reconciliation_required/);
    assert.equal(h.calls.creates, 0);
    await proposals.save({...receipt, status: 'VERIFIED'});
    assert.equal((await confirmGoal(h.ctx, input, admin, h.creation)).state, 'ACTIVE');
    assert.equal(await goalAuthorityActive(h.root), true);
  } finally {
    await h.cleanup();
  }
});

test('T8 legacy mutation-approve fails with goal_active_conflict while a goal is ACTIVE (dashboard wiring)', async (t) => {
  // No provider I/O: the conflict is raised before the legacy baseline read.
  t.mock.method(globalThis, 'fetch', async () => assert.fail('unexpected network access'));
  // One configured binding for both paths; its legacy Candidate is a separate, pre-assigned workspace.
  const legacyBinding = {...binding, workspaceId: '7'.repeat(24)};
  const h = await goalHarness({
    binding: legacyBinding,
    localMcp: (root) => ({connectionRef: 'owner-rest', credentialDirectory: join(root, 'mcp')}),
    oauth: {
      clientId: 'fixture-client',
      clientSecretFile: '/nonexistent/fixture-secret',
      applicationPermissions: {canReadDocuments: true, canWriteDocuments: true},
    },
  });
  try {
    const config = parseConfig({
      bindings: [legacyBinding],
      liveReads: true,
      goals: {enabled: true, approvalDirectory: h.approvalDirectory},
      localMcp: {connectionRef: 'owner-rest', credentialDirectory: join(h.root, 'mcp')},
      oauth: {
        clientId: 'fixture-client',
        clientSecretFile: '/nonexistent/fixture-secret',
        applicationPermissions: {canReadDocuments: true, canWriteDocuments: true},
      },
    });
    await mkdir(join(h.root, 'mcp'), {mode: 0o700});
    const store = await credentials(h.root, 'owner-rest', connectionOwner(legacyBinding), join(h.root, 'mcp'));
    await store.save({
      accessToken: 'fixture-access-DO-NOT-LOG',
      refreshToken: 'fixture-refresh-DO-NOT-LOG',
      expiresAt: Date.now() + 3600000,
      resource: 'https://cad.onshape.com/api/',
      scopes: ['OAuth2Read', 'OAuth2Write'],
    });
    const proposals = await mutationStore(h.root, legacyBinding);
    const body = {feature: {featureId: 'FabcDEF123_0'}};
    const id = '22222222-2222-4222-8222-222222222222';
    await proposals.save({
      version: 1,
      id,
      ownerHash: connectionOwner(legacyBinding),
      requestHash: 'a'.repeat(64),
      requestId: 'request',
      task: 'legacy',
      documentId: D,
      workspaceId: legacyBinding.workspaceId,
      elementId: E,
      primaryWorkspaceId: P,
      primaryMicroversionId: BASE,
      featureId: 'FabcDEF123_0',
      sourceMicroversion: BASE,
      body,
      payloadHash: payloadDigest(body),
      summary: 'legacy',
      status: 'PROPOSED',
      createdAt: new Date().toISOString(),
    });
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
    const approve = () =>
      actions
        .find((a) => a.id === 'mutation-approve')
        .handler({
          payload: {proposalId: id, expectedPayloadHash: payloadDigest(body)},
          client: {scopes: ['operator.admin']},
        });
    await activeGoal(h);
    const blocked = await approve();
    assert.equal(blocked.result.code, 'goal_active_conflict');
    assert.equal((await proposals.read(id)).status, 'PROPOSED');
    await assert.rejects(readFile(join(h.root, 'mcp', 'mutation-approvals', 'approved-update.json')));
  } finally {
    await h.cleanup();
  }
});

test('T9 goal_unsupported when goals are disabled, the capability is missing or 404; status reports the capability', async () => {
  for (const [setup, capability] of [
    [(h) => (h.server.capability = 'v2-only'), 'UNSUPPORTED'],
    [(h) => (h.server.capability = '404'), 'UNSUPPORTED'],
  ]) {
    const h = await goalHarness();
    try {
      setup(h);
      await assert.rejects(proposeVector(h), /goal_unsupported/);
      assert.deepEqual(await goalStatus(h.ctx), {goal: null, history: []});
      assert.equal(await goalCapability(h.ctx.fetcher), capability);
    } finally {
      await h.cleanup();
    }
  }
  const disabled = await goalHarness({goals: {enabled: false}});
  try {
    await assert.rejects(proposeVector(disabled), /goal_unsupported/);
    await assert.rejects(goalStatus(disabled.ctx), /goal_unsupported/);
    await assert.rejects(stopGoal(disabled.ctx, '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b', 'x'), /goal_unsupported/);
  } finally {
    await disabled.cleanup();
  }
  assert.throws(() => parseConfig({bindings: [], goals: {enabled: true}}), /invalid_configuration/);
  assert.throws(() => parseConfig({bindings: [], goals: {enabled: true, approvalDirectory: 'relative'}}), /invalid/);
  assert.deepEqual(parseConfig({bindings: []}).goals, undefined);
});

test('T9 capability and journal-summary probes on a 127.0.0.1 stub: 200, 404, 503, redirect, reset, timeout', async (t) => {
  let mode = 'goal';
  const goalId = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
  const server = createServer((req, res) => {
    if (mode === 'reset') {
      req.socket.destroy();
      return;
    }
    if (mode === 'hang') {
      return;
    }
    if (mode === 'redirect') {
      res.writeHead(302, {Location: 'http://127.0.0.1:1/elsewhere'});
      res.end();
      return;
    }
    if (mode === '503') {
      res.writeHead(503, {'Content-Type': 'application/json'});
      res.end('{"code":"dispatch_journal_unavailable"}');
      return;
    }
    if (mode === '404') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {'Content-Type': 'application/json'});
    if (req.url === '/capabilities') {
      res.end(JSON.stringify({contractVersion: '1.1.0', mutationAuthorities: ['approval-v2', 'goal-grant-v1']}));
    } else if (mode === 'malformed') {
      res.end('{"goalId":');
    } else {
      res.end(
        JSON.stringify({
          goalId,
          entries: 2,
          counted: 2,
          maxSequence: 2,
          unreconciledSequence: null,
          lastOutcome: 'OK',
          lastAdmittedAt: 1,
          future: true,
        }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const fetcher = (url, init) => fetch(String(url).replace('http://clawonshape-mcp:8080', base), init);
  assert.equal(await goalCapability(fetcher), 'AVAILABLE');
  assert.equal((await journalSummary(goalId, fetcher)).counted, 2);
  mode = 'malformed';
  assert.equal(await journalSummary(goalId, fetcher), null);
  for (const [m, capability] of [
    ['404', 'UNSUPPORTED'],
    ['503', 'BLOCKED'],
    ['redirect', 'BLOCKED'],
    ['reset', 'BLOCKED'],
    ['hang', 'BLOCKED'],
  ]) {
    mode = m;
    assert.equal(await goalCapability(fetcher), capability, m);
    if (m !== 'hang') {
      assert.equal(await journalSummary(goalId, fetcher), null, m);
    }
  }
  server.closeAllConnections();
});

test('GW3 canonical feature hash ignores the volatile keys of a recorded features read and nothing else', async () => {
  const {before, after} = await featuresFixture();
  const byId = (read, id) => read.features.find((f) => f.featureId === id);
  assert.deepEqual(VOLATILE_FEATURE_KEYS, ['nodeId', 'microversionSkew']);
  // Untouched feature with re-issued nodeIds: same hash.
  assert.equal(canonicalFeatureHash(byId(before, 'FholeAAA111_2')), canonicalFeatureHash(byId(after, 'FholeAAA111_2')));
  assert.equal(canonicalFeatureHash(byId(before, 'FfedCBA321_1')), canonicalFeatureHash(byId(after, 'FfedCBA321_1')));
  // Updated feature: different hash.
  assert.notEqual(
    canonicalFeatureHash(byId(before, 'FabcDEF123_0')),
    canonicalFeatureHash(byId(after, 'FabcDEF123_0')),
  );
  const hole = byId(before, 'FholeAAA111_2');
  const base = canonicalFeatureHash(hole);
  assert.equal(canonicalFeatureHash({...hole, _clientHint: 'x', microversionSkew: true}), base);
  for (const patch of [
    {name: 'Holes'},
    {suppressed: true},
    {featureType: 'extrude'},
    {namespace: 'e1::m2'},
    {parameters: [{...hole.parameters[0], expression: '4.5 mm'}]},
    {parameters: [{...hole.parameters[0], value: 1}]},
  ]) {
    assert.notEqual(canonicalFeatureHash({...hole, ...patch}), base, JSON.stringify(patch));
  }
});

test('T11 result delivery: lead-reply, outbound with a mocked adapter, failure code without a loop', async () => {
  const h = await goalHarness();
  try {
    const goalId = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
    const result = {
      state: 'COMPLETED',
      summary: 'All goal and preservation conditions verified.',
      verificationIndex: 0,
      revisionUrl: `https://cad.onshape.com/documents/${D}/w/${C}/m/${BASE}/e/${E}`,
      openLimits: ['Overall appearance stays compact'],
    };
    await assert.rejects(
      deliverGoalResult({
        stateDir: h.root,
        goalId,
        result,
        current: undefined,
        loadOutbound: async () => undefined,
        now: h.now,
      }),
      /goal_result_delivery_failed/,
    );
    await rememberGoalOrigin(h.root, goalId, {...origin, accountId: 'default'});
    // The first recorded origin stays.
    assert.deepEqual(await rememberGoalOrigin(h.root, goalId, {channel: 'discord', target: 'channel:other'}), {
      ...origin,
      accountId: 'default',
    });
    // Lead reply: the Lead's current conversation is the origin.
    const reply = await deliverGoalResult({
      stateDir: h.root,
      goalId,
      result,
      current: {channel: 'discord', to: origin.target},
      loadOutbound: async () => assert.fail('no outbound for a lead reply'),
      now: h.now,
    });
    assert.deepEqual(reply, {deliveredAt: h.now(), via: 'lead-reply', ...origin});
    // Outbound: another conversation; exactly one send to the recorded host-provided target.
    const sends = [];
    const outbound = async (channel) => {
      assert.equal(channel, 'discord');
      return async (params) => {
        sends.push(params);
      };
    };
    const blocked = {...result, state: 'BLOCKED', summary: 'Budget used up.'};
    const sent = await deliverGoalResult({
      stateDir: h.root,
      goalId,
      result: blocked,
      current: {channel: 'discord', to: 'channel:elsewhere'},
      loadOutbound: outbound,
      now: h.now,
    });
    assert.equal(sent.via, 'outbound');
    assert.equal(sends.length, 1);
    assert.equal(sends[0].to, origin.target);
    assert.equal(sends[0].accountId, 'default');
    assert.match(sends[0].text, /Onshape goal BLOCKED: Budget used up\./);
    // Already delivered: no second send.
    await deliverGoalResult({
      stateDir: h.root,
      goalId,
      result: blocked,
      current: {channel: 'discord', to: 'channel:elsewhere'},
      loadOutbound: outbound,
      now: h.now,
    });
    assert.equal(sends.length, 1);
    // Failure: one attempt, recorded, code only; the next Lead turn may try once more.
    let attempts = 0;
    const failing = async () => async () => {
      attempts++;
      throw new Error('provider says no: DO-NOT-LEAK');
    };
    const stopped = {...result, state: 'STOPPED', summary: 'Stopped.'};
    const args = {stateDir: h.root, goalId, result: stopped, current: undefined, now: h.now};
    await assert.rejects(deliverGoalResult({...args, loadOutbound: failing}), (e) => {
      assert.equal(e.message, 'goal_result_delivery_failed');
      return true;
    });
    assert.equal(attempts, 1);
    const entry = await readFile(join(h.root, 'claw-onshape', 'goal-deliveries', `${goalId}.json`), 'utf8');
    assert(!entry.includes('DO-NOT-LEAK'));
    assert.equal(JSON.parse(entry).failedAt, h.now());
    const retried = await deliverGoalResult({...args, loadOutbound: outbound});
    assert.equal(retried.via, 'outbound');
    assert.equal(sends.length, 2);
  } finally {
    await h.cleanup();
  }
});

test('T11/GW1 origin: Lead tool delivery context → signed goal request → goal record origin; tampering is rejected', async () => {
  const key = '1'.repeat(64);
  assert.deepEqual(
    leadOrigin({deliveryContext: {channel: 'discord', to: 'channel:origin-fixture', accountId: 'default'}}),
    {channel: 'discord', target: 'channel:origin-fixture', accountId: 'default'},
  );
  for (const deliveryContext of [undefined, {channel: 'discord'}, {to: 'channel:x'}, {channel: 'discord', to: ''}]) {
    assert.throws(() => leadOrigin({deliveryContext}), /delegation_denied/);
  }
  const context = mintContext(binding, key);
  const envelope = createTaskEnvelope(
    binding,
    {workflow: 'goal', task: 'Raise the depth to 60 mm.'},
    context,
    key,
    origin,
  );
  verifyTaskEnvelope(JSON.parse(JSON.stringify(envelope)), binding, context, key);
  assert.throws(
    () => verifyTaskEnvelope({...envelope, origin: {...origin, target: 'channel:attacker'}}, binding, context, key),
    /delegation_denied/,
  );
  const {origin: _dropped, ...withoutOrigin} = envelope;
  assert.throws(() => verifyTaskEnvelope(withoutOrigin, binding, context, key), /delegation_denied/);
  assert.throws(() => createTaskEnvelope(binding, {workflow: 'goal', task: 't'}, context, key), /delegation_denied/);
  assert.throws(
    () => createTaskEnvelope(binding, {workflow: 'edit', task: 't'}, context, key, origin),
    /delegation_denied/,
  );
  assert.throws(
    () =>
      createTaskEnvelope(
        binding,
        {workflow: 'edit', task: 't', goalId: '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b'},
        context,
        key,
      ),
    /invalid_arguments/,
  );
  // The Lead's delegation carries the origin inside the signed request.
  const dir = await goalHarness();
  try {
    const keyFile = join(dir.root, 'key');
    await writeFile(keyFile, key, {mode: 0o600});
    const c = parseConfig({
      bindings: [binding],
      delegation: {
        leadAgentId: 'lead',
        engineerAgentId: 'engineer',
        peerSenderId: 'lead',
        accountId: 'default',
        keyFile,
      },
    });
    const prior = process.env.A2A_LEAD_TO_MECHANICAL;
    process.env.A2A_LEAD_TO_MECHANICAL = 'fixture-transport';
    try {
      let signed;
      const fetcher = async (_url, init) => {
        const rpc = JSON.parse(init.body);
        signed = JSON.parse(rpc.params.message.parts[0].text);
        verifyTaskEnvelope(signed, c.bindings[0], rpc.params.message.contextId, key);
        const report = {
          status: 'ok',
          summary: 'proposed',
          requestId: signed.requestId,
          requestHash: signed.requestHash,
        };
        return new Response(
          JSON.stringify({
            result: {
              task: {
                id: 'task-1',
                contextId: rpc.params.message.contextId,
                status: {state: 'TASK_STATE_COMPLETED'},
                artifacts: [
                  {
                    parts: [
                      {
                        text: JSON.stringify({
                          ...report,
                          delegationProof: signResult(report, rpc.params.message.contextId, key),
                        }),
                      },
                    ],
                  },
                ],
              },
            },
          }),
          {headers: {'Content-Type': 'application/json'}},
        );
      };
      await delegateGoalTask(
        c,
        c.bindings[0],
        () => {},
        {workflow: 'goal', task: 'Goal: 60 mm depth.'},
        origin,
        fetcher,
      );
      assert.deepEqual(signed.origin, origin);
      assert.equal(signed.workflow, 'goal');
      // The Engineer records the signed origin with the goal.
      const proposed = await proposeGoal(dir.ctx, signed, {
        goalText: 'Depth 60 mm',
        goalConditions: [
          {
            id: 'depth',
            kind: 'parameterEquals',
            featureId: 'FabcDEF123_0',
            parameterId: 'depth',
            expression: '60 mm',
            text: 'Depth',
          },
        ],
        featureIds: ['FabcDEF123_0'],
      });
      assert.deepEqual((await dir.record(proposed.goalId)).origin, origin);
      assert.deepEqual((await dir.record(proposed.goalId)).scope.origin, origin);
    } finally {
      process.env.A2A_LEAD_TO_MECHANICAL = prior;
    }
  } finally {
    await dir.cleanup();
  }
});

test('propose validates scope and Part Studio membership before writing; revise rules follow §3', async () => {
  const h = await goalHarness();
  try {
    const v = await vector();
    const bad = [
      {featureIds: ['Fmissing_9']},
      {featureIds: ['FabcDEF123_0', 'FabcDEF123_0']},
      {goalConditions: [{id: 'look', kind: 'note', text: 'only a note'}]},
      {
        goalConditions: [
          {id: 'x', kind: 'parameterEquals', featureId: 'Fmissing_9', parameterId: 'p', expression: '1', text: 't'},
        ],
      },
      {maxDispatches: 26},
      {maxDispatches: 0},
      {lifetimeMinutes: 481},
      {goalConditions: [{...v.scope.goalConditions[0], extra: 1}]},
    ];
    for (const overrides of bad) {
      await assert.rejects(proposeVector(h, overrides), /invalid_arguments/, JSON.stringify(overrides));
    }
    await assert.rejects(proposeVector(h, {}, {workflow: 'edit'}), /invalid_arguments/);
    await assert.rejects(proposeVector(h, {}, {origin: undefined}), /delegation_denied/);
    assert.deepEqual(await goalStatus(h.ctx), {goal: null, history: []});
    const proposed = await proposeVector(h);
    // Renew from AWAITING_CONFIRMATION with an unchanged scope is not a transition of §3.
    await assert.rejects(proposeVector(h, {goalId: proposed.goalId}), /goal_state_invalid/);
    // Revise while awaiting confirmation: new scope revision and a new nonce.
    const nonce = await nonceOf(h, proposed.goalId);
    const revised = await proposeVector(h, {goalId: proposed.goalId, lifetimeMinutes: 60});
    assert.equal(revised.scopeRevision, 2);
    assert.notEqual(await nonceOf(h, proposed.goalId), nonce);
    assert.equal(goalHash(validateScope((await h.record(proposed.goalId)).scope)), revised.goalHash);
    // The goalId of the signed request and the tool input must agree.
    await assert.rejects(
      proposeVector(h, {goalId: proposed.goalId}, {goalId: '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b'}),
      /invalid_arguments/,
    );
    // Another binding does not see this goal.
    await assert.rejects(
      goalStatus({...h.ctx, binding: {...binding, elementId: 'c'.repeat(24)}}, proposed.goalId),
      /goal_not_found/,
    );
  } finally {
    await h.cleanup();
  }
});
