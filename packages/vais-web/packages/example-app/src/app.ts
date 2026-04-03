/**
 * Application entry point with router setup.
 * Simulates a VaisX server-side router that maps URL patterns to page components.
 */

import type { Route, RouteParams, RouteContext, RenderResult } from "./types.js";
import { renderPage, render404 } from "./ssr/render.js";
import { HomePage } from "./pages/home.js";
import { PostPage } from "./pages/post.js";
import { CreatePostPage } from "./pages/create-post.js";
import { AboutPage } from "./pages/about.js";

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Convert a path pattern like "/posts/:id" into a RegExp and extract param names.
 */
function compileRoute(pathPattern: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = pathPattern
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
      paramNames.push(match.slice(1));
      return "([^/]+)";
    })
    .replace(/\//g, "\\/");

  return {
    pattern: new RegExp(`^${regexStr}$`),
    paramNames,
  };
}

export class Router {
  private routes: Array<{
    pathPattern: string;
    pattern: RegExp;
    paramNames: string[];
    route: Route;
  }> = [];

  register(route: Route): this {
    const { pattern: compiledPattern, paramNames } = compileRoute(route.path);
    this.routes.push({
      pathPattern: route.path,
      pattern: compiledPattern,
      paramNames,
      route,
    });
    return this;
  }

  /**
   * Match a URL pathname and return the matching route with extracted params.
   */
  match(
    pathname: string,
  ): { route: Route; params: RouteParams } | null {
    for (const { pattern, paramNames, route } of this.routes) {
      const match = pathname.match(pattern);
      if (match) {
        const params: RouteParams = {};
        paramNames.forEach((name, i) => {
          params[name] = match[i + 1] ?? "";
        });
        return { route, params };
      }
    }
    return null;
  }

  /**
   * Handle a request by matching the path and rendering the appropriate page.
   */
  handle(request: {
    pathname: string;
    query?: Record<string, string>;
    locale?: string;
  }): RenderResult {
    const { pathname, query = {}, locale = "en" } = request;
    const matched = this.match(pathname);

    if (!matched) {
      return render404({ locale, query });
    }

    const context: RouteContext = {
      locale,
      query: { ...query, ...matched.params },
    };

    return renderPage(matched.route.handler, context);
  }
}

// ── Route Definitions ─────────────────────────────────────────────────────────

export function createRouter(): Router {
  const router = new Router();

  router.register({
    path: "/",
    pattern: /^\//,
    handler: HomePage,
  });

  router.register({
    path: "/about",
    pattern: /^\/about$/,
    handler: AboutPage,
  });

  router.register({
    path: "/posts/create",
    pattern: /^\/posts\/create$/,
    handler: CreatePostPage,
  });

  router.register({
    path: "/posts/:postId",
    pattern: /^\/posts\/([^/]+)$/,
    handler: PostPage,
  });

  return router;
}

// ── Application Instance ──────────────────────────────────────────────────────

export interface AppConfig {
  defaultLocale?: string;
  supportedLocales?: string[];
}

export class VaisXApp {
  private router: Router;
  private config: Required<AppConfig>;

  constructor(config: AppConfig = {}) {
    this.config = {
      defaultLocale: config.defaultLocale ?? "en",
      supportedLocales: config.supportedLocales ?? ["en", "ko", "ja"],
    };
    this.router = createRouter();
  }

  get routerInstance(): Router {
    return this.router;
  }

  /**
   * Handle an incoming HTTP-like request.
   */
  handle(request: {
    pathname: string;
    query?: Record<string, string>;
    locale?: string;
  }): RenderResult {
    const locale = this.resolveLocale(request.locale);
    return this.router.handle({ ...request, locale });
  }

  /**
   * Resolve the locale for a request, falling back to the default.
   */
  private resolveLocale(requested?: string): string {
    if (!requested) return this.config.defaultLocale;
    if (this.config.supportedLocales.includes(requested)) return requested;
    return this.config.defaultLocale;
  }
}

// ── Default export ────────────────────────────────────────────────────────────

export const app = new VaisXApp();
