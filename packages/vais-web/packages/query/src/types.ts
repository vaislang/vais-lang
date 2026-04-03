/**
 * Core type definitions for @vaisx/query.
 * API inspired by TanStack Query, adapted for VaisX reactivity.
 */

// ─── Query key ───────────────────────────────────────────────────────────────

/**
 * A stable, serialisable key that uniquely identifies a query in the cache.
 * Must be a readonly tuple of unknown values (strings, numbers, objects, …).
 */
export type QueryKey = readonly unknown[];

// ─── Query status ─────────────────────────────────────────────────────────────

/** The lifecycle status of a query or mutation. */
export type QueryStatus = "idle" | "loading" | "error" | "success";

/** The lifecycle status of a mutation. */
export type MutationStatus = "idle" | "loading" | "error" | "success";

// ─── QueryOptions ─────────────────────────────────────────────────────────────

/**
 * Options accepted by createQuery().
 *
 * @template TData   - The resolved value type of queryFn.
 * @template TError  - The rejected error type (defaults to Error).
 */
export interface QueryOptions<TData = unknown, TError = Error> {
  /**
   * Unique, serialisable key for this query.
   * Changing the key causes the query to re-fetch.
   */
  queryKey: QueryKey;

  /**
   * Async function that fetches the data.
   * Must return a Promise that resolves to TData.
   */
  queryFn: (context: { queryKey: QueryKey; signal: AbortSignal }) => Promise<TData>;

  /**
   * Duration in milliseconds after which cached data is considered stale
   * and eligible for background re-fetching.
   * @default 0
   */
  staleTime?: number;

  /**
   * Duration in milliseconds after which unused / inactive query data is
   * removed from the cache (Garbage Collection time).
   * @default 5 * 60 * 1000 (5 minutes)
   */
  gcTime?: number;

  /**
   * When false the query will not run automatically.
   * Useful for dependent queries or manual triggering.
   * @default true
   */
  enabled?: boolean;

  /**
   * Whether to re-fetch the query when the browser window regains focus.
   * @default true
   */
  refetchOnWindowFocus?: boolean;

  /**
   * Interval in milliseconds for automatic background re-fetching.
   * Set to false or 0 to disable.
   * @default false
   */
  refetchInterval?: number | false;

  /**
   * Initial data to use while the first fetch is in-flight.
   * Bypasses the loading state for the very first render.
   */
  initialData?: TData;

  /**
   * Number of times to retry a failed query before surfacing the error.
   * @default 3
   */
  retry?: number | false;

  /**
   * Delay in milliseconds between retry attempts.
   * @default 1000
   */
  retryDelay?: number;
}

// ─── QueryResult ──────────────────────────────────────────────────────────────

/**
 * Reactive state object returned by createQuery().
 *
 * @template TData  - The resolved data type.
 * @template TError - The error type.
 */
export interface QueryResult<TData = unknown, TError = Error> {
  /** The last successfully fetched data, or undefined. */
  readonly data: TData | undefined;

  /** The error thrown during the last failed fetch, or null. */
  readonly error: TError | null;

  /**
   * True while data has never been fetched AND a fetch is in progress.
   * Equivalent to status === "loading".
   */
  readonly isLoading: boolean;

  /**
   * True whenever a fetch is in progress (initial or background re-fetch).
   * Unlike isLoading, this can be true even when data already exists.
   */
  readonly isFetching: boolean;

  /** True when the last fetch threw an error. Equivalent to status === "error". */
  readonly isError: boolean;

  /** True when data was successfully fetched at least once. Equivalent to status === "success". */
  readonly isSuccess: boolean;

  /** True when the query has not been attempted yet (enabled: false). */
  readonly isIdle: boolean;

  /** Current lifecycle status of the query. */
  readonly status: QueryStatus;

  /**
   * Manually trigger a re-fetch of this query.
   * Returns a promise that resolves with the fresh data.
   */
  refetch: () => Promise<TData | undefined>;
}

// ─── MutationOptions ─────────────────────────────────────────────────────────

/**
 * Options accepted by createMutation().
 *
 * @template TData      - The resolved value type of mutationFn.
 * @template TError     - The rejected error type.
 * @template TVariables - The argument type passed to mutate().
 * @template TContext   - Arbitrary context returned by onMutate (for rollback).
 */
