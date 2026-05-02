import { execFile } from "node:child_process";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";

import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { buildRouteTree, generateManifest } from "../../src/router/tree.js";
import { resolveRoute, type ResolvedRoute } from "../../src/router/resolver.js";
import { prerender } from "../../src/ssg/index.js";
import { createLoadContext, getSetCookieHeaders } from "../../src/server/context.js";
import { executeLoad } from "../../src/server/load.js";
import { handleDataRequest } from "../../src/server/data-endpoint.js";
import { renderHtmlShell } from "../../src/ssr/html.js";
import type {
  ClientBundleConfig,
  LoadFunction,
  PageData,
  RouteDefinition,
  RouteManifest,
} from "../../src/types.js";

const execFileAsync = promisify(execFile);

let activeServer: Server | undefined;
const tempDirs: string[] = [];

function encodedState(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function writeAppFixture(root: string): Promise<string> {
  const appDir = join(root, "app");
  const productDir = join(appDir, "products", "[sku]");
  await mkdir(productDir, { recursive: true });

  await writeFile(
    join(productDir, "page.vaisx"),
    `<script>
export async function load(ctx) {
  return { sku: ctx.params.sku };
}
</script>
<article>Product</article>
`,
    "utf8"
  );

  return appDir;
}

async function writeBundleFixture(root: string): Promise<string> {
  const srcDir = join(root, "src");
  await mkdir(srcDir, { recursive: true });

  await writeFile(
    join(srcDir, "product-chunk.ts"),
    `
export function mountProduct(element: Element, state: { sku?: string; title?: string }, meta: { events: string[] }) {
  const w = window as any;
  const target = element as HTMLElement;
  const sku = typeof state.sku === "string" ? state.sku : "unknown";
  w.__VAISX_PRODUCT_MOUNT__ = {
    state,
    events: meta.events,
    pathname: window.location.pathname,
  };
  const button = target.querySelector("#cart-button");
  if (button) {
    button.textContent = "cart: " + sku;
    button.addEventListener("click", () => {
      button.textContent = "cart: " + sku + ": clicked";
    });
  }
}
`,
    "utf8"
  );

  const entryPath = join(srcDir, "entry.ts");
  await writeFile(
    entryPath,
    `
import("./product-chunk").then(async ({ mountProduct }) => {
  const w = window as any;
  const target = document.querySelector("[data-vx]");
  if (!target) {
    throw new Error("missing hydration target");
  }

  const marker = target.getAttribute("data-vx") || "";
  const [componentId, eventText = ""] = marker.split(":");
  const events = eventText.split(",").map((name) => name.trim()).filter(Boolean);
  const encoded = target.getAttribute("data-vx-state") || "";
  const state = encoded ? JSON.parse(atob(encoded)) : {};

  if (componentId !== "product") {
    throw new Error("unexpected component id: " + componentId);
  }

  mountProduct(target, state, { events });
  target.removeAttribute("data-vx");
  target.removeAttribute("data-vx-state");
  w.__VAISX_HYDRATED__ = ["product"];
  document.dispatchEvent(new CustomEvent("vaisx:hydrated", {
    detail: { components: ["product"] },
  }));

  const dataResponse = await fetch("/__data.json?route=" + encodeURIComponent(window.location.pathname) + "&source=client", {
    headers: { "Accept": "application/json" },
  });
  const dataPayload = await dataResponse.json();
  w.__VAISX_SSR_DATA_APP__ = {
    hydrated: true,
    initialState: state,
    dataEndpoint: {
      status: dataResponse.status,
      data: dataPayload.data,
    },
    entryUrl: import.meta.url,
  };

  const clientData = document.querySelector("#client-data");
  if (clientData && dataPayload.data) {
    clientData.textContent = [
      dataPayload.data.source,
      dataPayload.data.sku,
      dataPayload.data.visit
    ].join(":");
  }
}).catch((error) => {
  (window as any).__VAISX_SSR_DATA_ERROR__ =
    error instanceof Error ? error.message : String(error);
  throw error;
});
`,
    "utf8"
  );

  return entryPath;
}

async function buildProductionClientBundle(root: string): Promise<ClientBundleConfig> {
  const entryPath = await writeBundleFixture(root);
  const assetsDir = join(root, "assets");

  await execFileAsync(
    "pnpm",
    [
      "exec",
      "tsup",
      entryPath,
      "--format",
      "esm",
      "--splitting",
      "--minify",
      "--out-dir",
      assetsDir,
      "--platform",
      "browser",
      "--clean",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NPM_TOKEN: process.env.NPM_TOKEN ?? "codex-local",
      },
    }
  );

  const assetNames = (await readdir(assetsDir))
    .filter((name) => name.endsWith(".js"))
    .sort();
  const chunkNames = assetNames.filter((name) => name !== "entry.js");
  if (!assetNames.includes("entry.js") || chunkNames.length === 0) {
    throw new Error(`tsup emitted an unexpected production bundle: ${assetNames.join(", ")}`);
  }

  const assets: Record<string, string> = {};
  for (const name of assetNames) {
    assets[`/assets/${name}`] = await readFile(join(assetsDir, name), "utf8");
  }

  return {
    entry: "/assets/entry.js",
    assets,
    modulePreloads: chunkNames.map((name) => `/assets/${name}`),
  };
}

