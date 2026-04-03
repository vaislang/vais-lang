import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RouteDefinition } from "../src/types.js";
import {
  determineRenderMode,
  collectStaticPaths,
  prerender,
} from "../src/ssg/index.js";

// Mock fs/promises so tests don't write to disk
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoute(overrides: Partial<RouteDefinition> = {}): RouteDefinition {
  return {
    pattern: "/",
    segments: [{ type: "static", value: "" }],
    middleware: [],
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// determineRenderMode
// ---------------------------------------------------------------------------

describe("determineRenderMode", () => {
  it("returns 'ssg' for static route with no script content", () => {
    const route = makeRoute({ pattern: "/about", segments: [{ type: "static", value: "about" }] });
    expect(determineRenderMode(route)).toBe("ssg");
  });

  it("returns 'ssg' when #[static] attribute is present (forced SSG)", () => {
    const route = makeRoute({
      pattern: "/blog/[slug]",
      segments: [
        { type: "static", value: "blog" },
        { type: "dynamic", value: "slug" },
      ],
    });
    expect(determineRenderMode(route, "#[static]\nexport default function Page() {}")).toBe("ssg");
  });

  it("returns 'ssr' when script has export async function load(", () => {
    const route = makeRoute({ pattern: "/dashboard", segments: [{ type: "static", value: "dashboard" }] });
    const script = "export async function load(ctx) { return {}; }";
    expect(determineRenderMode(route, script)).toBe("ssr");
  });

  it("returns 'ssr' when script has export function load(", () => {
    const route = makeRoute({ pattern: "/profile", segments: [{ type: "static", value: "profile" }] });
    const script = "export function load(ctx) { return {}; }";
    expect(determineRenderMode(route, script)).toBe("ssr");
  });

  it("returns 'ssr' when script has export async function action(", () => {
    const route = makeRoute({ pattern: "/submit", segments: [{ type: "static", value: "submit" }] });
    const script = "export async function action(formData) {}";
    expect(determineRenderMode(route, script)).toBe("ssr");
  });

  it("returns 'csr' when $state is used but no server functions", () => {
    const route = makeRoute({ pattern: "/counter", segments: [{ type: "static", value: "counter" }] });
    const script = "let count = $state(0);";
    expect(determineRenderMode(route, script)).toBe("csr");
  });

  it("returns 'csr' when @click is used but no server functions", () => {
    const route = makeRoute({ pattern: "/interactive", segments: [{ type: "static", value: "interactive" }] });
    const script = '<button @click="handleClick">Click me</button>';
    expect(determineRenderMode(route, script)).toBe("csr");
  });

  it("returns 'ssr' for dynamic route (has [slug]) with no getStaticPaths hint", () => {
    const route = makeRoute({
      pattern: "/blog/[slug]",
      segments: [
        { type: "static", value: "blog" },
        { type: "dynamic", value: "slug" },
      ],
    });
    // No script content, dynamic → SSR by default
    expect(determineRenderMode(route)).toBe("ssr");
  });

  it("#[static] overrides dynamic route to ssg", () => {
    const route = makeRoute({
      pattern: "/docs/[id]",
      segments: [
        { type: "static", value: "docs" },
        { type: "dynamic", value: "id" },
      ],
    });
    expect(determineRenderMode(route, "// #[static]")).toBe("ssg");
  });

  it("returns 'ssr' when script has Vais syntax #[server] A F load(", () => {
    const route = makeRoute({ pattern: "/dashboard", segments: [{ type: "static", value: "dashboard" }] });
    const script = "#[server] A F load(params) { return {}; }";
    expect(determineRenderMode(route, script)).toBe("ssr");
  });

  it("returns 'ssr' when script has Vais async function A F load(", () => {
    const route = makeRoute({ pattern: "/data", segments: [{ type: "static", value: "data" }] });
    const script = "A F load(ctx) { return { items: [] }; }";
    expect(determineRenderMode(route, script)).toBe("ssr");
  });

  it("returns 'ssr' when script has Vais async function A F action(", () => {
    const route = makeRoute({ pattern: "/form", segments: [{ type: "static", value: "form" }] });
    const script = "A F action(formData) {}";
    expect(determineRenderMode(route, script)).toBe("ssr");
  });

  it("returns 'csr' when @submit handler is present but no server functions", () => {
    const route = makeRoute({ pattern: "/form", segments: [{ type: "static", value: "form" }] });
    const script = '<form @submit="handleSubmit">';
    expect(determineRenderMode(route, script)).toBe("csr");
  });

  it("returns 'csr' when @input handler is present but no server functions", () => {
    const route = makeRoute({ pattern: "/search", segments: [{ type: "static", value: "search" }] });
    const script = '<input @input="handleInput">';
    expect(determineRenderMode(route, script)).toBe("csr");
  });

  it("returns 'csr' when @keydown handler is present but no server functions", () => {
    const route = makeRoute({ pattern: "/editor", segments: [{ type: "static", value: "editor" }] });
    const script = '<textarea @keydown="handleKey">';
    expect(determineRenderMode(route, script)).toBe("csr");
  });

  it("returns 'csr' when :value= binding is present but no server functions", () => {
    const route = makeRoute({ pattern: "/input", segments: [{ type: "static", value: "input" }] });
    const script = '<input :value="name">';
    expect(determineRenderMode(route, script)).toBe("csr");
  });
});

// ---------------------------------------------------------------------------
// collectStaticPaths
// ---------------------------------------------------------------------------

describe("collectStaticPaths", () => {
  it("returns single path with empty params for a static route", async () => {
    const routes: RouteDefinition[] = [
      makeRoute({ pattern: "/about", segments: [{ type: "static", value: "about" }] }),
    ];
    const paths = await collectStaticPaths(routes);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ pattern: "/about", params: {}, url: "/about" });
  });

  it("expands dynamic routes via getStaticPaths", async () => {
    const routes: RouteDefinition[] = [
      makeRoute({
        pattern: "/blog/[slug]",
        segments: [
          { type: "static", value: "blog" },
          { type: "dynamic", value: "slug" },
        ],
      }),
    ];
    const getStaticPaths = async (_pattern: string) => [["hello"], ["world"]];
    const paths = await collectStaticPaths(routes, getStaticPaths);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatchObject({ url: "/blog/hello", params: { slug: "hello" } });
    expect(paths[1]).toMatchObject({ url: "/blog/world", params: { slug: "world" } });
  });

  it("skips SSR routes (dynamic without #[static] and without server fns)", async () => {
    const routes: RouteDefinition[] = [
      makeRoute({
        pattern: "/user/[id]",
        segments: [
          { type: "static", value: "user" },
          { type: "dynamic", value: "id" },
        ],
      }),
    ];
    // No getStaticPaths provided and route mode is SSR → skip
    const paths = await collectStaticPaths(routes);
    expect(paths).toHaveLength(0);
  });

  it("collects paths from children recursively", async () => {
    const parent = makeRoute({
      pattern: "/",
      segments: [],
      children: [
        makeRoute({ pattern: "/about", segments: [{ type: "static", value: "about" }] }),
        makeRoute({ pattern: "/contact", segments: [{ type: "static", value: "contact" }] }),
      ],
    });
    const paths = await collectStaticPaths([parent]);
    const urls = paths.map((p) => p.url);
    expect(urls).toContain("/about");
    expect(urls).toContain("/contact");
  });
});

