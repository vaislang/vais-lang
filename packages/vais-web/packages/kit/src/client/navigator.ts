import type { RouteDefinition, RouteParams } from "../types.js";
import { matchRoute } from "../router/matcher.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedRoute {
  route: RouteDefinition;
  params: RouteParams;
  layoutChain: string[];
  errorBoundary: string | null;
  loading: string | null;
  middlewareChain: string[];
}

export interface RouterOptions {
  /** Route manifest for resolving routes */
  routes: RouteDefinition;
  /** Callback when route changes */
  onNavigate: (resolved: ResolvedRoute) => void | Promise<void>;
  /** Base path (default: "/") */
  base?: string;
}

export interface NavigateOptions {
  /** Replace current history entry instead of push */
  replace?: boolean;
  /** Scroll to top after navigation (default: true) */
  scroll?: boolean;
  /** State to store in history */
  state?: unknown;
}

export interface Router {
  /** Navigate to a URL */
  navigate(url: string, options?: NavigateOptions): Promise<void>;
  /** Go back */
  back(): void;
  /** Go forward */
  forward(): void;
  /** Get current route */
  getCurrentRoute(): ResolvedRoute | null;
  /** Start listening to popstate events */
  start(): void;
  /** Stop listening */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRoute(
  url: string,
  routes: RouteDefinition
): ResolvedRoute | null {
  const match = matchRoute(url, routes);
  if (!match) return null;

  return {
    route: match.route,
    params: match.params,
    layoutChain: match.layoutChain,
    errorBoundary: match.route.error ?? null,
    loading: match.route.loading ?? null,
    middlewareChain: match.route.middleware ?? [],
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRouter(options: RouterOptions): Router {
  const { routes, onNavigate, base = "/" } = options;

  let currentRoute: ResolvedRoute | null = null;
  let popstateHandler: ((event: PopStateEvent) => void) | null = null;

  function normalizePath(url: string): string {
    // Strip base prefix if present and not just "/"
    if (base !== "/" && url.startsWith(base)) {
      return url.slice(base.length) || "/";
    }
    return url;
  }

  async function handleNavigation(url: string): Promise<void> {
    const path = normalizePath(url.split("?")[0].split("#")[0]) || "/";
    const resolved = resolveRoute(path, routes);
    currentRoute = resolved;
    if (resolved) {
      await onNavigate(resolved);
    }
  }

  const router: Router = {
    async navigate(url: string, opts: NavigateOptions = {}): Promise<void> {
      if (typeof window === "undefined") return;

      const { replace = false, scroll = true, state = null } = opts;

      if (replace) {
        window.history.replaceState(state, "", url);
      } else {
        window.history.pushState(state, "", url);
      }

      await handleNavigation(url);

      if (scroll) {
        window.scrollTo(0, 0);
      }
    },

    back(): void {
      if (typeof window !== "undefined") {
        window.history.back();
      }
    },

    forward(): void {
      if (typeof window !== "undefined") {
        window.history.forward();
      }
    },

    getCurrentRoute(): ResolvedRoute | null {
      return currentRoute;
    },

    start(): void {
      if (typeof window === "undefined") return;

      popstateHandler = (_event: PopStateEvent) => {
        void handleNavigation(window.location.pathname + window.location.search);
      };
      window.addEventListener("popstate", popstateHandler);

      // Resolve current URL on start
      void handleNavigation(window.location.pathname + window.location.search);
    },

    destroy(): void {
      if (typeof window === "undefined") return;

      if (popstateHandler) {
        window.removeEventListener("popstate", popstateHandler);
        popstateHandler = null;
      }
    },
  };

  return router;
}