const productLoad: LoadFunction = (ctx) => {
  const rawSku = ctx.params.sku;
  const sku = Array.isArray(rawSku) ? rawSku.join("/") : String(rawSku ?? "missing");
  const source = ctx.url.searchParams.get("source") ?? "ssr";
  const visit = ctx.cookies.get("visit") ?? "none";
  ctx.cookies.set("visit", `seen-${sku}`, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });

  return {
    sku,
    title: `Product ${sku}`,
    source,
    visit,
    routePath: ctx.url.pathname,
  };
};

async function renderSsrPage(
  request: Request,
  resolved: ResolvedRoute,
  clientBundle: ClientBundleConfig
): Promise<Response> {
  const context = createLoadContext(request, resolved.params, new URL(request.url));
  const result = await executeLoad({ loadFn: productLoad, context });
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
  });

  for (const cookie of getSetCookieHeaders(context.cookies)) {
    headers.append("set-cookie", cookie);
  }

  if (result.status !== "success") {
    return new Response("SSR load failed", { status: 500, headers });
  }

  const data = result.data ?? {};
  const sku = String(data.sku ?? "");
  const title = String(data.title ?? "");
  const body = `<main id="app">
  <article id="product" data-vx="product:click" data-vx-state="${encodedState(data)}">
    <h1 id="product-title">${escapeHtml(title)}</h1>
    <p id="ssr-data">${escapeHtml(String(data.source))}:${escapeHtml(sku)}:${escapeHtml(String(data.visit))}</p>
    <p id="client-data">pending</p>
    <button id="cart-button">pending</button>
  </article>
</main>`;

  const modulePreloads = (clientBundle.modulePreloads ?? [])
    .map((path) => `<link rel="modulepreload" href="${escapeHtml(path)}">`)
    .join("");

  const html = renderHtmlShell({
    head: `${modulePreloads}<title>${escapeHtml(title)}</title>`,
    body,
    scripts: [clientBundle.entry],
    state: {
      page: data,
    },
  });

  return new Response(html, { status: 200, headers });
}

function sendWebResponse(response: Response, nodeResponse: ServerResponse): void {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  nodeResponse.writeHead(response.status, headers);
  response.text().then((body) => nodeResponse.end(body), (error) => {
    nodeResponse.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    nodeResponse.end(String(error));
  });
}

