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
import type {
  AdapterBuildResult,
  ClientBundleConfig,
  RouteManifest,
} from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

const execFileAsync = promisify(execFile);

const productionManifest: RouteManifest = {
  routes: [
    {
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
      middleware: [],
      children: [],
    },
  ],
  modules: {
    "/": "/app/page.vaisx",
  },
};

let activeServer: Server | undefined;
const tempDirs: string[] = [];

function encodedState(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function injectHydrationTarget(indexHtml: string): string {
  return indexHtml.replace(
    '<div id="app"></div>',
    `<div id="app">
      <button id="counter" data-vx="counter:click" data-vx-state="${encodedState({
        count: 11,
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
    element.dispatchEvent(new CustomEvent("vaisx:component-hydrated", {
      bubbles: true,
      detail: { componentId, state },
    }));
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
    join(srcDir, "counter.ts"),
    `
export function mountCounter(element: Element, state: { count?: number }, meta: { events: string[] }) {
  const w = window as any;
  w.__VAISX_CHUNK_LOADED__ = true;
  w.__VAISX_MOUNT_META__ = { events: meta.events, state };
  const start = typeof state.count === "number" ? state.count : 0;
  const target = element as HTMLElement;
  target.textContent = "split count: " + start;
  target.addEventListener("click", () => {
    target.textContent = "split count: " + (start + 1);
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

import("./counter").then(({ mountCounter }) => {
  const w = window as any;
  w.__VAISX_COMPONENTS__ = { counter: mountCounter };
  const hydrated = hydrateAll();
  w.__VAISX_PROD_BUNDLE__ = { hydrated, entryUrl: import.meta.url };
}).catch((error) => {
  (window as any).__VAISX_BUNDLE_ERROR__ = error instanceof Error ? error.message : String(error);
  throw error;
});
`,
    "utf8"
  );

  return entryPath;
}

async function buildProductionClientBundle(): Promise<ClientBundleConfig> {
  const root = await mkdtemp(join(tmpdir(), "vais-web-production-bundle-"));
  tempDirs.push(root);

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
  if (!assetNames.includes("entry.js")) {
    throw new Error(`tsup did not emit entry.js: ${assetNames.join(", ")}`);
  }

  const chunkNames = assetNames.filter((name) => name !== "entry.js");
  if (chunkNames.length === 0) {
    throw new Error("tsup did not emit a code-split chunk for dynamic import.");
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
    const filePath = url.pathname === "/" ? "dist/index.html" : `dist${url.pathname}`;
    const content = files[filePath];

    if (content === undefined) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    const isScript = filePath.endsWith(".js");
    response.writeHead(200, {
      "Content-Type": isScript
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8",
    });
    response.end(filePath === "dist/index.html" ? injectHydrationTarget(content) : content);
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

describe("E2E - vais-web production bundle runtime", () => {
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

  it("loads minified code-split static output in Chromium", async () => {
    const clientBundle = await buildProductionClientBundle();
    const staticBuild = (await createStaticAdapter().build(productionManifest, {
      type: "static",
      clientBundle,
    })) as GeneratedBuildResult;

    const indexHtml = staticBuild.generatedFiles?.["dist/index.html"] ?? "";
    expect(indexHtml).toContain('<link rel="modulepreload" href="/assets/');
    expect(indexHtml).toContain('<script type="module" src="/assets/entry.js"></script>');
    expect(staticBuild.generatedFiles?.["dist/client.js"]).toBeUndefined();
    expect(staticBuild.files).toContain("dist/assets/entry.js");
    expect(staticBuild.files.some((file) => /^dist\/assets\/counter-[A-Z0-9]+\.js$/.test(file)))
      .toBe(true);

    const baseUrl = await serveGeneratedOutput(staticBuild.generatedFiles ?? {});
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

      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.waitForFunction(() => {
        const w = window as typeof window & {
          __VAISX_CHUNK_LOADED__?: boolean;
          __VAISX_HYDRATED__?: string[];
        };
        return w.__VAISX_CHUNK_LOADED__ === true
          && Array.isArray(w.__VAISX_HYDRATED__)
          && w.__VAISX_HYDRATED__.includes("counter");
      });

      expect(await page.textContent("#counter")).toBe("split count: 11");
      expect(await page.evaluate(() => {
        const target = document.querySelector("#counter");
        return {
          dataVx: target?.hasAttribute("data-vx"),
          dataState: target?.hasAttribute("data-vx-state"),
        };
      })).toEqual({ dataVx: false, dataState: false });
      expect(await page.evaluate(() => {
        const w = window as typeof window & {
          __VAISX_MOUNT_META__?: unknown;
          __VAISX_PROD_BUNDLE__?: unknown;
        };
        return {
          mount: w.__VAISX_MOUNT_META__,
          bundle: w.__VAISX_PROD_BUNDLE__,
        };
      })).toEqual({
        mount: { events: ["click"], state: { count: 11 } },
        bundle: {
          hydrated: ["counter"],
          entryUrl: `${baseUrl}/assets/entry.js`,
        },
      });

      const resourceUrls = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => entry.name)
      );
      expect(resourceUrls.some((url) => /\/assets\/counter-[A-Z0-9]+\.js$/.test(url)))
        .toBe(true);

      await page.click("#counter");
      expect(await page.textContent("#counter")).toBe("split count: 12");
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
