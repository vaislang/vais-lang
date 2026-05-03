import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";

import { createCloudflareAdapter } from "../../src/adapters/cloudflare.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

const cloudManifest: RouteManifest = {
  routes: [
    {
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
      middleware: [],
      children: [
        {
          pattern: "/blog/[slug]",
          segments: [
            { type: "static", value: "blog" },
            { type: "dynamic", value: "slug" },
          ],
          page: "/app/blog/[slug]/page.vaisx",
          middleware: [],
          children: [],
        },
      ],
    },
  ],
  modules: {
    "/": "/app/page.vaisx",
    "/blog/[slug]": "/app/blog/[slug]/page.vaisx",
  },
};

const STATIC_INDEX_HTML =
  "<!DOCTYPE html><body>CLOUDFLARE_STATIC_MINIFLARE</body>";

describe("E2E - vais-web cloudflare miniflare runtime", () => {
  let mf: Miniflare;
  let workerCode: string;
  let siteDir: string;

  beforeAll(async () => {
    const cloudflareBuild = (await createCloudflareAdapter().build(
      cloudManifest,
      { type: "cloudflare" }
    )) as GeneratedBuildResult;

    const generated = cloudflareBuild.generatedFiles?.["dist/_worker.js"];
    if (!generated) {
      throw new Error("cloudflare adapter did not generate dist/_worker.js");
    }
    workerCode = generated;

    siteDir = mkdtempSync(join(tmpdir(), "vais-web-mf-site-"));
    writeFileSync(join(siteDir, "index.html"), STATIC_INDEX_HTML);

    mf = new Miniflare({
      modules: true,
      script: workerCode,
      sitePath: siteDir,
      compatibilityDate: "2024-09-01",
    });
    await mf.ready;
  });

  afterAll(async () => {
    await mf?.dispose();
    if (siteDir) {
      rmSync(siteDir, { recursive: true, force: true });
    }
  });

  it("serves static asset for / through real workerd KV binding", async () => {
    const response = await mf.dispatchFetch("https://example.vais/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    expect(await response.text()).toContain("CLOUDFLARE_STATIC_MINIFLARE");
  });

  it("renders dynamic route HTML through workerd fetch handler", async () => {
    const response = await mf.dispatchFetch(
      "https://example.vais/blog/edge-runtime"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    const body = await response.text();
    expect(body).toContain('<div id="app"></div>');
    expect(body).toContain("<!DOCTYPE html>");
  });

  it("returns 404 for unmatched route through workerd dispatch", async () => {
    const response = await mf.dispatchFetch(
      "https://example.vais/missing-page"
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(await response.text()).toBe("Not Found");
  });
});
