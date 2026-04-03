import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseDirSegment,
  scanAppDir,
  buildRouteTree,
  generateManifest,
  matchRoute,
} from "../src/router/index.js";
import type { RouteDefinition } from "../src/index.js";

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

// ---------------------------------------------------------------------------
// Test fixture directory
// ---------------------------------------------------------------------------

let appDir: string;

beforeAll(async () => {
  appDir = join(tmpdir(), `vaisx-router-test-${Date.now()}`);

  // Structure:
  //   app/
  //     page.vaisx            → "/"
  //     layout.vaisx          → root layout
  //     middleware.vais        → root middleware
  //     about/
  //       page.vaisx          → "/about"
  //     blog/
  //       layout.vaisx        → "/blog" layout
  //       page.vaisx          → "/blog"
  //       [slug]/
  //         page.vaisx        → "/blog/[slug]"
  //         loading.vaisx
  //     docs/
  //       [...rest]/
  //         page.vaisx        → "/docs/[...rest]"
  //     (admin)/
  //       layout.vaisx        → group layout (not in URL)
  //       dashboard/
  //         page.vaisx        → "/dashboard"
  //     api/
  //       route.vais          → "/api" API route
  //     (marketing)/
  //       landing/
  //         page.vaisx        → "/landing"
  //         error.vaisx

  await mkdirs(
    appDir,
    join(appDir, "about"),
    join(appDir, "blog"),
    join(appDir, "blog", "[slug]"),
    join(appDir, "docs", "[...rest]"),
    join(appDir, "(admin)", "dashboard"),
    join(appDir, "api"),
    join(appDir, "(marketing)", "landing")
  );

  // Root
  await touch(join(appDir, "page.vaisx"));
  await touch(join(appDir, "layout.vaisx"));
  await touch(join(appDir, "middleware.vais"));

  // about
  await touch(join(appDir, "about", "page.vaisx"));

  // blog
  await touch(join(appDir, "blog", "layout.vaisx"));
  await touch(join(appDir, "blog", "page.vaisx"));
  await touch(join(appDir, "blog", "[slug]", "page.vaisx"));
  await touch(join(appDir, "blog", "[slug]", "loading.vaisx"));

  // docs/[...rest]
  await touch(join(appDir, "docs", "[...rest]", "page.vaisx"));

  // (admin)/dashboard
  await touch(join(appDir, "(admin)", "layout.vaisx"));
  await touch(join(appDir, "(admin)", "dashboard", "page.vaisx"));

  // api
  await touch(join(appDir, "api", "route.vais"));

  // (marketing)/landing
  await touch(join(appDir, "(marketing)", "landing", "page.vaisx"));
  await touch(join(appDir, "(marketing)", "landing", "error.vaisx"));
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. parseDirSegment
// ---------------------------------------------------------------------------

describe("parseDirSegment", () => {
  it("parses static segments", () => {
    expect(parseDirSegment("about")).toEqual({ type: "static", value: "about" });
    expect(parseDirSegment("blog")).toEqual({ type: "static", value: "blog" });
  });

  it("parses dynamic segments", () => {
    expect(parseDirSegment("[slug]")).toEqual({ type: "dynamic", value: "slug" });
    expect(parseDirSegment("[id]")).toEqual({ type: "dynamic", value: "id" });
  });

  it("parses catch-all segments", () => {
    expect(parseDirSegment("[...rest]")).toEqual({ type: "catch-all", value: "rest" });
    expect(parseDirSegment("[...path]")).toEqual({ type: "catch-all", value: "path" });
  });

  it("parses group segments", () => {
    expect(parseDirSegment("(admin)")).toEqual({ type: "group", value: "admin" });
    expect(parseDirSegment("(marketing)")).toEqual({ type: "group", value: "marketing" });
  });
});

// ---------------------------------------------------------------------------
// 2. scanAppDir
// ---------------------------------------------------------------------------

describe("scanAppDir", () => {
  it("discovers all special files in app directory", async () => {
    const files = await scanAppDir(appDir);
    const names = files.map((f) => f.fileName);
    expect(names).toContain("page.vaisx");
    expect(names).toContain("layout.vaisx");
    expect(names).toContain("middleware.vais");
    expect(names).toContain("route.vais");
    expect(names).toContain("loading.vaisx");
    expect(names).toContain("error.vaisx");
  });

  it("returns absolute paths", async () => {
    const files = await scanAppDir(appDir);
    for (const f of files) {
      expect(f.absolutePath.startsWith("/")).toBe(true);
    }
  });

  it("parses segments for nested files", async () => {
    const files = await scanAppDir(appDir);
    const slugPage = files.find(
      (f) =>
        f.fileName === "page.vaisx" &&
        f.segments.some((s) => s.type === "dynamic" && s.value === "slug")
    );
    expect(slugPage).toBeDefined();
    expect(slugPage!.segments).toEqual([
      { type: "static", value: "blog" },
      { type: "dynamic", value: "slug" },
    ]);
  });

  it("parses catch-all segments", async () => {
    const files = await scanAppDir(appDir);
    const catchPage = files.find(
      (f) =>
        f.fileName === "page.vaisx" &&
        f.segments.some((s) => s.type === "catch-all")
    );
    expect(catchPage).toBeDefined();
    expect(catchPage!.segments).toEqual([
      { type: "static", value: "docs" },
      { type: "catch-all", value: "rest" },
    ]);
  });

  it("handles group directory segments", async () => {
    const files = await scanAppDir(appDir);
    const adminPage = files.find(
      (f) =>
        f.fileName === "page.vaisx" &&
        f.segments.some((s) => s.type === "group" && s.value === "admin")
    );
    expect(adminPage).toBeDefined();
    expect(adminPage!.segments).toEqual([
      { type: "group", value: "admin" },
      { type: "static", value: "dashboard" },
    ]);
  });

  it("returns an empty array for a non-existent directory", async () => {
    const files = await scanAppDir("/non/existent/path/xyz");
    expect(files).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. buildRouteTree
// ---------------------------------------------------------------------------

describe("buildRouteTree", () => {
  let tree: RouteDefinition;

  beforeAll(async () => {
    tree = await buildRouteTree(appDir);
  });

  it("root has pattern '/'", () => {
    expect(tree.pattern).toBe("/");
  });

  it("root has page and layout assigned", () => {
    expect(tree.page).toBeDefined();
    expect(tree.layout).toBeDefined();
  });

  it("root middleware is collected", () => {
    expect(tree.middleware.length).toBeGreaterThanOrEqual(1);
  });

  it("creates children for top-level directories", () => {
    const patterns = tree.children.map((c) => c.pattern);
    expect(patterns).toContain("/about");
    expect(patterns).toContain("/blog");
    expect(patterns).toContain("/api");
  });

  it("group routes do NOT appear in URL patterns", () => {
    function collectPatterns(node: RouteDefinition): string[] {
      return [node.pattern, ...node.children.flatMap(collectPatterns)];
    }
    const all = collectPatterns(tree);
    // (admin) and (marketing) should not appear in any pattern
    for (const p of all) {
      expect(p).not.toMatch(/\(admin\)/);
      expect(p).not.toMatch(/\(marketing\)/);
    }
  });

  it("group routes expose children at correct URL paths", () => {
    function findPattern(node: RouteDefinition, target: string): RouteDefinition | null {
      if (node.pattern === target) return node;
      for (const c of node.children) {
        const found = findPattern(c, target);
        if (found) return found;
      }
      return null;
    }
    const dashboard = findPattern(tree, "/dashboard");
    expect(dashboard).not.toBeNull();
    expect(dashboard!.page).toBeDefined();
  });

  it("dynamic segment creates correct pattern", () => {
    function findPattern(node: RouteDefinition, target: string): RouteDefinition | null {
      if (node.pattern === target) return node;
      for (const c of node.children) {
        const found = findPattern(c, target);
        if (found) return found;
      }
      return null;
    }
    const blogSlug = findPattern(tree, "/blog/[slug]");
    expect(blogSlug).not.toBeNull();
    expect(blogSlug!.page).toBeDefined();
    expect(blogSlug!.loading).toBeDefined();
  });

  it("catch-all segment creates correct pattern", () => {
    function findPattern(node: RouteDefinition, target: string): RouteDefinition | null {
      if (node.pattern === target) return node;
      for (const c of node.children) {
        const found = findPattern(c, target);
        if (found) return found;
      }
      return null;
    }
    const docsRest = findPattern(tree, "/docs/[...rest]");
    expect(docsRest).not.toBeNull();
  });

  it("API route is assigned correctly", () => {
    function findPattern(node: RouteDefinition, target: string): RouteDefinition | null {
      if (node.pattern === target) return node;
      for (const c of node.children) {
        const found = findPattern(c, target);
        if (found) return found;
      }
      return null;
    }
    const api = findPattern(tree, "/api");
    expect(api).not.toBeNull();
    expect(api!.apiRoute).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. matchRoute
// ---------------------------------------------------------------------------

describe("matchRoute", () => {
  let tree: RouteDefinition;

  beforeAll(async () => {
    tree = await buildRouteTree(appDir);
  });

  it("matches root '/'", () => {
    const match = matchRoute("/", tree);
    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/");
    expect(match!.params).toEqual({});
  });

  it("matches static route '/about'", () => {
    const match = matchRoute("/about", tree);
    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/about");
    expect(match!.params).toEqual({});
  });

  it("extracts dynamic param: '/blog/hello' → params.slug = 'hello'", () => {
    const match = matchRoute("/blog/hello", tree);
    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/blog/[slug]");
    expect(match!.params).toEqual({ slug: "hello" });
  });

  it("extracts catch-all params: '/docs/a/b/c' → params.rest = ['a','b','c']", () => {
    const match = matchRoute("/docs/a/b/c", tree);
    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/docs/[...rest]");
    expect(match!.params).toEqual({ rest: ["a", "b", "c"] });
  });

  it("catch-all matches single segment: '/docs/intro'", () => {
    const match = matchRoute("/docs/intro", tree);
    expect(match).not.toBeNull();
    expect(match!.params).toEqual({ rest: ["intro"] });
  });

  it("group route '/dashboard' matches without '(admin)' in pattern", () => {
    const match = matchRoute("/dashboard", tree);
    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/dashboard");
  });

  it("layoutChain includes root layout for '/'", () => {
    const match = matchRoute("/", tree);
    expect(match).not.toBeNull();
    expect(match!.layoutChain.length).toBeGreaterThanOrEqual(1);
    expect(match!.layoutChain[0]).toContain("layout.vaisx");
  });

  it("layoutChain includes blog layout for '/blog/hello'", () => {
    const match = matchRoute("/blog/hello", tree);
    expect(match).not.toBeNull();
    // Should have root layout + blog layout
    const hasRootLayout = match!.layoutChain.some((p) =>
      p.endsWith("layout.vaisx") && !p.includes("blog")
    );
    const hasBlogLayout = match!.layoutChain.some((p) => p.includes("blog"));
    expect(hasRootLayout).toBe(true);
    expect(hasBlogLayout).toBe(true);
  });

  it("returns null for unmatched route", () => {
    const match = matchRoute("/non/existent/route", tree);
    expect(match).toBeNull();
  });

  it("strips query string when matching: '/about?foo=bar'", () => {
    const match = matchRoute("/about?foo=bar", tree);
    expect(match).not.toBeNull();
    expect(match!.route.pattern).toBe("/about");
  });
});

// ---------------------------------------------------------------------------
// 5. generateManifest
// ---------------------------------------------------------------------------

describe("generateManifest", () => {
  it("includes all routes and module paths", async () => {
    const tree = await buildRouteTree(appDir);
    const manifest = generateManifest(tree);

    expect(manifest.routes.length).toBeGreaterThan(0);
    // Root page should be in modules
    expect(manifest.modules["/"]).toBeDefined();
    expect(manifest.modules["/about"]).toBeDefined();
    expect(manifest.modules["/blog/[slug]"]).toBeDefined();
  });

  it("manifest routes array matches collectAllRoutes depth-first", async () => {
    const tree = await buildRouteTree(appDir);
    const manifest = generateManifest(tree);

    // First route should be root
    expect(manifest.routes[0].pattern).toBe("/");
  });

  it("API route is included in modules", async () => {
    const tree = await buildRouteTree(appDir);
    const manifest = generateManifest(tree);
    expect(manifest.modules["/api"]).toBeDefined();
  });
});
