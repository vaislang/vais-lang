/**
 * Federated Router — route-based remote module mapping & independent deployment.
 *
 * Provides:
 *  - createFederatedRouter: factory that maps URL routes to remote modules
 *  - matchRoute: URL pattern matching with dynamic segments (/:param, /*catch)
 *  - RouteManifest: deployment manifest generation and parsing
 */

import type { RemoteConfig } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration for a single federated route.
 *
 * Maps a URL path pattern to a remote application and its exposed module.
 */
export interface FederatedRouteConfig {
  /** URL path pattern (e.g. "/shop", "/shop/:id", "/docs/*catch"). */
  path: string;
  /** Remote configuration that serves this route. */
  remote: RemoteConfig;
  /** Module path exposed by the remote for this route (e.g. "./App"). */
  module: string;
  /**
   * Optional fallback module path to load when the primary module fails.
   * Falls back to this path on the same remote.
   */
  fallback?: string;
}

/**
 * Result returned by matchRoute when a URL matches a route pattern.
 */
export interface RouteMatch {
  /** The matched route configuration. */
  route: FederatedRouteConfig;
  /** Extracted dynamic parameter values keyed by parameter name. */
  params: Record<string, string>;
  /** The full URL that was matched. */
  url: string;
}

/**
 * The loaded module result returned by loadRoute.
 */
export interface LoadedRoute {
  /** The route match details. */
  match: RouteMatch;
  /** The module exports from the remote. */
  exports: Record<string, unknown>;
  /** Whether the fallback module was used instead of the primary. */
  usedFallback: boolean;
}

/**
 * Deployment manifest that maps routes to remote builds.
 * Used for independent deployment tracking.
 */
export interface RouteManifest {
  /** Manifest schema version. */
  version: string;
  /** ISO timestamp when this manifest was generated. */
  generatedAt: string;
  /** All route-to-remote mappings in this deployment. */
  routes: Array<{
    path: string;
    remote: string;
    remoteUrl: string;
    module: string;
    fallback?: string;
  }>;
}

/**
 * Public interface for the federated router instance.
 */
export interface FederatedRouter {
  /**
   * Add a new route to the router.
   *
   * @param config - Route configuration to register.
   */
  addRoute(config: FederatedRouteConfig): void;

  /**
   * Remove a previously registered route by its path pattern.
   *
   * @param path - Exact path pattern string used when registering the route.
   */
  removeRoute(path: string): void;

  /**
   * Resolve a URL against registered routes and return the first match.
   *
   * Supports:
   *  - Static segments: "/about"
   *  - Dynamic parameters: "/:id"
   *  - Catch-all wildcards: "/*rest"
   *
   * @param url - URL to match (pathname portion, e.g. "/shop/42").
   * @returns The first matching RouteMatch, or null when no route matches.
   */
  resolve(url: string): RouteMatch | null;

  /**
   * Resolve a URL and load the corresponding remote module.
   *
   * When the primary module load fails and a fallback is configured,
   * the fallback module is loaded instead.
   *
   * @param url - URL to match and load.
   * @returns Loaded route details including exports.
   * @throws When no route matches or all load attempts fail.
   */
  loadRoute(url: string): Promise<LoadedRoute>;

  /**
   * Return a snapshot of all registered routes.
   */
  getRoutes(): FederatedRouteConfig[];

  /**
   * Generate a RouteManifest from the currently registered routes.
   */
  generateManifest(): RouteManifest;
}

// ─── Pattern matching helpers ─────────────────────────────────────────────────

/**
 * Convert a route path pattern into a RegExp and an ordered list of
 * parameter names extracted from the pattern.
 *
 * Supported syntax:
 *  - `:name`   — named dynamic segment, matches one path segment ([^/]+)
 *  - `*name`   — catch-all wildcard, matches everything (.*) including slashes
 *
 * @param pattern - Route pattern string (e.g. "/shop/:id", "/docs/*rest").
 * @returns A tuple of [RegExp, string[]] where the array lists param names in order.
 */
function compilePattern(pattern: string): [RegExp, string[]] {
  const paramNames: string[] = [];

  // Escape special regex chars except for our own syntax markers (: and *)
  const regexSource = pattern
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        // Named dynamic segment — matches a single non-slash segment.
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      if (segment.startsWith("*")) {
        // Catch-all segment — matches everything including slashes.
        paramNames.push(segment.slice(1) || "wildcard");
        return "(.*)";
      }
      // Static segment — escape for regex.
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  // Anchor to start; allow optional trailing slash.
  const regex = new RegExp(`^${regexSource}\\/?$`);
  return [regex, paramNames];
}

/**
 * Normalise a URL to its pathname, stripping origin and query string.
 *
 * Handles:
 *  - Absolute URLs: "https://example.com/path?q=1" → "/path"
 *  - Relative paths: "/path?q=1" → "/path"
 *  - Bare paths: "/path" → "/path"
 */
function normalisePath(url: string): string {
  try {
    // Try parsing as absolute URL.
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    // Relative path — strip query string and hash.
    return url.split("?")[0].split("#")[0];
  }
}

// ─── matchRoute ───────────────────────────────────────────────────────────────

/**
 * Match a URL against an ordered list of route configurations.
 *
 * Routes are evaluated in insertion order; the first match wins.
 *
 * @param routes - Ordered list of route configurations to test.
 * @param url    - URL (or pathname) to match.
 * @returns The first RouteMatch, or null when no route matches.
 */
