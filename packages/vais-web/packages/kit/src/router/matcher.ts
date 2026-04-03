import type { RouteDefinition, RouteMatch, RouteParams } from "../types.js";

/**
 * Split a URL path into non-empty segments.
 * e.g. "/blog/hello" → ["blog", "hello"]
 *      "/"           → []
 */
function splitPath(url: string): string[] {
  // Strip query string / hash
  const path = url.split("?")[0].split("#")[0];
  return path.split("/").filter((s) => s.length > 0);
}

/**
 * Attempt to match a list of URL path segments against a RouteDefinition node.
 * Returns { params } on success, or null on failure.
 *
 * Priority: static > dynamic > catch-all
 */
interface MatchResult {
  params: RouteParams;
  layoutChain: string[];
}

function matchSegments(
  urlSegments: string[],
  node: RouteDefinition,
  parentLayouts: string[]
): MatchResult | null {
  // Build layout chain for this node
  const layoutChain = node.layout
    ? [...parentLayouts, node.layout]
    : [...parentLayouts];

  // The URL segments that this node is responsible for (non-group segments)
  const nodeSegs = node.segments.filter((s) => s.type !== "group");

  // If the node has no URL segments (root), start matching children directly
  if (nodeSegs.length === 0 && node.segments.length === 0) {
    // Root node — match against root page or recurse into children
    if (urlSegments.length === 0) {
      return { params: {}, layoutChain };
    }
    // Try to match children
    return matchChildren(urlSegments, node, layoutChain, {});
  }

  // This node has segments — they should line up with the start of urlSegments
  const params: RouteParams = {};
  let urlIdx = 0;

  for (const seg of nodeSegs) {
    if (seg.type === "catch-all") {
      // Catch-all consumes the rest of the URL
      params[seg.value] = urlSegments.slice(urlIdx);
      urlIdx = urlSegments.length;
      break;
    }
    if (urlIdx >= urlSegments.length) {
      return null; // Not enough URL segments
    }
    if (seg.type === "static") {
      if (urlSegments[urlIdx] !== seg.value) return null;
    } else if (seg.type === "dynamic") {
      params[seg.value] = urlSegments[urlIdx];
    }
    urlIdx++;
  }

  const remaining = urlSegments.slice(urlIdx);

  if (remaining.length === 0) {
    // Exact match
    return { params, layoutChain };
  }

  // Try children with remaining segments
  const childMatch = matchChildren(remaining, node, layoutChain, params);
  return childMatch;
}

function matchChildren(
  urlSegments: string[],
  node: RouteDefinition,
  layoutChain: string[],
  inheritedParams: RouteParams
): MatchResult | null {
  // Sort children: static first, then dynamic, then catch-all
  const sorted = [...node.children].sort((a, b) => {
    const priority = (n: RouteDefinition): number => {
      // Find the "own" segment (last non-group segment)
      const ownSegs = n.segments.filter((s) => s.type !== "group");
      const own = ownSegs[ownSegs.length - 1];
      if (!own) return 1; // root-level group nodes
      if (own.type === "static") return 0;
      if (own.type === "dynamic") return 1;
      if (own.type === "catch-all") return 2;
      return 3; // group — should not appear as own segment after filter
    };
    return priority(a) - priority(b);
  });

  for (const child of sorted) {
    const childSegs = child.segments.filter((s) => s.type !== "group");

    // For group children (0 URL segments), recurse transparently
    if (childSegs.length === 0) {
      // This is a group-only child — pass URL through but inherit layout
      const groupLayouts = child.layout
        ? [...layoutChain, child.layout]
        : layoutChain;
      const result = matchChildren(urlSegments, child, groupLayouts, inheritedParams);
      if (result !== null) return result;
      continue;
    }

    const ownSeg = childSegs[childSegs.length - 1];

    if (ownSeg.type === "catch-all") {
      // Catch-all: grab remaining
      const childLayouts = child.layout
        ? [...layoutChain, child.layout]
        : layoutChain;
      const catchParams: RouteParams = {
        ...inheritedParams,
        [ownSeg.value]: urlSegments,
      };
      return { params: catchParams, layoutChain: childLayouts };
    }

    if (ownSeg.type === "static") {
      if (urlSegments[0] !== ownSeg.value) continue;
    }

    const childResult = matchSegmentsFromChild(
      urlSegments,
      child,
      layoutChain,
      inheritedParams
    );
    if (childResult !== null) return childResult;
  }
  return null;
}

/**
 * Match urlSegments against a child node's own segments.
 * The child's segments array includes ALL ancestor segments, so we need to
 * look at only the "new" segments compared to the parent.
 * We achieve this by looking at the last segment(s) that the child adds.
 */
