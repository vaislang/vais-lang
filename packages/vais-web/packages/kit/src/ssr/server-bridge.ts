/**
 * SSR Server Bridge — HTTP interface between vais-server (Vais) and vais-web (Node.js)
 *
 * Architecture:
 *   vais-server (Vais binary, port 8080)
 *     ↓ HTTP POST /ssr/render
 *   vais-web SSR service (Node.js, port 3001)
 *     ↓ renderToString()
 *   HTML response
 *     ↓
 *   vais-server forwards to client
 *
 * Protocol:
 *   Request:  POST /ssr/render { route, props, head }
 *   Response: { html, status, headers }
 *
 * Usage from vais-server:
 *   1. Start SSR service: `node ssr-service.js` (port 3001)
 *   2. vais-server sends HTTP POST to localhost:3001/ssr/render
 *   3. Response body is the rendered HTML
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { renderToString } from "./renderer.js";

// ---------------------------------------------------------------------------
// SSR Render Request / Response types (wire protocol)
// ---------------------------------------------------------------------------

/** Incoming render request from vais-server */
export interface SsrRenderRequest {
  /** Route path to render, e.g. "/blog/hello" */
  route: string;
  /** Props/data to pass to the page component */
  props?: Record<string, unknown>;
  /** Additional <head> content */
  head?: string;
  /** Scripts to inject */
  scripts?: string[];
  /** Styles to inject */
  styles?: string[];
}

/** Response sent back to vais-server */
export interface SsrRenderResponse {
  /** Full rendered HTML document */
  html: string;
  /** HTTP status code (200, 404, etc.) */
  status: number;
  /** Response headers to set */
  headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// SSR Service configuration
// ---------------------------------------------------------------------------

export interface SsrServiceConfig {
  /** Port for the SSR service (default: 3001) */
  port?: number;
  /** Host to bind (default: "127.0.0.1") */
  host?: string;
  /** Component renderer function — resolves file path to HTML */
  renderComponent: (
    filePath: string,
    props?: Record<string, unknown>
  ) => Promise<string>;
  /** Route resolver — maps URL path to resolved route */
  resolveRoute: (path: string) => Promise<{
    page: string;
    layoutChain: string[];
    params: Record<string, string>;
  } | null>;
}

export interface SsrServiceHandle {
  /** Bound host */
  host: string;
  /** Bound port. When config.port is 0, this is the OS-assigned port. */
  port: number;
  /** Base URL for the running SSR service */
  url: string;
  /** Stop accepting render requests and release the listener. */
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// SSR Service — creates an HTTP server that handles render requests
// ---------------------------------------------------------------------------

/**
 * Create and start the SSR render service.
 *
 * This service is meant to run alongside vais-server:
 * - vais-server handles API routes and static files
 * - SSR service handles server-side rendering of .vaisx pages
 *
 * @example
 * ```ts
 * const service = await createSsrService({
 *   port: 3001,
 *   host: "127.0.0.1",
 *   renderComponent: async (path, props) => { ... },
 *   resolveRoute: async (path) => { ... },
 * });
 * await service.close();
 * ```
 */
export async function createSsrService(
  config: SsrServiceConfig
): Promise<SsrServiceHandle> {
  const { port = 3001, host = "127.0.0.1", renderComponent, resolveRoute } =
    config;
  let serviceUrl = `http://${host}:${port}`;

  const server = http.createServer(async (req, res) => {
    // Only accept POST /ssr/render
    if (req.method !== "POST" || req.url !== "/ssr/render") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    try {
      // Read request body
      const body = await readBody(req);
      const request: SsrRenderRequest = JSON.parse(body);

      // Resolve route
      const resolved = await resolveRoute(request.route);
      if (!resolved) {
        const response: SsrRenderResponse = {
          html: "<h1>404 Not Found</h1>",
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }

      // Render to string
      const renderComponentWithProps = (filePath: string) =>
        renderComponent(filePath, request.props);
      const result = await renderToString({
        route: {
          route: {
            pattern: request.route,
            segments: [],
            page: resolved.page,
            middleware: [],
            children: [],
          },
          layoutChain: resolved.layoutChain,
          params: resolved.params,
          errorBoundary: null,
          loading: null,
          middlewareChain: [],
        },
        renderComponent: renderComponentWithProps,
        head: request.head,
        scripts: request.scripts,
        styles: request.styles,
      });

      const response: SsrRenderResponse = {
        html: result.html,
        status: result.status ?? 200,
        headers: result.headers ?? {
          "content-type": "text/html; charset=utf-8",
        },
      };

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const response: SsrRenderResponse = {
        html: `<h1>500 Internal Server Error</h1><p>${message}</p>`,
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address() as AddressInfo | null;
      const actualPort = address?.port ?? port;
      serviceUrl = `http://${host}:${actualPort}`;
      console.log(`[vaisx-ssr] SSR service listening on ${serviceUrl}`);
      resolve({
        host,
        port: actualPort,
        url: serviceUrl,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) {
                rejectClose(err);
                return;
              }
              resolveClose();
            });
          }),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
