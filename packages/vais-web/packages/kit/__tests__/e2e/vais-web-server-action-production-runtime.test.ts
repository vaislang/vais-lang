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
const csrfToken = "csrf-action-token";

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
  const contactDir = join(appDir, "contact");
  await mkdir(contactDir, { recursive: true });

  await writeFile(
    join(contactDir, "page.vaisx"),
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
    join(srcDir, "action-chunk.ts"),
    `
function formBody(form: HTMLFormElement): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form).entries()) {
    params.append(key, typeof value === "string" ? value : value.name);
  }
  return params;
}

export function mountActionForm(element: Element, state: { csrf?: string }, meta: { events: string[] }) {
  const w = window as any;
  const target = element as HTMLElement;
  const enhancedForm = document.querySelector("#enhanced-form") as HTMLFormElement | null;
  const result = document.querySelector("#enhanced-result");
  const status = document.querySelector("#action-status");

  w.__VAISX_ACTION_MOUNT__ = {
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
        body: formBody(enhancedForm),
      });
      const payload = await response.json();
      w.__VAISX_ACTION_RESULT__ = { status: response.status, payload };
      if (payload.status === "success") {
        result.textContent = [
          "success",
          payload.data.email,
          String(payload.data.seats),
          payload.data.mode
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

  w.__VAISX_HYDRATED__ = ["action-form"];
  document.dispatchEvent(new CustomEvent("vaisx:hydrated", {
    detail: { components: ["action-form"] },
  }));
}
`,
    "utf8"
  );

  const entryPath = join(srcDir, "entry.ts");
  await writeFile(
    entryPath,
    `
import("./action-chunk").then(({ mountActionForm }) => {
  const target = document.querySelector("[data-vx]");
  if (!target) {
    throw new Error("missing action hydration target");
  }

  const marker = target.getAttribute("data-vx") || "";
  const [componentId, eventText = ""] = marker.split(":");
  if (componentId !== "action-form") {
    throw new Error("unexpected component id: " + componentId);
  }

  const events = eventText.split(",").map((name) => name.trim()).filter(Boolean);
  const encoded = target.getAttribute("data-vx-state") || "";
  const state = encoded ? JSON.parse(atob(encoded)) : {};

  mountActionForm(target, state, { events });
}).catch((error) => {
  (window as any).__VAISX_ACTION_ERROR__ =
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

const signupSchema: FormSchema = [
  { name: "email", type: "string", required: true },
  { name: "seats", type: "number", required: true },
  { name: "mode", type: "string", required: true },
];

const signupAction: ActionFunction = (formData) => {
  const email = String(formData.get("email") ?? "");
  const seatsText = String(formData.get("seats") ?? "0");
  const mode = String(formData.get("mode") ?? "json");

  if (mode === "redirect") {
    return {
      status: "redirect",
      redirectTo: `/contact?submitted=plain&email=${encodeURIComponent(email)}&seats=${encodeURIComponent(seatsText)}`,
    };
  }

  return {
    status: "success",
    data: {
      email,
      seats: Number(seatsText),
      mode,
    },
  };
};

function renderActionPage(url: URL, clientBundle: ClientBundleConfig): Response {
  const submitted = url.searchParams.get("submitted") ?? "none";
  const submittedEmail = url.searchParams.get("email") ?? "";
  const submittedSeats = url.searchParams.get("seats") ?? "";
  const state = {
    csrf: csrfToken,
    submitted,
  };

  const modulePreloads = (clientBundle.modulePreloads ?? [])
    .map((path) => `<link rel="modulepreload" href="${escapeHtml(path)}">`)
    .join("");

  const forms = injectCsrfField(
    `<section id="action-shell" data-vx="action-form:submit,click" data-vx-state="${encodedState(state)}">
  <p id="action-status">pending</p>
  <p id="submitted-banner">${escapeHtml(submitted)}:${escapeHtml(submittedEmail)}:${escapeHtml(submittedSeats)}</p>
  <form id="enhanced-form" method="post" action="/contact/action">
    <input id="enhanced-email" name="email" value="">
    <input id="enhanced-seats" name="seats" value="">
    <input type="hidden" name="mode" value="json">
    <button id="enhanced-submit" type="submit">Send enhanced</button>
  </form>
  <p id="enhanced-result">idle</p>
  <form id="plain-form" method="post" action="/contact/action">
    <input name="email" value="plain@example.com">
    <input name="seats" value="1">
    <input type="hidden" name="mode" value="redirect">
    <button id="plain-submit" type="submit">Send plain</button>
  </form>
</section>`,
    csrfToken
  );

  const html = renderHtmlShell({
    head: `${modulePreloads}<title>Server Action</title>`,
    body: `<main id="app">${forms}</main>`,
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

async function serveActionApp(
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

    if (pathname === "/contact/action") {
      toWebRequest(request)
        .then((webRequest) => handleServerAction({
          request: webRequest,
          actionFn: signupAction,
          csrfToken,
          schema: signupSchema,
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

    sendWebResponse(renderActionPage(url, clientBundle), response);
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

describe("E2E - vais-web server action production runtime", () => {
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

  it("serves CSRF-protected server actions with production hydration", async () => {
    const root = await mkdtemp(join(tmpdir(), "vais-web-action-prod-"));
    tempDirs.push(root);

    const appDir = await writeAppFixture(root);
    const routeTree = await buildRouteTree(appDir);
    const manifest: RouteManifest = generateManifest(routeTree);
    const clientBundle = await buildProductionClientBundle(root);

    expect(Object.keys(manifest.modules)).toContain("/contact");

    const prerenderResult = await prerender({
      routes: routeTree,
      outDir: join(root, "dist"),
      renderComponent: async () => "<form></form>",
      getScriptContent: async () => "export async function action(form) { return {}; }",
    });
    expect(prerenderResult.skipped).toContain("/contact");

    const baseUrl = await serveActionApp(routeTree, clientBundle);
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          const text = message.text();
          if (!text.includes("the server responded with a status of 400")) {
            consoleErrors.push(text);
          }
        }
      });
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });

      const response = await page.goto(`${baseUrl}/contact`, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await page.waitForFunction(() => {
        const w = window as typeof window & { __VAISX_HYDRATED__?: string[] };
        return w.__VAISX_HYDRATED__?.includes("action-form") === true;
      });

      expect(await page.textContent("#action-status")).toBe(`hydrated:${csrfToken}`);
      expect(await page.locator('input[name="__vx_csrf"]').count()).toBe(2);
      expect(await page.evaluate(() => {
        const target = document.querySelector("#action-shell");
        const w = window as typeof window & { __VAISX_ACTION_MOUNT__?: unknown };
        return {
          dataVx: target?.hasAttribute("data-vx"),
          dataState: target?.hasAttribute("data-vx-state"),
          mount: w.__VAISX_ACTION_MOUNT__,
        };
      })).toMatchObject({
        dataVx: false,
        dataState: false,
        mount: {
          events: ["submit", "click"],
          pathname: "/contact",
          state: {
            csrf: csrfToken,
            submitted: "none",
          },
        },
      });

      await page.click("#enhanced-submit");
      await page.waitForFunction(() =>
        document.querySelector("#enhanced-result")?.textContent === "error:400:email,seats"
      );

      await page.fill("#enhanced-email", "signup@example.com");
      await page.fill("#enhanced-seats", "3");
      await page.click("#enhanced-submit");
      await page.waitForFunction(() =>
        document.querySelector("#enhanced-result")?.textContent === "success:signup@example.com:3:json"
      );

      expect(await page.evaluate(() => {
        const w = window as typeof window & {
          __VAISX_ACTION_RESULT__?: { status?: number; payload?: unknown };
        };
        return w.__VAISX_ACTION_RESULT__;
      })).toMatchObject({
        status: 200,
        payload: {
          status: "success",
          data: {
            email: "signup@example.com",
            seats: 3,
            mode: "json",
          },
        },
      });

      const resourceUrls = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => entry.name)
      );
      expect(resourceUrls.some((url) => /\/assets\/action-chunk-.+\.js$/.test(url)))
        .toBe(true);

      await page.click("#plain-submit");
      await page.waitForURL((url) =>
        url.pathname === "/contact"
        && url.searchParams.get("submitted") === "plain"
        && url.searchParams.get("email") === "plain@example.com"
        && url.searchParams.get("seats") === "1"
      );
      await page.waitForFunction(() => {
        const w = window as typeof window & { __VAISX_HYDRATED__?: string[] };
        return w.__VAISX_HYDRATED__?.includes("action-form") === true;
      });
      expect(await page.textContent("#submitted-banner")).toBe("plain:plain@example.com:1");
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
