/**
 * createQuery — reactive async data-fetching primitive for @vaisx/query.
 *
 * Wraps a QueryClient fetch cycle in VaisX signals so that UI layers
 * can subscribe to loading / error / data state changes reactively.
 *
 * Usage:
 *   const posts = createQuery({
 *     queryKey: ["posts"],
 *     queryFn: () => fetch("/api/posts").then(r => r.json()),
 *   });
 *   posts.data;      // Post[] | undefined
 *   posts.isLoading; // boolean
 *   posts.refetch(); // Promise<Post[] | undefined>
 */

import { createSignal } from "@vaisx/runtime";
import type { Signal } from "@vaisx/runtime";
import type { QueryOptions, QueryResult, QueryStatus } from "./types.js";
import { QueryClient, getDefaultClient, serializeKey } from "./client.js";

// ─── Internal state ───────────────────────────────────────────────────────────

interface QueryState<TData, TError> {
  data:       Signal<TData | undefined>;
  error:      Signal<TError | null>;
  status:     Signal<QueryStatus>;
  isFetching: Signal<boolean>;
}

// ─── createQuery ──────────────────────────────────────────────────────────────

/**
 * Create a reactive query that automatically fetches data using the provided
 * queryFn and exposes reactive state (data, error, isLoading, …).
 *
 * @param options  - Query configuration (key, fetch fn, stale time, …).
 * @param client   - Optional QueryClient (uses the module default if omitted).
 * @returns A QueryResult object with reactive signal-backed getters.
 */
export function createQuery<TData = unknown, TError = Error>(
  options: QueryOptions<TData, TError>,
  client: QueryClient = getDefaultClient(),
): QueryResult<TData, TError> {
  // ── Initialise reactive signals ─────────────────────────────────────────────
  const initialData = options.initialData;

  const state: QueryState<TData, TError> = {
    data:       createSignal<TData | undefined>(initialData),
    error:      createSignal<TError | null>(null),
    status:     createSignal<QueryStatus>(initialData !== undefined ? "success" : "idle"),
    isFetching: createSignal<boolean>(false),
  };

  // ── Sync from cache ─────────────────────────────────────────────────────────
  const cacheKey = serializeKey(options.queryKey);

  function syncFromCache(): void {
    const entry = client.getQueryCache().get(cacheKey);
    if (!entry) return;

    if (entry.data !== undefined) {
      state.data.set(entry.data as TData);
      state.error.set(null);
      if (state.status() !== "success") {
        state.status.set("success");
      }
    } else if (entry.error !== null) {
      state.error.set(entry.error as TError);
      state.status.set("error");
    }
  }

  // ── Subscribe to cache invalidations ────────────────────────────────────────
  const unsubscribe = client.subscribe(options.queryKey, () => {
    syncFromCache();
    // Re-fetch if data is now stale (triggered by invalidateQueries)
    const staleTime = options.staleTime ?? client.defaultStaleTime;
    if (client.isStale(options.queryKey, staleTime) && options.enabled !== false) {
      void executeFetch();
    }
  });

  // ── Core fetch logic ────────────────────────────────────────────────────────
  async function executeFetch(): Promise<TData | undefined> {
    if (state.isFetching()) return state.data();

    state.isFetching.set(true);

    if (state.status() === "idle" || state.status() === "error") {
      state.status.set("loading");
    }

    try {
      const data = await client.fetchQuery<TData>(options);
      state.data.set(data);
      state.error.set(null);
      state.status.set("success");
      return data;
    } catch (err) {
      state.error.set(err as TError);
      state.status.set("error");
      return undefined;
    } finally {
      state.isFetching.set(false);
    }
  }

  // ── Auto-fetch on creation ──────────────────────────────────────────────────
  if (options.enabled !== false) {
    // Check if fresh data already exists in the cache
    const staleTime = options.staleTime ?? client.defaultStaleTime;
    if (!client.isStale(options.queryKey, staleTime)) {
      // Populate state from the already-fresh cache
      syncFromCache();
    } else {
      // Kick off initial fetch
      void executeFetch();
    }
  }

  // ── Polling ─────────────────────────────────────────────────────────────────
  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  if (options.refetchInterval && options.refetchInterval > 0 && options.enabled !== false) {
    pollingTimer = setInterval(() => {
      void executeFetch();
    }, options.refetchInterval);
  }

  // ── Window focus re-fetch ───────────────────────────────────────────────────
  const refetchOnWindowFocus = options.refetchOnWindowFocus ?? true;

  function handleWindowFocus(): void {
    if (options.enabled === false) return;
    const staleTime = options.staleTime ?? client.defaultStaleTime;
    if (client.isStale(options.queryKey, staleTime)) {
      void executeFetch();
    }
  }

  if (refetchOnWindowFocus && typeof window !== "undefined") {
    window.addEventListener("focus", handleWindowFocus);
  }

  // ── Build QueryResult ───────────────────────────────────────────────────────
  const result: QueryResult<TData, TError> = {
    get data()       { return state.data(); },
    get error()      { return state.error(); },
    get status()     { return state.status(); },
    get isFetching() { return state.isFetching(); },
    get isLoading()  { return state.status() === "loading"; },
    get isError()    { return state.status() === "error"; },
    get isSuccess()  { return state.status() === "success"; },
    get isIdle()     { return state.status() === "idle"; },

    refetch(): Promise<TData | undefined> {
      // Force stale so fetchQuery will not be a no-op
      return executeFetch();
    },

    /** Release resources (subscriptions, timers, event listeners). */
    // @ts-expect-error — dispose is an extension beyond the public interface
    dispose(): void {
      unsubscribe();
      if (pollingTimer !== null) clearInterval(pollingTimer);
      if (refetchOnWindowFocus && typeof window !== "undefined") {
        window.removeEventListener("focus", handleWindowFocus);
      }
    },
  };

  return result;
}
