// Operator deployment adapter: native OpenClaw Agent Files API, fixed AGENTS.md.
// Run inside the managed runtime after Clawake removes any nested AGENTS.md mount.
// Original runtime role files must first be backed up by the operator.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const [agentId, sourceFile] = process.argv.slice(2);
if (!['clawcad-robotics-lead', 'clawcad-mechanical-engineer'].includes(agentId) || !sourceFile)
  throw new Error('Expected managed agent ID and prepared role file.');
const content = readFileSync(sourceFile, 'utf8');
const title =
  agentId === 'clawcad-robotics-lead'
    ? '# Robotics Lead — Claw-Onshape read/render product increment'
    : '# Mechanical Engineer — Claw-Onshape read/render product increment';
if (!content.startsWith(title + '\n') || Buffer.byteLength(content) > 32768)
  throw new Error('Invalid prepared Claw-Onshape role document.');
const call = (method, params) =>
  JSON.parse(
    execFileSync('openclaw', ['gateway', 'call', method, '--params', JSON.stringify(params), '--json'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }),
  );
const params = {agentId, name: 'AGENTS.md'};
const before = call('agents.files.get', params);
if (before.agentId !== agentId || before.file?.missing || !/^[a-f0-9]{64}$/.test(before.file?.hash ?? ''))
  throw new Error('Native role read failed; nothing was written.');
const desiredHash = createHash('sha256').update(content).digest('hex');
if (before.file.hash !== desiredHash) {
  const result = call('agents.files.set', {...params, content, expectedHash: before.file.hash});
  if (result.ok !== true || result.file?.hash !== desiredHash) throw new Error('Native guarded role write failed.');
}
const after = call('agents.files.get', params);
if (after.file?.hash !== desiredHash) throw new Error('Native role verification failed.');
console.log(
  JSON.stringify({
    agentId,
    changed: before.file.hash !== desiredHash,
    previousHash: before.file.hash,
    hash: desiredHash,
    path: after.file.path,
  }),
);
