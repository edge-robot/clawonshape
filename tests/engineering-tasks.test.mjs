import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTaskEnvelope, verifyTaskEnvelope, mintContext, delegateTask, signResult} from '../dist/delegation.js';
import {parseConfig} from '../dist/config.js';
import {RestClient, validateFeatureReadEvidence} from '../dist/rest.js';
const D = 'a'.repeat(24),
  W = 'b'.repeat(24),
  E = 'c'.repeat(24),
  M = 'd'.repeat(24),
  key = '1'.repeat(64);
const binding = {
  agentId: 'engineer',
  requesterSenderId: 'owner',
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
  documentId: D,
  primaryWorkspaceId: W,
  workspaceId: W,
  elementId: E,
};
const json = (v) => new Response(JSON.stringify(v), {headers: {'Content-Type': 'application/json'}});
test('free inspect/edit/verify requests are hash/signature bound without rewriting task text', () => {
  const context = mintContext(binding, key);
  for (const workflow of ['inspect', 'edit', 'verify']) {
    const task = 'Wie groß sind alle Montagebohrungen? Prüfe Zuordnung, gib Grenzen an.\nPlan: 4,5 mm.';
    const envelope = createTaskEnvelope(binding, {workflow, task}, context, key);
    assert.equal(envelope.task, task);
    assert.equal(envelope.workflow, workflow);
    assert.equal(envelope.requestHash.length, 64);
    verifyTaskEnvelope(JSON.parse(JSON.stringify(envelope)), binding, context, key);
    for (const patch of [
      {task: 'Andere Aufgabe'},
      {workflow: 'edit-other'},
      {requestHash: '0'.repeat(64)},
      {target: {...envelope.target, workspaceId: D}},
      {requestId: '2'.repeat(36)},
    ]) {
      assert.throws(() => verifyTaskEnvelope({...envelope, ...patch}, binding, context, key));
    }
    assert.throws(() => verifyTaskEnvelope(envelope, binding, 'other-context', key));
  }
});
test('A2A sends a signed free request and rejects a signed result for another request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'engineering-a2a-'));
  try {
    const keyFile = join(dir, 'key');
    await writeFile(keyFile, key, {mode: 0o600});
    const c = parseConfig({
      bindings: [binding],
      delegation: {
        leadAgentId: 'lead-agent',
        engineerAgentId: 'engineer',
        peerSenderId: 'lead',
        accountId: 'default',
        keyFile,
      },
    });
    const before = process.env.A2A_LEAD_TO_MECHANICAL;
    process.env.A2A_LEAD_TO_MECHANICAL = 'fixture-transport';
    try {
      for (const mismatch of [false, true]) {
        const fetcher = async (_url, init) => {
          const rpc = JSON.parse(init.body),
            message = rpc.params.message;
          assert.equal(rpc.method, 'SendMessage');
          const request = JSON.parse(message.parts[0].text);
          assert.equal(request.task, 'Lies holeDiameter, keine Änderung.');
          verifyTaskEnvelope(request, c.bindings[0], message.contextId, key);
          const result = {
            status: 'ok',
            summary: 'Live 4 mm',
            requestId: request.requestId,
            requestHash: mismatch ? '0'.repeat(64) : request.requestHash,
          };
          return json({
            result: {
              id: 'task-id',
              contextId: message.contextId,
              status: {state: 'TASK_STATE_COMPLETED'},
              artifacts: [
                {
                  parts: [
                    {text: JSON.stringify({...result, delegationProof: signResult(result, message.contextId, key)})},
                  ],
                },
              ],
            },
          });
        };
        const action = delegateTask(
          c,
          c.bindings[0],
          () => {},
          {workflow: 'inspect', task: 'Lies holeDiameter, keine Änderung.'},
          fetcher,
          async () => {},
        );
        if (mismatch) {
          await assert.rejects(action, /delegation_result_invalid/);
        } else {
          assert.equal((await action).a2aTaskId, 'task-id');
        }
      }
    } finally {
      if (before === undefined) {
        delete process.env.A2A_LEAD_TO_MECHANICAL;
      } else {
        process.env.A2A_LEAD_TO_MECHANICAL = before;
      }
    }
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
test('generic native observations verify holeDiameter and width/state at one live revision', async () => {
  const evidence = {
    microversionId: M,
    observations: [
      {featureId: 'plate', featureStatus: 'OK', parameterId: 'holeDiameter', expression: '4 mm'},
      {featureId: 'plate', featureStatus: 'OK', parameterId: 'plateWidth', expression: '50 mm'},
      {featureId: 'sketch', featureStatus: 'OK'},
    ],
  };
  const features = {
    sourceMicroversion: M,
    features: [
      {
        featureId: 'plate',
        parameters: [
          {parameterId: 'holeDiameter', expression: '4 mm'},
          {parameterId: 'plateWidth', expression: '50 mm'},
        ],
      },
      {featureId: 'sketch', parameters: []},
    ],
    featureStates: {plate: {featureStatus: 'OK'}, sketch: {featureStatus: 'OK'}},
  };
  const client = () => {
    const replies = [{id: D}, [{id: W}], [{id: E, elementType: 'PARTSTUDIO'}], features];
    return new RestClient(
      async () => 'fixture-access',
      async (_u, init) => {
        assert.equal(init.method, 'GET');
        return json(replies.shift());
      },
    );
  };
  assert.equal((await client().verifyFeatureEvidence(binding, evidence)).observations[0].parameterId, 'holeDiameter');
  await assert.rejects(
    client().verifyFeatureEvidence(binding, {...evidence, microversionId: D}),
    /source_revision_conflict/,
  );
  const altered = structuredClone(evidence);
  altered.observations[0].expression = '4.5 mm';
  await assert.rejects(client().verifyFeatureEvidence(binding, altered), /feature_observation_mismatch/);
  assert.throws(
    () =>
      validateFeatureReadEvidence({...evidence, observations: [evidence.observations[0], evidence.observations[0]]}),
    /invalid_arguments/,
  );
});
