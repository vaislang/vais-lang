import type { RouteDefinition, RouteMatch } from "../types.js";

/**
 * Find the closest error.vaisx ancestor (or self) for the matched route.
 *
 * Strategy: walk from root to matched route collecting the path of nodes,
 * then scan from matched route upward (nearest first) for an error file.
 * Returns the path string of the closest error.vaisx, or null if none found.
 */
export function resolveErrorBoundary(
  tree: RouteDefinition,
  match: RouteMatch
): string | null {
  // Build the ancestor path from root to the matched route
  const path = _findPath(tree, match.route);
  if (path === null) {
    return null;
  }

  // Walk from matched route upward (nearest first) looking for error.vaisx
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].error) {
      return path[i].error!;
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
