// Run in a fresh Node process: no test hooks, credentials or provider calls.
import assert from 'node:assert/strict';
import {mkdtemp, chmod, lstat, readFile, readdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const report = {
  schemaVersion: 1,
  check: 'native_private_file',
  status: 'UNAVAILABLE',
  providerOperationsPerformed: false,
  checks: [],
  powerLossDurability: 'UNVERIFIED',
};
let root;
try {
  // Import failure must fail this check, rather than silently substitute a mock.
  const sdk = await import('openclaw/plugin-sdk/secret-file-runtime');
  assert.equal(typeof sdk.writePrivateSecretFileAtomic, 'function');
  assert.equal(typeof sdk.readSecretFileSync, 'function');
  root = await mkdtemp(path.join(tmpdir(), 'claw-onshape-native-check-'));
  await chmod(root, 0o700);
  const filePath = path.join(root, 'receipts', 'fixture.json');
  const first = JSON.stringify({schemaVersion: 1, status: 'UNKNOWN', fixture: true});
  const second = JSON.stringify({schemaVersion: 1, status: 'VERIFIED', fixture: true});
  await sdk.writePrivateSecretFileAtomic({rootDir: root, filePath, content: first, durable: 'file'});
  assert.equal(await readFile(filePath, 'utf8'), first);
  for (const item of [root, path.dirname(filePath), filePath]) {
    const info = await lstat(item);
    assert.equal(info.uid, process.getuid());
    assert.equal(info.mode & 0o077, 0);
    assert.equal(info.isSymbolicLink(), false);
  }
  report.checks.push('private_ownership_and_permissions', 'durable_option_accepted');
  await sdk.writePrivateSecretFileAtomic({rootDir: root, filePath, content: second, durable: 'file'});
  assert.equal(sdk.readSecretFileSync(filePath, 'Synthetic fixture', {rejectSymlink: true}), second);
  assert.deepEqual(await readdir(path.dirname(filePath)), ['fixture.json']);
  report.checks.push('complete_replacement', 'no_temporary_file_left');
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'import fs from "node:fs"; const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(v.status!=="VERIFIED"||v.fixture!==true)process.exit(1);',
      filePath,
    ],
    {encoding: 'utf8', timeout: 10000, maxBuffer: 2048},
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0);
  report.checks.push('fresh_process_read');
  const link = path.join(root, 'fixture-link');
  await symlink(filePath, link);
  assert.throws(() => sdk.readSecretFileSync(link, 'Synthetic fixture', {rejectSymlink: true}));
  report.checks.push('symlink_read_rejected');
  report.status = 'PASS';
} catch (error) {
  report.status = root ? 'FAIL' : 'UNAVAILABLE';
  report.reason = root ? 'native_private_file_contract_failed' : 'native_private_file_sdk_unavailable';
  // Only fixed diagnostic codes; paths and exception text are not emitted.
  process.exitCode = 1;
} finally {
  if (root)
    try {
      await rm(root, {recursive: true, force: true});
    } catch {
      report.status = 'FAIL';
      report.reason = 'fixture_cleanup_failed';
      process.exitCode = 1;
    }
}
console.log(JSON.stringify(report));
