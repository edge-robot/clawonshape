// Diagnostic only: no installation, restart, provider call or credential read.
import {spawnSync} from 'node:child_process';

const container = process.argv[2] ?? 'clawcad-mechanical-engineer';
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container)) throw Error('invalid_container_name');
function command(args, input) {
  const r = spawnSync('podman', args, {input, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024});
  return {ok: !r.error && r.status === 0, output: r.stdout?.trim() ?? ''};
}
const inspection = command(['inspect', container, '--format', '{{.State.Running}}']);
if (!inspection.ok) {
  console.log(
    JSON.stringify(
      {
        container,
        runtimeAccessible: false,
        next: 'Run this script in a normal host terminal with rootless Podman access.',
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else if (inspection.output !== 'true') {
  console.log(JSON.stringify({container, runtimeAccessible: true, running: false}, null, 2));
  process.exitCode = 1;
} else {
  const version = command(['exec', container, 'openclaw', '--version']);
  const match = version.output.match(/\b2026\.\d+\.\d+(?:-\d+)?\b/);
  const probe = command(
    ['exec', '-i', container, 'node', '--input-type=module'],
    `
    import {createRequire} from 'node:module';
    const require=createRequire(import.meta.url);
    const out={node:process.version};
    try {require.resolve('typescript/lib/tsc.js');out.localCompilerAvailable=true;}
    catch {out.localCompilerAvailable=false;}
    try {
      const sdk=await import('openclaw/plugin-sdk/secret-file-runtime');
      out.privateFileSdkAvailable=typeof sdk.readSecretFileSync==='function' && typeof sdk.writePrivateSecretFileAtomic==='function';
    } catch {out.privateFileSdkAvailable=false;}
    console.log(JSON.stringify(out));
  `,
  );
  let capabilities = {probeAvailable: false};
  try {
    capabilities = JSON.parse(probe.output);
  } catch {}
  const plugin = command(['exec', container, 'openclaw', 'plugins', 'info', 'claw-onshape', '--runtime', '--json']);
  let pluginState = {inspectionAvailable: false};
  try {
    const report = JSON.parse(plugin.output);
    pluginState = {
      inspectionAvailable: true,
      installed: report.plugin?.id === 'claw-onshape',
      status: report.plugin?.status,
      trustReason: report.plugin?.trust?.reason,
      diagnosticCount: Array.isArray(report.diagnostics) ? report.diagnostics.length : undefined,
    };
  } catch {}
  const result = {
    container,
    runtimeAccessible: true,
    running: true,
    openclawVersion: match?.[0] ?? 'unknown',
    researchedHost: '2026.9.9',
    matchesResearchedHost: match?.[0] === '2026.9.9',
    capabilities,
    plugin: pluginState,
    providerOperationsPerformed: false,
  };
  console.log(JSON.stringify(result, null, 2));
}
