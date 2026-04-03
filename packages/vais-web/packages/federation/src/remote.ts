/**
 * Remote Module Loader — dynamic import and shared dependency management.
 *
 * Provides:
 *  - loadRemoteModule: load a module from a remote with caching
 *  - SharedDependencyManager: register / resolve shared dependencies with semver checks
 *  - RemoteContainer: per-remote container abstraction (init + get)
 *  - createRemoteLoader: factory scoped to a host origin
 *  - semverSatisfies: lightweight semver range check (^, ~, exact)
 */

import type { RemoteConfig } from "./types.js";

// ─── semver helpers ──────────────────────────────────────────────────────────

/**
 * Parse a semver string into [major, minor, patch] integers.
 * Returns null when the string cannot be parsed.
 */
function parseSemver(version: string): [number, number, number] | null {
  // Strip a leading 'v' if present.
  const cleaned = version.replace(/^v/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Compare two parsed semver tuples.
 * Returns  1 if a > b,  -1 if a < b,  0 if equal.
 */
function compareSemver(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

/**
 * Check whether `version` satisfies `range`.
 *
 * Supported range prefixes:
 *  - `^X.Y.Z`  — compatible with X.Y.Z (same major, >= minor.patch)
 *  - `~X.Y.Z`  — approximately equivalent (same major.minor, >= patch)
 *  - `X.Y.Z`   — exact match
 *
 * @param version - Concrete version string (e.g. "18.2.0").
 * @param range   - Range string (e.g. "^18.0.0", "~18.2.0", "18.2.0").
 * @returns true when the version satisfies the range.
 */
export function semverSatisfies(version: string, range: string): boolean {
  const trimmedRange = range.trim();

  // Detect prefix.
  const caretMatch = /^\^(.+)$/.exec(trimmedRange);
  const tildeMatch = /^~(.+)$/.exec(trimmedRange);

  if (caretMatch) {
    // ^X.Y.Z — same major, version >= X.Y.Z
    const base = parseSemver(caretMatch[1]);
    const ver = parseSemver(version);
    if (!base || !ver) return false;
    if (ver[0] !== base[0]) return false; // major must match
    return compareSemver(ver, base) >= 0;
  }

  if (tildeMatch) {
    // ~X.Y.Z — same major.minor, version >= X.Y.Z
    const base = parseSemver(tildeMatch[1]);
    const ver = parseSemver(version);
    if (!base || !ver) return false;
    if (ver[0] !== base[0] || ver[1] !== base[1]) return false; // major + minor must match
    return compareSemver(ver, base) >= 0;
  }

  // Exact match.
  const base = parseSemver(trimmedRange);
  const ver = parseSemver(version);
  if (!base || !ver) return false;
  return compareSemver(ver, base) === 0;
}

// ─── Manifest simulation ─────────────────────────────────────────────────────

/**
 * Simulated manifest entry returned by a remote server.
 * In a real federation setup this would be fetched over the network.
 */
export interface RemoteManifestEntry {
  name: string;
  version: string;
  baseUrl: string;
  modules: string[];
}

/**
 * Simulate fetching a remote manifest from the given URL.
 *
 * This replaces a real network call so the code can be exercised in tests
 * and non-browser environments without a live remote server.
 */
async function fetchRemoteManifest(
  config: RemoteConfig,
): Promise<RemoteManifestEntry> {
  // Artificial async boundary — mimics network latency.
  await Promise.resolve();

  return {
    name: config.name,
    version: "1.0.0",
    baseUrl: config.url,
    modules: config.modules,
  };
}

// ─── Module cache ────────────────────────────────────────────────────────────

/** Cache key: "<remoteName>|<modulePath>" */
type ModuleCacheKey = string;

const globalModuleCache = new Map<ModuleCacheKey, Record<string, unknown>>();

function moduleCacheKey(remoteName: string, modulePath: string): ModuleCacheKey {
  return `${remoteName}|${modulePath}`;
}

/**
 * Clear the global module cache.
 * Useful in tests to prevent state leakage between test cases.
 */
export function clearModuleCache(): void {
  globalModuleCache.clear();
}

// ─── loadRemoteModule ─────────────────────────────────────────────────────────

/**
 * Dynamically load a module from a remote.
 *
 * Steps:
 *  1. Consult the cache — return immediately on a hit.
 *  2. Fetch (simulate) the remote manifest to verify the module is exposed.
 *  3. Construct the full module URL.
 *  4. Execute a dynamic `import()` (simulated for test environments).
 *  5. Store the result in the cache before returning.
 *
 * @param config     - Remote configuration (name, url, modules).
 * @param modulePath - Module path as declared in config.modules (e.g. "./Button").
 * @returns The module's exports as a plain object.
 */
export async function loadRemoteModule(
  config: RemoteConfig,
  modulePath: string,
): Promise<Record<string, unknown>> {
  const key = moduleCacheKey(config.name, modulePath);

  // Cache hit — return previously loaded module.
  const cached = globalModuleCache.get(key);
  if (cached) {
    return cached;
  }

  // Fetch the manifest to validate the module exists.
  const manifest = await fetchRemoteManifest(config);

  if (!manifest.modules.includes(modulePath)) {
    throw new Error(
      `Remote "${config.name}" does not expose module "${modulePath}". ` +
        `Available: ${manifest.modules.join(", ")}`,
    );
  }

  // Build the full module URL.
  const moduleUrl = `${manifest.baseUrl}/${modulePath.replace(/^\.\//, "")}`;

  // Perform the dynamic import (simulated — in a real browser this would be
  // `await import(/* @vite-ignore */ moduleUrl)`).
  const exports = await simulateDynamicImport(config.name, modulePath, moduleUrl);

  // Populate cache.
  globalModuleCache.set(key, exports);

  return exports;
}

/**
 * Simulate a dynamic `import()` of a remote module.
 *
 * Returns a synthetic exports object that carries provenance metadata so
 * callers can verify which remote and module was loaded.
 */
async function simulateDynamicImport(
  remoteName: string,
  modulePath: string,
  moduleUrl: string,
): Promise<Record<string, unknown>> {
  await Promise.resolve();
  return {
    __remote: remoteName,
    __module: modulePath,
    __url: moduleUrl,
    default: null,
  };
}

// ─── SharedDependencyManager ─────────────────────────────────────────────────

/**
 * An entry stored inside the SharedDependencyManager registry.
 */
export interface SharedDependencyEntry {
  /** Package name (e.g. "react"). */
  name: string;
  /** Registered version string (e.g. "18.2.0"). */
  version: string;
  /** The actual module instance. */
  module: unknown;
  /** When true, only a single instance is shared across all remotes. */
  singleton?: boolean;
}

/**
 * Options accepted by `SharedDependencyManager.register`.
 */
export interface RegisterOptions {
  /** Mark this registration as singleton. */
  singleton?: boolean;
}

/**
 * Manages shared dependency instances across remotes.
 *
 * Responsibilities:
 *  - Store versioned instances of shared packages.
 *  - Return an existing instance when one satisfies a semver range.
 *  - Surface singleton instances by name.
 */
export interface SharedDependencyManager {
  /**
   * Register a module under the given package name and version.
   *
   * @param name    - Package name (e.g. "react").
   * @param version - Concrete version string (e.g. "18.2.0").
   * @param module  - The module instance to store.
   * @param options - Optional flags (singleton, etc.).
   */
  register(
    name: string,
    version: string,
    module: unknown,
    options?: RegisterOptions,
  ): void;

  /**
   * Resolve a shared dependency by name and semver range.
   *
   * Returns the first registered instance whose version satisfies
   * `requiredVersion`. When `requiredVersion` is omitted the most-recently
   * registered version is returned.
   *
   * @param name            - Package name.
   * @param requiredVersion - Optional semver range (e.g. "^18.0.0").
   * @returns The matching module instance, or undefined if none is found.
   */
  resolve(name: string, requiredVersion?: string): unknown | undefined;

  /**
   * Return all registered version strings for a package.
   *
   * @param name - Package name.
   * @returns Array of version strings in registration order.
   */
  getVersions(name: string): string[];

  /**
   * Return the singleton instance for a package, if one was registered.
   *
   * @param name - Package name.
   * @returns The singleton module, or undefined if none exists.
   */
  getSingleton(name: string): unknown | undefined;
}

/**
 * Create a new SharedDependencyManager instance.
 *
 * @example
 * const manager = createSharedDependencyManager();
 * manager.register("react", "18.2.0", ReactModule, { singleton: true });
 * const react = manager.resolve("react", "^18.0.0");
 */
export function createSharedDependencyManager(): SharedDependencyManager {
  /**
   * Registry: package name → ordered list of entries.
   * Multiple versions of the same package may coexist unless one is a singleton.
   */
  const registry = new Map<string, SharedDependencyEntry[]>();

  function getEntries(name: string): SharedDependencyEntry[] {
    let entries = registry.get(name);
    if (!entries) {
      entries = [];
      registry.set(name, entries);
    }
    return entries;
  }

  function register(
    name: string,
    version: string,
    module: unknown,
    options?: RegisterOptions,
  ): void {
    const entries = getEntries(name);
    // Replace an existing entry for the same version to avoid duplicates.
    const existingIndex = entries.findIndex((e) => e.version === version);
    const entry: SharedDependencyEntry = {
      name,
      version,
      module,
      singleton: options?.singleton,
    };
    if (existingIndex !== -1) {
      entries[existingIndex] = entry;
    } else {
      entries.push(entry);
    }
  }

  function resolve(name: string, requiredVersion?: string): unknown | undefined {
    const entries = registry.get(name);
    if (!entries || entries.length === 0) return undefined;

    if (!requiredVersion) {
      // No constraint — return the last registered entry.
      return entries[entries.length - 1].module;
    }

    // Find the first entry whose version satisfies the range.
    const match = entries.find((e) => semverSatisfies(e.version, requiredVersion));
    return match?.module;
  }

  function getVersions(name: string): string[] {
    const entries = registry.get(name);
    if (!entries) return [];
    return entries.map((e) => e.version);
  }

  function getSingleton(name: string): unknown | undefined {
    const entries = registry.get(name);
    if (!entries) return undefined;
    const singleton = entries.find((e) => e.singleton === true);
    return singleton?.module;
  }

  return { register, resolve, getVersions, getSingleton };
}

// ─── RemoteContainer ──────────────────────────────────────────────────────────

/**
 * A factory function that produces a module's exports.
 */
export type ModuleFactory = () => Promise<Record<string, unknown>>;

/**
 * Federated container abstraction for a single remote application.
 *
 * Mirrors the Webpack Module Federation container API (init / get).
 */
export interface RemoteContainer {
  /** Name of the remote this container belongs to. */
  readonly name: string;

  /**
   * Initialise the container with the host's shared dependency scope.
   *
   * @param shared - Map of package name → resolved module instance provided by the host.
   */
  init(shared: Record<string, unknown>): void;

  /**
   * Retrieve a module factory for the given module path.
   *
   * @param modulePath - Module path as declared in the remote's manifest (e.g. "./Button").
   * @returns A factory function that, when called, returns the module exports.
   * @throws When the module path is not exposed by this container.
   */
  get(modulePath: string): ModuleFactory;
}

/**
 * Create a RemoteContainer for the supplied RemoteConfig.
 *
 * @param config - Remote configuration (name, url, modules).
 * @returns A RemoteContainer bound to that remote.
 */
export function createRemoteContainer(config: RemoteConfig): RemoteContainer {
  /** Shared dependencies injected by the host at init time. */
  let sharedScope: Record<string, unknown> = {};
  /** Per-container module cache so repeated `get` calls share the same instance. */
  const containerCache = new Map<string, Record<string, unknown>>();

  function init(shared: Record<string, unknown>): void {
    sharedScope = { ...shared };
  }

  function get(modulePath: string): ModuleFactory {
    if (!config.modules.includes(modulePath)) {
      throw new Error(
        `RemoteContainer "${config.name}" does not expose module "${modulePath}". ` +
          `Available: ${config.modules.join(", ")}`,
      );
    }

    return async (): Promise<Record<string, unknown>> => {
      const cached = containerCache.get(modulePath);
      if (cached) return cached;

      // Simulate the dynamic load, passing the shared scope as context.
      await Promise.resolve();
      const exports: Record<string, unknown> = {
        __remote: config.name,
        __module: modulePath,
        __url: `${config.url}/${modulePath.replace(/^\.\//, "")}`,
        __shared: sharedScope,
        default: null,
      };
      containerCache.set(modulePath, exports);
      return exports;
    };
  }

  return { name: config.name, init, get };
}

// ─── createRemoteLoader ───────────────────────────────────────────────────────

/**
 * A loader instance scoped to a single host origin.
 */
export interface RemoteLoader {
  /** The host base URL this loader is bound to. */
  readonly host: string;

  /**
   * Load a module from the named remote.
   *
   * @param config     - Remote configuration.
   * @param modulePath - Module path (e.g. "./Button").
   * @returns Module exports.
   */
  load(config: RemoteConfig, modulePath: string): Promise<Record<string, unknown>>;

  /**
   * Pre-warm the loader by fetching the manifest for a remote.
   * Subsequent `load` calls for that remote will skip manifest fetching.
   *
   * @param config - Remote configuration to pre-warm.
   */
  preload(config: RemoteConfig): Promise<void>;

  /**
   * Clear only the entries for a specific remote from the cache.
   *
   * @param remoteName - Name of the remote to evict.
   */
  invalidate(remoteName: string): void;
}

/**
 * Create a RemoteLoader bound to the given host origin.
 *
 * The loader maintains its own module cache and manifest cache, independent
 * of the global `loadRemoteModule` cache.
 *
 * @param host - Base URL of the host application (used as a namespace).
 * @returns A RemoteLoader instance.
 *
 * @example
 * const loader = createRemoteLoader("https://shell.example.com");
 * const exports = await loader.load(shopRemote, "./Cart");
 */
export function createRemoteLoader(host: string): RemoteLoader {
  const moduleCache = new Map<ModuleCacheKey, Record<string, unknown>>();
  const manifestCache = new Map<string, RemoteManifestEntry>();

  async function ensureManifest(config: RemoteConfig): Promise<RemoteManifestEntry> {
    const cached = manifestCache.get(config.name);
    if (cached) return cached;
    const manifest = await fetchRemoteManifest(config);
    manifestCache.set(config.name, manifest);
    return manifest;
  }

  async function load(
    config: RemoteConfig,
    modulePath: string,
  ): Promise<Record<string, unknown>> {
    const key = moduleCacheKey(config.name, modulePath);
    const cached = moduleCache.get(key);
    if (cached) return cached;

    const manifest = await ensureManifest(config);

    if (!manifest.modules.includes(modulePath)) {
      throw new Error(
        `Remote "${config.name}" does not expose module "${modulePath}". ` +
          `Available: ${manifest.modules.join(", ")}`,
      );
    }

    const moduleUrl = `${manifest.baseUrl}/${modulePath.replace(/^\.\//, "")}`;
    const exports = await simulateDynamicImport(config.name, modulePath, moduleUrl);

    moduleCache.set(key, exports);
    return exports;
  }

  async function preload(config: RemoteConfig): Promise<void> {
    await ensureManifest(config);
  }

  function invalidate(remoteName: string): void {
    for (const key of moduleCache.keys()) {
      if (key.startsWith(`${remoteName}|`)) {
        moduleCache.delete(key);
      }
    }
    manifestCache.delete(remoteName);
  }

  return { host, load, preload, invalidate };
}
