import {execFileSync} from 'node:child_process';
// Run only AFTER operator installation/configuration. Plugin startup has no provider calls.
try {
  const raw = execFileSync('openclaw', ['plugins', 'info', 'claw-onshape', '--runtime', '--json'], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  const info = JSON.parse(raw);
  if (info.plugin?.status !== 'loaded') {
    throw Error('plugin_not_loaded');
  }
  process.stdout.write('Native plugin info reports loaded. This does not test an agent turn or provider access.\n');
} catch {
  process.stderr.write(
    'Native loading check unavailable or failed. Verify OpenClaw 2026.9.9 installation and plugin diagnostics.\n',
  );
  process.exitCode = 1;
}
