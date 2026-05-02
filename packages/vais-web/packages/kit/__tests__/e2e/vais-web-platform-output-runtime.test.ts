import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createCloudflareAdapter } from "../../src/adapters/cloudflare.js";
import { createVercelAdapter } from "../../src/adapters/vercel.js";
import type { AdapterBuildResult, RouteManifest } from "../../src/types.js";

type GeneratedBuildResult = AdapterBuildResult & {
  generatedFiles?: Record<string, string>;
};

type VercelRoute = {
  src: string;
  dest: string;
};

type VercelOutputConfig = {
  version: number;
  routes: VercelRoute[];
};

const nativeImport = new Function(
  "specifier",
  "return import(specifier)"
) as (specifier: string) => Promise<unknown>;

const platformManifest: RouteManifest = {
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

let activeServer: Server | undefined;
let activeTempDir: string | undefined;

async function makeTempRoot(prefix: string): Promise<string> {
  const root = join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "package.json"), '{"type":"module"}\n', "utf8");
  activeTempDir = root;
  return root;
}

async function writeGeneratedFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

function serveError(response: ServerResponse, error: unknown): void {
  response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(error instanceof Error ? error.message : String(error));
}

function sendText(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, { "Content-Type": contentType });
  response.end(body);
}

async function invokeVercelFunction(
  outputRoot: string,
  route: VercelRoute,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const functionPath = join(outputRoot, route.dest.replace(/^\//, ""), "index.js");
  const moduleUrl = `${pathToFileURL(functionPath).href}?t=${Date.now()}`;
  const mod = await nativeImport(moduleUrl) as { default: unknown };
  const handler = mod.default as (
    req: { url: string; method: string },
    res: {
      statusCode: number;
      headers: Record<string, string>;
      setHeader(name: string, value: string): void;
      end(body: string): void;
    }
  ) => void | Promise<void>;

  let ended = false;
  const platformResponse = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(body: string) {
      ended = true;
      response.writeHead(this.statusCode, this.headers);
      response.end(body);
    },
  };

  await handler(
    { url: request.url ?? "/", method: request.method ?? "GET" },
    platformResponse
  );

  if (!ended) {
    sendText(response, 500, "serverless function did not end response", "text/plain");
  }
}

async function handleVercelOutputRequest(
  outputRoot: string,
  config: VercelOutputConfig,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  for (const route of config.routes) {
    if (!new RegExp(route.src).test(url.pathname)) {
      continue;
    }

    if (route.dest.startsWith("/static/")) {
      const staticFile = join(outputRoot, route.dest.replace(/^\//, ""));
      const html = await readFile(staticFile, "utf8");
      sendText(response, 200, html, "text/html; charset=utf-8");
      return;
    }

    if (route.dest.startsWith("/functions/")) {
      await invokeVercelFunction(outputRoot, route, request, response);
      return;
    }
  }

  sendText(response, 404, "Not Found", "text/plain; charset=utf-8");
}

async function startVercelOutputHost(root: string): Promise<string> {
  const outputRoot = join(root, ".vercel/output");
  const config = JSON.parse(
    await readFile(join(outputRoot, "config.json"), "utf8")
  ) as VercelOutputConfig;

  activeServer = createServer((request, response) => {
    void handleVercelOutputRequest(outputRoot, config, request, response).catch((error) => {
      serveError(response, error);
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

async function importCloudflareWorker(root: string): Promise<{
  default: {
    fetch(
      request: Request,
      env: {
        __STATIC_CONTENT?: {
          get(key: string, options: { type: "arrayBuffer" }): Promise<ArrayBuffer | null>;
        };
      },
      ctx: Record<string, never>
    ): Promise<Response>;
  };
}> {
  const workerPath = join(root, "dist/_worker.js");
  return nativeImport(`${pathToFileURL(workerPath).href}?t=${Date.now()}`) as Promise<{
    default: {
      fetch(
        request: Request,
        env: {
          __STATIC_CONTENT?: {
            get(key: string, options: { type: "arrayBuffer" }): Promise<ArrayBuffer | null>;
          };
        },
        ctx: Record<string, never>
      ): Promise<Response>;
    };
  }>;
}

function createCloudflareStaticEnv(root: string): {
  __STATIC_CONTENT: {
    get(key: string, options: { type: "arrayBuffer" }): Promise<ArrayBuffer | null>;
  };
} {
  return {
    __STATIC_CONTENT: {
      async get(key: string, options: { type: "arrayBuffer" }) {
        expect(options.type).toBe("arrayBuffer");
        try {
          const bytes = await readFile(join(root, "dist/_assets", key));
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          );
        } catch {
          return null;
        }
      },
    },
  };
}

describe("E2E - vais-web platform output runtime", () => {
  afterEach(async () => {
    const server = activeServer;
    const tempDir = activeTempDir;
    activeServer = undefined;
    activeTempDir = undefined;
    await closeServer(server);
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("serves Vercel Build Output API files through a local platform host", async () => {
    const build = (await createVercelAdapter().build(platformManifest, {
      type: "vercel",
    })) as GeneratedBuildResult;

    const root = await makeTempRoot("vais-web-vercel-output");
    await writeGeneratedFiles(root, build.generatedFiles ?? {});

    const baseUrl = await startVercelOutputHost(root);
    const staticResponse = await fetch(`${baseUrl}/`);
    expect(staticResponse.status).toBe(200);
    expect(staticResponse.headers.get("content-type")).toContain("text/html");
    expect(await staticResponse.text()).toContain('<script type="module" src="/client.js">');

    const dynamicResponse = await fetch(`${baseUrl}/blog/platform-runtime?preview=1`);
    expect(dynamicResponse.status).toBe(200);
    expect(dynamicResponse.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await dynamicResponse.text()).toContain('<div id="app"></div>');

    const missingResponse = await fetch(`${baseUrl}/missing`);
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.text()).toBe("Not Found");
  });

  it("imports Cloudflare Worker output from disk and serves static plus dynamic routes", async () => {
    const build = (await createCloudflareAdapter().build(platformManifest, {
      type: "cloudflare",
    })) as GeneratedBuildResult;

    const root = await makeTempRoot("vais-web-cloudflare-output");
    await writeGeneratedFiles(root, build.generatedFiles ?? {});

    const worker = await importCloudflareWorker(root);
    const env = createCloudflareStaticEnv(root);

    const staticResponse = await worker.default.fetch(
      new Request("https://example.vais/"),
      env,
      {}
    );
    expect(staticResponse.status).toBe(200);
    expect(staticResponse.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await staticResponse.text()).toContain('<script type="module" src="/client.js">');

    const dynamicResponse = await worker.default.fetch(
      new Request("https://example.vais/blog/platform-runtime"),
      env,
      {}
    );
    expect(dynamicResponse.status).toBe(200);
    expect(dynamicResponse.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await dynamicResponse.text()).toContain('<div id="app"></div>');

    const missingResponse = await worker.default.fetch(
      new Request("https://example.vais/missing"),
      env,
      {}
    );
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.text()).toBe("Not Found");
  });
});
