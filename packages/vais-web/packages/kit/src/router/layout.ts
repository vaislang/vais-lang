import type { RouteDefinition, RouteMatch } from "../types.js";

/**
 * Walk the route tree from root toward the matched route,
 * collecting layout.vaisx paths in order (root → nearest).
 *
 * The matcher already builds layoutChain during matching, but this function
 * provides a standalone resolution by re-walking the tree.
 *
 * For group routes (segments with type "group"), their layout is included
 * as if it were a real ancestor layout.
 */
export function resolveLayoutChain(
  tree: RouteDefinition,
  match: RouteMatch
): string[] {
  // The matcher already populates layoutChain on RouteMatch — return it.
  // If it is populated, use it directly.
  if (match.layoutChain && match.layoutChain.length > 0) {
    return match.layoutChain;
  }

  // Fallback: walk the tree manually to collect layouts
  const chain: string[] = [];
  _collectLayouts(tree, match.route, chain);
  return chain;
}

/**
 * Recursively walk the tree looking for the target route,
 * accumulating layout files along the path.
 */
function _collectLayouts(
  node: RouteDefinition,
  target: RouteDefinition,
  accumulated: string[]
): boolean {
  // Add this node's layout if it has one
  if (node.layout) {
    accumulated.push(node.layout);
  }

  // Base case: this is the target
  if (node === target) {
    return true;
  }

  // Recurse into children
  for (const child of node.children) {
    const childLayouts: string[] = [...accumulated];
    if (_collectLayouts(child, target, childLayouts)) {
      // Found the target in this subtree — copy results back
      accumulated.length = 0;
      for (const l of childLayouts) accumulated.push(l);
      return true;
    }
  }

  // Not found in this subtree
  return false;
}
