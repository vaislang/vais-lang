import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { createStaticAdapter } from "../../src/adapters/static.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

const browserManifest: RouteManifest = {
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

function browserState(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function injectHydrationTarget(indexHtml: string): string {
  const state = browserState({ count: 7 });
  return indexHtml.replace(
    '<div id="app"></div>',
    `<script>
window.__VAISX_COMPONENTS__ = {
  counter(element, state, meta) {
    window.__VAISX_MOUNT_META__ = {
      events: meta.events,
      state
    };
    const start = typeof state.count === "number" ? state.count : 0;
    element.textContent = "count: " + start;
    element.addEventListener("click", () => {
      element.textContent = "count: " + (start + 1);
    });
  }
};
document.addEventListener("vaisx:hydrated", (event) => {
  window.__VAISX_BROWSER_EVENT__ = event.detail;
});
</script>
  <div id="app"><button id="counter" data-vx="counter:click" data-vx-state="${state}">pending</button></div>`
  );
}

async function serveStaticOutput(files: Record<string, string>): Promise<string> {
  const indexHtml = files["dist/index.html"];
  const clientJs = files["dist/client.js"];
  if (!indexHtml || !clientJs) {
    throw new Error("static adapter did not generate index.html and client.js");
  }

  activeServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(injectHydrationTarget(indexHtml));
      return;
    }
    if (url.pathname === "/client.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(clientJs);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
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

describe("E2E - vais-web real browser runtime", () => {
  afterEach(async () => {
    const server = activeServer;
    activeServer = undefined;
    await closeServer(server);
  });

  it("loads generated static output in Chromium and hydrates SSR markers", async () => {
    const staticBuild = (await createStaticAdapter().build(browserManifest, {
      type: "static",
    })) as GeneratedBuildResult;

    const baseUrl = await serveStaticOutput(staticBuild.generatedFiles ?? {});
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
        return Array.isArray(window.__VAISX_HYDRATED__)
          && window.__VAISX_HYDRATED__.includes("counter");
      });

      expect(await page.textContent("#counter")).toBe("count: 7");
      expect(
        await page.evaluate(() => document.querySelector("#counter")?.hasAttribute("data-vx"))
      ).toBe(false);
      expect(
        await page.evaluate(() => document.querySelector("#counter")?.hasAttribute("data-vx-state"))
      ).toBe(false);
      expect(await page.evaluate(() => window.__VAISX_BROWSER_EVENT__)).toEqual({
        components: ["counter"],
      });
      expect(await page.evaluate(() => window.__VAISX_MOUNT_META__)).toEqual({
        events: ["click"],
        state: { count: 7 },
      });

      await page.click("#counter");
      expect(await page.textContent("#counter")).toBe("count: 8");
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
