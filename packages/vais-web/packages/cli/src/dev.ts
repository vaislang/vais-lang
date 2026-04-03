/**
 * VaisX dev server.
 *
 * Provides:
 * - HTTP server for serving compiled output + static files
 * - File watcher for .vaisx incremental compilation
 * - WebSocket server for HMR notifications
 * - Auto-injection of HMR client script
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { watch } from "chokidar";
import { WebSocketServer, WebSocket } from "./ws.js";
import type { VaisxConfig } from "./config.js";
import { compileFile } from "./compiler.js";
import type { CompileResult } from "./compiler.js";
import * as logger from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DevServerOptions {
  root: string;
  config: VaisxConfig;
  port: number;
  host: string;
}

export interface DevServer {
  /** The HTTP server instance. */
  httpServer: http.Server;
  /** The WebSocket server for HMR. */
  wss: WebSocketServer;
  /** Stop the server and file watcher. */
  close(): Promise<void>;
  /** The resolved port the server is listening on. */
  port: number;
}

// ---------------------------------------------------------------------------
// HMR client script (injected into HTML)
// ---------------------------------------------------------------------------

function hmrClientScript(port: number): string {
  return `
<script type="module">
(function() {
  const ws = new WebSocket("ws://localhost:${port}/__vaisx_hmr");
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "update") {
      console.log("[vaisx] updating:", msg.file);
      // For now, full reload. HMR module replacement will be added in Phase 4.4.
      location.reload();
    } else if (msg.type === "error") {
      console.error("[vaisx] compile error:", msg.file, msg.error);
    }
  });
  ws.addEventListener("open", () => console.log("[vaisx] dev server connected"));
  ws.addEventListener("close", () => {
    console.log("[vaisx] dev server disconnected, attempting reconnect...");
    setTimeout(() => location.reload(), 1000);
  });
})();
</script>`;
}

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Compile cache
// ---------------------------------------------------------------------------

class CompileCache {
  private cache = new Map<string, { mtime: number; js: string }>();

  get(filePath: string): string | null {
    const entry = this.cache.get(filePath);
    if (!entry) return null;

    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs === entry.mtime) return entry.js;
    } catch {
      // File may have been deleted
    }

    this.cache.delete(filePath);
    return null;
  }

  set(filePath: string, js: string): void {
    try {
      const stat = fs.statSync(filePath);
      this.cache.set(filePath, { mtime: stat.mtimeMs, js });
    } catch {
      // Ignore if file disappeared
    }
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }
}

// ---------------------------------------------------------------------------
// Dev Server
// ---------------------------------------------------------------------------

/**
 * Create and start the VaisX dev server.
 */
export async function createDevServer(
  options: DevServerOptions,
): Promise<DevServer> {
  const { root, config, port, host } = options;
  const srcDir = path.resolve(root, config.srcDir);
  const outDir = path.resolve(root, config.outDir);
  const cache = new CompileCache();

  // Ensure outDir exists
  fs.mkdirSync(outDir, { recursive: true });

  // --- Compile a .vaisx file and cache the result ---
  function compileAndCache(filePath: string): { js: string } | { error: string } {
    const result = compileFile(filePath, {
      sourceMap: true,
      devMode: true,
    });

    if (!result.ok) {
      return { error: result.error };
    }

    const compileResult = result as CompileResult;
    cache.set(filePath, compileResult.js);

    // Write to outDir too
    const relativePath = path.relative(srcDir, filePath);
    const outPath = path.join(outDir, relativePath.replace(/\.vaisx$/, ".js"));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, compileResult.js, "utf-8");

    return { js: compileResult.js };
  }

  // --- WebSocket clients ---
  const wsClients = new Set<WebSocket>();

  function broadcast(data: Record<string, unknown>): void {
    const msg = JSON.stringify(data);
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  // --- HTTP server ---
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    let pathname = decodeURIComponent(url.pathname);

    // Normalize path
    if (pathname === "/") pathname = "/index.html";

    // Serve from outDir first, then from project root (for static assets)
    const candidates = [
      path.join(outDir, pathname),
      path.join(root, "public", pathname),
      path.join(root, pathname),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const content = fs.readFileSync(candidate);
        const mimeType = getMimeType(candidate);
        res.writeHead(200, { "Content-Type": mimeType });

        // Inject HMR script into HTML responses
        if (mimeType.startsWith("text/html")) {
          const html = content.toString("utf-8");
          const injected = html.replace(
            "</body>",
            `${hmrClientScript(port)}\n</body>`,
          );
          res.end(injected);
        } else {
          res.end(content);
        }
        return;
      }
    }

    // SPA fallback: serve index.html for non-file routes
    const indexPath = path.join(outDir, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf-8");
      const injected = html.replace(
        "</body>",
        `${hmrClientScript(port)}\n</body>`,
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(injected);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  });

  // --- WebSocket server (upgrade on /__vaisx_hmr) ---
  const wss = new WebSocketServer(server);

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    ws.on("close", () => wsClients.delete(ws));
  });

  // --- File watcher ---
  const watcher = watch(path.join(srcDir, "**/*.vaisx"), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 },
  });

  watcher.on("change", (filePath) => {
    const relativePath = path.relative(srcDir, filePath);
    logger.info(`File changed: ${relativePath}`);

    cache.invalidate(filePath);
    const result = compileAndCache(filePath);

    if ("error" in result) {
      logger.error(`${relativePath}: ${result.error}`);
      broadcast({ type: "error", file: relativePath, error: result.error });
    } else {
      logger.success(`Recompiled: ${relativePath}`);
      broadcast({ type: "update", file: relativePath });
    }
  });

  watcher.on("add", (filePath) => {
    const relativePath = path.relative(srcDir, filePath);
    logger.info(`File added: ${relativePath}`);
    const result = compileAndCache(filePath);
    if ("error" in result) {
      logger.error(`${relativePath}: ${result.error}`);
    } else {
      logger.success(`Compiled: ${relativePath}`);
      broadcast({ type: "update", file: relativePath });
    }
  });

  watcher.on("unlink", (filePath) => {
    const relativePath = path.relative(srcDir, filePath);
    logger.info(`File removed: ${relativePath}`);
    cache.invalidate(filePath);

    // Remove compiled output
    const outPath = path.join(outDir, relativePath.replace(/\.vaisx$/, ".js"));
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
    }

    broadcast({ type: "remove", file: relativePath });
  });

  // --- Start listening ---
  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  const resolvedPort = typeof addr === "object" && addr ? addr.port : port;

  logger.success(`Dev server running at http://${host}:${resolvedPort}/`);
  logger.info(`Watching ${config.srcDir}/ for changes...`);

  return {
    httpServer: server,
    wss,
    port: resolvedPort,
    async close() {
      await watcher.close();
      for (const client of wsClients) {
        client.close();
      }
      wsClients.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
