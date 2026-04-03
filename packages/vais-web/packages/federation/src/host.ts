/**
 * FederationHost — core orchestrator for Module Federation.
 *
 * Responsibilities:
 *  - Maintain a registry of remote configurations.
 *  - Dynamically load (simulated) remote modules on demand.
 *  - Manage shared dependency resolution.
 *  - Expose an event bus for lifecycle notifications.
 */

import type {
  FederationConfig,
  FederationHost,
  RemoteConfig,
  RemoteModule,
  SharedDependencyConfig,
} from "./types.js";
import { createEventBus } from "./event-bus.js";

// ─── Federation events ────────────────────────────────────────────────────────

/**
 * Events emitted by the federation host on the internal bus.
 *
 * Consumers can listen via host.events.on("remote:loaded", ...) etc.
 */
export type FederationEvent =
  | "remote:registered"
  | "remote:loading"
  | "remote:loaded"
  | "remote:error"
  | "shared:resolved";

// ─── Internal state ───────────────────────────────────────────────────────────

interface HostState {
  /** Map of remote name → RemoteConfig */
  remotes: Map<string, RemoteConfig>;
  /** Cache of already-loaded remote modules: "remoteName/modulePath" → RemoteModule */
  moduleCache: Map<string, RemoteModule>;
  /** Shared dependency registry derived from FederationConfig.shared */
  shared: Map<string, SharedDependencyConfig>;
}

// ─── createFederationHost ─────────────────────────────────────────────────────

/**
 * Create a federation host that manages remote module loading and shared
 * dependency negotiation.
 *
 * @example
 * const host = createFederationHost({
 *   name: "shell",
 *   remotes: [{ name: "shop", url: "https://shop.example.com", modules: ["./Cart"] }],
 *   shared: { react: { singleton: true, requiredVersion: "^18.0.0" } },
 * });
 *
 * const { Cart } = await host.loadRemote("shop", "./Cart");
 */
export function createFederationHost(config: FederationConfig): FederationHost & {
  /** Name of this host application. */
  readonly name: string;
  /** Internal event bus — subscribe to federation lifecycle events. */
  readonly events: ReturnType<typeof createEventBus>;
  /** Read-only snapshot of all registered remotes. */
  readonly remotes: ReadonlyMap<string, RemoteConfig>;
  /** Read-only snapshot of the module load cache. */
  readonly moduleCache: ReadonlyMap<string, RemoteModule>;
} {
  // ── Initialise internal state ──────────────────────────────────────────────

  const state: HostState = {
    remotes: new Map(),
    moduleCache: new Map(),
    shared: new Map(),
  };

  const events = createEventBus();

  // Populate remotes from config.
  for (const remote of config.remotes) {
    state.remotes.set(remote.name, { ...remote });
  }

  // Populate shared registry from config.
  for (const [pkgName, opts] of Object.entries(config.shared)) {
    state.shared.set(pkgName, { ...opts });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Build the stable cache key used to identify a loaded module.
   */
  function cacheKey(remoteName: string, modulePath: string): string {
    return `${remoteName}/${modulePath}`;
  }

  /**
   * Simulate loading a remote module.
   *
   * In a real browser environment this would use dynamic `import()` against
   * the remote's container URL.  Here we resolve with a synthetic exports
   * object so the host can be tested and used without a live remote server.
   */
  async function simulateLoad(
    remote: RemoteConfig,
    modulePath: string,
  ): Promise<Record<string, unknown>> {
    // Artificial async boundary — mimics network/parse latency.
    await Promise.resolve();

    // Validate that the remote declares this module.
    if (!remote.modules.includes(modulePath)) {
      throw new Error(
        `Remote "${remote.name}" does not expose module "${modulePath}". ` +
          `Available modules: ${remote.modules.join(", ")}`,
      );
    }

    // Return a synthetic exports object that includes provenance metadata.
    return {
      __remote: remote.name,
      __module: modulePath,
      __url: remote.url,
      default: null,
    };
  }

  // ── FederationHost API ─────────────────────────────────────────────────────

  async function loadRemote(
    name: string,
    modulePath: string,
  ): Promise<Record<string, unknown>> {
    const key = cacheKey(name, modulePath);

    // Return cached result on repeated loads.
    const cached = state.moduleCache.get(key);
    if (cached?.loaded && cached.exports) {
      return cached.exports;
    }

    const remote = state.remotes.get(name);
    if (!remote) {
      const error = new Error(
        `Federation host "${config.name}": unknown remote "${name}". ` +
          `Registered remotes: ${[...state.remotes.keys()].join(", ") || "(none)"}`,
      );
      events.emit<{ name: string; modulePath: string; error: Error }>("remote:error", {
        name,
        modulePath,
        error,
      });
      throw error;
    }

    // Notify subscribers that loading is starting.
    events.emit<{ name: string; modulePath: string; url: string }>("remote:loading", {
      name,
      modulePath,
      url: remote.url,
    });

    let exports: Record<string, unknown>;
    try {
      exports = await simulateLoad(remote, modulePath);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      events.emit<{ name: string; modulePath: string; error: Error }>("remote:error", {
        name,
        modulePath,
        error,
      });
      throw error;
    }

    // Update the module cache.
    const remoteModule: RemoteModule = {
      name,
      url: `${remote.url}/${modulePath}`,
      loaded: true,
      exports,
    };
    state.moduleCache.set(key, remoteModule);

    events.emit<RemoteModule>("remote:loaded", remoteModule);

    return exports;
  }

  function registerRemote(remoteConfig: RemoteConfig): void {
    state.remotes.set(remoteConfig.name, { ...remoteConfig });
    events.emit<RemoteConfig>("remote:registered", { ...remoteConfig });
  }

  function getShared(name: string): SharedDependencyConfig | undefined {
    const entry = state.shared.get(name);
    if (!entry) return undefined;
    events.emit<{ name: string; config: SharedDependencyConfig }>("shared:resolved", {
      name,
      config: entry,
    });
    return { ...entry };
  }

  // ── Assemble and return the host object ────────────────────────────────────

  return {
    name: config.name,
    events,
    get remotes(): ReadonlyMap<string, RemoteConfig> {
      return state.remotes;
    },
    get moduleCache(): ReadonlyMap<string, RemoteModule> {
      return state.moduleCache;
    },
    loadRemote,
    registerRemote,
    getShared,
  };
}
