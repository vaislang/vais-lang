/**
 * @vaisx/store — Public API
 *
 * Re-exports all public APIs from the store package.
 */

// Core store factory
export { defineStore, addStorePlugin, resetAllStores, getStore } from "./store.js";

// Component integration hook
export { useStore, connectStore } from "./use-store.js";
export type { ComponentContext } from "./use-store.js";

// Middleware / plugins
export { devtools, persist, logger, composePlugins } from "./middleware.js";

// SSR utilities
export {
  serializeStores,
  snapshotToJSON,
  renderStateScript,
  hydrateStores,
  hydrateFromDOM,
  consumeHydration,
  hasPendingHydration,
  clearHydration,
  createSSRContext,
  hydrateStore,
  getHydratedState,
  ssrHydrationPlugin,
  getStore as ssrGetStore,
  SSR_STATE_ELEMENT_ID,
} from "./ssr.js";

// Type definitions
export type {
  StoreDefinition,
  Store,
  StorePlugin,
  PersistOptions,
  LoggerOptions,
  DevtoolsOptions,
  SSRSnapshot,
  UnwrapGetters,
} from "./types.js";
