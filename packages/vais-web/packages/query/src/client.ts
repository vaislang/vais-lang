/**
 * QueryClient — central cache manager for @vaisx/query.
 *
 * Holds an in-memory Map of cached query results and exposes methods to read,
 * write, invalidate and prefetch queries.
 */

import type {
  QueryKey,
  QueryOptions,
  QueryCacheEntry,
  QueryClientInterface,
} from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Serialise a QueryKey array to a stable string suitable for use as a Map key.
 * Uses JSON.stringify which handles nested objects deterministically for most
 * practical cases (arrays, primitives, plain objects).
 */
export function serializeKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

/**
 * Check whether a serialised cache key starts with the serialised prefix.
 * Used by invalidateQueries to match partial keys.
 *
 * e.g. prefix ["users"] matches ["users", 1] and ["users", 2].
 */
function keyMatchesPrefix(serializedKey: string, prefix: QueryKey): boolean {
  const prefixStr = JSON.stringify(prefix);
  // A key matches the prefix if the key string starts with the prefix string
  // without the trailing "]", meaning prefix is a subset of the key.
  if (serializedKey === prefixStr) return true;
  // Strip trailing ] from both to compare prefix portion
  const keyBody = serializedKey.slice(0, -1);  // remove trailing ]
  const prefixBody = prefixStr.slice(0, -1);    // remove trailing ]
  return keyBody.startsWith(prefixBody);
}

// ─── QueryClientOptions ───────────────────────────────────────────────────────

export interface QueryClientOptions {
  /**
   * Default stale time applied to all queries (ms).
   * @default 0
   */
  defaultStaleTime?: number;

  /**
   * Default garbage-collection time applied to all queries (ms).
   * @default 5 * 60 * 1000
   */
  defaultGcTime?: number;

  /**
   * Default number of retries on failure.
   * @default 3
   */
  defaultRetry?: number;
}

// ─── QueryClient ──────────────────────────────────────────────────────────────

/**
 * Central cache manager.
 *
 * Usage:
 *   const client = new QueryClient();
 *   const data   = client.getQueryData(["users"]);
 *   client.setQueryData(["users"], [...]);
 *   await client.invalidateQueries(["users"]);
 */
export class QueryClient implements QueryClientInterface {
  /** In-memory query cache. Keyed by serialised QueryKey. */
  private readonly cache = new Map<string, QueryCacheEntry>();

  /** Active in-flight fetches — prevents duplicate concurrent requests. */
  private readonly inflight = new Map<string, Promise<unknown>>();

  /** Client-level defaults. */
  readonly defaultStaleTime: number;
  readonly defaultGcTime: number;
  readonly defaultRetry: number;

