import path from 'node:path';
import {lstat, realpath} from 'node:fs/promises';
import type {Tokens} from './oauth.ts';
// This directory is separately mounted rw in the owner and ro in MCP. Never
// publish the REST credential record or accept arbitrary metadata into the file.
export async function publishMcpCredential(directory: string, tokens: Tokens | null): Promise<void> {
  try {
    const dir = await lstat(directory);
    if (
      !path.isAbsolute(directory) ||
      !dir.isDirectory() ||
      dir.isSymbolicLink() ||
      dir.uid !== process.getuid?.() ||
      dir.mode & 0o077 ||
      (await realpath(directory)) !== directory
    ) {
      throw new Error();
    }
    const native = await import('openclaw/plugin-sdk/secret-file-runtime');
    const filePath = path.join(directory, 'access-token.json');
    const content =
      tokens === null
        ? 'null'
        : JSON.stringify({accessToken: tokens.accessToken, expiresAt: tokens.expiresAt, scopes: [...tokens.scopes]});
    await native.writePrivateSecretFileAtomic({rootDir: directory, filePath, content, durable: 'file'});
  } catch {
    throw new Error('mcp_credential_handoff_unavailable');
  }
}
