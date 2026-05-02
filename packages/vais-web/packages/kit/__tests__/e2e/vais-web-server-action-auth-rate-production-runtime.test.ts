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
const csrfToken = "csrf-auth-rate-token";

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
  const secureDir = join(appDir, "secure");
  await mkdir(secureDir, { recursive: true });

  await writeFile(
    join(secureDir, "page.vaisx"),
    `<script>
export async function action(form) {
  return { ok: true };
}
</script>
<form method="post"><input name="email"></form>
`,
    "utf8"
  );

  return appDir;
}

async function writeBundleFixture(root: string): Promise<string> {
  const srcDir = join(root, "src");
  await mkdir(srcDir, { recursive: true });

  await writeFile(
    join(srcDir, "auth-rate-chunk.ts"),
    `
type PostOptions = {
  authorization?: string;
  path?: string;
};

async function postSecure(csrf: string, email: string, options: PostOptions = {}) {
  const params = new URLSearchParams({
    __vx_csrf: csrf,
    email,
  });
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (options.authorization) {
    headers.Authorization = options.authorization;
  }
  const response = await fetch(options.path || "/secure/action", {
    method: "POST",
    headers,
    body: params.toString(),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {
    status: response.status,
    body,
    retryAfter: response.headers.get("retry-after"),
    rateLimit: response.headers.get("x-ratelimit-limit"),
    authenticate: response.headers.get("www-authenticate"),
  };
}

export function mountSecureAction(element: Element, state: { csrf?: string }, meta: { events: string[] }) {
  const w = window as any;
  const target = element as HTMLElement;
  const csrf = String(state.csrf || "");
  target.removeAttribute("data-vx");
  target.removeAttribute("data-vx-state");

  w.__VAISX_AUTH_RATE_MOUNT__ = {
    state,
    events: meta.events,
    pathname: window.location.pathname,
  };
  w.__VAISX_AUTH_RATE__ = {
    post: (email: string, options?: PostOptions) => postSecure(csrf, email, options),
  };
  document.dispatchEvent(new CustomEvent("vaisx:hydrated", {
    detail: { components: ["secure-action"] },
  }));
}
`,
    "utf8"
  );

  const entryPath = join(srcDir, "entry.ts");
  await writeFile(
    entryPath,
    `
import("./auth-rate-chunk").then(({ mountSecureAction }) => {
  const target = document.querySelector("[data-vx]");
  if (!target) {
    throw new Error("missing secure action hydration target");
  }

  const marker = target.getAttribute("data-vx") || "";
  const [componentId, eventText = ""] = marker.split(":");
  if (componentId !== "secure-action") {
    throw new Error("unexpected component id: " + componentId);
  }

  const events = eventText.split(",").map((name) => name.trim()).filter(Boolean);
  const encoded = target.getAttribute("data-vx-state") || "";
  const state = encoded ? JSON.parse(atob(encoded)) : {};
  mountSecureAction(target, state, { events });
}).catch((error) => {
  (window as any).__VAISX_AUTH_RATE_ERROR__ =
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

const secureSchema: FormSchema = [
  { name: "email", type: "string", required: true },
];

const secureAction: ActionFunction = (formData) => ({
  status: "success",
  data: {
    email: String(formData.get("email") ?? ""),
    accepted: true,
  },
});

function renderSecurePage(clientBundle: ClientBundleConfig): Response {
  const state = { csrf: csrfToken };
  const modulePreloads = (clientBundle.modulePreloads ?? [])
    .map((path) => `<link rel="modulepreload" href="${escapeHtml(path)}">`)
    .join("");

  const body = injectCsrfField(
    `<section id="secure-shell" data-vx="secure-action:submit" data-vx-state="${encodedState(state)}">
  <h1>Secure Action</h1>
  <form id="secure-form" method="post" action="/secure/action">
    <input name="email" value="secure@example.com">
    <button id="secure-submit" type="submit">Send</button>
  </form>
</section>`,
    csrfToken
  );

  const html = renderHtmlShell({
    head: `${modulePreloads}<title>Secure Action</title>`,
    body: `<main id="app">${body}</main>`,
    scripts: [clientBundle.entry],
    state,
  });

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function readRequestBody(request: IncomingMessage): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
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
  const body = await readRequestBody(request);
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

async function serveSecureActionApp(
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

    if (pathname === "/secure/session") {
      response.writeHead(204, {
        "set-cookie": "vx_session=session-123; Path=/; HttpOnly; SameSite=Lax",
      });
      response.end();
      return;
    }

    if (pathname === "/secure/action" || pathname === "/secure/session-action") {
      toWebRequest(request)
        .then((webRequest) => handleServerAction({
          request: webRequest,
          actionFn: secureAction,
          csrfToken,
          schema: secureSchema,
          options: pathname === "/secure/action"
            ? { authRequired: true, rateLimit: "2/min" }
            : { authRequired: true },
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

    sendWebResponse(renderSecurePage(clientBundle), response);
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

describe("E2E - vais-web server action auth/rate production runtime", () => {
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

  it("enforces authRequired and rateLimit in a production hydrated action route", async () => {
    const root = await mkdtemp(join(tmpdir(), "vais-web-auth-rate-prod-"));
    tempDirs.push(root);

    const appDir = await writeAppFixture(root);
    const routeTree = await buildRouteTree(appDir);
    const manifest: RouteManifest = generateManifest(routeTree);
    const clientBundle = await buildProductionClientBundle(root);

    expect(Object.keys(manifest.modules)).toContain("/secure");

    const prerenderResult = await prerender({
      routes: routeTree,
      outDir: join(root, "dist"),
      renderComponent: async () => "<form></form>",
      getScriptContent: async () => "export async function action(form) { return {}; }",
    });
    expect(prerenderResult.skipped).toContain("/secure");

    const baseUrl = await serveSecureActionApp(routeTree, clientBundle);
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          const text = message.text();
          if (
            !text.includes("the server responded with a status of 401")
            && !text.includes("the server responded with a status of 429")
          ) {
            consoleErrors.push(text);
          }
        }
      });
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });

      const response = await page.goto(`${baseUrl}/secure`, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await page.waitForFunction(() => {
        const w = window as typeof window & { __VAISX_AUTH_RATE__?: { post?: unknown } };
        return typeof w.__VAISX_AUTH_RATE__?.post === "function";
      });

      expect(await page.locator('input[name="__vx_csrf"]').count()).toBe(1);
      expect(await page.evaluate(() => {
        const target = document.querySelector("#secure-shell");
        const w = window as typeof window & { __VAISX_AUTH_RATE_MOUNT__?: unknown };
        return {
          dataVx: target?.hasAttribute("data-vx"),
          dataState: target?.hasAttribute("data-vx-state"),
          mount: w.__VAISX_AUTH_RATE_MOUNT__,
        };
      })).toMatchObject({
        dataVx: false,
        dataState: false,
        mount: {
          events: ["submit"],
          pathname: "/secure",
          state: {
            csrf: csrfToken,
          },
        },
      });

      const unauthenticated = await page.evaluate(async () => {
        const w = window as typeof window & {
          __VAISX_AUTH_RATE__?: {
            post(email: string, options?: Record<string, string>): Promise<unknown>;
          };
        };
        return w.__VAISX_AUTH_RATE__?.post("unauth@example.com");
      });
      expect(unauthenticated).toMatchObject({
        status: 401,
        authenticate: "Bearer",
        body: "Unauthorized",
      });

      const first = await page.evaluate(async () => {
        const w = window as typeof window & {
          __VAISX_AUTH_RATE__?: {
            post(email: string, options?: Record<string, string>): Promise<unknown>;
          };
        };
        return w.__VAISX_AUTH_RATE__?.post("one@example.com", {
          authorization: "Bearer production-token",
        });
      });
      const second = await page.evaluate(async () => {
        const w = window as typeof window & {
          __VAISX_AUTH_RATE__?: {
            post(email: string, options?: Record<string, string>): Promise<unknown>;
          };
        };
        return w.__VAISX_AUTH_RATE__?.post("two@example.com", {
          authorization: "Bearer production-token",
        });
      });
      const third = await page.evaluate(async () => {
        const w = window as typeof window & {
          __VAISX_AUTH_RATE__?: {
            post(email: string, options?: Record<string, string>): Promise<unknown>;
          };
        };
        return w.__VAISX_AUTH_RATE__?.post("three@example.com", {
          authorization: "Bearer production-token",
        });
      });

      expect(first).toMatchObject({
        status: 200,
        body: {
          status: "success",
          data: {
            email: "one@example.com",
            accepted: true,
          },
        },
      });
      expect(second).toMatchObject({
        status: 200,
        body: {
          status: "success",
          data: {
            email: "two@example.com",
            accepted: true,
          },
        },
      });
      expect(third).toMatchObject({
        status: 429,
        body: "Too Many Requests",
        rateLimit: "2",
      });
      expect(Number((third as { retryAfter?: string }).retryAfter)).toBeGreaterThan(0);

      const sessionStatus = await page.evaluate(async () => {
        const response = await fetch("/secure/session");
        return response.status;
      });
      expect(sessionStatus).toBe(204);
      await page.goto(`${baseUrl}/secure`, { waitUntil: "load" });
      await page.waitForFunction(() => {
        const w = window as typeof window & { __VAISX_AUTH_RATE__?: { post?: unknown } };
        return typeof w.__VAISX_AUTH_RATE__?.post === "function";
      });
      const cookieAuthorized = await page.evaluate(async () => {
        const w = window as typeof window & {
          __VAISX_AUTH_RATE__?: {
            post(email: string, options?: Record<string, string>): Promise<unknown>;
          };
        };
        return w.__VAISX_AUTH_RATE__?.post("cookie@example.com", {
          path: "/secure/session-action",
        });
      });
      expect(cookieAuthorized).toMatchObject({
        status: 200,
        body: {
          status: "success",
          data: {
            email: "cookie@example.com",
            accepted: true,
          },
        },
      });

      const resourceUrls = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => entry.name)
      );
      expect(resourceUrls.some((url) => /\/assets\/auth-rate-chunk-.+\.js$/.test(url)))
        .toBe(true);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
