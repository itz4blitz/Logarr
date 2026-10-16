/**
 * Process-wide state of the qBittorrent provider.
 *
 * Providers are singletons that connect/disconnect on every poll, so sessions, login cooldowns,
 * log cursors and connection states must outlive client instances. All of it is kept in bounded
 * caches (size cap with oldest-first eviction plus an idle TTL) so it cannot grow without limit
 * when servers are added, changed or deleted.
 */

/** Maximum number of entries per cache (far above any realistic number of qBittorrent servers) */
const MAX_ENTRIES = 100;
const HOUR_MS = 60 * 60_000;

interface Entry<V> {
  value: V;
  expires: number;
}

/**
 * Small Map-like cache with a size cap (least recently used entry is evicted first) and a TTL
 * that is refreshed on access. Uses Date.now() so it works with fake timers.
 */
export class BoundedCache<V> {
  private readonly entries = new Map<string, Entry<V>>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency and TTL
    this.entries.delete(key);
    this.entries.set(key, { value: entry.value, expires: Date.now() + this.ttlMs });
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    this.prune();
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Number of stored entries (expired ones are removed first) */
  get size(): number {
    this.prune();
    return this.entries.size;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expires <= now) {
        this.entries.delete(key);
      }
    }
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.entries.delete(oldest.value);
    }
  }
}

export interface Cooldown {
  until: number;
  message: string;
  failures: number;
}

export interface LogCursor {
  lastId: number;
  lastTs: number;
  fullSyncAt: number;
}

export interface ConnectionState {
  status: string;
  reportedDay: string | null;
}

/** Session cookies per (url, username, secret) hash */
export const sessionCache = new BoundedCache<Map<string, string>>(MAX_ENTRIES, 12 * HOUR_MS);
/** Login failure cooldowns per (url, username, secret) hash; they also carry the failure count */
export const cooldowns = new BoundedCache<Cooldown>(MAX_ENTRIES, 24 * HOUR_MS);
/** Log cursors per qBittorrent base URL */
export const logCursors = new BoundedCache<LogCursor>(MAX_ENTRIES, 7 * 24 * HOUR_MS);
/** Last reported connection status per qBittorrent base URL */
export const connectionStates = new BoundedCache<ConnectionState>(MAX_ENTRIES, 7 * 24 * HOUR_MS);

/** Clear all cached state (used by tests) */
export function resetQBittorrentState(): void {
  sessionCache.clear();
  cooldowns.clear();
  logCursors.clear();
  connectionStates.clear();
}
