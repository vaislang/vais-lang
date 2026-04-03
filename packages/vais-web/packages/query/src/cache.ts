/**
 * QueryCache — standalone in-memory cache for @vaisx/query.
 *
 * Manages query data with staleTime/gcTime semantics, cache key hashing,
 * change subscriptions, and automatic garbage collection.
 */

import type { QueryKey } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single entry stored in the QueryCache.
 *
 * @template T - The type of the cached data.
 */
export interface QueryCacheEntry<T = unknown> {
  /** The cached data value. */
  data: T;
  /** Timestamp (Date.now()) when data was last stored. */
  dataUpdatedAt: number;
  /**
   * Duration in ms after which data is considered stale.
   * 0 means immediately stale.
   */
  staleTime: number;
  /**
   * Duration in ms after which the entry is garbage-collected
   * if no subscribers are active.
   */
  gcTime: number;
}

/** Options accepted by QueryCache.set(). */
export interface QueryCacheSetOptions {
  /**
   * Duration in ms after which data is considered stale.
   * @default 0
   */
  staleTime?: number;
  /**
   * Duration in ms after which the entry is garbage-collected.
   * @default 5 * 60 * 1000
   */
  gcTime?: number;
}

/** Options accepted by the QueryCache constructor. */
export interface QueryCacheOptions {
  /**
   * Default staleTime for all entries (ms).
   * @default 0
   */
  defaultStaleTime?: number;
  /**
   * Default gcTime for all entries (ms).
   * @default 5 * 60 * 1000
   */
  defaultGcTime?: number;
}

/** Internal record tracking an entry plus its active GC timer and subscribers. */
interface InternalEntry {
  entry: QueryCacheEntry<unknown>;
  /** Whether this entry has been manually invalidated (marked stale immediately). */
  invalidated: boolean;
  /** Active GC timer handle. */
  gcTimer: ReturnType<typeof setTimeout> | null;
  /** Subscriber callbacks for this cache key. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribers: Set<(entry: QueryCacheEntry<any> | undefined) => void>;
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

/**
 * Normalise a QueryKey array to a stable string cache key.
 * Uses JSON.stringify so arrays with identical contents but different
 * object references produce the same string.
 */
export function hashQueryKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

// ─── QueryCache ───────────────────────────────────────────────────────────────

/**
 * Standalone in-memory query cache.
 *
 * Responsibilities:
 * - Store arbitrary data under a stable string key derived from a QueryKey.
 * - Track freshness via staleTime.
 * - Auto-delete entries via gcTime when they have no active subscribers.
 * - Notify subscribers on every mutation (set / invalidate / delete).
 *
 * Usage:
 * ```ts
 * const cache = new QueryCache();
 * cache.set(["users"], data, { staleTime: 30_000, gcTime: 5 * 60_000 });
 * const entry = cache.get(["users"]); // undefined when expired / missing
 * const unsub = cache.subscribe(["users"], (e) => console.log(e));
 * ```
 */
export class QueryCache {
  /** Internal store keyed by the hashed QueryKey. */
  private readonly store = new Map<string, InternalEntry>();

  readonly defaultStaleTime: number;
  readonly defaultGcTime: number;

