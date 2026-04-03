import { join } from "node:path";
import type { RouteDefinition, RouteManifest, RouteSegment } from "../types.js";
import { scanAppDir, type ScannedFile } from "./scanner.js";

/**
 * Convert an array of route segments (excluding group segments) into a URL pattern.
 * Group segments `(name)` are skipped because they are not part of the URL.
 */
function segmentsToPattern(segments: RouteSegment[]): string {
  const parts = segments
    .filter((s) => s.type !== "group")
    .map((s) => {
      if (s.type === "dynamic") return `[${s.value}]`;
      if (s.type === "catch-all") return `[...${s.value}]`;
      return s.value;
    });

  if (parts.length === 0) return "/";
  return "/" + parts.join("/");
}

/**
 * Get the node key for a segment in the tree.
 * Group segments use their raw "(name)" form so they remain distinct from
 * static segments but do not contribute to the URL pattern.
 */
function segmentKey(seg: RouteSegment): string {
  if (seg.type === "group") return `(${seg.value})`;
  if (seg.type === "dynamic") return `[${seg.value}]`;
  if (seg.type === "catch-all") return `[...${seg.value}]`;
  return seg.value;
}

interface TreeNode {
  segments: RouteSegment[];
  page?: string;
  layout?: string;
  error?: string;
  loading?: string;
  apiRoute?: string;
  middleware: string[];
  children: Map<string, TreeNode>;
}

function createNode(segments: RouteSegment[]): TreeNode {
  return {
    segments,
    middleware: [],
    children: new Map(),
  };
}

/**
 * Convert a TreeNode (and its children) into a RouteDefinition.
 * Inherits parent middleware down the chain.
 */
function nodeToRouteDefinition(
  node: TreeNode,
  parentMiddleware: string[]
): RouteDefinition {
  const allMiddleware = [...parentMiddleware, ...node.middleware];
  const pattern = segmentsToPattern(node.segments);

  const children: RouteDefinition[] = [];
  for (const child of node.children.values()) {
    children.push(nodeToRouteDefinition(child, allMiddleware));
  }

  return {
    pattern,
    segments: node.segments,
    ...(node.page !== undefined ? { page: node.page } : {}),
    ...(node.layout !== undefined ? { layout: node.layout } : {}),
    ...(node.error !== undefined ? { error: node.error } : {}),
    ...(node.loading !== undefined ? { loading: node.loading } : {}),
    ...(node.apiRoute !== undefined ? { apiRoute: node.apiRoute } : {}),
    middleware: allMiddleware,
    children,
  };
}

/**
 * Build a route tree from the given app directory.
 * Returns the root RouteDefinition which represents "/".
 */
export async function buildRouteTree(appDir: string): Promise<RouteDefinition> {
  const scanned: ScannedFile[] = await scanAppDir(appDir);

  // Root node (represents the "/" route)
  const root: TreeNode = createNode([]);

  for (const file of scanned) {
    // Navigate / create nodes for each segment
    let current = root;
    for (let i = 0; i < file.segments.length; i++) {
      const seg = file.segments[i];
      const key = segmentKey(seg);
      if (!current.children.has(key)) {
        current.children.set(key, createNode(file.segments.slice(0, i + 1)));
      }
      current = current.children.get(key)!;
    }

    // Assign the file to the correct field on the node
    switch (file.fileName) {
      case "page.vaisx":
        current.page = join(appDir, file.relativePath);
        break;
      case "layout.vaisx":
        current.layout = join(appDir, file.relativePath);
        break;
      case "error.vaisx":
        current.error = join(appDir, file.relativePath);
        break;
      case "loading.vaisx":
        current.loading = join(appDir, file.relativePath);
        break;
      case "route.vais":
        current.apiRoute = join(appDir, file.relativePath);
        break;
      case "middleware.vais":
        current.middleware.push(join(appDir, file.relativePath));
        break;
    }
  }

  return nodeToRouteDefinition(root, []);
}

/**
 * Collect all RouteDefinition nodes recursively (flat list).
 */
function collectAllRoutes(tree: RouteDefinition): RouteDefinition[] {
  const result: RouteDefinition[] = [tree];
  for (const child of tree.children) {
    result.push(...collectAllRoutes(child));
  }
  return result;
}

/**
 * Generate a route manifest from a route tree.
 * The manifest contains all route definitions and a modules map
 * (pattern → page/apiRoute path).
 */
export function generateManifest(tree: RouteDefinition): RouteManifest {
  const routes = collectAllRoutes(tree);
  const modules: Record<string, string> = {};

  for (const route of routes) {
    if (route.page !== undefined) {
      modules[route.pattern] = route.page;
    } else if (route.apiRoute !== undefined) {
      modules[route.pattern] = route.apiRoute;
    }
  }

  return { routes, modules };
}
