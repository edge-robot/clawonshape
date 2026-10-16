import test from 'node:test';
import assert from 'node:assert/strict';
import {RestClient, validateFeatureObservation} from '../dist/rest.js';
import plugin from '../dist/index.js';

const D = 'a'.repeat(24),
  W = 'b'.repeat(24),
  E = 'c'.repeat(24),
  M = 'd'.repeat(24);
const binding = {
  agentId: 'engineer',
  requesterSenderId: 'owner',
  messageChannel: 'discord',
  agentAccountId: 'default',
  discordChannelId: '123456789012345678',
  connectionRef: 'owner-rest',
  documentId: D,
  primaryWorkspaceId: W,
  workspaceId: W,
  elementId: E,
};
const observation = {microversionId: M, featureId: 'live_feature', plateWidth: '63 mm', featureStatus: 'OK'};
const features = {
  sourceMicroversion: M,
  features: [{featureId: 'live_feature', parameters: [{parameterId: 'plateWidth', expression: '63 mm'}]}],
  featureStates: {live_feature: {featureStatus: 'OK'}},
};
function client(response = features, workspaces = [{id: W}], elements = [{id: E, elementType: 'PARTSTUDIO'}]) {
  const calls = [],
    replies = [{id: D}, workspaces, elements, response];
  return {
    calls,
    rest: new RestClient(
      async () => 'fixture-access',
      async (url, init) => {
        calls.push({url, init});
        return new Response(JSON.stringify(replies.shift()), {headers: {'Content-Type': 'application/json'}});
      },
    ),
  };
}
test('native feature evidence is independently matched using only exact-target GETs', async () => {
  const {rest, calls} = client();
  const result = await rest.verifyFeatureRead(binding, observation);
  assert.equal(result.plateWidth, '63 mm');
  assert.equal(result.verification, 'independent_rest_match');
  assert(calls.every((c) => c.init.method === 'GET'));
  assert(calls.at(-1).url.endsWith(`/partstudios/d/${D}/w/${W}/e/${E}/features`));
  assert(!JSON.stringify(result).includes('fixture-access'));
});
test('verification denies stale revisions, wrong width/state/feature and missing membership', async () => {
  for (const change of [
    {microversionId: D},
    {plateWidth: '50 mm'},
    {featureStatus: 'ERROR'},
    {featureId: 'historical_feature'},
  ]) {
    await assert.rejects(
      client().rest.verifyFeatureRead(binding, {...observation, ...change}),
      /source_revision_conflict|feature_observation_mismatch/,
    );
  }
  await assert.rejects(client(features, []).rest.verifyFeatureRead(binding, observation), /workspace_not_in_document/);
  await assert.rejects(
    client(features, [{id: W}], [{id: E, elementType: 'DRAWING'}]).rest.verifyFeatureRead(binding, observation),
    /target_not_part_studio/,
  );
  const duplicate = structuredClone(features);
  duplicate.features[0].parameters.push({parameterId: 'plateWidth', expression: '63 mm'});
  await assert.rejects(client(duplicate).rest.verifyFeatureRead(binding, observation), /feature_observation_mismatch/);
  for (const bad of [
    {...observation, documentId: D},
    {...observation, microversionId: 'bad'},
    {...observation, featureId: '../bad'},
    {...observation, plateWidth: 50},
  ]) {
    assert.throws(() => validateFeatureObservation(bad), /invalid_arguments/);
  }
});
test('inspection tools require the same trusted Engineer or Lead identity as existing tools', () => {
  const config = {
    bindings: [binding],
    liveReads: true,
    delegation: {
      leadAgentId: 'lead-agent',
      engineerAgentId: 'engineer',
      peerSenderId: 'lead',
      accountId: 'default',
      keyFile: '/unused/key',
    },
  };
  const factories = [];
  plugin.register({
    pluginConfig: config,
    registerTool: (f) => factories.push(f.create),
    registerCli: () => {},
    registerHttpRoute: () => {},
    session: {controls: {registerSessionAction: () => {}}},
    lifecycle: {registerRuntimeLifecycle: () => {}},
    runtime: {
      state: {resolveStateDir: () => '/tmp/unused'},
      config: {current: () => ({plugins: {entries: {'claw-onshape': {enabled: true, config}}}})},
    },
  });
  const tools = (ctx) =>
    factories
      .map((f) => f({deliveryContext: {channel: 'discord', to: binding.discordChannelId}, ...ctx}))
      .filter(Boolean)
      .map((t) => t.name);
  assert(tools(binding).includes('onshape_verify_feature_read'));
  assert(!tools(binding).includes('onshape_delegate_inspect'));
  assert(
    tools({
      ...binding,
      agentId: 'lead-agent',
      deliveryContext: {channel: 'discord', to: binding.discordChannelId},
    }).includes('onshape_delegate_inspect'),
  );
  assert(!tools({...binding, requesterSenderId: 'other'}).includes('onshape_verify_feature_read'));
  assert(
    !tools({
      ...binding,
      agentId: 'lead-agent',
      deliveryContext: {channel: 'discord', to: '999999999999999999'},
    }).includes('onshape_delegate_inspect'),
  );
});
