import type { RouteDefinition, RouteMatch } from "../types.js";

/**
 * Find the closest loading.vaisx ancestor (or self) for the matched route.
 *
 * Walk from matched route upward to root, return the first loading.vaisx found.
 * Returns null if none found.
 */
export function resolveLoading(
  tree: RouteDefinition,
  match: RouteMatch
): string | null {
  // Build the ancestor path from root to the matched route
  const path = _findPath(tree, match.route);
  if (path === null) {
    return null;
  }

  // Walk from matched route upward (nearest first) looking for loading.vaisx
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].loading) {
      return path[i].loading!;
    }
  }

  return null;
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
