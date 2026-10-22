// Durable work-context selection records (docs/interface/work-context.md §3): one private file per binding key in the
// Engineer plugin's state directory, atomic replace, fsync of file and directory (the goal-store pattern).
// Writers run under the goal store lock (§5.1); this module has no lock of its own.
import {constants} from 'node:fs';
import {lstat, mkdir, open, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {assertPrivateFile} from './credentials.ts';
import type {SelectionRecord} from './work-context.ts';
import {validateSelectionRecord} from './work-context.ts';

export const SELECTION_RECORD_MAX_BYTES = 16 * 1024;
const KEY = /^[a-f0-9]{64}$/;

const selectionDirectory = (stateDir: string) => path.join(stateDir, 'claw-onshape', 'work-context');

async function syncPath(target: string, flags: number): Promise<void> {
  const handle = await open(target, flags);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function privateDirectory(dir: string): Promise<void> {
  const info = await lstat(dir);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077 ||
    (await realpath(dir)) !== dir
  ) {
    throw new Error('goal_state_invalid');
  }
}

export type SelectionStore = Awaited<ReturnType<typeof selectionStore>>;

export async function selectionStore(stateDir: string) {
  if (!path.isAbsolute(stateDir)) {
    throw new Error('goal_state_invalid');
  }
  const root = selectionDirectory(stateDir);
  try {
    await mkdir(root, {recursive: true, mode: 0o700});
    await privateDirectory(root);
  } catch {
    // An unusable state directory is reported as unreadable selection state (fail closed).
    throw new Error('goal_state_invalid');
  }
  const native = await import('openclaw/plugin-sdk/secret-file-runtime');
  const file = (key: string) => {
    if (!KEY.test(key)) {
      throw new Error('goal_state_invalid');
    }
    return path.join(root, `${key}.json`);
  };
  // undefined = no record for this binding key (element-only binding, never adopted).
  const read = async (key: string): Promise<SelectionRecord | undefined> => {
    const p = file(key);
    try {
      assertPrivateFile(p);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw new Error('goal_state_invalid');
    }
    let raw: string;
    try {
      raw = await readFile(p, 'utf8');
    } catch {
      throw new Error('goal_state_invalid');
    }
    if (Buffer.byteLength(raw) > SELECTION_RECORD_MAX_BYTES) {
      throw new Error('goal_state_invalid');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('goal_state_invalid');
    }
    return validateSelectionRecord(parsed, key);
  };
  const save = async (record: SelectionRecord): Promise<void> => {
    const validated = validateSelectionRecord(JSON.parse(JSON.stringify(record)), record.bindingKey);
    const content = JSON.stringify(validated);
    if (Buffer.byteLength(content) > SELECTION_RECORD_MAX_BYTES) {
      throw new Error('goal_state_invalid');
    }
    await native.writePrivateSecretFileAtomic({
      rootDir: stateDir,
      filePath: file(record.bindingKey),
      content,
      durable: 'file',
    });
    await syncPath(file(record.bindingKey), constants.O_RDONLY);
    await syncPath(root, constants.O_RDONLY | constants.O_DIRECTORY);
  };
  return {root, read, save};
}
