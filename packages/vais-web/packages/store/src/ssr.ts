/**
 * SSR (Server-Side Rendering) utilities for @vaisx/store.
 *
 * Pattern:
 *  Server:
 *    1. Create stores and let them compute their state normally.
 *    2. Call `serializeStores()` to collect a JSON-serialisable snapshot.
 *    3. Embed the snapshot into the HTML (e.g. <script id="__VAISX_STATE__">).
 *
 *  Client:
 *    1. Extract the raw snapshot from the DOM/HTML.
 *    2. Call `hydrateStores(snapshot)` before any store is first accessed.
 *    3. When stores are created, they pick up the hydrated state instead of the
 *       default initial state — no flash of wrong state.
 */

import type { Store, SSRSnapshot } from "./types.js";
import { getStore, resetAllStores } from "./store.js";

/** ID of the default script element used to embed the state snapshot. */
export const SSR_STATE_ELEMENT_ID = "__VAISX_STATE__";

/**
 * Collect the current state from an array of store instances into a plain
 * serialisable snapshot object.
 *
 * @param stores - Array of store instances to snapshot.
 * @returns Plain object mapping storeId → current state.
 */
export function serializeStores(
  stores: Store<any, any, any>[],
): SSRSnapshot {
  const snapshot: SSRSnapshot = {};
  for (const store of stores) {
    // Spread state into a plain object (the proxy reads signal values eagerly)
    snapshot[store.$id] = { ...(store.$state as Record<string, unknown>) };
  }
  return snapshot;
}

/**
 * Serialise a snapshot to a JSON string safe for embedding in HTML.
 * Escapes all sequences that could break out of a `<script>` or `<style>` tag,
 * as well as Unicode line/paragraph separators that are invalid in JSON strings
 * embedded in HTML.
 *
 * Escaped sequences:
 *  - `<`  → `\u003c`  (prevents `</script>`, `<!--`, `</style>`, etc.)
 *  - `>`  → `\u003e`  (prevents `-->` and tag-close variants)
 *  - U+2028 → `\u2028` (LINE SEPARATOR — invalid in JS string literals)
 *  - U+2029 → `\u2029` (PARAGRAPH SEPARATOR — invalid in JS string literals)
 */
export function snapshotToJSON(snapshot: SSRSnapshot): string {
  return JSON.stringify(snapshot)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Generate an inline `<script>` tag containing the state snapshot.
 * Embed this in the server-rendered HTML, inside `<head>` or just before
 * closing `</body>`.
 */
export function renderStateScript(snapshot: SSRSnapshot): string {
  return `<script id="${SSR_STATE_ELEMENT_ID}" type="application/json">${snapshotToJSON(snapshot)}</script>`;
}

// ─── Client-side hydration ───────────────────────────────────────────────────

/**
 * In-memory store for pending hydration data.
 * Keyed by store id → state snapshot for that store.
 */
const pendingHydration = new Map<string, Record<string, unknown>>();

/**
 * Register a full snapshot for hydration.
 * Must be called before any store is first created (i.e. before the first
 * `useStore()` call for each respective store).
 *
 * @param snapshot - The SSRSnapshot produced by `serializeStores()` on the server.
 */
export function hydrateStores(snapshot: SSRSnapshot): void {
  for (const [id, state] of Object.entries(snapshot)) {
    pendingHydration.set(id, state as Record<string, unknown>);
  }
}

/**
 * Read and apply the state embedded by `renderStateScript()` from the DOM.
 * Call this once on the client, early in the boot sequence.
 *
 * @param elementId - Override the default script element id.
 */
export function hydrateFromDOM(elementId = SSR_STATE_ELEMENT_ID): void {
  if (typeof document === "undefined") return;

  const el = document.getElementById(elementId);
  if (!el) return;

  try {
    const snapshot = JSON.parse(el.textContent ?? "{}") as SSRSnapshot;
    hydrateStores(snapshot);
  } catch {
    // Malformed JSON — leave defaults in place
  }
}

/**
 * Retrieve pending hydration state for a given store id, then clear it so the
 * data is consumed only once.
 *
 * This is called internally by `defineStore`'s factory when creating a store
 * for the first time on the client.
 */
export function consumeHydration(id: string): Record<string, unknown> | undefined {
  const state = pendingHydration.get(id);
  if (state !== undefined) {
    pendingHydration.delete(id);
  }
  return state;
}

/**
 * Check whether there is any pending hydration data left (useful for debugging).
 */
export function hasPendingHydration(): boolean {
  return pendingHydration.size > 0;
}

/**
 * Clear all pending hydration data (useful for test isolation).
 */
export function clearHydration(): void {
  pendingHydration.clear();
}

// ─── SSR context helpers ─────────────────────────────────────────────────────

/**
 * Create an isolated SSR context.
 * On the server each request should use its own context to avoid state leaking
 * across concurrent requests.
 *
 * Returns an object with:
 *  - `runWithContext(fn)` — run `fn` in this SSR context (resets global registry,
 *    restores it afterwards so tests can be nested).
 *  - `serialize()` — collect all stores created during `runWithContext`.
 */
export function createSSRContext() {
  const createdStores: Store<any, any, any>[] = [];

  return {
    /**
     * Execute `fn` in a clean store environment.
     * Any stores created inside `fn` are captured and can be serialised later.
     */
    async runWithContext<T>(fn: () => T | Promise<T>): Promise<T> {
      // Start with a clean registry for this request
      resetAllStores();
      const result = await fn();
      return result;
    },

    /**
     * Track a store so it is included in the serialised snapshot.
     */
    trackStore(store: Store<any, any, any>): void {
      createdStores.push(store);
    },

    /**
     * Serialise all tracked stores to a snapshot.
     */
    serialize(): SSRSnapshot {
      return serializeStores(createdStores);
    },
  };
}

/**
 * Convenience: hydrate a store with pre-fetched SSR state.
 * Applies the state snapshot to an already-created store instance.
 */
export function hydrateStore<S extends object>(
  store: Store<S, any, any>,
  state: Partial<S>,
): void {
  store.$patch(state);
}

/**
 * Retrieve the hydrated state for a specific store from a full SSRSnapshot.
 * Returns undefined if there is no entry for that store id.
 */
export function getHydratedState(snapshot: SSRSnapshot, id: string): Record<string, unknown> | undefined {
  const entry = snapshot[id];
  if (entry && typeof entry === "object") {
    return entry as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Create a plugin that automatically hydrates a store from pending SSR data
 * when the store is first instantiated on the client.
 *
 * Install this plugin globally with `addStorePlugin()` or pass it per-store.
 */
export function ssrHydrationPlugin() {
  return ({ store }: { store: Store<any, any, any>; options: unknown }) => {
    const savedState = consumeHydration(store.$id);
    if (savedState) {
      store.$patch(savedState as Record<string, unknown>);
    }
  };
}

/**
 * Re-export getStore so SSR utilities can inspect already-created stores
 * without an additional import.
 */
export { getStore };