  constructor(options: QueryCacheOptions = {}) {
    this.defaultStaleTime = options.defaultStaleTime ?? 0;
    this.defaultGcTime    = options.defaultGcTime    ?? 5 * 60 * 1000;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Store data in the cache under the given key.
   *
   * If an entry already exists its data and timestamp are updated.
   * Any active GC timer is cancelled because fresh data has arrived.
   * All subscribers are notified after the write.
   */
  set<T>(key: QueryKey, data: T, options: QueryCacheSetOptions = {}): void {
    const hashedKey  = hashQueryKey(key);
    const staleTime  = options.staleTime ?? this.defaultStaleTime;
    const gcTime     = options.gcTime    ?? this.defaultGcTime;

    const existing = this.store.get(hashedKey);

    if (existing) {
      // Cancel any pending GC — we just received fresh data.
      this.clearGcTimer(existing);

      existing.entry.data          = data;
      existing.entry.dataUpdatedAt = Date.now();
      existing.entry.staleTime     = staleTime;
      existing.entry.gcTime        = gcTime;
      existing.invalidated         = false;

      this.notify(existing);
    } else {
      const record: InternalEntry = {
        entry: {
          data,
          dataUpdatedAt: Date.now(),
          staleTime,
          gcTime,
        },
        invalidated: false,
        gcTimer: null,
        subscribers: new Set(),
      };
      this.store.set(hashedKey, record);
      this.notify(record);
    }
  }

  /**
   * Retrieve a cache entry.
   *
   * Returns `undefined` when:
   * - the key has never been set, OR
   * - the entry has been manually invalidated, OR
   * - gcTime has elapsed (entry was deleted by the GC timer).
   *
   * Note: this method does NOT filter by staleTime — callers should check
   * `isStale()` separately to decide whether a background re-fetch is needed.
   * The entry is still returned while it is stale but within gcTime.
   */
  get<T = unknown>(key: QueryKey): QueryCacheEntry<T> | undefined {
    const hashedKey = hashQueryKey(key);
    const record    = this.store.get(hashedKey);

    if (!record) return undefined;
    if (record.invalidated) return undefined;

    return record.entry as QueryCacheEntry<T>;
  }

  /**
   * Check whether a non-invalidated entry exists for the given key.
   * Does not consider staleTime — stale-but-present entries still return true.
   */
  has(key: QueryKey): boolean {
    const hashedKey = hashQueryKey(key);
    const record    = this.store.get(hashedKey);
    return record !== undefined && !record.invalidated;
  }

  /**
   * Check whether the entry for the given key is stale.
   *
   * Returns `true` when:
   * - no entry exists, OR
   * - the entry is invalidated, OR
   * - `Date.now() - dataUpdatedAt >= staleTime`.
   */
  isStale(key: QueryKey): boolean {
    const hashedKey = hashQueryKey(key);
    const record    = this.store.get(hashedKey);

    if (!record || record.invalidated) return true;

    const { dataUpdatedAt, staleTime } = record.entry;
    return Date.now() - dataUpdatedAt >= staleTime;
  }

  /**
   * Mark a specific cache entry as invalidated.
   *
   * `get()` will return `undefined` for an invalidated entry.
   * The entry is NOT immediately removed — it waits for gcTime to elapse
   * (or until a new `set()` call repopulates it).
   * All subscribers are notified.
   */
  invalidate(key: QueryKey): void {
    const hashedKey = hashQueryKey(key);
    const record    = this.store.get(hashedKey);

    if (!record) return;

    record.invalidated = true;
    this.notify(record);
    this.scheduleGc(hashedKey, record);
  }

  /**
   * Invalidate all entries that match an optional predicate.
   *
   * When no predicate is provided every entry is invalidated.
   *
   * @param predicate - Receives the hashed key and entry; return true to invalidate.
   */
  invalidateAll(
    predicate?: (hashedKey: string, entry: QueryCacheEntry) => boolean,
  ): void {
    for (const [hashedKey, record] of this.store) {
      if (!predicate || predicate(hashedKey, record.entry)) {
        record.invalidated = true;
        this.notify(record);
        this.scheduleGc(hashedKey, record);
      }
    }
  }

  /**
   * Immediately delete all cache entries and cancel all GC timers.
   * Subscribers are notified with `undefined` before removal.
   */
  clear(): void {
    for (const [, record] of this.store) {
      this.clearGcTimer(record);
      // Notify subscribers that data is gone.
      for (const subscriber of record.subscribers) {
        subscriber(undefined);
      }
    }
    this.store.clear();
  }

  /**
   * Subscribe to changes for a specific cache key.
   *
   * The callback is invoked with the current entry whenever it is written,
   * invalidated, or deleted. When there is no entry (key missing or deleted)
   * the argument is `undefined`.
   *
   * Subscribing cancels any pending GC timer for that key so the data
   * is not deleted while a subscriber is active.
   *
   * @returns An unsubscribe function. Call it to stop listening.
   *          When the last subscriber detaches, the GC timer is rescheduled.
   */
  subscribe<T = unknown>(
    key: QueryKey,
    callback: (entry: QueryCacheEntry<T> | undefined) => void,
  ): () => void {
    const hashedKey = hashQueryKey(key);
    let record      = this.store.get(hashedKey);

    if (!record) {
      // Create a placeholder so we can attach the subscriber.
      record = {
        entry: { data: undefined as unknown, dataUpdatedAt: 0, staleTime: this.defaultStaleTime, gcTime: this.defaultGcTime },
        invalidated: true,
        gcTimer: null,
        subscribers: new Set(),
      };
      this.store.set(hashedKey, record);
    }

    // Cancel any pending GC while a subscriber is watching.
    this.clearGcTimer(record);

    // Cast so the subscriber set (typed as any) accepts our typed callback.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = callback as (entry: QueryCacheEntry<any> | undefined) => void;
    record.subscribers.add(cb);

    const captured = record;

    return () => {
      captured.subscribers.delete(cb);

      // When the last subscriber leaves, reschedule GC.
      if (captured.subscribers.size === 0) {
        this.scheduleGc(hashedKey, captured);
      }
    };
  }

  /**
   * Return a snapshot of all non-invalidated cache entries.
   *
   * The returned Map is keyed by the hashed query key string.
   */
  getAll(): Map<string, QueryCacheEntry> {
    const result = new Map<string, QueryCacheEntry>();
    for (const [hashedKey, record] of this.store) {
      if (!record.invalidated) {
        result.set(hashedKey, record.entry);
      }
    }
    return result;
  }

  /**
   * Return the total number of entries in the store,
   * including invalidated ones that have not yet been GC'd.
   */
  size(): number {
    return this.store.size;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Cancel the GC timer associated with a record, if any. */
  private clearGcTimer(record: InternalEntry): void {
    if (record.gcTimer !== null) {
      clearTimeout(record.gcTimer);
      record.gcTimer = null;
    }
  }

  /**
   * Schedule a GC timer for the given record.
   *
   * If the record already has an active GC timer it is left as-is.
   * A new timer is started only when there are no active subscribers.
   */
  private scheduleGc(hashedKey: string, record: InternalEntry): void {
    // Do not schedule GC while subscribers are active.
    if (record.subscribers.size > 0) return;
    // Do not stack timers.
    if (record.gcTimer !== null) return;

    const gcTime = record.entry.gcTime;

    if (gcTime <= 0) {
      // Delete immediately.
      this.store.delete(hashedKey);
      return;
    }

    record.gcTimer = setTimeout(() => {
      this.store.delete(hashedKey);
    }, gcTime);
  }

  /** Notify all subscribers of a record with the current entry value. */
  private notify(record: InternalEntry): void {
    const value = record.invalidated ? undefined : record.entry;
    for (const subscriber of record.subscribers) {
      subscriber(value);
    }
  }
}
