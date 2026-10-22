// Browsing cache and read serialization (docs/interface/work-context.md §11.4). In memory only, never persisted.
// One partition per connection. A partition is valid for exactly one scope fingerprint (authorization snapshot,
// binding and the access token in use); any other fingerprint clears it first, so cached provider data never
// outlives the authority that read it (authorization or binding change, disconnect/reconnect). dispose clears all.

// §11.4: 64 entries / 8 MiB for microversion-keyed data; TTL 60 s (R6) and 30 s (R7).
export const MV_CACHE_ENTRIES = 64;
export const MV_CACHE_BYTES = 8 * 1024 * 1024;
export const DOCUMENTS_TTL_MS = 60_000;
export const WORKSPACES_TTL_MS = 30_000;
// Unpinned (TTL) entries are bounded as well, independent of the microversion LRU.
export const TTL_CACHE_ENTRIES = 64;

type Entry = {value: unknown; bytes: number; expiresAt: number | null};

function sizeOf(value: unknown): number {
  if (Buffer.isBuffer(value)) {
    return value.length;
  }
  return Buffer.byteLength(JSON.stringify(value) ?? '');
}

class Partition {
  scope: string;
  private readonly pinned = new Map<string, Entry>();
  private readonly timed = new Map<string, Entry>();
  private bytes = 0;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(scope: string) {
    this.scope = scope;
  }

  clear(): void {
    this.pinned.clear();
    this.timed.clear();
    this.bytes = 0;
  }

  // Serialized: at most one browsing read sequence in flight for this connection. A failure does not block the queue.
  exclusive<T>(action: () => Promise<T>): Promise<T> {
    const run = this.tail.then(action, action);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  getPinned(key: string): unknown {
    const entry = this.pinned.get(key);
    if (!entry) {
      return undefined;
    }
    // LRU: a hit moves the entry to the most recent position.
    this.pinned.delete(key);
    this.pinned.set(key, entry);
    return entry.value;
  }

  setPinned(key: string, value: unknown): void {
    const bytes = sizeOf(value);
    const previous = this.pinned.get(key);
    if (previous) {
      this.bytes -= previous.bytes;
      this.pinned.delete(key);
    }
    if (bytes > MV_CACHE_BYTES) {
      return;
    }
    this.pinned.set(key, {value, bytes, expiresAt: null});
    this.bytes += bytes;
    for (const [oldest, entry] of this.pinned) {
      if (this.pinned.size <= MV_CACHE_ENTRIES && this.bytes <= MV_CACHE_BYTES) {
        break;
      }
      this.pinned.delete(oldest);
      this.bytes -= entry.bytes;
    }
  }

  getTimed(key: string, now: number): unknown {
    const entry = this.timed.get(key);
    if (!entry || entry.expiresAt === null || entry.expiresAt <= now) {
      this.timed.delete(key);
      return undefined;
    }
    return entry.value;
  }

  setTimed(key: string, value: unknown, now: number, ttl: number): void {
    this.timed.delete(key);
    this.timed.set(key, {value, bytes: 0, expiresAt: now + ttl});
    for (const oldest of this.timed.keys()) {
      if (this.timed.size <= TTL_CACHE_ENTRIES) {
        break;
      }
      this.timed.delete(oldest);
    }
  }
}

// The per-request view of one connection's partition, already bound to the request's scope.
export type BrowseAccess = {
  exclusive<T>(action: () => Promise<T>): Promise<T>;
  pinned<T>(key: string, load: () => Promise<T>): Promise<T>;
  timed<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T>;
};

export class BrowseCache {
  private readonly partitions = new Map<string, Partition>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  // dispose and explicit invalidation.
  clear(): void {
    for (const partition of this.partitions.values()) {
      partition.clear();
    }
    this.partitions.clear();
  }

  access(connectionRef: string, scope: string): BrowseAccess {
    let partition = this.partitions.get(connectionRef);
    if (!partition) {
      partition = new Partition(scope);
      this.partitions.set(connectionRef, partition);
    }
    // A scope that differs from the stored one drops everything first (§11.4 invalidation).
    if (partition.scope !== scope) {
      partition.clear();
      partition.scope = scope;
    }
    const p = partition;
    const now = this.now;
    // A request whose scope has since been replaced neither reads nor writes the partition.
    const live = () => p.scope === scope;
    return {
      exclusive: (action) => p.exclusive(action),
      async pinned<T>(key: string, load: () => Promise<T>): Promise<T> {
        const hit = live() ? p.getPinned(key) : undefined;
        if (hit !== undefined) {
          // Stored by the same typed loader under the same key (keys encode the read kind).
          return hit as T;
        }
        const value = await load();
        if (live()) {
          p.setPinned(key, value);
        }
        return value;
      },
      async timed<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
        const hit = live() ? p.getTimed(key, now()) : undefined;
        if (hit !== undefined) {
          // Stored by the same typed loader under the same key (keys encode the read kind).
          return hit as T;
        }
        const value = await load();
        if (live()) {
          p.setTimed(key, value, now(), ttl);
        }
        return value;
      },
    };
  }
}

// Without a cache (direct service use): no reuse, still serialized per call site.
export const uncachedAccess = (): BrowseAccess => ({
  exclusive: (action) => action(),
  pinned: (_key, load) => load(),
  timed: (_key, _ttl, load) => load(),
});
