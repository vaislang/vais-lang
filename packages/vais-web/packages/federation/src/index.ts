/**
 * @vaisx/federation — Public API
 *
 * Re-exports all public APIs from the federation package.
 */

// Host factory
export { createFederationHost } from "./host.js";

// Event bus factory
export { createEventBus } from "./event-bus.js";

// Type definitions
export type {
  FederationConfig,
  RemoteConfig,
  SharedConfig,
  SharedDependencyConfig,
  RemoteModule,
  FederationManifest,
  FederationHost,
  EventBus,
  EventHandler,
} from "./types.js";

export type { FederationEvent } from "./host.js";

// Shared state & message channel
export {
  createSharedStore,
  SharedStoreRegistry,
  createMessageChannel,
  syncStores,
} from "./state.js";

export type {
  StateRecord,
  StateListener,
  Unsubscribe,
  SharedStore,
  ISharedStoreRegistry,
  ChannelMessage,
  MessageHandler,
  MessageChannel,
  SyncDirection,
  ConflictStrategy,
  SyncOptions,
  SyncHandle,
} from "./state.js";

// Remote module loader
export {
  semverSatisfies,
  loadRemoteModule,
  clearModuleCache,
  createSharedDependencyManager,
  createRemoteContainer,
  createRemoteLoader,
} from "./remote.js";

export type {
  RemoteManifestEntry,
  SharedDependencyEntry,
  RegisterOptions,
  SharedDependencyManager,
  ModuleFactory,
  RemoteContainer,
  RemoteLoader,
} from "./remote.js";

// Build integration
export {
  createFederationBuildPlugin,
  generateExposeMap,
  resolveSharedDeps,
  validateFederationConfig,
  serializeManifest as serializeBuildManifest,
  parseManifest as parseBuildManifest,
  FederationConfigError,
  ManifestParseError,
} from "./build.js";

export type {
  FederationBuildConfig,
  ExposeConfig,
  ExposeMapEntry,
  BuildChunk,
  BuildResult,
  FederationBuildPlugin,
  BuildFederationManifest,
  PackageJson,
} from "./build.js";

// Federated router
export {
  createFederatedRouter,
  matchRoute,
  serializeManifest,
  parseManifest,
} from "./router.js";

export type {
  FederatedRouteConfig,
  RouteMatch,
  LoadedRoute,
  RouteManifest,
  FederatedRouter,
  FederatedRouterConfig,
} from "./router.js";

// Fallback, version management & circuit breaker
export {
  createFallbackManager,
  VersionManager,
  createCircuitBreaker,
  CircuitOpenError,
  FallbackUI,
} from "./fallback.js";

export type {
  FallbackOptions,
  FallbackManager,
  VersionConstraint,
  CompatibilityResult,
  CircuitState,
  CircuitBreakerOptions,
  CircuitBreaker,
  LoadingPlaceholderOptions,
  HTMLString,
  FallbackUIHelper,
} from "./fallback.js";