export interface MutationOptions<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
> {
  /**
   * Async function that performs the mutation.
   * Receives the variables passed to mutate() / mutateAsync().
   */
  mutationFn: (variables: TVariables) => Promise<TData>;

  /**
   * Called before mutationFn.
   * Can return a context object used for optimistic updates / rollback.
   */
  onMutate?: (variables: TVariables) => Promise<TContext | undefined> | TContext | undefined;

  /**
   * Called when mutationFn resolves successfully.
   */
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => Promise<unknown> | unknown;

  /**
   * Called when mutationFn rejects.
   */
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => Promise<unknown> | unknown;

  /**
   * Called after either onSuccess or onError, regardless of outcome.
   */
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => Promise<unknown> | unknown;

  /**
   * Number of times to retry a failed mutation.
   * @default 0
   */
  retry?: number | false;

  /**
   * Delay in milliseconds between retry attempts.
   * @default 0
   */
  retryDelay?: number;
}

// ─── MutationResult ───────────────────────────────────────────────────────────

/**
 * Reactive state object returned by createMutation().
 *
 * @template TData      - The resolved value type.
 * @template TError     - The error type.
 * @template TVariables - The variables argument type.
 * @template TContext   - Arbitrary rollback context type.
 */
export interface MutationResult<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown,
> {
  /**
   * Trigger the mutation.
   * Does NOT throw — errors are captured in the result state.
   */
  mutate: (variables: TVariables) => void;

  /**
   * Trigger the mutation and return a Promise.
   * Throws on failure so callers can use try/catch.
   */
  mutateAsync: (variables: TVariables) => Promise<TData>;

  /** The data returned by the last successful mutation, or undefined. */
  readonly data: TData | undefined;

  /** The error from the last failed mutation, or null. */
  readonly error: TError | null;

  /** True while a mutation is in-flight. */
  readonly isLoading: boolean;

  /** True when the last mutation threw an error. */
  readonly isError: boolean;

  /** True when the last mutation succeeded. */
  readonly isSuccess: boolean;

  /** True before the mutation has been called. */
  readonly isIdle: boolean;

  /** Current lifecycle status of the mutation. */
  readonly status: MutationStatus;

  /** Reset the mutation state back to idle. */
  reset: () => void;
}

// ─── QueryCache entry ─────────────────────────────────────────────────────────

/**
 * A single entry in the QueryClient's in-memory cache.
 */
export interface QueryCacheEntry<TData = unknown> {
  /** The serialised query key (used as map key). */
  queryKey: QueryKey;

  /** The cached data, or undefined if not yet fetched. */
  data: TData | undefined;

  /** Timestamp (Date.now()) when data was last successfully updated. */
  updatedAt: number;

  /** The error from the last failed fetch, or null. */
  error: unknown;

  /** Observers (subscriber callbacks) watching this cache entry. */
  observers: Set<() => void>;

  /** GC timer handle — cleared when an observer attaches. */
  gcTimer: ReturnType<typeof setTimeout> | null;
}

// ─── QueryClient interface ────────────────────────────────────────────────────

/**
 * Central cache manager interface.
 * One QueryClient instance is typically shared across the entire application.
 */
export interface QueryClientInterface {
  /**
   * Read cached data for the given key.
   * Returns undefined if no data is cached yet.
   */
  getQueryData<TData = unknown>(queryKey: QueryKey): TData | undefined;

  /**
   * Write data directly into the cache for the given key,
   * bypassing any fetching logic.
   */
  setQueryData<TData = unknown>(queryKey: QueryKey, data: TData): void;

  /**
   * Mark one or more queries as stale and trigger re-fetches.
   * Accepts a full key or a partial prefix to invalidate all matching queries.
   */
  invalidateQueries(queryKey?: QueryKey): Promise<void>;

  /**
   * Pre-populate the cache by running queryFn ahead of time.
   * No-ops if fresh data already exists in the cache.
   */
  prefetchQuery<TData = unknown>(options: QueryOptions<TData>): Promise<void>;

  /**
   * Direct read access to the underlying cache Map.
   */
  getQueryCache(): Map<string, QueryCacheEntry>;
}
