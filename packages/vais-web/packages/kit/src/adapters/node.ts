import type { Adapter, RouteManifest, AdapterConfig, AdapterBuildResult } from "../types.js";
import type { ServerOptions, RequestHandlerOptions } from "./types.js";

/**
 * Generate JS code string for the server entry point.
 * The generated code creates a Node.js HTTP server with route handling
 * and static file serving.
 */
export function generateServerEntry(
  manifest: RouteManifest,
  options: ServerOptions
): string {
  const routes = manifest.routes
    .map((r) => `  { pattern: ${JSON.stringify(r.pattern)} }`)
    .join(",\n");

  return `import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = ${options.port};
const HOST = ${JSON.stringify(options.host)};
const STATIC_DIR = path.resolve(__dirname, ${JSON.stringify(options.staticDir)});
const SERVER_DIR = path.resolve(__dirname, ${JSON.stringify(options.serverDir)});

const routes = [
${routes}
];

function matchRoute(pathname) {
  for (const route of routes) {
    const pattern = route.pattern;
    if (pattern === pathname) return route;
    const regexStr = pattern.replace(/\\[([^\\]]+)\\]/g, "([^/]+)");
    const regex = new RegExp("^" + regexStr + "$");
    if (regex.test(pathname)) return route;
  }
  return null;
}

function serveStaticFile(res, filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
      };
      const contentType = contentTypes[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
      return true;
    }
  } catch {
    // file not found or read error
  }
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", \`http://\${HOST}:\${PORT}\`);
  const pathname = url.pathname;

  // Try serving static file first
  const staticFilePath = path.join(STATIC_DIR, pathname);
  if (serveStaticFile(res, staticFilePath)) return;

  // Try index.html for directory requests
  const indexFilePath = path.join(STATIC_DIR, pathname, "index.html");
  if (serveStaticFile(res, indexFilePath)) return;

  // Match against routes
  const route = matchRoute(pathname);
  if (route) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(\`<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>\`);
    return;
  }

  // 404
  const notFoundPath = path.join(STATIC_DIR, "404.html");
  if (serveStaticFile(res, notFoundPath)) return;

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, HOST, () => {
  console.log(\`Server listening on http://\${HOST}:\${PORT}\`);
});
`;
}

/**
 * Create a request handler that converts between Node.js and Web APIs.
 * The returned function handles IncomingMessage/ServerResponse.
 */
export function createRequestHandler(
  _options: RequestHandlerOptions
): (req: { url?: string; method?: string; headers: Record<string, string | string[] | undefined> }, res: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (body?: string | Uint8Array) => void }) => void {
  return (req, res) => {
    const url = req.url || "/";
    const method = req.method || "GET";

    // Convert Node.js IncomingMessage headers to Web API Headers format
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers[key] = Array.isArray(value) ? value.join(", ") : value;
      }
    }

    // Convert to Web Request (for potential SSR use)
    const baseUrl = `http://${headers["host"] || "localhost"}`;
    const _webRequest = new Request(`${baseUrl}${url}`, {
      method,
      headers,
    });

    // For now, send a basic response
    // In a real implementation this would invoke SSR rendering
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!DOCTYPE html><html><head></head><body><div id=\"app\"></div></body></html>");
  };
}

/**
 * Create the Node.js HTTP server adapter.
 */
export function createNodeAdapter(): Adapter {
  return {
    name: "node",

    async build(
      manifest: RouteManifest,
      config: AdapterConfig
    ): Promise<AdapterBuildResult> {
      const port = config.port ?? 3000;
      const host = config.host ?? "0.0.0.0";
      const outDir = "dist";
      const serverDir = `${outDir}/server`;
      const clientDir = `${outDir}/client`;

      const options: ServerOptions = {
        port,
        host,
        staticDir: "../client",
        serverDir: ".",
      };

      // Generate server entry point code
      const serverEntryCode = generateServerEntry(manifest, options);

      // Generate start.js that imports http and creates server
      const startJsCode = `import { createServer } from "http";
import { createRequestHandler } from "./server/index.js";

const PORT = ${port};
const HOST = ${JSON.stringify(host)};

const handler = createRequestHandler({
  staticDir: "./client",
  serverDir: "./server",
});

const server = createServer(handler);

server.listen(PORT, HOST, () => {
  console.log(\`Server started on http://\${HOST}:\${PORT}\`);
});
`;

      const files = [
        `${serverDir}/index.js`,
        `${clientDir}/.gitkeep`,
        `${outDir}/start.js`,
      ];

      // In a real build, we would write these files to disk.
      // For testing purposes, we return the generated file list
      // and make the generated code available via the result.
      const result: AdapterBuildResult & {
        generatedFiles?: Record<string, string>;
      } = {
        outputDir: outDir,
        files,
        generatedFiles: {
          [`${serverDir}/index.js`]: serverEntryCode,
          [`${outDir}/start.js`]: startJsCode,
        },
      };

      return result;
    },
  };
}
