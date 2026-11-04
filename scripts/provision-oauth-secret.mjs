import {mkdir, lstat, realpath, open} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Operator-only terminal adapter. No command-line secret, env variable or echo.
export async function provisionSecret(secret, file) {
  if (typeof secret !== 'string' || !secret || secret.length > 8192 || /\s/.test(secret)) {
    throw new Error('Invalid secret. Nothing was saved.');
  }
  const directory = path.dirname(file);
  await mkdir(directory, {recursive: true, mode: 0o700});
  const s = await lstat(directory);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    s.uid !== process.getuid?.() ||
    s.mode & 0o077 ||
    (await realpath(directory)) !== directory
  ) {
    throw new Error('Secret directory must be private, owned and canonical.');
  }
  const f = await open(file, 'wx', 0o600);
  try {
    await f.writeFile(`${secret}\n`);
    await f.sync();
  } finally {
    await f.close();
  }
}
async function main() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Use your own interactive terminal; piped input is rejected.');
  }
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = path.join(repository, 'state', 'deployment', 'oauth', 'client-secret');
  process.stdout.write('Paste the Onshape application client secret, then press Enter (input is hidden): ');
  let secret = '';
  try {
    secret = await new Promise((resolve, reject) => {
      process.stdin.setRawMode(true);
      process.stdin.setEncoding('utf8');
      process.stdin.resume();
      const finish = (error) => {
        process.stdin.off('data', input);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        error ? reject(error) : resolve(secret);
      };
      const input = (chunk) => {
        for (const c of chunk) {
          if (c === '\u0003' || c === '\u0004') {
            secret = '';
            finish(new Error('Canceled. Nothing was saved.'));
            return;
          }
          if (c === '\r' || c === '\n') {
            finish();
            return;
          }
          if (c === '\u007f' || c === '\b') {
            secret = secret.slice(0, -1);
          } else if (c >= ' ') {
            secret += c;
          }
          if (secret.length > 8192) {
            secret = '';
            finish(new Error('Input too long. Nothing was saved.'));
            return;
          }
        }
      };
      process.stdin.on('data', input);
    });
    await provisionSecret(secret, file);
    process.stdout.write(
      '\nPrivate application secret saved. Refresh Claw-Onshape in the Mechanical Engineer dashboard, then choose Connect Onshape.\n',
    );
  } finally {
    secret = '';
    if (process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(
      '\nProvisioning failed or canceled. No secret value was logged. Existing files are never overwritten; ask the operator to inspect the private directory if needed.\n',
    );
    process.exitCode = 1;
  });
}