async function serveSsrApp(
  routeTree: RouteDefinition,
  clientBundle: ClientBundleConfig
): Promise<string> {
  activeServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    const asset = clientBundle.assets[pathname];
    if (asset !== undefined) {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(asset);
      return;
    }

    const routePath = url.searchParams.get("route") ?? pathname;
    const resolved = resolveRoute(routePath, routeTree);
    if (!resolved) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    const webRequest = new Request(`http://127.0.0.1${request.url ?? "/"}`, {
      method: request.method ?? "GET",
      headers,
    });

    if (pathname === "/__data.json") {
      handleDataRequest(webRequest, resolved, productLoad)
        .then((dataResponse) => sendWebResponse(dataResponse, response))
        .catch((error) => {
          response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          response.end(String(error));
        });
      return;
    }

    renderSsrPage(webRequest, resolved, clientBundle)
      .then((ssrResponse) => sendWebResponse(ssrResponse, response))
      .catch((error) => {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end(String(error));
      });
  });

  await new Promise<void>((resolve, reject) => {
    activeServer?.once("error", reject);
    activeServer?.listen(0, "127.0.0.1", () => resolve());
  });

  const address = activeServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("E2E - vais-web SSR data production runtime", () => {
  afterEach(async () => {
    const server = activeServer;
    activeServer = undefined;
    await closeServer(server);

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it("serves an SSR route with load data and production client data refresh", async () => {
    const root = await mkdtemp(join(tmpdir(), "vais-web-ssr-data-prod-"));
    tempDirs.push(root);

    const appDir = await writeAppFixture(root);
    const routeTree = await buildRouteTree(appDir);
    const manifest: RouteManifest = generateManifest(routeTree);
    const clientBundle = await buildProductionClientBundle(root);

    expect(Object.keys(manifest.modules)).toContain("/products/[sku]");

    const prerenderResult = await prerender({
      routes: routeTree,
      outDir: join(root, "dist"),
      renderComponent: async () => "<article>static</article>",
      getScriptContent: async () => "export async function load(ctx) { return {}; }",
    });
    expect(prerenderResult.skipped).toContain("/products/[sku]");

    const baseUrl = await serveSsrApp(routeTree, clientBundle);
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(message.text());
        }
      });
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });

      const response = await page.goto(`${baseUrl}/products/sku-42`, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      expect(await page.textContent("#product-title")).toBe("Product sku-42");
      expect(await page.textContent("#ssr-data")).toBe("ssr:sku-42:none");

      await page.waitForFunction(() => {
        const w = window as typeof window & {
          __VAISX_SSR_DATA_APP__?: { hydrated?: boolean; dataEndpoint?: { data?: { source?: string } } };
        };
        return w.__VAISX_SSR_DATA_APP__?.hydrated === true
          && w.__VAISX_SSR_DATA_APP__?.dataEndpoint?.data?.source === "client";
      });

      expect(await page.textContent("#client-data")).toBe("client:sku-42:seen-sku-42");
      expect(await page.evaluate(() => {
        const target = document.querySelector("#product");
        const w = window as typeof window & {
          __VAISX_PRODUCT_MOUNT__?: unknown;
          __VAISX_SSR_DATA_APP__?: unknown;
        };
        return {
          dataVx: target?.hasAttribute("data-vx"),
          dataState: target?.hasAttribute("data-vx-state"),
          mount: w.__VAISX_PRODUCT_MOUNT__,
          app: w.__VAISX_SSR_DATA_APP__,
        };
      })).toMatchObject({
        dataVx: false,
        dataState: false,
        mount: {
          events: ["click"],
          pathname: "/products/sku-42",
          state: {
            sku: "sku-42",
            source: "ssr",
            visit: "none",
            routePath: "/products/sku-42",
          },
        },
        app: {
          hydrated: true,
          initialState: {
            sku: "sku-42",
            source: "ssr",
            visit: "none",
            routePath: "/products/sku-42",
          },
          dataEndpoint: {
            status: 200,
            data: {
              sku: "sku-42",
              source: "client",
              visit: "seen-sku-42",
              routePath: "/__data.json",
            },
          },
          entryUrl: `${baseUrl}/assets/entry.js`,
        },
      });

      const resourceUrls = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => entry.name)
      );
      expect(resourceUrls.some((url) => /\/assets\/product-chunk-[A-Z0-9]+\.js$/.test(url)))
        .toBe(true);

      await page.click("#cart-button");
      expect(await page.textContent("#cart-button")).toBe("cart: sku-42: clicked");
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
