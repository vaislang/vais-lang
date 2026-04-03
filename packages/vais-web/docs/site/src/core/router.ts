import type { PageMeta } from "./types.js";

export type RouteHandler = (params: Record<string, string>) => PageMeta;

export interface Route {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];

/**
 * Register a route pattern (e.g. "/guide/:slug") with a handler
 * that returns PageMeta for the matched path.
 */
export function addRoute(pattern: string, handler: RouteHandler): void {
  const paramNames: string[] = [];
  const regexSource = pattern
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_: string, name: string) => {
      paramNames.push(name);
      return "([^/]+)";
    })
    .replace(/\//g, "\\/");

  routes.push({
    pattern: new RegExp(`^${regexSource}$`),
    paramNames,
    handler,
  });
}

/**
 * Match a pathname against registered routes.
 * Returns the PageMeta from the first matching route, or null.
 */
export function matchRoute(pathname: string): PageMeta | null {
  for (const route of routes) {
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      params[name] = match[i + 1] ?? "";
    });
    return route.handler(params);
  }
  return null;
}

/**
 * Register the standard VaisX docs routes.
 */
export function registerDefaultRoutes(): void {
  addRoute("/", () => ({
    title: "VaisX — Token-efficient frontend framework",
    description: "The official documentation for VaisX framework",
    section: "home",
  }));

  addRoute("/guide", () => ({
    title: "Guide — VaisX Docs",
    section: "guide",
  }));

  addRoute("/guide/:slug", ({ slug }) => ({
    title: `${toTitle(slug)} — Guide — VaisX Docs`,
    section: "guide",
  }));

  addRoute("/tutorial", () => ({
    title: "Tutorial — VaisX Docs",
    section: "tutorial",
  }));

  addRoute("/tutorial/:slug", ({ slug }) => ({
    title: `${toTitle(slug)} — Tutorial — VaisX Docs`,
    section: "tutorial",
  }));

  addRoute("/api", () => ({
    title: "API Reference — VaisX Docs",
    section: "api",
  }));

  addRoute("/api/:slug", ({ slug }) => ({
    title: `${toTitle(slug)} — API — VaisX Docs`,
    section: "api",
  }));
}

function toTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
