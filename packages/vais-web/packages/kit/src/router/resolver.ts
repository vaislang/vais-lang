import type { RouteDefinition, RouteParams } from "../types.js";
import { matchRoute } from "./matcher.js";
import { resolveLayoutChain } from "./layout.js";
import { resolveErrorBoundary } from "./error-boundary.js";
import { resolveLoading } from "./loading.js";

/**
 * The fully resolved result for a matched route, combining layout chain,
 * error boundary, loading state, and middleware chain.
 */
export interface ResolvedRoute {
  route: RouteDefinition;
  params: RouteParams;
  layoutChain: string[];
  errorBoundary: string | null;
  loading: string | null;
  middlewareChain: string[];
}

/**
 * Collect middleware from root to matched route (parent → child order).
 */
function resolveMiddlewareChain(
  tree: RouteDefinition,
  target: RouteDefinition
): string[] {
  const path = _findPath(tree, target);
  if (path === null) return [];

  const chain: string[] = [];
  for (const node of path) {
    for (const mw of node.middleware) {
      chain.push(mw);
    }
  }
  return chain;
}

/**
 * Find the path of nodes from root to target (inclusive).
 * Returns null if target is not found.
 */
function _findPath(
  node: RouteDefinition,
  target: RouteDefinition
): RouteDefinition[] | null {
  if (node === target) {
    return [node];
  }

  for (const child of node.children) {
    const childPath = _findPath(child, target);
    if (childPath !== null) {
      return [node, ...childPath];
    }
  }

  return null;
}

/**
 * Fully resolve a URL against the route tree.
 *
 * Combines:
 * - matchRoute: finds the matching RouteDefinition and params
 * - resolveLayoutChain: ordered list of layout.vaisx paths (root → nearest)
 * - resolveErrorBoundary: closest error.vaisx ancestor
 * - resolveLoading: closest loading.vaisx ancestor
 * - middlewareChain: all middleware from root to matched route
 *
 * Returns null if no route matches the URL.
 */
export function resolveRoute(
  url: string,
  tree: RouteDefinition
): ResolvedRoute | null {
  const match = matchRoute(url, tree);
  if (match === null) {
    return null;
  }

  const layoutChain = resolveLayoutChain(tree, match);
  const errorBoundary = resolveErrorBoundary(tree, match);
  const loading = resolveLoading(tree, match);
  const middlewareChain = resolveMiddlewareChain(tree, match.route);

  return {
    route: match.route,
    params: match.params,
    layoutChain,
    errorBoundary,
    loading,
    middlewareChain,
  };
}
