// @vitest-environment node

import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";

import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { buildRouteTree, generateManifest } from "../../src/router/tree.js";
import { resolveRoute } from "../../src/router/resolver.js";
import { prerender } from "../../src/ssg/index.js";
import { handleServerAction, injectCsrfField } from "../../src/server/index.js";
import { renderHtmlShell } from "../../src/ssr/html.js";
import type {
  ActionFunction,
  ClientBundleConfig,
  FormSchema,
  RouteDefinition,
  RouteManifest,
} from "../../src/types.js";

const execFileAsync = promisify(execFile);
const csrfToken = "csrf-upload-token";

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
  const uploadDir = join(appDir, "upload");
  await mkdir(uploadDir, { recursive: true });

  await writeFile(
    join(uploadDir, "page.vaisx"),
    `<script>
export async function action(form) {
  return { ok: true };
}
</script>
<form method="post" enctype="multipart/form-data"><input type="file" name="asset"></form>
`,
    "utf8"
  );

  return appDir;
}

async function writeBundleFixture(root: string): Promise<string> {
  const srcDir = join(root, "src");
  await mkdir(srcDir, { recursive: true });

  await writeFile(
    join(srcDir, "upload-chunk.ts"),
    `
export function mountUploadForm(element: Element, state: { csrf?: string }, meta: { events: string[] }) {
  const w = window as any;
  const target = element as HTMLElement;
  const enhancedForm = document.querySelector("#enhanced-upload-form") as HTMLFormElement | null;
  const result = document.querySelector("#enhanced-upload-result");
  const status = document.querySelector("#upload-status");

  w.__VAISX_UPLOAD_MOUNT__ = {
    state,
    events: meta.events,
    pathname: window.location.pathname,
  };

  target.removeAttribute("data-vx");
  target.removeAttribute("data-vx-state");
  if (status) {
    status.textContent = "hydrated:" + state.csrf;
  }

  if (enhancedForm && result) {
    enhancedForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const response = await fetch(enhancedForm.action, {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: new FormData(enhancedForm),
      });
      const payload = await response.json();
      w.__VAISX_UPLOAD_RESULT__ = { status: response.status, payload };
      if (payload.status === "success") {
        result.textContent = [
          "success",
          payload.data.name,
          String(payload.data.size),
          payload.data.text
        ].join(":");
      } else {
        result.textContent = [
          "error",
          String(response.status),
          Object.keys(payload.errors || {}).sort().join(",")
        ].join(":");
      }
    });
  }

  w.__VAISX_HYDRATED__ = ["upload-form"];
  document.dispatchEvent(new CustomEvent("vaisx:hydrated", {
    detail: { components: ["upload-form"] },
  }));
}
`,
    "utf8"
  );

  const entryPath = join(srcDir, "entry.ts");
  await writeFile(
    entryPath,
    `
import("./upload-chunk").then(({ mountUploadForm }) => {
  const target = document.querySelector("[data-vx]");
  if (!target) {
    throw new Error("missing upload hydration target");
  }

  const marker = target.getAttribute("data-vx") || "";
  const [componentId, eventText = ""] = marker.split(":");
  if (componentId !== "upload-form") {
    throw new Error("unexpected component id: " + componentId);
  }

  const events = eventText.split(",").map((name) => name.trim()).filter(Boolean);
  const encoded = target.getAttribute("data-vx-state") || "";
  const state = encoded ? JSON.parse(atob(encoded)) : {};

  mountUploadForm(target, state, { events });
}).catch((error) => {
  (window as any).__VAISX_UPLOAD_ERROR__ =
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

const uploadSchema: FormSchema = [
  { name: "title", type: "string", required: true },
  { name: "asset", type: "file", required: true },
  { name: "mode", type: "string", required: true },
];

const uploadAction: ActionFunction = async (formData) => {
  const title = String(formData.get("title") ?? "");
  const mode = String(formData.get("mode") ?? "json");
  const asset = formData.get("asset");

  if (!(asset instanceof File)) {
    return {
      status: "error",
      errors: { asset: "asset must be a file" },
    };
  }

  if (mode === "redirect") {
    return {
      status: "redirect",
      redirectTo: `/upload?uploaded=${encodeURIComponent(asset.name)}&size=${asset.size}&title=${encodeURIComponent(title)}`,
    };
  }

  return {
    status: "success",
    data: {
      title,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      text: await asset.text(),
    },
  };
};

function renderUploadPage(url: URL, clientBundle: ClientBundleConfig): Response {
  const uploaded = url.searchParams.get("uploaded") ?? "none";
  const uploadedSize = url.searchParams.get("size") ?? "0";
  const uploadedTitle = url.searchParams.get("title") ?? "none";
  const state = {
    csrf: csrfToken,
    uploaded,
  };

  const modulePreloads = (clientBundle.modulePreloads ?? [])
    .map((path) => `<link rel="modulepreload" href="${escapeHtml(path)}">`)
    .join("");

  const forms = injectCsrfField(
    `<section id="upload-shell" data-vx="upload-form:submit,change" data-vx-state="${encodedState(state)}">
  <p id="upload-status">pending</p>
  <p id="uploaded-banner">${escapeHtml(uploaded)}:${escapeHtml(uploadedSize)}:${escapeHtml(uploadedTitle)}</p>
  <form id="enhanced-upload-form" method="post" enctype="multipart/form-data" action="/upload/action">
    <input id="enhanced-title" name="title" value="Enhanced asset">
    <input id="enhanced-file" name="asset" type="file">
    <input type="hidden" name="mode" value="json">
    <button id="enhanced-submit" type="submit">Upload enhanced</button>
  </form>
  <p id="enhanced-upload-result">idle</p>
  <form id="plain-upload-form" method="post" enctype="multipart/form-data" action="/upload/action">
    <input name="title" value="Plain asset">
    <input id="plain-file" name="asset" type="file">
    <input type="hidden" name="mode" value="redirect">
    <button id="plain-submit" type="submit">Upload plain</button>
  </form>
</section>`,
    csrfToken
  );

  const html = renderHtmlShell({
    head: `${modulePreloads}<title>File Upload Action</title>`,
    body: `<main id="app">${forms}</main>`,
    scripts: [clientBundle.entry],
    state,
  });

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function readRequestBodyBytes(request: IncomingMessage): Promise<Uint8Array | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks);
  return body.byteLength === 0 ? undefined : new Uint8Array(body);
}

function nodeHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const headers = nodeHeaders(request);
  const host = headers.get("host") ?? "127.0.0.1";
  const method = request.method ?? "GET";
  const body = await readRequestBodyBytes(request);
  return new Request(`http://${host}${request.url ?? "/"}`, {
    method,
    headers,
    body,
  });
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

