import { describe, expect, it } from "vitest";

import {
  createNodeAdapter,
  createRequestHandler,
} from "../../src/adapters/node.js";
import { createStaticAdapter } from "../../src/adapters/static.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

const pageManifest: RouteManifest = {
  routes: [
    {
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
      middleware: [],
      children: [
        {
          pattern: "/about",
          segments: [{ type: "static", value: "about" }],
          page: "/app/about/page.vaisx",
          middleware: [],
          children: [],
        },
        {
          pattern: "/products/[sku]",
          segments: [
            { type: "static", value: "products" },
            { type: "dynamic", value: "sku" },
          ],
          page: "/app/products/[sku]/page.vaisx",
          middleware: [],
          children: [],
        },
      ],
    },
  ],
  modules: {
    "/": "/app/page.vaisx",
    "/about": "/app/about/page.vaisx",
    "/products/[sku]": "/app/products/[sku]/page.vaisx",
  },
};

const serverOnlyManifest: RouteManifest = {
  routes: [
    {
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
      middleware: [],
      children: [
        {
          pattern: "/api/orders",
          segments: [
            { type: "static", value: "api" },
            { type: "static", value: "orders" },
          ],
          apiRoute: "/app/api/orders/route.vais",
          middleware: [],
          children: [],
        },
      ],
    },
  ],
  modules: {},
};

describe("E2E - vais-web adapter runtime", () => {
  it("builds static output and node handler artifacts with bounded runtime contracts", async () => {
    const staticAdapter = createStaticAdapter();
    const staticBuild = (await staticAdapter.build(pageManifest, {
      type: "static",
      fallback: "404.html",
    })) as GeneratedBuildResult;

    expect(staticBuild.outputDir).toBe("dist");
    expect(staticBuild.files).toContain("dist/index.html");
    expect(staticBuild.files).toContain("dist/about/index.html");
    expect(staticBuild.files).toContain("dist/products/[sku]/index.html");
    expect(staticBuild.files).toContain("dist/404.html");
    expect(staticBuild.files).toContain("dist/client.js");
    expect(staticBuild.generatedFiles?.["dist/index.html"]).toContain(
      '<script type="module" src="/client.js"></script>'
    );
    expect(staticBuild.generatedFiles?.["dist/404.html"]).toContain(
      "404 - Page Not Found"
    );

    await expect(
      staticAdapter.build(serverOnlyManifest, { type: "static" })
    ).rejects.toThrow("not SSG-compatible");

    const nodeAdapter = createNodeAdapter();
    const nodeBuild = (await nodeAdapter.build(pageManifest, {
      type: "node",
      host: "127.0.0.1",
      port: 0,
    })) as GeneratedBuildResult;

    expect(nodeBuild.files).toContain("dist/server/index.js");
    expect(nodeBuild.files).toContain("dist/start.js");
    const serverEntry = nodeBuild.generatedFiles?.["dist/server/index.js"];
    expect(serverEntry).toContain('"/products/[sku]"');
    expect(serverEntry).toContain("function matchRoute(pathname)");

    const handler = createRequestHandler({
      staticDir: "./client",
      serverDir: "./server",
    });
    let status = 0;
    let headers: Record<string, string> | undefined;
    let body = "";

    handler(
      {
        url: "/products/sku-42?preview=1",
        method: "GET",
        headers: { host: "127.0.0.1:3000" },
      },
      {
        writeHead: (nextStatus, nextHeaders) => {
          status = nextStatus;
          headers = nextHeaders;
        },
        end: (nextBody) => {
          body =
            typeof nextBody === "string"
              ? nextBody
              : Buffer.from(nextBody ?? "").toString("utf-8");
        },
      }
    );

    expect(status).toBe(200);
    expect(headers?.["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain('<div id="app"></div>');
  });
});
