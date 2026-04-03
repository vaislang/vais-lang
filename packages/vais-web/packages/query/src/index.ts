/**
 * @vaisx/query — Public API
 *
 * TanStack Query inspired async state management built on @vaisx/runtime signals.
 */

// ── Core factories ─────────────────────────────────────────────────────────────
export { createQuery } from "./query.js";
export { createMutation } from "./mutation.js";
export { createInfiniteQuery } from "./infinite.js";
export type {
  InfiniteQueryOptions,
  InfiniteQueryResult,
  InfiniteData,
} from "./infinite.js";

// ── QueryClient ────────────────────────────────────────────────────────────────
export {
  QueryClient,
  getDefaultClient,
  setDefaultClient,
  serializeKey,
} from "./client.js";
export type { QueryClientOptions } from "./client.js";

// ── QueryCache ─────────────────────────────────────────────────────────────────
export { QueryCache, hashQueryKey } from "./cache.js";
export type {
  QueryCacheEntry,
  QueryCacheSetOptions,
  QueryCacheOptions,
} from "./cache.js";

// ── RefetchManager ─────────────────────────────────────────────────────────────
export { RefetchManager } from "./refetch.js";
export type { Cleanup, AutoRefetchOptions, AutoRefetchHandle } from "./refetch.js";

// ── Optimistic updates ─────────────────────────────────────────────────────────
export { OptimisticUpdateManager } from "./optimistic.js";
export type {
  OptimisticMutationOptions,
  OptimisticMutationResult,
  OptimisticMutationStatus,
} from "./optimistic.js";

// ── SSR utilities ──────────────────────────────────────────────────────────────
export {
  dehydrate,
  hydrate,
  prefetchQuery,
  createSSRQueryClient,
  renderDehydratedScript,
  hydrateFromDOM,
} from "./ssr.js";
export type { DehydratedQuery, DehydratedState } from "./ssr.js";

// ── Type definitions ───────────────────────────────────────────────────────────
export type {
  QueryKey,
  QueryStatus,
  MutationStatus,
  QueryOptions,
  QueryResult,
  MutationOptions,
  MutationResult,
  QueryClientInterface,
} from "./types.js";