async function serveUploadApp(
  routeTree: RouteDefinition,
  clientBundle: ClientBundleConfig
): Promise<string> {
  activeServer = createServer((request, response) => {
    const host = request.headers.host ?? "127.0.0.1";
    const url = new URL(request.url ?? "/", `http://${host}`);
    const pathname = url.pathname;

    const asset = clientBundle.assets[pathname];
    if (asset !== undefined) {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(asset);
      return;
    }

    if (pathname === "/upload/action") {
      toWebRequest(request)
        .then((webRequest) => handleServerAction({
          request: webRequest,
          actionFn: uploadAction,
          csrfToken,
          schema: uploadSchema,
        }))
        .then((actionResponse) => sendWebResponse(actionResponse, response))
        .catch((error) => {
          response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          response.end(String(error));
        });
      return;
    }

    const resolved = resolveRoute(pathname, routeTree);
    if (!resolved) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    sendWebResponse(renderUploadPage(url, clientBundle), response);
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

describe("E2E - vais-web server action file upload production runtime", () => {
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

  it("serves multipart file uploads through production action hydration", async () => {
    const root = await mkdtemp(join(tmpdir(), "vais-web-upload-prod-"));
    tempDirs.push(root);

    const appDir = await writeAppFixture(root);
    const routeTree = await buildRouteTree(appDir);
    const manifest: RouteManifest = generateManifest(routeTree);
    const clientBundle = await buildProductionClientBundle(root);

    expect(Object.keys(manifest.modules)).toContain("/upload");

    const prerenderResult = await prerender({
      routes: routeTree,
      outDir: join(root, "dist"),
      renderComponent: async () => "<form></form>",
      getScriptContent: async () => "export async function action(form) { return {}; }",
    });
    expect(prerenderResult.skipped).toContain("/upload");

    const baseUrl = await serveUploadApp(routeTree, clientBundle);
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

      const response = await page.goto(`${baseUrl}/upload`, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await page.waitForFunction(() => {
        const w = window as typeof window & { __VAISX_HYDRATED__?: string[] };
        return w.__VAISX_HYDRATED__?.includes("upload-form") === true;
      });

      expect(await page.textContent("#upload-status")).toBe(`hydrated:${csrfToken}`);
      expect(await page.locator('input[name="__vx_csrf"]').count()).toBe(2);
      expect(await page.evaluate(() => {
        const target = document.querySelector("#upload-shell");
        const w = window as typeof window & { __VAISX_UPLOAD_MOUNT__?: unknown };
        return {
          dataVx: target?.hasAttribute("data-vx"),
          dataState: target?.hasAttribute("data-vx-state"),
          mount: w.__VAISX_UPLOAD_MOUNT__,
        };
      })).toMatchObject({
        dataVx: false,
        dataState: false,
        mount: {
          events: ["submit", "change"],
          pathname: "/upload",
          state: {
            csrf: csrfToken,
            uploaded: "none",
          },
        },
      });

      await page.setInputFiles("#enhanced-file", {
        name: "enhanced.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("enhanced payload", "utf8"),
      });
      await page.click("#enhanced-submit");
      await page.waitForFunction(() =>
        document.querySelector("#enhanced-upload-result")?.textContent ===
        "success:enhanced.txt:16:enhanced payload"
      );

      expect(await page.evaluate(() => {
        const w = window as typeof window & {
          __VAISX_UPLOAD_RESULT__?: { status?: number; payload?: unknown };
        };
        return w.__VAISX_UPLOAD_RESULT__;
      })).toMatchObject({
        status: 200,
        payload: {
          status: "success",
          data: {
            title: "Enhanced asset",
            name: "enhanced.txt",
            type: "text/plain",
            size: 16,
            text: "enhanced payload",
          },
        },
      });

      const resourceUrls = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => entry.name)
      );
      expect(resourceUrls.some((url) => /\/assets\/upload-chunk-.+\.js$/.test(url)))
        .toBe(true);

      await page.setInputFiles("#plain-file", {
        name: "plain.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("plain payload", "utf8"),
      });
      await page.click("#plain-submit");
      await page.waitForURL((url) =>
        url.pathname === "/upload"
        && url.searchParams.get("uploaded") === "plain.txt"
        && url.searchParams.get("size") === "13"
        && url.searchParams.get("title") === "Plain asset"
      );
      await page.waitForFunction(() => {
        const w = window as typeof window & { __VAISX_HYDRATED__?: string[] };
        return w.__VAISX_HYDRATED__?.includes("upload-form") === true;
      });
      expect(await page.textContent("#uploaded-banner")).toBe("plain.txt:13:Plain asset");
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