export function matchRoute(
  routes: FederatedRouteConfig[],
  url: string,
): RouteMatch | null {
  const pathname = normalisePath(url);

  for (const route of routes) {
    const [regex, paramNames] = compilePattern(route.path);
    const match = regex.exec(pathname);

    if (match) {
      const params: Record<string, string> = {};
      paramNames.forEach((name, index) => {
        params[name] = match[index + 1] ?? "";
      });

      return { route, params, url };
    }
  }

  return null;
}

// ─── Module loading simulation ────────────────────────────────────────────────

/**
 * Simulate loading a module from a remote configuration.
 *
 * In a real environment this would perform a dynamic import() of the remote
 * entry point. Here we produce a synthetic exports object for testability.
 */
async function loadModuleFromRemote(
  remote: RemoteConfig,
  modulePath: string,
): Promise<Record<string, unknown>> {
  // Validate the module is declared in the remote config.
  if (!remote.modules.includes(modulePath)) {
    throw new Error(
      `Remote "${remote.name}" does not expose module "${modulePath}". ` +
        `Available: ${remote.modules.join(", ")}`,
    );
  }

  // Artificial async boundary mimicking network latency.
  await Promise.resolve();

  const moduleUrl = `${remote.url}/${modulePath.replace(/^\.\//, "")}`;

  return {
    __remote: remote.name,
    __module: modulePath,
    __url: moduleUrl,
    default: null,
  };
}

// ─── RouteManifest helpers ────────────────────────────────────────────────────

/**
 * Serialize a RouteManifest to a JSON string.
 *
 * @param manifest - Manifest object to serialize.
 * @returns Formatted JSON string.
 */
export function serializeManifest(manifest: RouteManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Parse a JSON string back into a RouteManifest.
 *
 * @param json - JSON string produced by serializeManifest.
 * @returns Parsed RouteManifest.
 * @throws When the JSON is malformed or missing required fields.
 */
export function parseManifest(json: string): RouteManifest {
  const parsed = JSON.parse(json) as Partial<RouteManifest>;

  if (!parsed.version || !parsed.generatedAt || !Array.isArray(parsed.routes)) {
    throw new Error(
      "Invalid RouteManifest: missing required fields (version, generatedAt, routes).",
    );
  }

  return parsed as RouteManifest;
}

// ─── createFederatedRouter ────────────────────────────────────────────────────

/**
 * Configuration options for the federated router.
 */
export interface FederatedRouterConfig {
  /**
   * Initial set of routes to register at creation time.
   * Additional routes can be added via addRoute() at any time.
   */
  routes?: FederatedRouteConfig[];
}

/**
 * Create a FederatedRouter that maps URL paths to remote modules.
 *
 * Routes are matched in insertion order (first match wins), supporting:
 *  - Static segments:          "/about"
 *  - Dynamic parameter segments: "/user/:id"
 *  - Catch-all wildcards:       "/docs/*rest"
 *
 * @param config - Optional initial configuration.
 * @returns A FederatedRouter instance.
 *
 * @example
 * const router = createFederatedRouter({
 *   routes: [
 *     {
 *       path: "/shop",
 *       remote: { name: "shop", url: "https://shop.example.com", modules: ["./App"] },
 *       module: "./App",
 *     },
 *   ],
 * });
 *
 * const match = router.resolve("/shop");
 * if (match) {
 *   const loaded = await router.loadRoute("/shop");
 * }
 */
export function createFederatedRouter(config: FederatedRouterConfig = {}): FederatedRouter {
  /** Ordered list of registered routes. */
  const routes: FederatedRouteConfig[] = [];

  // Seed with initial routes if provided.
  if (config.routes) {
    for (const route of config.routes) {
      routes.push(route);
    }
  }

  // ── addRoute ──────────────────────────────────────────────────────────────

  function addRoute(routeConfig: FederatedRouteConfig): void {
    // Prevent duplicate path registrations; last write wins.
    const existingIndex = routes.findIndex((r) => r.path === routeConfig.path);
    if (existingIndex !== -1) {
      routes[existingIndex] = routeConfig;
    } else {
      routes.push(routeConfig);
    }
  }

  // ── removeRoute ───────────────────────────────────────────────────────────

  function removeRoute(path: string): void {
    const index = routes.findIndex((r) => r.path === path);
    if (index !== -1) {
      routes.splice(index, 1);
    }
  }

  // ── resolve ───────────────────────────────────────────────────────────────

  function resolve(url: string): RouteMatch | null {
    return matchRoute(routes, url);
  }

  // ── loadRoute ─────────────────────────────────────────────────────────────

  async function loadRoute(url: string): Promise<LoadedRoute> {
    const match = resolve(url);

    if (!match) {
      throw new Error(`No route matched for URL: "${url}"`);
    }

    const { route } = match;

    // Attempt primary module load.
    try {
      const exports = await loadModuleFromRemote(route.remote, route.module);
      return { match, exports, usedFallback: false };
    } catch (primaryError) {
      // If a fallback is configured, attempt to load it.
      if (route.fallback) {
        try {
          const exports = await loadModuleFromRemote(route.remote, route.fallback);
          return { match, exports, usedFallback: true };
        } catch {
          // Both failed — re-throw the original error.
          throw primaryError;
        }
      }
      throw primaryError;
    }
  }

  // ── getRoutes ─────────────────────────────────────────────────────────────

  function getRoutes(): FederatedRouteConfig[] {
    return [...routes];
  }

  // ── generateManifest ──────────────────────────────────────────────────────

  function generateManifest(): RouteManifest {
    return {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      routes: routes.map((r) => ({
        path: r.path,
        remote: r.remote.name,
        remoteUrl: r.remote.url,
        module: r.module,
        ...(r.fallback ? { fallback: r.fallback } : {}),
      })),
    };
  }

  return { addRoute, removeRoute, resolve, loadRoute, getRoutes, generateManifest };
}
