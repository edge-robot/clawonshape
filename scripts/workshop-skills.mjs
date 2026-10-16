// Host-side, revision-aware export/import through native OpenClaw Workshop APIs.
// This operator utility does not execute MCP or add an agent skill source.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
const args = process.argv.slice(2);
const value = (key) => args[args.indexOf(key) + 1];
const mode = args[0];
const execute = args.includes('--execute');
const agentId = value('--agent');
const container = value('--container');
const directory = resolve(value('--directory') || '.');
if (!['export', 'import'].includes(mode) || !agentId || !container || !args.includes('--directory'))
  throw Error(
    'Usage: export|import --agent ID --container NAME --directory PATH [--execute] [--expected-current-sha256 HASH]',
  );
const hash = (s) => createHash('sha256').update(s).digest('hex');
const call = (method, params) =>
  JSON.parse(
    execFileSync(
      'podman',
      [
        'exec',
        container,
        'openclaw',
        'gateway',
        'call',
        method,
        '--params',
        JSON.stringify(params),
        '--json',
        '--timeout',
        '30000',
      ],
      {encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024},
    ),
  );
const safe = (name) => typeof name === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(name);
const installed = call('skills.proposals.list', {agentId}).installedSkills;
if (!Array.isArray(installed)) throw Error('Native installed Workshop inventory unavailable');
if (mode === 'export') {
  const manifest = {version: 1, agentId, source: 'native-openclaw-workshop', skills: []};
  for (const entry of installed) {
    if (!safe(entry.name)) throw Error('Unsafe installed skill name');
    const skill = call('skills.workshop.read', {agentId, name: entry.name});
    if (typeof skill.content !== 'string' || skill.name !== entry.name) throw Error('Native read contract unavailable');
    // This deployed API exposes SKILL.md only. Fail closed for declared resources.
    if (skill.supportFiles?.length || entry.supportFiles?.length)
      throw Error('Resource-bearing skills require native resource export support; no incomplete export written');
    const target = join(directory, entry.name, 'SKILL.md');
    const sha256 = hash(skill.content);
    if (existsSync(target) && hash(readFileSync(target)) !== sha256)
      throw Error(`Export differs: review ${entry.name} before replacing the reviewed file`);
    manifest.skills.push({name: entry.name, description: skill.description, sha256, resources: []});
    console.log(JSON.stringify({name: entry.name, sha256, action: execute ? 'export' : 'preview_export'}));
    if (execute) {
      mkdirSync(join(directory, entry.name), {recursive: true});
      writeFileSync(target, skill.content);
    }
  }
  if (execute) {
    mkdirSync(directory, {recursive: true});
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
} else {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.agentId !== agentId) throw Error('Export ownership mismatch');
  for (const entry of manifest.skills) {
    if (!safe(entry.name) || entry.resources?.length) throw Error('Unsupported import resources');
    const content = readFileSync(join(directory, entry.name, 'SKILL.md'), 'utf8');
    const current = installed.some((s) => s.name === entry.name)
      ? call('skills.workshop.read', {agentId, name: entry.name})
      : null;
    const currentHash = current ? hash(current.content) : null;
    if (currentHash === hash(content)) {
      console.log(JSON.stringify({name: entry.name, action: 'unchanged'}));
      continue;
    }
    console.log(
      JSON.stringify({
        name: entry.name,
        currentSha256: currentHash,
        proposedSha256: hash(content),
        action: execute ? 'propose_and_apply' : 'preview_import',
      }),
    );
    if (!execute) continue;
    // An existing customized version can only change after an explicit hash review.
    if (current && value('--expected-current-sha256') !== currentHash)
      throw Error('Existing skill differs: explicit --expected-current-sha256 required');
    const common = {
      agentId,
      content,
      description: entry.description,
      goal: 'Reviewed operator import of exported Workshop skill.',
      evidence: 'Native Workshop export/import with current-content and proposal-revision checks.',
    };
    const proposal = current
      ? call('skills.proposals.update', {...common, skillName: entry.name})
      : call('skills.proposals.create', {...common, name: entry.name});
    if (!proposal.record?.id || !proposal.revisionHash) throw Error('Native proposal revision unavailable');
    if (current && hash(call('skills.workshop.read', {agentId, name: entry.name}).content) !== currentHash)
      throw Error('Installed skill changed during import; proposal retained, not applied');
    const result = call('skills.proposals.apply', {
      agentId,
      proposalId: proposal.record.id,
      expectedRevisionHash: proposal.revisionHash,
    });
    if (result.record?.status !== 'applied') throw Error('Native apply did not complete');
    console.log(
      JSON.stringify({
        name: entry.name,
        proposalId: proposal.record.id,
        status: 'applied',
        sha256: hash(call('skills.workshop.read', {agentId, name: entry.name}).content),
      }),
    );
  }
}