// ---------------------------------------------------------------------------
// prerender
// ---------------------------------------------------------------------------

describe("prerender", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders a static SSG route to HTML", async () => {
    const routeTree = makeRoute({
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
    });

    const result = await prerender({
      routes: routeTree,
      outDir: "dist",
      renderComponent: async () => "<h1>Home</h1>",
    });

    expect(result.files.length).toBeGreaterThan(0);
    const homeFile = result.files.find((f) => f.url === "/");
    expect(homeFile).toBeDefined();
    expect(homeFile!.html).toContain("<h1>Home</h1>");
    expect(homeFile!.outputPath).toBe("dist/index.html");
  });

  it("generates correct output path: /about → dist/about/index.html", async () => {
    const routeTree = makeRoute({
      pattern: "/",
      segments: [],
      children: [
        makeRoute({
          pattern: "/about",
          segments: [{ type: "static", value: "about" }],
          page: "/app/about/page.vaisx",
        }),
      ],
    });

    const result = await prerender({
      routes: routeTree,
      outDir: "dist",
      renderComponent: async () => "<p>About</p>",
    });

    const aboutFile = result.files.find((f) => f.url === "/about");
    expect(aboutFile).toBeDefined();
    expect(aboutFile!.outputPath).toBe("dist/about/index.html");
  });

  it("skips SSR routes (dynamic without static paths) and adds to skipped list", async () => {
    const routeTree = makeRoute({
      pattern: "/",
      segments: [],
      children: [
        makeRoute({
          pattern: "/user/[id]",
          segments: [
            { type: "static", value: "user" },
            { type: "dynamic", value: "id" },
          ],
          page: "/app/user/[id]/page.vaisx",
        }),
      ],
    });

    // getScriptContent returns server function → SSR
    const result = await prerender({
      routes: routeTree,
      outDir: "dist",
      renderComponent: async () => "",
      getScriptContent: async () => "export async function load(ctx) { return {}; }",
    });

    expect(result.skipped).toContain("/user/[id]");
    expect(result.files.find((f) => f.url.includes("/user/"))).toBeUndefined();
  });

  it("generates minimal HTML shell for CSR routes", async () => {
    const routeTree = makeRoute({
      pattern: "/",
      segments: [],
      children: [
        makeRoute({
          pattern: "/interactive",
          segments: [{ type: "static", value: "interactive" }],
          page: "/app/interactive/page.vaisx",
        }),
      ],
    });

    const result = await prerender({
      routes: routeTree,
      outDir: "dist",
      renderComponent: async () => "<button>click</button>",
      getScriptContent: async () => 'let x = $state(0); <button @click="fn">',
    });

    const file = result.files.find((f) => f.url === "/interactive");
    expect(file).toBeDefined();
    expect(file!.html).toContain("<!DOCTYPE html>");
    expect(file!.html).toContain('<div id="app">');
  });

  it("expands dynamic SSG route via getStaticPaths", async () => {
    const routeTree = makeRoute({
      pattern: "/",
      segments: [],
      children: [
        makeRoute({
          pattern: "/blog/[slug]",
          segments: [
            { type: "static", value: "blog" },
            { type: "dynamic", value: "slug" },
          ],
          page: "/app/blog/[slug]/page.vaisx",
        }),
      ],
    });

    const result = await prerender({
      routes: routeTree,
      outDir: "dist",
      renderComponent: async (_path, props) => `<article>${JSON.stringify(props)}</article>`,
      getStaticPaths: async () => [["hello-world"], ["another-post"]],
      // #[static] forces SSG on the dynamic route
      getScriptContent: async () => "#[static]",
    });

    const urls = result.files.map((f) => f.url);
    expect(urls).toContain("/blog/hello-world");
    expect(urls).toContain("/blog/another-post");

    const helloFile = result.files.find((f) => f.url === "/blog/hello-world");
    expect(helloFile!.outputPath).toBe("dist/blog/hello-world/index.html");
  });

  it("returns empty files and skipped arrays for a route tree with only SSR routes", async () => {
    const routeTree = makeRoute({
      pattern: "/",
      segments: [],
      // Root "/" itself has no dynamic segments → SSG
      // But let's add only SSR children
      children: [
        makeRoute({
          pattern: "/api/data",
          segments: [
            { type: "static", value: "api" },
            { type: "static", value: "data" },
          ],
          page: "/app/api/data/page.vaisx",
        }),
      ],
    });

    const result = await prerender({
      routes: routeTree,
      outDir: "dist",
      renderComponent: async () => "",
      getScriptContent: async () => "export async function load(ctx) {}",
    });

    // "/" is SSG (root, no dynamic), "/api/data" is SSR
    expect(result.skipped).toContain("/api/data");
  });

  it("HTML output contains DOCTYPE for SSG routes", async () => {
    const routeTree = makeRoute({
      pattern: "/",
      segments: [],
      page: "/app/page.vaisx",
    });

    const result = await prerender({
      routes: routeTree,
      outDir: "dist",
      renderComponent: async () => "<p>content</p>",
    });

    for (const file of result.files) {
      expect(file.html).toMatch(/<!DOCTYPE html>/i);
    }
  });
});
