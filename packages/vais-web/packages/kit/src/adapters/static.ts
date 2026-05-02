import type {
  Adapter,
  RouteManifest,
  AdapterConfig,
  AdapterBuildResult,
  RouteDefinition,
  ClientBundleConfig,
} from "../types.js";
import { generateClientBundle } from "../client/bundle.js";

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
function generateHtmlPage(
  pattern: string,
  clientScriptPath = "/client.js",
  modulePreloads: string[] = []
): string {
  const title = pattern === "/" ? "Home" : pattern.replace(/^\//, "").replace(/\//g, " / ");
  const preloadLinks = generateModulePreloads(modulePreloads);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
${preloadLinks}
</head>
<body>
  <div id="app"></div>
  <script type="module" src="${clientScriptPath}"></script>
</body>
</html>
`;
}

/**
 * Generate a fallback/404 HTML page.
 */
function generateFallbackPage(
  fallbackName: string,
  clientScriptPath = "/client.js",
  modulePreloads: string[] = []
): string {
  const is404 = fallbackName === "404.html";
  const preloadLinks = generateModulePreloads(modulePreloads);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${is404 ? "404 - Page Not Found" : "App"}</title>
${preloadLinks}
</head>
<body>
  <div id="app">${is404 ? "<h1>404 - Page Not Found</h1>" : ""}</div>
  <script type="module" src="${clientScriptPath}"></script>
</body>
</html>
`;
}

function generateModulePreloads(paths: string[]): string {
  return paths.map((path) => `  <link rel="modulepreload" href="${path}">`).join("\n");
}

function normalizePublicAssetPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("Client bundle asset path cannot be empty.");
  }

  const publicPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = publicPath.replace(/\/+/g, "/");
  const segments = normalized.split("/");
  if (segments.includes("..") || normalized.includes("\\") || normalized.endsWith("/")) {
    throw new Error(`Invalid client bundle asset path: ${path}`);
  }

  return normalized;
}

function copyClientBundleAssets(
  outDir: string,
  bundle: ClientBundleConfig,
  files: string[],
  generatedFiles: Record<string, string>
): { entry: string; modulePreloads: string[] } {
  const entry = normalizePublicAssetPath(bundle.entry);
  const normalizedAssets = new Map<string, string>();

  for (const [path, content] of Object.entries(bundle.assets)) {
    const publicPath = normalizePublicAssetPath(path);
    normalizedAssets.set(publicPath, content);
  }

  if (!normalizedAssets.has(entry)) {
    throw new Error(`Client bundle entry "${entry}" is missing from clientBundle.assets.`);
  }

  for (const [publicPath, content] of normalizedAssets) {
    const filePath = `${outDir}${publicPath}`;
    files.push(filePath);
    generatedFiles[filePath] = content;
  }

  const modulePreloads = (bundle.modulePreloads ?? []).map(normalizePublicAssetPath);
  for (const preload of modulePreloads) {
    if (!normalizedAssets.has(preload)) {
      throw new Error(`Client bundle preload "${preload}" is missing from clientBundle.assets.`);
    }
  }

  return { entry, modulePreloads };
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
      const client = config.clientBundle
        ? copyClientBundleAssets(outDir, config.clientBundle, files, generatedFiles)
        : {
            entry: "/client.js",
            modulePreloads: [],
          };

      // Collect all routes and generate HTML files
      const allRoutes = collectRoutes(manifest.routes);

      for (const route of allRoutes) {
        // Only generate pages for routes that have a page component
        if (route.page) {
          const filePath = `${outDir}/${routePatternToFilePath(route.pattern)}`;
          const html = generateHtmlPage(route.pattern, client.entry, client.modulePreloads);
          files.push(filePath);
          generatedFiles[filePath] = html;
        }
      }

      // Generate fallback page
      const fallbackPath = `${outDir}/${fallback}`;
      const fallbackHtml = generateFallbackPage(fallback, client.entry, client.modulePreloads);
      files.push(fallbackPath);
      generatedFiles[fallbackPath] = fallbackHtml;

      if (!config.clientBundle) {
        // Add the standalone client-side hydration bootstrap.
        const clientJsPath = `${outDir}/client.js`;
        files.push(clientJsPath);
        generatedFiles[clientJsPath] = generateClientBundle();
      }

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
