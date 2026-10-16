// Operator-only provisioning through existing native APIs and Clawake lifecycle.
// Preview by default. Never invokes MCP or performs a CAD feature update.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const args = process.argv.slice(2),
  option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const execute = args.includes('--execute'),
  candidate = option('--candidate'),
  proposalId = option('--proposal');
if (!/^[a-f0-9]{24}$/.test(candidate ?? '')) {
  throw Error('Use --candidate ID [--proposal ID] [--execute]');
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  parent = dirname(repo),
  inventoryPath = join(repo, 'deploy/team.json');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const engineer = inventory.instances.find((i) => i.role === 'developer'),
  config = engineer.plugins.find((p) => p.id === 'claw-onshape').config;
if (config.bindings.length !== 1) {
  throw Error('Select one configured target before provisioning');
}
const binding = config.bindings[0];
if (candidate === binding.primaryWorkspaceId) {
  throw Error('Protected Primary is never a mutation target');
}
const native = (actionId, payload) =>
  JSON.parse(
    execFileSync(
      'podman',
      [
        'exec',
        engineer.container_name,
        'openclaw',
        'gateway',
        'call',
        'plugins.sessionAction',
        '--params',
        JSON.stringify({
          pluginId: 'claw-onshape',
          actionId,
          payload: {connectionRef: binding.connectionRef, ...payload},
        }),
        '--json',
        '--timeout',
        '60000',
      ],
      {encoding: 'utf8', timeout: 75000, maxBuffer: 8 * 1024 * 1024},
    ),
  );
if (candidate !== binding.workspaceId) {
  const wire = native('candidate-check', {candidateWorkspaceId: candidate});
  if (wire.result?.status !== 'ok' || wire.result.references?.candidateWorkspaceId !== candidate) {
    throw Error('Native control-plane Candidate membership/baseline check failed');
  }
}
let proposal;
if (proposalId) {
  if (!/^[a-f0-9-]{36}$/.test(proposalId)) {
    throw Error('Invalid proposal ID');
  }
  proposal = JSON.parse(
    readFileSync(join(engineer.state_path, 'claw-onshape/mutations', `${proposalId}.json`), 'utf8'),
  );
  if (
    proposal.status !== 'PROPOSED' ||
    proposal.workspaceId !== candidate ||
    proposal.primaryWorkspaceId !== binding.primaryWorkspaceId ||
    proposal.documentId !== binding.documentId ||
    proposal.elementId !== binding.elementId
  ) {
    throw Error('Proposal/target mismatch or unresolved attempt');
  }
}
for (const instance of inventory.instances) {
  const plugin = instance.plugins.find((p) => p.id === 'claw-onshape');
  if (plugin) {
    for (const b of plugin.config.bindings) {
      if (b.documentId === binding.documentId && b.primaryWorkspaceId === binding.primaryWorkspaceId) {
        b.workspaceId = candidate;
      }
    }
  }
}
const tomlString = (s) => JSON.stringify(s);
let configToml = `[external_token]\nfile = "/run/onshape-credentials/access-token.json"\ndocument_id = ${tomlString(binding.documentId)}\nworkspace_id = ${tomlString(candidate)}\nelement_id = ${tomlString(binding.elementId)}\nread_api_version = "v16"\n`;
if (proposal) {
  configToml += 'mutation_approval_file = "/run/onshape-credentials/mutation-approvals/approved-update.json"\n';
  configToml += `\n[external_token.mutation]\ndocument_id = ${tomlString(binding.documentId)}\nworkspace_id = ${tomlString(candidate)}\nelement_id = ${tomlString(binding.elementId)}\nexcluded_workspace_ids = [${tomlString(binding.primaryWorkspaceId)}]\nallowed_operations = ["updatePartStudioFeature"]\nfeature_id = ${tomlString(proposal.featureId)}\nexpected_microversion = ${tomlString(proposal.sourceMicroversion)}\nwrite_mode = "modify"\n`;
}
configToml +=
  '\n[api]\ntimeout = 30\n\n[http]\nhost = "0.0.0.0"\nport = 8080\npublic_url = "http://clawonshape-mcp:8080"\n';
const servicePath = join(repo, 'state/deployment/onshape-mcp/service.json'),
  service = JSON.parse(readFileSync(servicePath, 'utf8'));
const plan = join(repo, 'state/deployment/candidate-plan');
mkdirSync(plan, {recursive: true, mode: 0o700});
const plannedInventory = join(plan, 'team.json');
writeFileSync(plannedInventory, `${JSON.stringify(inventory, null, 2)}\n`, {mode: 0o600});
writeFileSync(join(plan, 'config.toml'), configToml, {mode: 0o600});
console.log(
  JSON.stringify({
    action: execute ? 'apply_reviewed_plan' : 'preview',
    candidate,
    protectedPrimary: binding.primaryWorkspaceId,
    featureId: proposal?.featureId,
    sourceMicroversion: proposal?.sourceMicroversion,
    payloadHash: proposal?.payloadHash,
    mutation: proposal ? 'exact_operator_approval_file_required' : 'disabled',
  }),
);
const clawake = join(parent, 'clawake/.venv/bin/clawake');
const lifecycle = (args) => execFileSync(clawake, args, {cwd: parent, stdio: 'inherit'});
lifecycle(['validate', '-c', plannedInventory]);
lifecycle(['setup', '-c', plannedInventory]);
lifecycle(['sync-plugins', '-c', plannedInventory]);
if (!execute) {
  process.exit(0);
}
const backup = join(repo, `state/backups/candidate-provision-${Date.now()}`);
mkdirSync(backup, {recursive: true, mode: 0o700});
copyFileSync(inventoryPath, join(backup, 'team.json'));
copyFileSync(service.config_file, join(backup, 'config.toml'));
// Stop MCP through Clawake before changing its configuration. All secrets stay intact.
lifecycle(['onshape-mcp', '-c', servicePath, '--action', 'stop']);
lifecycle(['onshape-mcp', '-c', servicePath, '--action', 'stop', '--execute']);
writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
writeFileSync(service.config_file, configToml, {mode: 0o600});
lifecycle(['setup', '-c', inventoryPath, '--execute']);
// Wait for native Gateway startup maintenance before plugin synchronization.
for (const instance of inventory.instances) {
  const port = instance.ports[0].host_port;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/ready`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ready) {
    throw Error('Gateway not ready; private provisioning backup retained');
  }
}
lifecycle(['sync-plugins', '-c', inventoryPath, '--execute']);
lifecycle(['onshape-mcp', '-c', servicePath, '--action', 'restart']);
lifecycle(['onshape-mcp', '-c', servicePath, '--action', 'restart', '--execute']);
console.log(
  'Candidate provisioned. Review/approve the exact proposal in the plugin dashboard before native execution. No feature update was performed.',
);
