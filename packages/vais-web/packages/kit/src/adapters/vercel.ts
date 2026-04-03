import type { Adapter, RouteManifest, AdapterConfig, AdapterBuildResult, RouteDefinition } from "../types.js";

/**
 * Vercel Build Output API v3 config structure.
 */
export interface VercelConfig {
  version: 3;
  routes: VercelRoute[];
}

export interface VercelRoute {
  src: string;     // regex pattern
  dest: string;    // handler path
  methods?: string[];
}

/**
 * Convert a route pattern like /blog/[slug] to a regex string.
 */
function patternToRegex(pattern: string): string {
  // Escape special regex chars (except brackets which we handle specially)
  const escaped = pattern
    .replace(/[.+?^${}()|\\]/g, "\\$&")
    .replace(/\[([^\]]+)\]/g, "([^/]+)");
  return `^${escaped}$`;
}

/**
 * Check if a route is an SSR (server-side) route.
 * Routes with apiRoute are always SSR; routes without page are API-only.
 */
function isSSRRoute(route: RouteDefinition): boolean {
  return Boolean(route.apiRoute) || Boolean(route.page);
}

/**
 * Generate the Vercel config.json content for Build Output API v3.
 */
export function generateVercelConfig(manifest: RouteManifest): VercelConfig {
  const routes: VercelRoute[] = [];

  for (const route of manifest.routes) {
    const src = patternToRegex(route.pattern);

    if (route.apiRoute) {
      // API routes → serverless function
      const fnName = route.pattern.replace(/^\//, "").replace(/\//g, "-") || "index";
      routes.push({
        src,
        dest: `/functions/${fnName}.func`,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      });
    } else if (route.page) {
      // Check for dynamic segments
      const hasDynamic = route.segments.some(
        (s) => s.type === "dynamic" || s.type === "catch-all"
      );

      if (hasDynamic) {
        // Dynamic routes → serverless function (SSR)
        const fnName = route.pattern.replace(/^\//, "").replace(/\//g, "-") || "index";
        routes.push({
          src,
          dest: `/functions/${fnName}.func`,
        });
      } else {
        // Static routes → static file
        const staticPath =
          route.pattern === "/"
            ? "/static/index.html"
            : `/static${route.pattern}/index.html`;
        routes.push({
          src,
          dest: staticPath,
        });
      }
    }
  }

  return {
    version: 3,
    routes,
  };
}

/**
 * Generate JS code for a Vercel serverless handler function.
 */
export function generateServerlessFunction(routePattern: string): string {
  return `// Vercel serverless function for route: ${routePattern}
export default function handler(req, res) {
  const url = req.url || "/";
  const method = req.method || "GET";

  // Set response headers
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  // Handle the request for route: ${routePattern}
  res.statusCode = 200;
  res.end(\`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/client.js"></script>
</body>
</html>\`);
}
`;
}

/**
 * Create the Vercel adapter.
 * Generates .vercel/output/ directory structure (Build Output API v3).
 */
export function createVercelAdapter(): Adapter {
  return {
    name: "vercel",

    async build(
      manifest: RouteManifest,
      _config: AdapterConfig
    ): Promise<AdapterBuildResult> {
      const outputDir = ".vercel/output";
      const files: string[] = [];
      const generatedFiles: Record<string, string> = {};

      // Generate static file entries for static routes
      for (const route of manifest.routes) {
        if (route.page) {
          const hasDynamic = route.segments.some(
            (s) => s.type === "dynamic" || s.type === "catch-all"
          );

          if (!hasDynamic && !route.apiRoute) {
            const filePath =
              route.pattern === "/"
                ? `${outputDir}/static/index.html`
                : `${outputDir}/static${route.pattern}/index.html`;
            files.push(filePath);
            generatedFiles[filePath] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/client.js"></script>
</body>
</html>
`;
          }
        }
      }

      // Generate serverless function entries for SSR/API routes
      for (const route of manifest.routes) {
        const hasDynamic = route.segments.some(
          (s) => s.type === "dynamic" || s.type === "catch-all"
        );

        if (route.apiRoute || (route.page && hasDynamic)) {
          const fnName =
            route.pattern.replace(/^\//, "").replace(/\//g, "-") || "index";
          const fnDir = `${outputDir}/functions/${fnName}.func`;
          const fnFile = `${fnDir}/index.js`;
          files.push(fnFile);
          generatedFiles[fnFile] = generateServerlessFunction(route.pattern);
        }
      }

      // Generate config.json
      const vercelConfig = generateVercelConfig(manifest);
      const configPath = `${outputDir}/config.json`;
      const configContent = JSON.stringify(vercelConfig, null, 2);
      files.push(configPath);
      generatedFiles[configPath] = configContent;

      const result: AdapterBuildResult & {
        generatedFiles?: Record<string, string>;
        vercelConfig?: VercelConfig;
      } = {
        outputDir,
        files,
        generatedFiles,
        vercelConfig,
      };

      return result;
    },
  };
}
