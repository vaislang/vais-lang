/**
 * OptimisticUpdateManager — optimistic update support for @vaisx/query.
 *
 * Provides `createOptimisticMutation` which wraps a mutation with:
 *   1. Immediate cache update (UI pre-reflection) before the server responds.
 *   2. Automatic rollback to the previous snapshot on failure.
 *   3. Cache invalidation on success (re-validation from server).
 *   4. Full lifecycle callbacks: onSuccess, onError, onSettled.
 *
 * Usage:
 *   const manager = new OptimisticUpdateManager(cache);
 *
 *   const mutation = manager.createOptimisticMutation({
 *     queryKey: ["todos"],
 *     mutationFn: (todo) => api.addTodo(todo),
 *     updater: (oldData, newTodo) => [...(oldData ?? []), newTodo],
 *     onSuccess: (data) => console.log("saved", data),
 *     onError:   (err)  => console.error("failed", err),
 *   });
 *
 *   mutation.mutate({ text: "Buy milk" });
 *   // Cache is updated immediately; rolled back if the server rejects.
 */

import { QueryCache } from "./cache.js";
import type { QueryKey } from "./types.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Options accepted by `OptimisticUpdateManager.createOptimisticMutation`.
 *
 * @template TData      - Resolved value type of mutationFn.
 * @template TError     - Rejection type.
 * @template TVariables - Argument type of mutate().
 * @template TCacheData - Type of the data stored in the cache under queryKey.
 */
export interface OptimisticMutationOptions<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TCacheData = unknown,
> {
  /**
   * Async function that performs the actual server-side mutation.
   */
  mutationFn: (variables: TVariables) => Promise<TData>;

  /**
   * The cache key whose data should be optimistically updated.
   */
  queryKey: QueryKey;

  /**
   * Pure function that produces the optimistic new cache value.
   *
   * @param oldData   - Current value in the cache (may be undefined).
   * @param variables - Variables passed to mutate().
   * @returns New optimistic value to write into the cache immediately.
   */
  updater: (oldData: TCacheData | undefined, variables: TVariables) => TCacheData;

  /** Called when mutationFn resolves successfully. */
  onSuccess?: (data: TData, variables: TVariables) => Promise<unknown> | unknown;

  /** Called when mutationFn rejects (after rollback has been applied). */
  onError?: (error: TError, variables: TVariables) => Promise<unknown> | unknown;

  /**
   * Called after either onSuccess or onError, regardless of outcome.
   * At this point the cache has been either invalidated (success) or
   * rolled back (failure).
   */
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
  ) => Promise<unknown> | unknown;
}

/**
 * Status of a running optimistic mutation.
 */
export type OptimisticMutationStatus = "idle" | "loading" | "error" | "success";

/**
 * Handle returned by `createOptimisticMutation`.
 *
 * @template TData      - Resolved value type.
 * @template TError     - Error type.
 * @template TVariables - Variables argument type.
 */
export interface OptimisticMutationResult<
  TData = unknown,
  TError = Error,
  TVariables = void,
> {
  /**
   * Trigger the mutation.
   * The cache is updated immediately; errors are captured in state (no throw).
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

  /** Current lifecycle status. */
  readonly status: OptimisticMutationStatus;

  /** Reset state back to idle. */
  reset: () => void;
}

// ─── OptimisticUpdateManager ───────────────────────────────────────────────────

/**
 * Manages optimistic mutations against a `QueryCache`.
 *
 * One manager can produce many independent optimistic mutations, each bound
 * to its own `queryKey`.
 */
export class OptimisticUpdateManager {
  constructor(private readonly cache: QueryCache) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Create an optimistic mutation.
   *
   * The returned handle's `.mutate()` / `.mutateAsync()` methods follow this flow:
   *   a. Snapshot existing cache data.
   *   b. Apply `updater` to the cache immediately (optimistic UI update).
   *   c. Execute `mutationFn`.
   *   d. On success → call `onSuccess`, then `cache.invalidate(queryKey)` (re-validation).
   *   e. On failure → rollback to the snapshot, then call `onError`.
   *   f. Always call `onSettled`.
   */
  createOptimisticMutation<
    TData = unknown,
    TError = Error,
    TVariables = void,
    TCacheData = unknown,
  >(
    options: OptimisticMutationOptions<TData, TError, TVariables, TCacheData>,
  ): OptimisticMutationResult<TData, TError, TVariables> {
    // Simple mutable state (no framework signals needed — callers read via getters).
    let _status: OptimisticMutationStatus = "idle";
    let _data: TData | undefined           = undefined;
    let _error: TError | null              = null;

    const self = this;

    async function execute(variables: TVariables): Promise<TData> {
      _status = "loading";
      _error  = null;

      // ── a. Snapshot ──────────────────────────────────────────────────────────
      const existingEntry = self.cache.get<TCacheData>(options.queryKey);
      const snapshot       = existingEntry?.data;

      // ── b. Optimistic update ─────────────────────────────────────────────────
      const optimisticData = options.updater(snapshot, variables);
      self.cache.set<TCacheData>(options.queryKey, optimisticData);

      // ── c. Execute mutation ──────────────────────────────────────────────────
      let result: TData;
      try {
        result = await options.mutationFn(variables);
      } catch (err) {
        // ── e. Rollback ────────────────────────────────────────────────────────
        self.rollback(options.queryKey, snapshot);

        _error  = err as TError;
        _status = "error";

        try {
          await Promise.resolve(options.onError?.(err as TError, variables));
        } catch {
          // suppress callback errors
        }
        try {
          await Promise.resolve(options.onSettled?.(undefined, err as TError, variables));
        } catch {
          // suppress callback errors
        }

        throw err;
      }

      // ── d. Success ──────────────────────────────────────────────────────────
      _data   = result;
      _status = "success";

      try {
        await Promise.resolve(options.onSuccess?.(result, variables));
      } catch {
        // suppress callback errors
      }

      // Invalidate so the next read re-fetches fresh server data.
      self.cache.invalidate(options.queryKey);

      // ── f. onSettled ─────────────────────────────────────────────────────────
      try {
        await Promise.resolve(options.onSettled?.(result, null, variables));
      } catch {
        // suppress callback errors
      }

      return result;
    }

    const mutationResult: OptimisticMutationResult<TData, TError, TVariables> = {
      mutate(variables: TVariables): void {
        void execute(variables);
      },

      mutateAsync(variables: TVariables): Promise<TData> {
        return execute(variables);
      },

      get data()      { return _data; },
      get error()     { return _error; },
      get status()    { return _status; },
      get isLoading() { return _status === "loading"; },
      get isError()   { return _status === "error"; },
      get isSuccess() { return _status === "success"; },
      get isIdle()    { return _status === "idle"; },

      reset(): void {
        _data   = undefined;
        _error  = null;
        _status = "idle";
      },
    };

    return mutationResult;
  }

  /**
   * Restore the cache entry for `queryKey` to the given `snapshot`.
   *
   * - If `snapshot` is `undefined` the entry is invalidated (cleared).
   * - If `snapshot` has a value it is written back via `cache.set`.
   *
   * This is used internally by `createOptimisticMutation` on failure, but
   * it is also exposed publicly so callers can perform manual rollbacks.
   */
  rollback<T = unknown>(queryKey: QueryKey, snapshot: T | undefined): void {
    if (snapshot === undefined) {
      // There was no data before the optimistic update — invalidate to clear.
      this.cache.invalidate(queryKey);
    } else {
      this.cache.set<T>(queryKey, snapshot);
    }
  }
}
