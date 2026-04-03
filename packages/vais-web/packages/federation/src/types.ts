/**
 * Core type definitions for @vaisx/federation.
 *
 * Provides the foundational types for Module Federation:
 * host configuration, remote registration, shared dependency management,
 * and the event bus contract used for cross-remote communication.
 */

// ─── Remote Configuration ────────────────────────────────────────────────────

/**
 * Configuration for a single remote application.
 */
export interface RemoteConfig {
  /** Unique name identifying this remote (used as the namespace for module lookups). */
  name: string;
  /** URL where the remote's entry point (manifest or container) is hosted. */
  url: string;
  /** List of module paths exposed by this remote (e.g. "./Button", "./utils"). */
  modules: string[];
}

// ─── Shared Dependency Configuration ─────────────────────────────────────────

/**
 * Options for a single shared dependency.
 */
export interface SharedDependencyConfig {
  /** When true, only one instance of this dependency is loaded across all remotes. */
  singleton?: boolean;
  /** SemVer range that satisfies this package (e.g. "^18.0.0"). */
  requiredVersion?: string;
  /** When true, the dependency is included in the initial bundle instead of lazy-loaded. */
  eager?: boolean;
}

/**
 * Map of package names to their sharing configuration.
 *
 * @example
 * {
 *   react: { singleton: true, requiredVersion: "^18.0.0", eager: true },
 *   "react-dom": { singleton: true, requiredVersion: "^18.0.0" },
 * }
 */
export type SharedConfig = Record<string, SharedDependencyConfig>;

// ─── Federation Host Configuration ───────────────────────────────────────────

/**
 * Top-level configuration passed to createFederationHost().
 */
export interface FederationConfig {
  /** Name of the host application. */
  name: string;
  /** List of remote applications this host can load modules from. */
  remotes: RemoteConfig[];
  /** Shared dependencies and their negotiation rules. */
  shared: SharedConfig;
}

// ─── Runtime Remote State ────────────────────────────────────────────────────

/**
 * Runtime state of a remote module after it has been resolved or loaded.
 */
export interface RemoteModule {
  /** Name of the remote that owns this module. */
  name: string;
  /** Resolved URL for this specific module. */
  url: string;
  /** Whether the module has been successfully loaded. */
  loaded: boolean;
  /** The module's exported members, available after loading. */
  exports?: Record<string, unknown>;
}

// ─── Federation Manifest ─────────────────────────────────────────────────────

/**
 * Manifest emitted by a remote application at build time.
 * The host fetches and parses this to understand what a remote exposes.
 */
export interface FederationManifest {
  /** Remote application name (must match RemoteConfig.name). */
  name: string;
  /** Semantic version of the remote build. */
  version: string;
  /** Other remotes this remote depends on. */
  remotes: RemoteConfig[];
  /** Shared dependency information declared by this remote. */
  shared: SharedConfig;
  /** All module paths this remote exposes. */
  modules: string[];
}

// ─── Federation Host API ─────────────────────────────────────────────────────

/**
 * Public interface for the federation host instance.
 * Returned by createFederationHost().
 */
export interface FederationHost {
  /**
   * Dynamically load a module from a named remote.
   *
   * @param name   - Remote name as registered in config or via registerRemote().
   * @param module - Module path as declared in RemoteConfig.modules (e.g. "./Button").
   * @returns A promise that resolves to the module's exports.
   */
  loadRemote(name: string, module: string): Promise<Record<string, unknown>>;

  /**
   * Retrieve a shared dependency instance by package name.
   *
   * @param name - Package name (e.g. "react").
   * @returns The shared dependency config, or undefined if not registered.
   */
  getShared(name: string): SharedDependencyConfig | undefined;

  /**
   * Register a new remote at runtime (after host initialisation).
   *
   * @param config - Full configuration for the remote to register.
   */
  registerRemote(config: RemoteConfig): void;
}

// ─── Event Bus ───────────────────────────────────────────────────────────────

/**
 * Generic event handler function type.
 */
export type EventHandler<T = unknown> = (data: T) => void;

/**
 * Lightweight publish/subscribe event bus for cross-remote communication.
 */
export interface EventBus {
  /**
   * Emit an event, invoking all registered handlers for that event.
   *
   * @param event - Event name.
   * @param data  - Payload passed to every handler.
   */
  emit<T = unknown>(event: string, data: T): void;

  /**
   * Register a persistent handler for the given event.
   * The handler is called every time the event is emitted.
   *
   * @param event   - Event name.
   * @param handler - Callback to invoke on each emission.
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): void;

  /**
   * Remove a previously registered handler.
   * No-op if the handler was never registered for that event.
   *
   * @param event   - Event name.
   * @param handler - The exact handler reference to remove.
   */
  off<T = unknown>(event: string, handler: EventHandler<T>): void;

  /**
   * Register a one-shot handler that is automatically removed after the first emission.
   *
   * @param event   - Event name.
   * @param handler - Callback invoked only once.
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): void;
}