function matchSegmentsFromChild(
  urlSegments: string[],
  child: RouteDefinition,
  parentLayouts: string[],
  inheritedParams: RouteParams
): MatchResult | null {
  const childLayouts = child.layout
    ? [...parentLayouts, child.layout]
    : [...parentLayouts];

  // Determine the child's own (new) segments (excluding group type)
  const childOwnSegs = child.segments.filter((s) => s.type !== "group");
  // parentOwnSegs length = childOwnSegs.length - 1 (the last segment is new)
  // But we only have urlSegments from the parent's position, so child contributes 1 segment
  const ownSeg = childOwnSegs[childOwnSegs.length - 1];

  if (!ownSeg) return null;

  const params: RouteParams = { ...inheritedParams };
  let consumed = 0;

  if (ownSeg.type === "catch-all") {
    params[ownSeg.value] = urlSegments;
    consumed = urlSegments.length;
  } else if (ownSeg.type === "static") {
    if (urlSegments[0] !== ownSeg.value) return null;
    consumed = 1;
  } else if (ownSeg.type === "dynamic") {
    if (urlSegments.length === 0) return null;
    params[ownSeg.value] = urlSegments[0];
    consumed = 1;
  }

  const remaining = urlSegments.slice(consumed);

  if (remaining.length === 0) {
    return { params, layoutChain: childLayouts };
  }

  // Try grandchildren
  return matchChildren(remaining, child, childLayouts, params);
}

/**
 * Match a URL against the route tree.
 * Returns a RouteMatch (including params and layoutChain) or null if no match.
 */
export function matchRoute(
  url: string,
  tree: RouteDefinition
): RouteMatch | null {
  const urlSegments = splitPath(url);
  const parentLayouts: string[] = [];

  // Root-level match
  const rootLayouts = tree.layout ? [tree.layout] : [];

  if (urlSegments.length === 0) {
    // "/" → root
    return {
      route: tree,
      params: {},
      layoutChain: rootLayouts,
    };
  }

  // Try children of root
  const sorted = [...tree.children].sort((a, b) => {
    const priority = (n: RouteDefinition): number => {
      const ownSegs = n.segments.filter((s) => s.type !== "group");
      const own = ownSegs[ownSegs.length - 1];
      if (!own) return 1;
      if (own.type === "static") return 0;
      if (own.type === "dynamic") return 1;
      if (own.type === "catch-all") return 2;
      return 3;
    };
    return priority(a) - priority(b);
  });

  for (const child of sorted) {
    const childOwnSegs = child.segments.filter((s) => s.type !== "group");

    // Group node — pass through transparently
    if (childOwnSegs.length === 0) {
      const groupLayouts = child.layout
        ? [...rootLayouts, child.layout]
        : rootLayouts;
      const result = matchChildren(urlSegments, child, groupLayouts, {});
      if (result !== null) {
        // Find the actual matched route definition
        const matchedRoute = findMatchedRoute(urlSegments, child);
        if (matchedRoute) {
          return {
            route: matchedRoute,
            params: result.params,
            layoutChain: result.layoutChain,
          };
        }
      }
      continue;
    }

    const result = matchSegmentsFromChild(
      urlSegments,
      child,
      rootLayouts,
      {}
    );
    if (result !== null) {
      const matchedRoute = findMatchedRoute(urlSegments, child);
      if (matchedRoute) {
        return {
          route: matchedRoute,
          params: result.params,
          layoutChain: result.layoutChain,
        };
      }
    }
  }

  return null;
}

/**
 * Find the most specific RouteDefinition node that matches the URL segments.
 */
function findMatchedRoute(
  urlSegments: string[],
  node: RouteDefinition
): RouteDefinition | null {
  const nodeOwnSegs = node.segments.filter((s) => s.type !== "group");
  const ownSeg = nodeOwnSegs[nodeOwnSegs.length - 1];

  if (!ownSeg) {
    // Group node — look inside children
    for (const child of node.children) {
      const result = findMatchedRoute(urlSegments, child);
      if (result) return result;
    }
    return null;
  }

  if (ownSeg.type === "catch-all") {
    return node;
  }

  let match = false;
  if (ownSeg.type === "static") match = urlSegments[0] === ownSeg.value;
  else if (ownSeg.type === "dynamic") match = urlSegments.length > 0;

  if (!match) return null;

  const remaining = urlSegments.slice(1);
  if (remaining.length === 0) return node;

  // Try children
  const sorted = [...node.children].sort((a, b) => {
    const priority = (n: RouteDefinition): number => {
      const segs = n.segments.filter((s) => s.type !== "group");
      const own = segs[segs.length - 1];
      if (!own) return 1;
      if (own.type === "static") return 0;
      if (own.type === "dynamic") return 1;
      if (own.type === "catch-all") return 2;
      return 3;
    };
    return priority(a) - priority(b);
  });

  for (const child of sorted) {
    const found = findMatchedRoute(remaining, child);
    if (found) return found;
  }

  return null;
}
