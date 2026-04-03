/**
 * SSG — build-time prerendering.
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

import type { RouteDefinition } from "../types.js";
import { renderToString } from "../ssr/renderer.js";
import { resolveRoute } from "../router/resolver.js";
import { renderHtmlShell } from "../ssr/html.js";
import { determineRenderMode } from "./paths.js";

export interface PrerenderOptions {
  /** Route tree */
  routes: RouteDefinition;
  /** Output directory (default: "dist") */
  outDir: string;
  /** Render component to HTML */
  renderComponent: (filePath: string, props?: Record<string, unknown>) => Promise<string>;
  /** Get static paths for dynamic routes */
  getStaticPaths?: (pattern: string) => Promise<string[][]>;
  /** Optional script content reader for render mode detection */
  getScriptContent?: (filePath: string) => Promise<string>;
}

export interface PrerenderResult {
  files: PrerenderFile[];
  /** SSR-only routes that were skipped */
  skipped: string[];
}

export interface PrerenderFile {
  url: string;
  /** e.g., "dist/about/index.html" */
  outputPath: string;
  html: string;
}

/**
 * Convert a URL path to an output file path under outDir.
 *
 * "/"       → "dist/index.html"
 * "/about"  → "dist/about/index.html"
 * "/blog/hello" → "dist/blog/hello/index.html"
 */
function urlToOutputPath(url: string, outDir: string): string {
  const clean = url.replace(/^\//, "").replace(/\/$/, "");
  if (clean === "") {
    return join(outDir, "index.html");
  }
  return join(outDir, clean, "index.html");
}

/**
 * Collect all routes (recursively) from the route tree.
 */
function collectAllRoutes(tree: RouteDefinition): RouteDefinition[] {
  const routes: RouteDefinition[] = [tree];
  for (const child of tree.children) {
    routes.push(...collectAllRoutes(child));
  }
  return routes;
}

/**
 * Generate a minimal CSR HTML shell — just the document structure with script
 * placeholders. No server-rendered content.
 */
function csrShell(): string {
  return renderHtmlShell({ body: '<div id="app"></div>' });
}

/**
 * Main prerender function. Walks all routes, determines render mode, and
 * produces HTML files for SSG/CSR routes.
 */
export async function prerender(options: PrerenderOptions): Promise<PrerenderResult> {
  const {
    routes: routeTree,
    outDir,
    renderComponent,
    getStaticPaths,
    getScriptContent,
  } = options;

  const files: PrerenderFile[] = [];
  const skipped: string[] = [];

  const allRoutes = collectAllRoutes(routeTree);

  for (const route of allRoutes) {
    // Read script content if a reader and page path are available
    let scriptContent: string | undefined;
    if (getScriptContent && route.page) {
      try {
        scriptContent = await getScriptContent(route.page);
      } catch {
        // ignore read errors
      }
    }

    const mode = determineRenderMode(route, scriptContent);

    const hasDynamicSegment = route.segments.some(
      (s) => s.type === "dynamic" || s.type === "catch-all"
    );

    if (mode === "ssr") {
      skipped.push(route.pattern);
      continue;
    }

    // Expand dynamic routes via getStaticPaths
    const urlsToRender: Array<{ url: string; params: Record<string, string> }> = [];

    if (hasDynamicSegment) {
      if (!getStaticPaths) continue; // can't expand without getStaticPaths
      const combos = await getStaticPaths(route.pattern);
      for (const combo of combos) {
        const params = buildParams(route, combo);
        const url = buildUrl(route.pattern, params);
        urlsToRender.push({ url, params });
      }
    } else {
      const url = route.pattern === "" ? "/" : route.pattern;
      urlsToRender.push({ url, params: {} });
    }

    for (const { url } of urlsToRender) {
      const outputPath = urlToOutputPath(url, outDir);
      let html: string;

      if (mode === "csr") {
        html = csrShell();
      } else {
        // SSG — render to full HTML
        const resolved = resolveRoute(url, routeTree);
        if (resolved === null) {
          // Fallback: render page directly without layout resolution
          const pageHtml = route.page ? await renderComponent(route.page) : "";
          html = renderHtmlShell({ body: pageHtml });
        } else {
          const result = await renderToString({ route: resolved, renderComponent });
          html = result.html;
        }
      }

      files.push({ url, outputPath, html });

      // Write file to disk
      const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
      await mkdir(dir, { recursive: true });
      await writeFile(outputPath, html, "utf-8");
    }
  }

  return { files, skipped };
}

// ---------------------------------------------------------------------------
// Helpers (duplicated from paths.ts to keep modules self-contained)
// ---------------------------------------------------------------------------

function buildParams(
  route: RouteDefinition,
  values: string[]
): Record<string, string> {
  const dynamicSegs = route.segments.filter(
    (s) => s.type === "dynamic" || s.type === "catch-all"
  );
  const params: Record<string, string> = {};
  dynamicSegs.forEach((seg, i) => {
    if (values[i] !== undefined) {
      params[seg.value] = values[i];
    }
  });
  return params;
}

function buildUrl(pattern: string, params: Record<string, string>): string {
  let url = pattern;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`[${key}]`, value).replace(`[...${key}]`, value);
  }
  return url;
}
