import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {mutationStore, payloadDigest} from '../dist/mutation-workflow.js';
import {createTaskEnvelope, mintContext} from '../dist/delegation.js';
import {registerDashboard} from '../dist/dashboard.js';
import {parseConfig} from '../dist/config.js';
const D = 'a'.repeat(24),
  P = 'b'.repeat(24),
  W = 'c'.repeat(24),
  E = 'd'.repeat(24),
  M = 'e'.repeat(24),
  PM = 'f'.repeat(24);
const binding = {
  agentId: 'engineer',
  requesterSenderId: 'owner',
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
  documentId: D,
  primaryWorkspaceId: P,
  workspaceId: W,
  elementId: E,
};
const feature = {
  featureId: 'plate',
  featureType: 'extrude',
  suppressed: false,
  parameters: [
    {parameterId: 'holeDiameter', expression: '4.5 mm'},
    {parameterId: 'plateWidth', expression: '50 mm'},
  ],
};
const body = {
  feature,
  sourceMicroversion: M,
  rejectMicroversionSkew: true,
  serializationVersion: '1.2.23',
  libraryVersion: 123,
};
const request = createTaskEnvelope(
  binding,
  {workflow: 'edit', task: 'Plane Montagebohrungen 4,5 mm; Candidate only.'},
  mintContext(binding, '1'.repeat(64)),
  '1'.repeat(64),
);
const baseline = (overrides = {}) => ({
  sourceMicroversion: M,
  primaryMicroversionId: PM,
  featureStatus: 'OK',
  feature,
  body,
  ...overrides,
});
test('Candidate approval binds the exact payload and persists UNKNOWN before native execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mutation-workflow-'));
  const directory = join(root, 'approval');
  try {
    const store = await mutationStore(root, binding);
    let current = baseline();
    const client = {featureUpdateBaseline: async () => current};
    const proposal = await store.propose(request, body, 'Mounting holes 4 → 4.5 mm; width preserved.', client);
    assert.equal(proposal.status, 'PROPOSED');
    assert.equal(proposal.payloadHash, payloadDigest(body));
    await assert.rejects(
      store.approve(proposal.id, '0'.repeat(64), directory, client, () => {}),
      /authorization_changed/,
    );
    await assert.rejects(
      store.approve(proposal.id, proposal.payloadHash, directory, client, () => {
        throw Error('operator denied');
      }),
      /operator denied/,
    );
    assert.equal((await store.read(proposal.id)).status, 'PROPOSED');
    const approved = await store.approve(proposal.id, proposal.payloadHash, directory, client, () => {});
    assert.equal(approved.status, 'UNKNOWN');
    assert.equal((await store.read(proposal.id)).status, 'UNKNOWN');
    const wire = JSON.parse(await readFile(join(directory, 'approved-update.json'), 'utf8'));
    assert.deepEqual(wire.body, body);
    assert.equal(wire.proposalId, proposal.id);
    const execution = await store.executionContext(proposal.id);
    assert.equal(execution.status, 'ok');
    assert.equal(execution.apiCall.endpoint, 'updatePartStudioFeature');
    assert.deepEqual(execution.apiCall.path_params, {did: D, wid: W, eid: E, fid: 'plate'});
    assert.deepEqual(execution.apiCall.body, body);
    assert.equal(execution.operation, undefined);
    await assert.rejects(store.propose(request, body, 'Another attempt', client), /mutation_reconciliation_required/);
    await assert.rejects(
      store.approve(proposal.id, proposal.payloadHash, directory, client, () => {}),
      /authorization_changed/,
    );
    await assert.rejects(store.reconcile(proposal.id, client, directory), /mutation_outcome_unknown/);
    current = baseline({sourceMicroversion: D, primaryMicroversionId: M});
    await assert.rejects(store.reconcile(proposal.id, client, directory), /primary_revision_changed/);
    current = baseline({sourceMicroversion: D});
    const verified = await store.reconcile(proposal.id, client, directory);
    assert.equal(verified.status, 'VERIFIED');
    assert.equal(JSON.parse(await readFile(join(directory, 'approved-update.json'), 'utf8')), null);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('Primary and stale proposal revisions cannot receive execution authority', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mutation-deny-'));
  try {
    await assert.rejects(
      (await mutationStore(root, {...binding, workspaceId: P})).propose(request, body, 'Plan', {}),
      /protected_primary_workspace/,
    );
    const store = await mutationStore(root, binding);
    let current = baseline();
    const client = {featureUpdateBaseline: async () => current};
    const proposal = await store.propose(request, body, 'Plan', client);
    current = baseline({sourceMicroversion: D});
    await assert.rejects(
      store.approve(proposal.id, proposal.payloadHash, join(root, 'approval'), client, () => {}),
      /source_revision_conflict/,
    );
    assert.equal((await store.read(proposal.id)).status, 'PROPOSED');
    await assert.rejects(
      store.propose(request, {...body, sourceMicroversion: D, serializationVersion: 'v10'}, 'Plan', client),
      /provider_protocol_error/,
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
test('Candidate creation and update approval require actual operator.admin before touching state', async () => {
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
    () => parseConfig({bindings: []}),
  );
  for (const name of ['candidate-prepare', 'candidate-check', 'mutation-approve', 'mutation-reconcile']) {
    const result = await actions.find((a) => a.id === name).handler({payload: {}, client: {scopes: ['operator.read']}});
    assert.equal(result.result.code, 'authorization_changed');
  }
});

test('unreadable mutation receipts block new proposals and approvals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mutation-receipt-corrupt-'));
  try {
    const store = await mutationStore(root, binding),
      client = {featureUpdateBaseline: async () => baseline()};
    const proposal = await store.propose(request, body, 'Reviewed Candidate change', client);
    await writeFile(join(root, 'claw-onshape', 'mutations', '11111111-1111-4111-8111-111111111111.json'), '{invalid', {
      mode: 0o600,
    });
    await assert.rejects(store.list());
    await assert.rejects(store.propose(request, body, 'Another change', client));
    await assert.rejects(store.approve(proposal.id, proposal.payloadHash, join(root, 'approval'), client, () => {}));
    assert.equal((await store.read(proposal.id)).status, 'PROPOSED');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

// Contract §4 reconcile rules 1–4 with an injected clock (docs/interface/onshape-mcp.md 0.3.0-draft).
const APPROVAL_LIFETIME = 300000;
async function approvedReceipt(t0 = 1_800_000_000_000) {
  const root = await mkdtemp(join(tmpdir(), 'mutation-reconcile-'));
  const directory = join(root, 'approval'),
    approvalFile = join(directory, 'approved-update.json');
  const clock = {now: t0};
  const store = await mutationStore(root, binding, () => clock.now);
  const client = {current: baseline(), featureUpdateBaseline: async () => client.current};
  const proposal = await store.propose(request, body, 'Mounting holes 4 → 4.5 mm.', client);
  const approved = await store.approve(proposal.id, proposal.payloadHash, directory, client, () => {});
  assert.equal(approved.expiresAt, t0 + APPROVAL_LIFETIME);
  return {root, directory, approvalFile, clock, store, client, proposal, expiresAt: approved.expiresAt};
}

// Contract §4: 60 s grace after expiresAt before rule 4 applies.
const GRACE = 60000;
const changedFeature = {
  ...feature,
  parameters: [
    {parameterId: 'holeDiameter', expression: '5 mm'},
    {parameterId: 'plateWidth', expression: '50 mm'},
  ],
};

test('reconcile (a) Primary changed stays UNKNOWN and leaves the approval file untouched', async () => {
  const r = await approvedReceipt();
  try {
    const before = await readFile(r.approvalFile, 'utf8');
    r.client.current = baseline({primaryMicroversionId: M});
    await assert.rejects(r.store.reconcile(r.proposal.id, r.client, r.directory), /primary_revision_changed/);
    // Rule 1 precedes rule 4: an expired approval with a changed Primary is not closed as REJECTED.
    r.clock.now = r.expiresAt + GRACE;
    await assert.rejects(r.store.reconcile(r.proposal.id, r.client, r.directory), /primary_revision_changed/);
    assert.equal((await r.store.read(r.proposal.id)).status, 'UNKNOWN');
    assert.equal(await readFile(r.approvalFile, 'utf8'), before);
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('reconcile (b) Candidate changed and matching becomes VERIFIED and resets the approval file', async () => {
  const r = await approvedReceipt();
  try {
    // Rule 2 precedes rule 4: a dispatch that landed is verified even after the grace period.
    r.clock.now = r.expiresAt + GRACE;
    r.client.current = baseline({sourceMicroversion: D});
    const verified = await r.store.reconcile(r.proposal.id, r.client, r.directory);
    assert.equal(verified.status, 'VERIFIED');
    assert.equal(verified.resultMicroversion, D);
    assert.equal((await r.store.read(r.proposal.id)).status, 'VERIFIED');
    assert.equal(JSON.parse(await readFile(r.approvalFile, 'utf8')), null);
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('reconcile (c) Candidate changed but mismatching stays UNKNOWN', async () => {
  const r = await approvedReceipt();
  try {
    const before = await readFile(r.approvalFile, 'utf8');
    r.client.current = baseline({sourceMicroversion: D, feature: changedFeature});
    await assert.rejects(r.store.reconcile(r.proposal.id, r.client, r.directory), /mutation_verification_mismatch/);
    assert.equal((await r.store.read(r.proposal.id)).status, 'UNKNOWN');
    assert.equal(await readFile(r.approvalFile, 'utf8'), before);
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('reconcile (d) unchanged Candidate within the 60 s grace stays UNKNOWN', async () => {
  const r = await approvedReceipt();
  try {
    const before = await readFile(r.approvalFile, 'utf8');
    r.clock.now = r.expiresAt + GRACE - 1;
    await assert.rejects(r.store.reconcile(r.proposal.id, r.client, r.directory), /mutation_outcome_unknown/);
    assert.equal((await r.store.read(r.proposal.id)).status, 'UNKNOWN');
    assert.equal(await readFile(r.approvalFile, 'utf8'), before);
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('reconcile (e) unchanged Candidate after the grace closes as REJECTED and resets the approval file', async () => {
  const r = await approvedReceipt();
  try {
    r.clock.now = r.expiresAt + GRACE;
    const rejected = await r.store.reconcile(r.proposal.id, r.client, r.directory);
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.reason, 'approval_expired_not_dispatched');
    assert.equal(rejected.rejectedAt, new Date(r.expiresAt + GRACE).toISOString());
    const stored = await r.store.read(r.proposal.id);
    assert.deepEqual(stored, rejected);
    // All other receipt fields are kept.
    assert.equal(stored.payloadHash, r.proposal.payloadHash);
    assert.equal(stored.expiresAt, r.expiresAt);
    assert.deepEqual(stored.body, body);
    assert.equal(JSON.parse(await readFile(r.approvalFile, 'utf8')), null);
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('reconcile (f) a REJECTED receipt does not block a new proposal and approval', async () => {
  const r = await approvedReceipt();
  try {
    r.clock.now = r.expiresAt + GRACE;
    assert.equal((await r.store.reconcile(r.proposal.id, r.client, r.directory)).status, 'REJECTED');
    const next = await r.store.propose(request, body, 'Second attempt after expiry.', r.client);
    assert.equal(next.status, 'PROPOSED');
    const approved = await r.store.approve(next.id, next.payloadHash, r.directory, r.client, () => {});
    assert.equal(approved.status, 'UNKNOWN');
    assert.equal(JSON.parse(await readFile(r.approvalFile, 'utf8')).proposalId, next.id);
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('reconcile (g) terminal REJECTED and VERIFIED receipts are refused without a file write', async () => {
  const r = await approvedReceipt();
  try {
    r.clock.now = r.expiresAt + GRACE;
    await r.store.reconcile(r.proposal.id, r.client, r.directory);
    const next = await r.store.propose(request, body, 'Verified attempt.', r.client);
    await r.store.approve(next.id, next.payloadHash, r.directory, r.client, () => {});
    r.client.current = baseline({sourceMicroversion: D});
    assert.equal((await r.store.reconcile(next.id, r.client, r.directory)).status, 'VERIFIED');
    await writeFile(r.approvalFile, 'sentinel', {mode: 0o600});
    for (const id of [r.proposal.id, next.id]) {
      await assert.rejects(r.store.reconcile(id, r.client, r.directory), /invalid_arguments/);
    }
    assert.equal(await readFile(r.approvalFile, 'utf8'), 'sentinel');
    assert.equal((await r.store.read(r.proposal.id)).status, 'REJECTED');
    assert.equal((await r.store.read(next.id)).status, 'VERIFIED');
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});

test('executionContext is unavailable once the approval has expired', async () => {
  const r = await approvedReceipt();
  try {
    r.clock.now = r.expiresAt - 1;
    assert.equal((await r.store.executionContext(r.proposal.id)).expiresAt, r.expiresAt);
    r.clock.now = r.expiresAt;
    await assert.rejects(r.store.executionContext(r.proposal.id), /mutation_approval_unavailable/);
  } finally {
    await rm(r.root, {recursive: true, force: true});
  }
});
