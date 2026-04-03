/**
 * SSR utilities for @vaisx/query.
 *
 * Provides dehydrate/hydrate helpers, server-side prefetching, and DOM-based
 * state injection — all without taking hard dependencies on browser globals.
 */

import { QueryClient } from "./client.js";
import type { QueryKey, QueryOptions } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single query entry captured during dehydration.
 */
export interface DehydratedQuery {
  /** The original query key. */
  queryKey: QueryKey;
  /** The serialised data (JSON-safe). */
  data: unknown;
  /** Timestamp when the data was last updated. */
  dataUpdatedAt: number;
}

/**
 * The serialisable representation of a QueryClient's cache,
 * suitable for embedding in an SSR HTML response.
 */
export interface DehydratedState {
  queries: DehydratedQuery[];
}

// ─── dehydrate ────────────────────────────────────────────────────────────────

/**
 * Serialise the current state of a QueryClient's cache into a plain object
 * that can be safely passed over the network (e.g. embedded in HTML or JSON).
 *
 * Only entries that have data are included; entries with no data are skipped.
 *
 * @param client - The QueryClient whose cache should be serialised.
 * @returns A {@link DehydratedState} snapshot of the cache.
 */
export function dehydrate(client: QueryClient): DehydratedState {
  const cache = client.getQueryCache();
  const queries: DehydratedQuery[] = [];

  for (const [, entry] of cache) {
    if (entry.data === undefined) continue;

    queries.push({
      queryKey: entry.queryKey,
      data: entry.data,
      dataUpdatedAt: entry.updatedAt,
    });
  }

  return { queries };
}

// ─── hydrate ──────────────────────────────────────────────────────────────────

/**
 * Restore a previously {@link dehydrate}d state into a QueryClient's cache.
 *
 * Each entry is written via {@link QueryClient.setQueryData}, which means
 * observers will be notified and existing data is overwritten.
 *
 * @param client - The QueryClient to restore state into.
 * @param state  - The dehydrated state to restore.
 */
export function hydrate(client: QueryClient, state: DehydratedState): void {
  if (!state || !Array.isArray(state.queries)) return;

  for (const query of state.queries) {
    if (query.data === undefined) continue;
    client.setQueryData(query.queryKey, query.data);
  }
}

// ─── prefetchQuery ────────────────────────────────────────────────────────────

/**
 * Run a query on the server and populate the given QueryClient's cache.
 *
 * This is a thin wrapper around {@link QueryClient.prefetchQuery} that makes
 * the server-side intent explicit.
 *
 * @param client  - The SSR QueryClient to populate.
 * @param options - Standard {@link QueryOptions} for the query to prefetch.
 */
export async function prefetchQuery<TData = unknown>(
  client: QueryClient,
  options: QueryOptions<TData>,
): Promise<void> {
  await client.prefetchQuery(options);
}

// ─── createSSRQueryClient ─────────────────────────────────────────────────────

/**
 * Create a QueryClient suitable for SSR environments.
 *
 * The returned client:
 * - Has no dependency on `window` or `document`.
 * - Defaults to `gcTime: 0` so unused entries are never kept alive by timers
 *   (avoids memory leaks in a long-running server process).
 * - Defaults to `defaultRetry: 0` so failed prefetches surface immediately.
 *
 * @returns A fresh {@link QueryClient} configured for server-side use.
 */
export function createSSRQueryClient(): QueryClient {
  return new QueryClient({
    defaultStaleTime: 0,
    defaultGcTime: 0,
    defaultRetry: 0,
  });
}

// ─── renderDehydratedScript ───────────────────────────────────────────────────

/**
 * Characters that must be escaped inside a JSON string embedded in an HTML
 * `<script>` tag to prevent XSS via early `</script>` termination or HTML
 * entity injection.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "\\u0026",
  "<": "\\u003c",
  ">": "\\u003e",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Escape a JSON string so it is safe to embed inside an HTML `<script>` tag.
 *
 * Replaces `&`, `<`, `>`, and Unicode line/paragraph separators with their
 * Unicode escape sequences.
 */
function escapeForHtml(json: string): string {
  return json.replace(/[&<>\u2028\u2029]/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

/**
 * Serialise a {@link DehydratedState} and wrap it in a `<script>` tag that
 * assigns the state to a global variable on `window`.
 *
 * The JSON is escaped to prevent XSS — specifically, sequences like
 * `</script>` inside a JSON string value cannot terminate the script block.
 *
 * @param state     - The dehydrated state to embed.
 * @param varName   - The global variable name (default: `__QUERY_STATE__`).
 * @returns An HTML `<script>` string ready to be injected into the `<head>`.
 *
 * @example
 * ```html
 * <script>window.__QUERY_STATE__ = {"queries":[...]}</script>
 * ```
 */
export function renderDehydratedScript(
  state: DehydratedState,
  varName = "__QUERY_STATE__",
): string {
  const json = JSON.stringify(state);
  const safe = escapeForHtml(json);
  return `<script>window.${varName} = ${safe}</script>`;
}

// ─── hydrateFromDOM ───────────────────────────────────────────────────────────

/**
 * Read a {@link DehydratedState} from a DOM element and hydrate the client.
 *
 * This is the client-side counterpart to {@link renderDehydratedScript}.
 * It reads `window[elementId]` (for inline script injection) or falls back
 * to reading the `textContent` of a DOM element with the given `id`.
 *
 * Guards against `window`/`document` being unavailable so the function is
 * safe to call in Node.js (it simply no-ops).
 *
 * @param client    - The QueryClient to hydrate.
 * @param elementId - Window variable name / DOM element id (default: `__QUERY_STATE__`).
 */
export function hydrateFromDOM(
  client: QueryClient,
  elementId = "__QUERY_STATE__",
): void {
  // Guard: window may not exist in SSR/Node environments.
  if (typeof window === "undefined") return;

  // Primary: the state was injected as a window variable via renderDehydratedScript.
  const windowState = (window as unknown as Record<string, unknown>)[elementId];
  if (windowState && typeof windowState === "object") {
    hydrate(client, windowState as DehydratedState);
    return;
  }

  // Fallback: the state was embedded as JSON text content inside a DOM element.
  if (typeof document === "undefined") return;

  const el = document.getElementById(elementId);
  if (!el) return;

  try {
    const parsed = JSON.parse(el.textContent ?? "");
    hydrate(client, parsed as DehydratedState);
  } catch {
    // Malformed JSON — silently ignore.
  }
}