  constructor(options: QueryClientOptions = {}) {
    this.defaultStaleTime = options.defaultStaleTime ?? 0;
    this.defaultGcTime    = options.defaultGcTime    ?? 5 * 60 * 1000;
    this.defaultRetry     = options.defaultRetry     ?? 3;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Read cached data for the given key. Returns undefined on cache miss. */
  getQueryData<TData = unknown>(queryKey: QueryKey): TData | undefined {
    const entry = this.cache.get(serializeKey(queryKey));
    return entry?.data as TData | undefined;
  }

  /** Write data directly into the cache and notify observers. */
  setQueryData<TData = unknown>(queryKey: QueryKey, data: TData): void {
    const key = serializeKey(queryKey);
    const existing = this.cache.get(key);
    if (existing) {
      existing.data      = data;
      existing.updatedAt = Date.now();
      existing.error     = null;
      this.notifyObservers(existing);
    } else {
      this.cache.set(key, {
        queryKey,
        data,
        updatedAt: Date.now(),
        error: null,
        observers: new Set(),
        gcTimer: null,
      });
    }
  }

  /**
   * Mark matching queries as stale and notify their observers to re-fetch.
   * Passing no argument invalidates ALL cached queries.
   */
  async invalidateQueries(queryKey?: QueryKey): Promise<void> {
    for (const [serializedKey, entry] of this.cache) {
      if (!queryKey || keyMatchesPrefix(serializedKey, queryKey)) {
        // Signal every observer that data is stale — they will re-fetch.
        this.notifyObservers(entry);
      }
    }
  }

  /**
   * Pre-populate the cache by running queryFn ahead of time.
   * Skips execution when fresh (non-stale) data already exists.
   */
  async prefetchQuery<TData = unknown>(options: QueryOptions<TData>): Promise<void> {
    const key       = serializeKey(options.queryKey);
    const staleTime = options.staleTime ?? this.defaultStaleTime;
    const existing  = this.cache.get(key);

    if (existing?.data !== undefined) {
      const age = Date.now() - existing.updatedAt;
      if (age < staleTime) return; // Data is still fresh
    }

    await this.fetchQuery(options);
  }

  /** Direct read access to the underlying cache Map. */
  getQueryCache(): Map<string, QueryCacheEntry> {
    return this.cache;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Execute queryFn and populate the cache.
   * De-duplicates concurrent fetches for the same key.
   */
  fetchQuery<TData = unknown>(options: QueryOptions<TData>): Promise<TData> {
    const key = serializeKey(options.queryKey);

    // Return existing in-flight promise to avoid duplicate network requests
    if (this.inflight.has(key)) {
      return this.inflight.get(key) as Promise<TData>;
    }

    const controller = new AbortController();

    const promise = (async (): Promise<TData> => {
      const retryCount = options.retry === false ? 0 : (options.retry ?? this.defaultRetry);
      const retryDelay = options.retryDelay ?? 1000;

      let lastError: unknown;

      for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
          const data = await options.queryFn({
            queryKey: options.queryKey,
            signal: controller.signal,
          });

          this.setQueryData(options.queryKey, data);
          return data;
        } catch (err) {
          lastError = err;
          if (attempt < retryCount) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      // Update cache with error state
      const entry = this.getOrCreateEntry(key, options.queryKey);
      entry.error = lastError;
      this.notifyObservers(entry);

      throw lastError;
    })().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Register an observer callback for a given query key.
   * Returns an unsubscribe function.
   */
  subscribe(queryKey: QueryKey, observer: () => void): () => void {
    const key   = serializeKey(queryKey);
    const entry = this.getOrCreateEntry(key, queryKey);

    // Cancel any pending GC timer when an observer attaches
    if (entry.gcTimer !== null) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = null;
    }

    entry.observers.add(observer);

    return () => {
      entry.observers.delete(observer);

      // Schedule GC when no observers remain
      if (entry.observers.size === 0) {
        const gcTime = this.defaultGcTime;
        if (gcTime > 0) {
          entry.gcTimer = setTimeout(() => {
            this.cache.delete(key);
          }, gcTime);
        } else {
          this.cache.delete(key);
        }
      }
    };
  }

  /** Return (or lazily create) a cache entry for the given key. */
  private getOrCreateEntry(serializedKey: string, queryKey: QueryKey): QueryCacheEntry {
    if (!this.cache.has(serializedKey)) {
      this.cache.set(serializedKey, {
        queryKey,
        data: undefined,
        updatedAt: 0,
        error: null,
        observers: new Set(),
        gcTimer: null,
      });
    }
    return this.cache.get(serializedKey)!;
  }

  /** Notify all observers subscribed to a cache entry. */
  private notifyObservers(entry: QueryCacheEntry): void {
    for (const observer of entry.observers) {
      observer();
    }
  }

  /**
   * Check whether the data for a given key is stale relative to staleTime.
   */
  isStale(queryKey: QueryKey, staleTime: number): boolean {
    const key     = serializeKey(queryKey);
    const entry   = this.cache.get(key);
    if (!entry || entry.data === undefined) return true;
    return Date.now() - entry.updatedAt >= staleTime;
  }

  /**
   * Tear down: clear all GC timers and wipe the cache.
   * Useful in tests and SSR environments.
   */
  clear(): void {
    for (const entry of this.cache.values()) {
      if (entry.gcTimer !== null) {
        clearTimeout(entry.gcTimer);
      }
    }
    this.cache.clear();
    this.inflight.clear();
  }
}

// ─── Default client singleton ─────────────────────────────────────────────────

/** Module-level default QueryClient instance. */
let _defaultClient: QueryClient | null = null;

/**
 * Get or create the module-level default QueryClient.
 * Applications that need multiple independent caches should construct their
 * own QueryClient instances instead of relying on this helper.
 */
export function getDefaultClient(): QueryClient {
  if (!_defaultClient) {
    _defaultClient = new QueryClient();
  }
  return _defaultClient;
}

/**
 * Replace the module-level default QueryClient.
 * Useful for testing and SSR hydration scenarios.
 */
export function setDefaultClient(client: QueryClient | null): void {
  _defaultClient = client;
}
