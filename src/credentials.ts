import path from 'node:path';
import {publishMcpCredential} from './mcp-credentials.ts';
import {open, lstat, realpath, unlink} from 'node:fs/promises';
import type {FileHandle} from 'node:fs/promises';
import {lstatSync, realpathSync} from 'node:fs';
import {ref} from './config.ts';
import type {Tokens} from './oauth.ts';
import type {OAuthScope} from './oauth.ts';
import {OAUTH_SCOPE_READ, scopeToken} from './oauth.ts';
export function assertPrivateFile(filePath: string): void {
  const file = lstatSync(filePath),
    dir = lstatSync(path.dirname(filePath));
  if (
    !path.isAbsolute(filePath) ||
    !file.isFile() ||
    file.isSymbolicLink() ||
    file.nlink !== 1 ||
    file.uid !== process.getuid?.() ||
    file.mode & 0o077 ||
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    dir.uid !== process.getuid?.() ||
    dir.mode & 0o077 ||
    realpathSync(filePath) !== filePath
  ) {
    throw new Error('private_file_required');
  }
}
export async function privateSecret(filePath: string): Promise<string> {
  try {
    assertPrivateFile(filePath);
    const native = await import('openclaw/plugin-sdk/secret-file-runtime');
    const value = native.readSecretFileSync(filePath, 'Claw-Onshape private secret', {rejectSymlink: true}).trim();
    if (!value || value.length > 8192 || /\s/.test(value)) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error('private_secret_unavailable');
  }
}
// Native host helpers own permission, symlink and atomic-file handling.
export async function credentials(stateDir: string, connectionRef: string, owner: string, handoffDirectory?: string) {
  if (!ref(connectionRef) || !path.isAbsolute(stateDir) || !/^[a-f0-9]{64}$/.test(owner)) {
    throw new Error('invalid_connection');
  }
  const filePath = path.join(stateDir, 'claw-onshape', 'credentials', `${connectionRef}.json`);
  const native = await import('openclaw/plugin-sdk/secret-file-runtime');
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    // Hold through an entire consent attempt; disconnect never reports success while
    // an outstanding callback could subsequently restore the connection.
    const lockPath = path.join(stateDir, `.claw-onshape-${connectionRef}.lock`);
    let lock: FileHandle;
    try {
      const root = await lstat(stateDir);
      if (
        !root.isDirectory() ||
        root.isSymbolicLink() ||
        root.mode & 0o077 ||
        root.uid !== process.getuid?.() ||
        (await realpath(stateDir)) !== stateDir
      ) {
        throw new Error();
      }
      lock = await open(lockPath, 'wx', 0o600);
    } catch {
      throw new Error('connection_busy_or_state_unavailable');
    }
    try {
      return await action();
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  };
  const normalized = (tokens: unknown): Tokens => {
    const t = tokens as Partial<Tokens> | null | undefined;
    const scopes = t?.scopes;
    // Pre-scope records came from the read-only onboarding implementation.
    // Migrate only absent fields; malformed explicit grants must fail closed.
    if (
      scopes !== undefined &&
      (!Array.isArray(scopes) || !scopes.length || scopes.length > 32 || !scopes.every(scopeToken))
    ) {
      throw new Error('reconnect_required');
    }
    const validScopes: readonly OAuthScope[] =
      scopes === undefined ? Object.freeze([OAUTH_SCOPE_READ]) : Object.freeze([...new Set(scopes)]);
    return {...t, scopes: Object.freeze(validScopes)} as Tokens;
  };
  return {
    exclusive,
    async save(tokens: Tokens | null): Promise<void> {
      if (handoffDirectory) {
        await publishMcpCredential(handoffDirectory, null);
      }
      try {
        await native.writePrivateSecretFileAtomic({
          rootDir: stateDir,
          filePath,
          content: JSON.stringify({owner, tokens}),
          durable: 'file',
        });
      } catch {
        throw new Error('credential_store_unavailable');
      }
      if (handoffDirectory && tokens) {
        await publishMcpCredential(handoffDirectory, tokens);
      }
    },
    status(): 'disconnected' | 'expired' | 'connected' | 'unavailable' {
      try {
        assertPrivateFile(filePath);
        const r = JSON.parse(native.readSecretFileSync(filePath, 'Onshape connection', {rejectSymlink: true}));
        if (r.owner !== owner) {
          return 'unavailable';
        }
        if (r.tokens === null) {
          return 'disconnected';
        }
        const t = normalized(r.tokens);
        if (
          t?.resource !== 'https://cad.onshape.com/api/' ||
          typeof t?.accessToken !== 'string' ||
          !t.accessToken ||
          /\s/.test(t.accessToken) ||
          !Number.isFinite(t.expiresAt) ||
          !t.scopes.length
        ) {
          return 'unavailable';
        }
        return r.tokens.expiresAt <= Date.now() + 30000 ? 'expired' : 'connected';
      } catch {
        try {
          lstatSync(filePath);
          return 'unavailable';
        } catch {
          return 'disconnected';
        }
      }
    },
    read(allowExpired = false): Tokens {
      try {
        assertPrivateFile(filePath);
        const record = JSON.parse(native.readSecretFileSync(filePath, 'Onshape connection', {rejectSymlink: true})) as {
          owner: string;
          tokens: Tokens;
        };
        if (record.owner !== owner) {
          throw new Error();
        }
        const t = normalized(record.tokens);
        if (
          !t ||
          t.resource !== 'https://cad.onshape.com/api/' ||
          typeof t.accessToken !== 'string' ||
          !t.accessToken ||
          /\s/.test(t.accessToken) ||
          typeof t.refreshToken !== 'string' ||
          !t.refreshToken ||
          /\s/.test(t.refreshToken) ||
          !Number.isFinite(t.expiresAt) ||
          !t.scopes.length ||
          (!allowExpired && t.expiresAt <= Date.now() + 30000)
        ) {
          throw new Error();
        }
        return t;
      } catch {
        throw new Error('reconnect_required');
      }
    },
  };
}
