/**
 * E2E integration tests: .vaisx → compile → SSR → HTML output pipeline.
 *
 * Since the actual WASM compiler is not available in the test environment,
 * the compilation step is mocked. All other kit module functions are real.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildRouteTree, matchRoute, resolveRoute } from "../../src/router/index.js";
import { renderToString } from "../../src/ssr/renderer.js";
import {
  detectComponentType,
  renderClientComponent,
  renderServerComponent,
} from "../../src/ssr/component.js";
import { renderHtmlShell } from "../../src/ssr/html.js";
import { findHydrationTargets } from "../../src/hydration/markers.js";
import { deserializeState, serializeState } from "../../src/hydration/state.js";
import { determineRenderMode } from "../../src/ssg/paths.js";
import { prerender } from "../../src/ssg/prerender.js";
import { handleServerAction } from "../../src/server/action.js";
import { runMiddlewareChain } from "../../src/middleware/runner.js";
import { Next } from "../../src/types.js";
import type { RouteDefinition } from "../../src/types.js";
import type { ResolvedRoute } from "../../src/router/index.js";
import type { MiddlewareDefinition } from "../../src/middleware/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function touch(filePath: string): Promise<void> {
  await writeFile(filePath, "", "utf-8");
}

async function mkdirs(...dirs: string[]): Promise<void> {
  for (const d of dirs) {
    await mkdir(d, { recursive: true });
  }
}

function makeResolvedRoute(overrides: Partial<ResolvedRoute> = {}): ResolvedRoute {
  const route: RouteDefinition = {
    pattern: "/",
    segments: [{ type: "static", value: "" }],
    page: "/app/page.vaisx",
    middleware: [],
    children: [],
  };
  return {
    route,
    params: {},
    layoutChain: [],
    errorBoundary: null,
    loading: null,
    middlewareChain: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Temp directory for file-based tests
// ---------------------------------------------------------------------------

let appDir: string;
let outDir: string;

beforeAll(async () => {
  const base = join(tmpdir(), `vaisx-e2e-test-${Date.now()}`);
  appDir = join(base, "app");
  outDir = join(base, "dist");

  // Build a small app/ tree:
  //   app/
  //     page.vaisx            → "/"
  //     layout.vaisx          → root layout
  //     error.vaisx           → root error boundary
  //     about/
  //       page.vaisx          → "/about"
  //     blog/
  //       layout.vaisx        → "/blog" layout
  //       page.vaisx          → "/blog"
  //       [slug]/
  //         page.vaisx        → "/blog/[slug]"
  await mkdirs(
    appDir,
    join(appDir, "about"),
    join(appDir, "blog"),
    join(appDir, "blog", "[slug]"),
    outDir,
  );

  await touch(join(appDir, "page.vaisx"));
  await touch(join(appDir, "layout.vaisx"));
  await touch(join(appDir, "error.vaisx"));
  await touch(join(appDir, "about", "page.vaisx"));
  await touch(join(appDir, "blog", "layout.vaisx"));
  await touch(join(appDir, "blog", "page.vaisx"));
  await touch(join(appDir, "blog", "[slug]", "page.vaisx"));
});

afterAll(async () => {
  const base = join(tmpdir(), `vaisx-e2e-test-${Date.now()}`);
  // Remove the parent dir — we derive it from appDir
  const parentDir = appDir.replace("/app", "");
  await rm(parentDir, { recursive: true, force: true });
});

// ===========================================================================
// a) Component type detection pipeline
// ===========================================================================

describe("E2E — component type detection pipeline", () => {
  it("context=\"client\" on .vaisx source → detectComponentType returns 'client'", () => {
    // Simulates parsing the script tag from counter.vaisx
    const scriptTag = '<script context="client">';
    const scriptContent = "count := $state(0)\nfn increment() { count = count + 1 }";
    expect(detectComponentType(scriptContent, scriptTag)).toBe("client");
  });

  it(".vaisx source with $state (no explicit context) → auto-detects as 'client'", () => {
    // Simulates parsing hello-reactive.vaisx that has $state but no explicit tag
    const scriptContent = "count := $state(0)\ndoubled := $derived(count * 2)";
    expect(detectComponentType(scriptContent)).toBe("client");
  });

  it(".vaisx source with @click event binding → auto-detects as 'client'", () => {
    const scriptContent = '<button @click="handleClick">Click me</button>';
    expect(detectComponentType(scriptContent)).toBe("client");
  });

  it(".vaisx source with no reactive markers → detectComponentType returns 'server'", () => {
    // Simulates parsing hello.vaisx — pure static content
    const scriptContent = 'title := "Hello, VaisX!"\ndescription := "A simple server component."';
    expect(detectComponentType(scriptContent)).toBe("server");
  });

  it("context=\"server\" + $state in content → detectComponentType returns 'conflict'", () => {
    // Simulates parsing server-component.vaisx incorrectly having $state
    const scriptTag = '<script context="server">';
    const scriptContent = 'count := $state(0)\nmessage := "Hello"';
    expect(detectComponentType(scriptContent, scriptTag)).toBe("conflict");
  });

  it("context=\"server\" + no reactive markers → 'server' (valid server component)", () => {
    const scriptTag = '<script context="server">';
    const scriptContent = 'message := "Hello from server"\nitems := ["alpha", "beta"]';
    expect(detectComponentType(scriptContent, scriptTag)).toBe("server");
  });
});

// ===========================================================================
// b) SSR rendering pipeline
// ===========================================================================

describe("E2E — SSR rendering pipeline", () => {
  it("resolveRoute finds the correct route and layout chain from tree", async () => {
    const tree = await buildRouteTree(appDir);
    const resolved = resolveRoute("/about", tree);

    expect(resolved).not.toBeNull();
    expect(resolved!.route.pattern).toBe("/about");
    // Root layout should be in the chain
    expect(resolved!.layoutChain.length).toBeGreaterThan(0);
  });

  it("renderToString with mock renderComponent produces valid HTML", async () => {
    const resolved = makeResolvedRoute({
      layoutChain: ["/app/layout.vaisx"],
    });

    const result = await renderToString({
      route: resolved,
      renderComponent: async (path) => {
        if (path.endsWith("layout.vaisx")) return "<div class=\"layout\">{slot}</div>";
        return "<main>Hello SSR World</main>";
      },
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<html");
    expect(result.html).toContain("<head>");
    expect(result.html).toContain("<body>");
    expect(result.html).toContain("Hello SSR World");
  });

  it("HTML output contains DOCTYPE, html, head, body tags", async () => {
    const resolved = makeResolvedRoute();
    const result = await renderToString({
      route: resolved,
      renderComponent: async () => "<p>page content</p>",
    });

    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toMatch(/<html[^>]*>/);
    expect(result.html).toContain("<head>");
    expect(result.html).toContain("</head>");
    expect(result.html).toContain("<body>");
    expect(result.html).toContain("</body>");
    expect(result.html).toContain("</html>");
  });

  it("layout wrapping: page content is wrapped in layout via {slot}", async () => {
    const resolved = makeResolvedRoute({
      layoutChain: ["/app/layout.vaisx"],
    });

    const result = await renderToString({
      route: resolved,
      renderComponent: async (path) => {
        if (path === "/app/layout.vaisx")
          return "<nav>nav</nav><main>{slot}</main>";
        return "<section>page section</section>";
      },
    });

    expect(result.html).toContain(
      "<nav>nav</nav><main><section>page section</section></main>"
    );
  });

  it("nested layout chain: page wrapped from innermost to outermost", async () => {
    const resolved = makeResolvedRoute({
      layoutChain: ["/app/layout.vaisx", "/app/blog/layout.vaisx"],
    });

    const result = await renderToString({
      route: resolved,
      renderComponent: async (path) => {
        if (path === "/app/layout.vaisx") return "<root>{slot}</root>";
        if (path === "/app/blog/layout.vaisx") return "<blog>{slot}</blog>";
        return "<article>blog post</article>";
      },
    });

    expect(result.html).toContain(
      "<root><blog><article>blog post</article></blog></root>"
    );
  });

  it("resolveRoute with error boundary resolves correctly", async () => {
    const tree = await buildRouteTree(appDir);
    const resolved = resolveRoute("/about", tree);

    expect(resolved).not.toBeNull();
    // error.vaisx is at root level, so it should be inherited
    expect(resolved!.errorBoundary).not.toBeNull();
  });
});

// ===========================================================================
// c) Hydration marker pipeline
// ===========================================================================

describe("E2E — hydration marker pipeline", () => {
  it("renderClientComponent produces data-vx and data-vx-state attributes", () => {
    const html = renderClientComponent(
      "<button>Increment</button>",
      "counter",
      { count: 0 }
    );

    expect(html).toContain('data-vx="counter"');
    expect(html).toContain("data-vx-state=");
    expect(html).toContain("<button>Increment</button>");
  });

  it("findHydrationTargets extracts markers from rendered HTML", () => {
    // Simulate what would be in the document after SSR
    const state = { count: 5, name: "test" };
    const clientHtml = renderClientComponent("<span>5</span>", "c0:click,input", state);

    const container = document.createElement("div");
    container.innerHTML = clientHtml;
    document.body.appendChild(container);

    const targets = findHydrationTargets(document.body);
    expect(targets.length).toBeGreaterThan(0);

    const target = targets.find((t) => t.componentId === "c0");
    expect(target).toBeDefined();
    expect(target!.events).toContain("click");
    expect(target!.events).toContain("input");
    expect(target!.stateBase64).toBeTruthy();

    document.body.removeChild(container);
  });

  it("deserializeState recovers original state from base64", () => {
    const originalState = { count: 42, label: "hello", active: true };
    const serialized = serializeState(originalState);
    const recovered = deserializeState(serialized);

    expect(recovered).toEqual(originalState);
  });

  it("full hydration round-trip: renderClientComponent → findHydrationTargets → deserializeState", () => {
    const originalState = { count: 7, items: ["a", "b"] };
    const clientHtml = renderClientComponent(
      "<div>rendered</div>",
      "widget",
      originalState
    );

    const container = document.createElement("div");
    container.innerHTML = clientHtml;
    document.body.appendChild(container);

    const targets = findHydrationTargets(document.body);
    const widgetTarget = targets.find((t) => t.componentId === "widget");
    expect(widgetTarget).toBeDefined();

    const recoveredState = deserializeState(widgetTarget!.stateBase64);
    expect(recoveredState).toEqual(originalState);

    document.body.removeChild(container);
  });

  it("renderServerComponent returns HTML without hydration markers", () => {
    const html = "<p>Server rendered content</p>";
    const result = renderServerComponent(html);

    expect(result).toBe(html);
    expect(result).not.toContain("data-vx");
    expect(result).not.toContain("data-vx-state");
  });
});

// ===========================================================================
// d) Router → SSR → HTML pipeline
// ===========================================================================

describe("E2E — Router → SSR → HTML pipeline", () => {
  it("matchRoute finds correct route from built tree", async () => {
    const tree = await buildRouteTree(appDir);
    const match = matchRoute("/blog", tree);

    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/blog");
  });

  it("matchRoute resolves dynamic [slug] segment", async () => {
    const tree = await buildRouteTree(appDir);
    const match = matchRoute("/blog/my-post", tree);

    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/blog/[slug]");
    expect(match!.params["slug"]).toBe("my-post");
  });

  it("full pipeline: buildRouteTree → resolveRoute → renderToString → HTML", async () => {
    const tree = await buildRouteTree(appDir);
    const resolved = resolveRoute("/blog", tree);

    expect(resolved).not.toBeNull();

    const result = await renderToString({
      route: resolved!,
      renderComponent: async (path) => {
        if (path.endsWith("layout.vaisx")) {
          return "<html-layout>{slot}</html-layout>";
        }
        return `<page path="${path}">Blog home</page>`;
      },
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("Blog home");
  });

  it("layout chain is applied correctly via router pipeline", async () => {
    const tree = await buildRouteTree(appDir);
    // /blog has both root layout and blog layout
    const resolved = resolveRoute("/blog", tree);

    expect(resolved).not.toBeNull();
    // The layout chain should include both root layout and blog layout
    expect(resolved!.layoutChain.length).toBe(2);

    const result = await renderToString({
      route: resolved!,
      renderComponent: async (path) => {
        if (path.includes("app/layout.vaisx")) return "<root>{slot}</root>";
        if (path.includes("blog/layout.vaisx")) return "<blog-layout>{slot}</blog-layout>";
        return "<blog-page>Blog content</blog-page>";
      },
    });

    // Page wrapped by blog layout, then root layout
    expect(result.html).toContain(
      "<root><blog-layout><blog-page>Blog content</blog-page></blog-layout></root>"
    );
  });

  it("renderHtmlShell used in pipeline produces well-formed HTML shell", () => {
    const body = "<main>content</main>";
    const html = renderHtmlShell({
      body,
      head: "<title>Test Page</title>",
      scripts: ["/main.js"],
      styles: ["/main.css"],
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Test Page</title>");
    expect(html).toContain('<script type="module" src="/main.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="/main.css">');
    expect(html).toContain("<main>content</main>");
  });
});

// ===========================================================================
// e) SSG pipeline
// ===========================================================================

describe("E2E — SSG pipeline", () => {
  it("determineRenderMode: static route with no markers → 'ssg'", () => {
    const route: RouteDefinition = {
      pattern: "/about",
      segments: [{ type: "static", value: "about" }],
      page: "/app/about/page.vaisx",
      middleware: [],
      children: [],
    };
    expect(determineRenderMode(route)).toBe("ssg");
  });

  it("determineRenderMode: route with server function → 'ssr'", () => {
    const route: RouteDefinition = {
      pattern: "/dashboard",
      segments: [{ type: "static", value: "dashboard" }],
      page: "/app/dashboard/page.vaisx",
      middleware: [],
      children: [],
    };
    const scriptContent = "export async function load(ctx) { return { data: await fetch() } }";
    expect(determineRenderMode(route, scriptContent)).toBe("ssr");
  });

  it("determineRenderMode: route with $state but no server function → 'csr'", () => {
    const route: RouteDefinition = {
      pattern: "/interactive",
      segments: [{ type: "static", value: "interactive" }],
      page: "/app/interactive/page.vaisx",
      middleware: [],
      children: [],
    };
    const scriptContent = "count := $state(0)";
    expect(determineRenderMode(route, scriptContent)).toBe("csr");
  });

  it("determineRenderMode: route with #[static] → forces 'ssg'", () => {
    const route: RouteDefinition = {
      pattern: "/forced-static",
      segments: [{ type: "static", value: "forced-static" }],
      page: "/app/forced-static/page.vaisx",
      middleware: [],
      children: [],
    };
    const scriptContent = "#[static]\ntitle := \"Static Page\"";
    expect(determineRenderMode(route, scriptContent)).toBe("ssg");
  });

  it("prerender produces HTML files for SSG routes", async () => {
    const tmpBase = join(tmpdir(), `vaisx-ssg-test-${Date.now()}`);
    const ssgOut = join(tmpBase, "dist");
    await mkdir(ssgOut, { recursive: true });

    const rootRoute: RouteDefinition = {
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
      ],
    };

    const result = await prerender({
      routes: rootRoute,
      outDir: ssgOut,
      renderComponent: async (filePath) => {
        if (filePath.includes("about")) return "<p>About page</p>";
        return "<p>Home page</p>";
      },
    });

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.skipped).not.toContain("/");
    expect(result.skipped).not.toContain("/about");

    // Verify at least one file URL is "/" or "/about"
    const urls = result.files.map((f) => f.url);
    expect(urls).toContain("/");

    // Verify HTML content
    const homePage = result.files.find((f) => f.url === "/");
    expect(homePage?.html).toContain("<!DOCTYPE html>");
    expect(homePage?.html).toContain("Home page");

    await rm(tmpBase, { recursive: true, force: true });
  });

  it("prerender skips SSR routes", async () => {
    const tmpBase = join(tmpdir(), `vaisx-ssg-skip-test-${Date.now()}`);
    const ssgOut = join(tmpBase, "dist");
    await mkdir(ssgOut, { recursive: true });

    const rootRoute: RouteDefinition = {
      pattern: "/",
      segments: [],
      middleware: [],
      children: [],
    };

    const ssrChildRoute: RouteDefinition = {
      pattern: "/api-page",
      segments: [{ type: "static", value: "api-page" }],
      page: "/app/api-page/page.vaisx",
      middleware: [],
      children: [],
    };

    const treeWithSsr: RouteDefinition = {
      ...rootRoute,
      children: [ssrChildRoute],
    };

    const result = await prerender({
      routes: treeWithSsr,
      outDir: ssgOut,
      renderComponent: async () => "<p>content</p>",
      getScriptContent: async (filePath) => {
        if (filePath.includes("api-page")) {
          return "export async function load(ctx) { return {} }";
        }
        return "";
      },
    });

    expect(result.skipped).toContain("/api-page");

    await rm(tmpBase, { recursive: true, force: true });
  });
});

// ===========================================================================
// f) Server action pipeline
// ===========================================================================

describe("E2E — server action pipeline", () => {
  const csrfToken = "test-csrf-token-12345";

  /**
   * Build a POST request using application/x-www-form-urlencoded body.
   * This is the most reliable form encoding in the Node/jsdom test environment.
   */
  function makePostRequest(
    url: string,
    fields: Record<string, string>,
    headers: Record<string, string> = {}
  ): Request {
    return new Request(url, {
      method: "POST",
      body: new URLSearchParams(fields).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: new URL(url).origin,
        ...headers,
      },
    });
  }

  it("handleServerAction enforces POST only — returns 405 for GET", async () => {
    const request = new Request("http://localhost:3000/action", {
      method: "GET",
    });

    const response = await handleServerAction({
      request,
      actionFn: async () => ({ status: "success" }),
      csrfToken,
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("handleServerAction rejects missing CSRF token with 403", async () => {
    // No __vx_csrf field — only other data
    const request = makePostRequest("http://localhost:3000/action", {
      username: "alice",
    });

    const response = await handleServerAction({
      request,
      actionFn: async () => ({ status: "success" }),
      csrfToken,
    });

    expect(response.status).toBe(403);
  });

  it("CSRF validation works end-to-end", async () => {
    const request = makePostRequest(
      "http://localhost:3000/action",
      { __vx_csrf: csrfToken, username: "alice" },
      { accept: "application/json" }
    );

    const response = await handleServerAction({
      request,
      actionFn: async (fd) => ({
        status: "success",
        data: { username: fd.get("username") },
      }),
      csrfToken,
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { status: string; data: { username: string } };
    expect(body.status).toBe("success");
    expect(body.data.username).toBe("alice");
  });

  it("origin validation rejects cross-origin requests", async () => {
    const request = new Request("http://localhost:3000/action", {
      method: "POST",
      body: new URLSearchParams({ __vx_csrf: csrfToken }).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://evil.example.com",
      },
    });

    const response = await handleServerAction({
      request,
      actionFn: async () => ({ status: "success" }),
      csrfToken,
      allowedOrigins: [],
    });

    expect(response.status).toBe(403);
  });

  it("origin validation accepts allowed origins", async () => {
    const request = new Request("http://app.example.com/action", {
      method: "POST",
      body: new URLSearchParams({ __vx_csrf: csrfToken }).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://trusted.example.com",
        accept: "application/json",
      },
    });

    const response = await handleServerAction({
      request,
      actionFn: async () => ({ status: "success", data: { ok: true } }),
      csrfToken,
      allowedOrigins: ["http://trusted.example.com"],
    });

    expect(response.status).toBe(200);
  });
});

// ===========================================================================
// g) Middleware pipeline
// ===========================================================================

describe("E2E — middleware pipeline", () => {
  function makeRequest(path = "/test"): Request {
    return new Request(`http://localhost${path}`);
  }

  function makeUrl(path = "/test"): URL {
    return new URL(`http://localhost${path}`);
  }

  it("runMiddlewareChain executes in order and collects locals", async () => {
    const order: number[] = [];

    const mw1: MiddlewareDefinition = {
      path: "/app/middleware.vais",
      handler: async (ctx) => {
        order.push(1);
        ctx.locals["step1"] = true;
        return Next;
      },
    };

    const mw2: MiddlewareDefinition = {
      path: "/app/dashboard/middleware.vais",
      handler: async (ctx) => {
        order.push(2);
        ctx.locals["step2"] = "done";
        return Next;
      },
    };

    const result = await runMiddlewareChain({
      middleware: [mw1, mw2],
      request: makeRequest("/dashboard"),
      url: makeUrl("/dashboard"),
      params: {},
    });

    expect(result.completed).toBe(true);
    expect(order).toEqual([1, 2]);
    expect(result.locals["step1"]).toBe(true);
    expect(result.locals["step2"]).toBe("done");
  });

  it("Response interrupts middleware chain", async () => {
    const order: number[] = [];

    const mw1: MiddlewareDefinition = {
      path: "/app/middleware.vais",
      handler: async (_ctx) => {
        order.push(1);
        return new Response("Unauthorized", { status: 401 });
      },
    };

    const mw2: MiddlewareDefinition = {
      path: "/app/dashboard/middleware.vais",
      handler: async (_ctx) => {
        order.push(2);
        return Next;
      },
    };

    const result = await runMiddlewareChain({
      middleware: [mw1, mw2],
      request: makeRequest("/dashboard"),
      url: makeUrl("/dashboard"),
      params: {},
    });

    expect(result.completed).toBe(false);
    expect(result.response?.status).toBe(401);
    // mw2 should not have run
    expect(order).toEqual([1]);
    expect(order).not.toContain(2);
  });

  it("locals are shared across middleware in the same chain", async () => {
    const mw1: MiddlewareDefinition = {
      path: "/app/middleware.vais",
      handler: async (ctx) => {
        ctx.locals["user"] = { id: "u1", name: "Alice" };
        return Next;
      },
    };

    const mw2: MiddlewareDefinition = {
      path: "/app/auth/middleware.vais",
      handler: async (ctx) => {
        // mw2 can read what mw1 set
        const user = ctx.locals["user"] as { id: string; name: string } | undefined;
        ctx.locals["authorized"] = user !== undefined;
        return Next;
      },
    };

    const result = await runMiddlewareChain({
      middleware: [mw1, mw2],
      request: makeRequest("/auth/profile"),
      url: makeUrl("/auth/profile"),
      params: {},
    });

    expect(result.completed).toBe(true);
    expect(result.locals["user"]).toEqual({ id: "u1", name: "Alice" });
    expect(result.locals["authorized"]).toBe(true);
  });

  it("empty middleware chain completes immediately with empty locals", async () => {
    const result = await runMiddlewareChain({
      middleware: [],
      request: makeRequest("/"),
      url: makeUrl("/"),
      params: {},
    });

    expect(result.completed).toBe(true);
    expect(result.locals).toEqual({});
    expect(result.response).toBeUndefined();
  });

  it("full router→middleware→SSR pipeline simulation", async () => {
    const tree = await buildRouteTree(appDir);
    const resolved = resolveRoute("/about", tree);
    expect(resolved).not.toBeNull();

    // Simulate middleware auth check before SSR
    const authMiddleware: MiddlewareDefinition = {
      path: "/app/middleware.vais",
      handler: async (ctx) => {
        ctx.locals["authenticated"] = true;
        return Next;
      },
    };

    const middlewareResult = await runMiddlewareChain({
      middleware: [authMiddleware],
      request: makeRequest("/about"),
      url: makeUrl("/about"),
      params: {},
    });

    // Middleware passed — proceed to SSR
    expect(middlewareResult.completed).toBe(true);
    expect(middlewareResult.locals["authenticated"]).toBe(true);

    const renderResult = await renderToString({
      route: resolved!,
      renderComponent: async (path) => {
        if (path.endsWith("layout.vaisx")) return "<shell>{slot}</shell>";
        return "<section>About Us</section>";
      },
    });

    expect(renderResult.status).toBe(200);
    expect(renderResult.html).toContain("About Us");
    expect(renderResult.html).toContain("<!DOCTYPE html>");
  });
});
