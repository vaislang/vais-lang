import type { Adapter, RouteManifest, AdapterConfig, AdapterBuildResult, RouteDefinition } from "../types.js";

/**
 * Check if a route is SSG-compatible (no server-only functions).
 * Routes with API routes are considered server-only.
 */
function isSSGCompatible(route: RouteDefinition): boolean {
  // API routes are server-side only, not SSG-compatible
  if (route.apiRoute) {
    return false;
  }
  // Check children recursively
  for (const child of route.children) {
    if (!isSSGCompatible(child)) {
      return false;
    }
  }
  return true;
}

/**
 * Convert a route pattern to a file path for static output.
 * e.g. "/" -> "index.html", "/about" -> "about/index.html"
 */
function routePatternToFilePath(pattern: string): string {
  if (pattern === "/") {
    return "index.html";
  }
  // Remove leading slash and add /index.html
  const normalized = pattern.replace(/^\//, "").replace(/\/$/, "");
  // Dynamic segments cannot be pre-rendered statically as-is
  // They produce a parameterized path placeholder
  return `${normalized}/index.html`;
}

/**
 * Generate a minimal HTML page for a route.
 */
function generateHtmlPage(pattern: string): string {
  const title = pattern === "/" ? "Home" : pattern.replace(/^\//, "").replace(/\//g, " / ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/client.js"></script>
</body>
</html>
`;
}

/**
 * Generate a fallback/404 HTML page.
 */
function generateFallbackPage(fallbackName: string): string {
  const is404 = fallbackName === "404.html";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${is404 ? "404 - Page Not Found" : "App"}</title>
</head>
<body>
  <div id="app">${is404 ? "<h1>404 - Page Not Found</h1>" : ""}</div>
  <script type="module" src="/client.js"></script>
</body>
</html>
`;
}

/**
 * Collect all routes (including children) into a flat list.
 */
function collectRoutes(routes: RouteDefinition[]): RouteDefinition[] {
  const result: RouteDefinition[] = [];
  for (const route of routes) {
    result.push(route);
    if (route.children.length > 0) {
      result.push(...collectRoutes(route.children));
    }
  }
  return result;
}

/**
 * Create the static site adapter.
 */
export function createStaticAdapter(): Adapter {
  return {
    name: "static",

    async build(
      manifest: RouteManifest,
      config: AdapterConfig
    ): Promise<AdapterBuildResult> {
      const outDir = "dist";
      const fallback = config.fallback ?? "404.html";

      // Validate all routes are SSG-compatible
      for (const route of manifest.routes) {
        if (!isSSGCompatible(route)) {
          throw new Error(
            `Route "${route.pattern}" is not SSG-compatible: contains server-only functions (apiRoute). ` +
            `Use the node adapter for routes with server functions.`
          );
        }
      }

      const files: string[] = [];
      const generatedFiles: Record<string, string> = {};

      // Collect all routes and generate HTML files
      const allRoutes = collectRoutes(manifest.routes);

      for (const route of allRoutes) {
        // Only generate pages for routes that have a page component
        if (route.page) {
          const filePath = `${outDir}/${routePatternToFilePath(route.pattern)}`;
          const html = generateHtmlPage(route.pattern);
          files.push(filePath);
          generatedFiles[filePath] = html;
        }
      }

      // Generate fallback page
      const fallbackPath = `${outDir}/${fallback}`;
      const fallbackHtml = generateFallbackPage(fallback);
      files.push(fallbackPath);
      generatedFiles[fallbackPath] = fallbackHtml;

      // Add client-side assets placeholder
      const clientJsPath = `${outDir}/client.js`;
      files.push(clientJsPath);
      generatedFiles[clientJsPath] = "// Client-side bundle placeholder\n";

      const result: AdapterBuildResult & {
        generatedFiles?: Record<string, string>;
        fallbackPage?: string;
      } = {
        outputDir: outDir,
        files,
        generatedFiles,
        fallbackPage: fallbackPath,
      };

      return result;
    },
  };
}
