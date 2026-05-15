import { describe, expect, it } from "vitest";

import { createCloudflareAdapter } from "../../src/adapters/cloudflare.js";
import { createVercelAdapter } from "../../src/adapters/vercel.js";
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

function evaluateVercelHandler(code: string): (
  req: { url: string; method: string },
  res: {
    statusCode: number;
    headers: Record<string, string>;
    setHeader(name: string, value: string): void;
    end(body: string): void;
  }
) => void {
  const source = code.replace(
    "export default function handler",
    "return function handler"
  );
  return new Function(source)();
}

function evaluateCloudflareWorker(code: string): {
  fetch(
    request: Request,
    env: {
      __STATIC_CONTENT?: {
        get(
          key: string,
          options: { type: "arrayBuffer" }
        ): Promise<ArrayBuffer | null>;
      };
    },
    ctx: Record<string, never>
  ): Promise<Response>;
} {
  const source = code.replace("export default", "return");
  return new Function(source)();
}

describe("E2E - vais-web cloud adapter runtime", () => {
  it("executes generated Vercel and Cloudflare handlers through platform-like request APIs", async () => {
    const vercelBuild = (await createVercelAdapter().build(cloudManifest, {
      type: "vercel",
    })) as GeneratedBuildResult;
    const vercelFunctionPath =
      ".vercel/output/functions/blog-[slug].func/index.js";
    const vercelCode = vercelBuild.generatedFiles?.[vercelFunctionPath];

    expect(vercelBuild.vercelConfig?.version).toBe(3);
    expect(vercelBuild.vercelConfig?.routes).toContainEqual({
      src: "^/blog/([^/]+)$",
      dest: "/functions/blog-[slug].func",
    });
    expect(vercelCode).toBeTruthy();

    const handler = evaluateVercelHandler(vercelCode ?? "");
    const vercelResponse = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      body: "",
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      end(body: string) {
        this.body = body;
      },
    };

    handler(
      { url: "/blog/edge-runtime?preview=1", method: "GET" },
      vercelResponse
    );

    expect(vercelResponse.statusCode).toBe(200);
    expect(vercelResponse.headers["Content-Type"]).toBe(
      "text/html; charset=utf-8"
    );
    expect(vercelResponse.body).toContain("<!DOCTYPE html>");
    expect(vercelResponse.body).toContain('<div id="app"></div>');

    const cloudflareBuild =
      (await createCloudflareAdapter().build(cloudManifest, {
        type: "cloudflare",
      })) as GeneratedBuildResult;
    const workerCode = cloudflareBuild.generatedFiles?.["dist/_worker.js"];
    expect(cloudflareBuild.files).toContain("dist/_worker.js");
    expect(cloudflareBuild.files).toContain("dist/_assets/index.html");
    expect(cloudflareBuild.files).toContain("dist/wrangler.toml");
    expect(workerCode).toBeTruthy();

    const worker = evaluateCloudflareWorker(workerCode ?? "");
    const encoder = new TextEncoder();
    const env = {
      __STATIC_CONTENT: {
        async get(key: string, options: { type: "arrayBuffer" }) {
          expect(options.type).toBe("arrayBuffer");
          if (key === "index.html") {
            return encoder
              .encode("<!DOCTYPE html><body>CLOUDFLARE_STATIC</body>")
              .buffer;
          }
          return null;
        },
      },
    };

    const staticResponse = await worker.fetch(
      new Request("https://example.vais/"),
      env,
      {}
    );
    expect(staticResponse.status).toBe(200);
    expect(staticResponse.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    expect(await staticResponse.text()).toContain("CLOUDFLARE_STATIC");

    const dynamicResponse = await worker.fetch(
      new Request("https://example.vais/blog/edge-runtime"),
      env,
      {}
    );
    expect(dynamicResponse.status).toBe(200);
    expect(dynamicResponse.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    expect(await dynamicResponse.text()).toContain('<div id="app"></div>');

    const missingResponse = await worker.fetch(
      new Request("https://example.vais/missing"),
      env,
      {}
    );
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.headers.get("content-type")).toBe("text/plain");
    expect(await missingResponse.text()).toBe("Not Found");
  });
});
