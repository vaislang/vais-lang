import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";

import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { createStaticAdapter } from "../../src/adapters/static.js";
import { buildRouteTree, generateManifest } from "../../src/router/tree.js";
import type {
  AdapterBuildResult,
  ClientBundleConfig,
  RouteManifest,
} from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

const execFileAsync = promisify(execFile);

let activeServer: Server | undefined;
const tempDirs: string[] = [];

function encodedState(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

async function writeAppFixture(root: string): Promise<string> {
  const appDir = join(root, "app");
  await mkdir(join(appDir, "(marketing)", "about"), { recursive: true });
  await mkdir(join(appDir, "docs", "guide"), { recursive: true });

  await writeFile(join(appDir, "page.vaisx"), "<h1>Home</h1>\n", "utf8");
  await writeFile(
    join(appDir, "(marketing)", "about", "page.vaisx"),
    "<h1>About</h1>\n",
    "utf8"
  );
  await writeFile(
    join(appDir, "docs", "guide", "page.vaisx"),
    "<h1>Guide</h1>\n",
    "utf8"
  );

  return appDir;
}

function injectHydrationTarget(indexHtml: string, path: string): string {
  const routeName = path === "/" ? "home" : path.replace(/^\/|\/$/g, "").replace(/\//g, "-");
  return indexHtml.replace(
    '<div id="app"></div>',
    `<div id="app">
      <button id="route-marker" data-vx="route:click" data-vx-state="${encodedState({
        route: routeName,
      })}">pending</button>
    </div>`
  );
}

async function writeBundleFixture(root: string): Promise<string> {
  const srcDir = join(root, "src");
  await mkdir(srcDir, { recursive: true });

  await writeFile(
    join(srcDir, "runtime.ts"),
    `
export function hydrateAll() {
  const w = window as any;
  const registry = w.__VAISX_COMPONENTS__ || {};
  const targets = Array.from(document.querySelectorAll("[data-vx]"));
  const hydrated: string[] = [];

  for (const element of targets) {
    const markerText = element.getAttribute("data-vx") || "";
    const [componentId, eventText = ""] = markerText.split(":");
    const events = eventText.split(",").map((name) => name.trim()).filter(Boolean);
    const encoded = element.getAttribute("data-vx-state") || "";
    const state = encoded ? JSON.parse(atob(encoded)) : {};
    const mount = registry[componentId];

    if (typeof mount === "function") {
      mount(element, state, { events });
    }

    element.removeAttribute("data-vx");
    element.removeAttribute("data-vx-state");
    hydrated.push(componentId);
  }

  w.__VAISX_HYDRATED__ = hydrated;
  document.dispatchEvent(new CustomEvent("vaisx:hydrated", {
    detail: { components: hydrated },
  }));
  return hydrated;
}
`,
    "utf8"
  );

  await writeFile(
    join(srcDir, "route-chunk.ts"),
    `
export function mountRoute(element: Element, state: { route?: string }, meta: { events: string[] }) {
  const w = window as any;
  const target = element as HTMLElement;
  const route = typeof state.route === "string" ? state.route : "unknown";
  w.__VAISX_ROUTE_CHUNK_LOADED__ = true;
  w.__VAISX_ROUTE_META__ = {
    route,
    events: meta.events,
    pathname: window.location.pathname,
  };
  target.textContent = "route:" + route;
  target.addEventListener("click", () => {
    target.textContent = "route:" + route + ":clicked";
  });
}
`,
    "utf8"
  );

  const entryPath = join(srcDir, "entry.ts");
  await writeFile(
    entryPath,
    `
import { hydrateAll } from "./runtime";

import("./route-chunk").then(({ mountRoute }) => {
  const w = window as any;
  w.__VAISX_COMPONENTS__ = { route: mountRoute };
  const hydrated = hydrateAll();
  w.__VAISX_FILE_ROUTING_APP__ = {
    hydrated,
    pathname: window.location.pathname,
    entryUrl: import.meta.url,
  };
}).catch((error) => {
  (window as any).__VAISX_FILE_ROUTING_ERROR__ =
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

async function serveGeneratedOutput(files: Record<string, string>): Promise<string> {
  activeServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname.endsWith("/") && url.pathname !== "/"
      ? url.pathname.slice(0, -1)
      : url.pathname;
    const filePath = resolveStaticFile(pathname);
    const content = files[filePath];

    if (content === undefined) {
      const fallback = files["dist/404.html"] ?? "not found";
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end(injectHydrationTarget(fallback, pathname));
      return;
    }

    const isScript = filePath.endsWith(".js");
    response.writeHead(200, {
      "Content-Type": isScript
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8",
    });
    response.end(isScript ? content : injectHydrationTarget(content, pathname));
  });

  await new Promise<void>((resolve, reject) => {
    activeServer?.once("error", reject);
    activeServer?.listen(0, "127.0.0.1", () => resolve());
  });

  const address = activeServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function resolveStaticFile(pathname: string): string {
  if (pathname === "/" || pathname === "") {
    return "dist/index.html";
  }
  if (pathname.startsWith("/assets/")) {
    return `dist${pathname}`;
  }
  return `dist${pathname}/index.html`;
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function verifyRoute(baseUrl: string, path: string): Promise<void> {
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

    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const w = window as typeof window & {
        __VAISX_ROUTE_CHUNK_LOADED__?: boolean;
        __VAISX_FILE_ROUTING_APP__?: { hydrated?: string[] };
      };
      return w.__VAISX_ROUTE_CHUNK_LOADED__ === true
        && Array.isArray(w.__VAISX_FILE_ROUTING_APP__?.hydrated)
        && w.__VAISX_FILE_ROUTING_APP__?.hydrated?.includes("route");
    });

    const routeName = path === "/" ? "home" : path.replace(/^\/|\/$/g, "").replace(/\//g, "-");
    expect(await page.textContent("#route-marker")).toBe(`route:${routeName}`);
    expect(await page.evaluate(() => {
      const target = document.querySelector("#route-marker");
      const w = window as typeof window & {
        __VAISX_ROUTE_META__?: unknown;
        __VAISX_FILE_ROUTING_APP__?: unknown;
      };
      return {
        dataVx: target?.hasAttribute("data-vx"),
        dataState: target?.hasAttribute("data-vx-state"),
        routeMeta: w.__VAISX_ROUTE_META__,
        app: w.__VAISX_FILE_ROUTING_APP__,
      };
    })).toEqual({
      dataVx: false,
      dataState: false,
      routeMeta: {
        route: routeName,
        events: ["click"],
        pathname: path,
      },
      app: {
        hydrated: ["route"],
        pathname: path,
        entryUrl: `${baseUrl}/assets/entry.js`,
      },
    });

    const resourceUrls = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => entry.name)
    );
    expect(resourceUrls.some((url) => /\/assets\/route-chunk-[A-Z0-9]+\.js$/.test(url)))
      .toBe(true);

    await page.click("#route-marker");
    expect(await page.textContent("#route-marker")).toBe(`route:${routeName}:clicked`);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await browser.close();
  }
}

describe("E2E - vais-web file-routing production runtime", () => {
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

  it("scans app routes and serves a production static app with code-split hydration", async () => {
    const root = await mkdtemp(join(tmpdir(), "vais-web-file-routing-prod-"));
    tempDirs.push(root);

    const appDir = await writeAppFixture(root);
    const routeTree = await buildRouteTree(appDir);
    const manifest: RouteManifest = generateManifest(routeTree);
    const clientBundle = await buildProductionClientBundle(root);

    expect(Object.keys(manifest.modules).sort()).toEqual([
      "/",
      "/about",
      "/docs/guide",
    ]);
    expect(manifest.modules["/about"]).toContain("(marketing)");
    expect(manifest.modules["/docs/guide"]).toContain(join("docs", "guide", "page.vaisx"));

    const staticBuild = (await createStaticAdapter().build(manifest, {
      type: "static",
      clientBundle,
    })) as GeneratedBuildResult;

    expect(staticBuild.files).toEqual(expect.arrayContaining([
      "dist/index.html",
      "dist/about/index.html",
      "dist/docs/guide/index.html",
      "dist/404.html",
      "dist/assets/entry.js",
    ]));
    expect(staticBuild.files.some((file) => /^dist\/assets\/route-chunk-[A-Z0-9]+\.js$/.test(file)))
      .toBe(true);

    const aboutHtml = staticBuild.generatedFiles?.["dist/about/index.html"] ?? "";
    expect(aboutHtml).toContain('<link rel="modulepreload" href="/assets/');
    expect(aboutHtml).toContain('<script type="module" src="/assets/entry.js"></script>');

    const baseUrl = await serveGeneratedOutput(staticBuild.generatedFiles ?? {});
    await verifyRoute(baseUrl, "/");
    await verifyRoute(baseUrl, "/about");
    await verifyRoute(baseUrl, "/docs/guide");

    const missing = await fetch(`${baseUrl}/missing`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("404 - Page Not Found");
  }, 15000);
});
