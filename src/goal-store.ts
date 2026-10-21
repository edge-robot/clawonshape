// Durable goal records (docs/interface/goal-workflow.md §1) and the goal grant writer (onshape-mcp.md §12.2).
// One private file per goal, atomic replace, fsync of file and directory; a non-waiting lock serializes transitions.
import {constants} from 'node:fs';
import {lstat, mkdir, open, readdir, readFile, realpath, unlink} from 'node:fs/promises';
import path from 'node:path';
import {assertPrivateFile} from './credentials.ts';
import type {GoalGrant, GoalRecord} from './goal-lifecycle.ts';
import {GRANT_MAX_BYTES, grantViolations, isTerminal, uuidV4, validateRecord} from './goal-lifecycle.ts';

export const GOAL_RECORD_MAX_BYTES = 8 * 1024 * 1024;
export const GOAL_MAX_RECORDS = 256;
export const GOAL_GRANT_FILE = 'goal-grant.json';

const goalDirectory = (stateDir: string) => path.join(stateDir, 'claw-onshape', 'goals');

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

export type GoalStore = Awaited<ReturnType<typeof goalStore>>;

export async function goalStore(stateDir: string) {
  if (!path.isAbsolute(stateDir)) {
    throw new Error('goal_state_invalid');
  }
  const root = goalDirectory(stateDir);
  await mkdir(root, {recursive: true, mode: 0o700});
  await privateDirectory(root);
  const native = await import('openclaw/plugin-sdk/secret-file-runtime');
  const file = (goalId: string) => {
    if (!uuidV4(goalId)) {
      throw new Error('invalid_arguments');
    }
    return path.join(root, `${goalId}.json`);
  };
  const read = async (goalId: string): Promise<GoalRecord> => {
    const p = file(goalId);
    try {
      assertPrivateFile(p);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('goal_not_found');
      }
      throw new Error('goal_state_invalid');
    }
    const raw = await readFile(p, 'utf8');
    if (Buffer.byteLength(raw) > GOAL_RECORD_MAX_BYTES) {
      throw new Error('goal_state_invalid');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('goal_state_invalid');
    }
    return validateRecord(parsed, goalId);
  };
  // The goal record is persisted (file and directory entry synced) before any grant revision is published.
  const save = async (record: GoalRecord): Promise<void> => {
    const validated = validateRecord(JSON.parse(JSON.stringify(record)), record.goalId);
    const content = JSON.stringify(validated);
    if (Buffer.byteLength(content) > GOAL_RECORD_MAX_BYTES) {
      throw new Error('goal_state_invalid');
    }
    await native.writePrivateSecretFileAtomic({
      rootDir: stateDir,
      filePath: file(record.goalId),
      content,
      durable: 'file',
    });
    await syncPath(file(record.goalId), constants.O_RDONLY);
    await syncPath(root, constants.O_RDONLY | constants.O_DIRECTORY);
  };
  // Never omit an unreadable record: it could hold live goal authority.
  const list = async (): Promise<GoalRecord[]> => {
    const names = (await readdir(root)).filter((name) => name.endsWith('.json'));
    if (names.length > GOAL_MAX_RECORDS) {
      throw new Error('goal_state_invalid');
    }
    const records: GoalRecord[] = [];
    for (const name of names) {
      records.push(await read(name.slice(0, -5)));
    }
    return records.sort((a, b) => a.createdAt - b.createdAt);
  };
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    const lock = path.join(root, 'operation.lock');
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(
        lock,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
    } catch {
      // Another goal transition is running (or a stale lock needs operator attention). Never wait or retry here.
      throw new Error('connection_busy_or_state_unavailable');
    }
    try {
      return await action();
    } finally {
      await handle.close();
      await unlink(lock);
    }
  };
  return {
    root,
    read,
    save,
    list,
    exclusive,
    // §1 exclusivity. The grant file is shared by every binding of this plugin, so the check is store-wide.
    async nonTerminal(): Promise<GoalRecord[]> {
      return (await list()).filter((record) => !isTerminal(record.state));
    },
  };
}

// Read-only check used by the legacy mutation-approve path (§1): true while any goal holds live authority.
// A missing goal directory means no goal was ever created.
export async function goalAuthorityActive(stateDir: string): Promise<boolean> {
  try {
    await lstat(goalDirectory(stateDir));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw new Error('goal_state_invalid');
  }
  const store = await goalStore(stateDir);
  return (await store.list()).some((record) => record.state === 'ACTIVE' || record.state === 'RECONCILING');
}

// §12.2 writer: validates the exact schema and size before an atomic private replace.
export async function writeGoalGrant(approvalDirectory: string, grant: GoalGrant | null): Promise<void> {
  if (!path.isAbsolute(approvalDirectory)) {
    throw new Error('goal_unsupported');
  }
  const violations = grantViolations(grant);
  const content = JSON.stringify(grant);
  if (violations.length || Buffer.byteLength(content) > GRANT_MAX_BYTES) {
    throw new Error('goal_state_invalid');
  }
  await mkdir(approvalDirectory, {recursive: true, mode: 0o700});
  const native = await import('openclaw/plugin-sdk/secret-file-runtime');
  await native.writePrivateSecretFileAtomic({
    rootDir: approvalDirectory,
    filePath: path.join(approvalDirectory, GOAL_GRANT_FILE),
    content,
    durable: 'file',
  });
}

// §1: a goal cannot be confirmed while an approval file holds a non-null, unexpired approval (v1 or v2).
// Unreadable or malformed files fail closed.
export async function approvalFileActive(directory: string, now: number): Promise<boolean> {
  const filePath = path.join(directory, 'approved-update.json');
  let raw: string;
  try {
    assertPrivateFile(filePath);
    raw = await readFile(filePath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    return true;
  }
  if (Buffer.byteLength(raw) > 1024 * 1024) {
    return true;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null) {
      return false;
    }
    const expiresAt =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as {expiresAt?: unknown}).expiresAt
        : undefined;
    return !(typeof expiresAt === 'number' && Number.isSafeInteger(expiresAt) && expiresAt <= now);
  } catch {
    return true;
  }
}
