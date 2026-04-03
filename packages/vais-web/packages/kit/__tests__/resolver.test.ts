import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildRouteTree,
  matchRoute,
  resolveLayoutChain,
  resolveErrorBoundary,
  resolveLoading,
  resolveRoute,
} from "../src/router/index.js";
import type { RouteDefinition } from "../src/index.js";
import type { ResolvedRoute } from "../src/router/resolver.js";

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

function findPattern(
  node: RouteDefinition,
  target: string
): RouteDefinition | null {
  if (node.pattern === target) return node;
  for (const c of node.children) {
    const found = findPattern(c, target);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test fixture directory
// ---------------------------------------------------------------------------
//
// Structure:
//   app/
//     page.vaisx              → "/"
//     layout.vaisx            → root layout
//     error.vaisx             → root error boundary
//     middleware.vais         → root middleware
//     blog/
//       layout.vaisx          → blog layout
//       page.vaisx            → "/blog"
//       error.vaisx           → blog error boundary
//       [slug]/
//         page.vaisx          → "/blog/[slug]"
//         loading.vaisx       → slug loading
//     about/
//       page.vaisx            → "/about"
//       loading.vaisx         → about loading
//     docs/
//       [...rest]/
//         page.vaisx          → "/docs/[...rest]"
//     (admin)/
//       layout.vaisx          → admin group layout
//       middleware.vais       → admin middleware
//       dashboard/
//         page.vaisx          → "/dashboard"
//     (marketing)/
//       landing/
//         page.vaisx          → "/landing"
//         error.vaisx         → landing error boundary
//     api/
//       route.vais            → "/api" API route

let appDir: string;
let tree: RouteDefinition;

beforeAll(async () => {
  appDir = join(tmpdir(), `vaisx-resolver-test-${Date.now()}`);

  await mkdirs(
    appDir,
    join(appDir, "blog"),
    join(appDir, "blog", "[slug]"),
    join(appDir, "about"),
    join(appDir, "docs", "[...rest]"),
    join(appDir, "(admin)", "dashboard"),
    join(appDir, "(marketing)", "landing"),
    join(appDir, "api")
  );

  // Root
  await touch(join(appDir, "page.vaisx"));
  await touch(join(appDir, "layout.vaisx"));
  await touch(join(appDir, "error.vaisx"));
  await touch(join(appDir, "middleware.vais"));

  // blog
  await touch(join(appDir, "blog", "layout.vaisx"));
  await touch(join(appDir, "blog", "page.vaisx"));
  await touch(join(appDir, "blog", "error.vaisx"));

  // blog/[slug]
  await touch(join(appDir, "blog", "[slug]", "page.vaisx"));
  await touch(join(appDir, "blog", "[slug]", "loading.vaisx"));

  // about
  await touch(join(appDir, "about", "page.vaisx"));
  await touch(join(appDir, "about", "loading.vaisx"));

  // docs/[...rest]
  await touch(join(appDir, "docs", "[...rest]", "page.vaisx"));

  // (admin)/dashboard
  await touch(join(appDir, "(admin)", "layout.vaisx"));
  await touch(join(appDir, "(admin)", "middleware.vais"));
  await touch(join(appDir, "(admin)", "dashboard", "page.vaisx"));

  // (marketing)/landing
  await touch(join(appDir, "(marketing)", "landing", "page.vaisx"));
  await touch(join(appDir, "(marketing)", "landing", "error.vaisx"));

  // api
  await touch(join(appDir, "api", "route.vais"));

  tree = await buildRouteTree(appDir);
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. resolveLayoutChain
// ---------------------------------------------------------------------------

describe("resolveLayoutChain", () => {
  it("root layout chain contains root layout", () => {
    const match = matchRoute("/", tree);
    expect(match).not.toBeNull();
    const chain = resolveLayoutChain(tree, match!);
    expect(chain.length).toBeGreaterThanOrEqual(1);
    expect(chain[0]).toContain("layout.vaisx");
  });

  it("/blog/hello layout chain contains root and blog layouts in order", () => {
    const match = matchRoute("/blog/hello", tree);
    expect(match).not.toBeNull();
    const chain = resolveLayoutChain(tree, match!);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    // root layout first
    const rootIdx = chain.findIndex(
      (p) => p.endsWith("layout.vaisx") && !p.includes("blog")
    );
    const blogIdx = chain.findIndex((p) => p.includes("blog") && p.endsWith("layout.vaisx"));
    expect(rootIdx).not.toBe(-1);
    expect(blogIdx).not.toBe(-1);
    expect(rootIdx).toBeLessThan(blogIdx);
  });

  it("/dashboard layout chain includes admin group layout", () => {
    const match = matchRoute("/dashboard", tree);
    expect(match).not.toBeNull();
    const chain = resolveLayoutChain(tree, match!);
    // Should include the admin group layout
    const hasAdminLayout = chain.some((p) => p.includes("(admin)") || p.includes("admin"));
    expect(hasAdminLayout).toBe(true);
  });

  it("/about has only root layout (no about-specific layout)", () => {
    const match = matchRoute("/about", tree);
    expect(match).not.toBeNull();
    const chain = resolveLayoutChain(tree, match!);
    // Root layout should be present
    expect(chain.some((p) => p.endsWith("layout.vaisx"))).toBe(true);
    // No about-specific layout
    expect(chain.some((p) => p.includes("about"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveErrorBoundary
// ---------------------------------------------------------------------------

describe("resolveErrorBoundary", () => {
  it("returns null when route has no error boundary in the tree", () => {
    // Build a minimal tree with no error files
    const minimalTree: RouteDefinition = {
      pattern: "/",
      segments: [],
      middleware: [],
      children: [
        {
          pattern: "/foo",
          segments: [{ type: "static", value: "foo" }],
          page: "app/foo/page.vaisx",
          middleware: [],
          children: [],
        },
      ],
    };
    const match = matchRoute("/foo", minimalTree);
    expect(match).not.toBeNull();
    const result = resolveErrorBoundary(minimalTree, match!);
    expect(result).toBeNull();
  });

  it("finds error boundary on the matched route itself", () => {
    const match = matchRoute("/landing", tree);
    expect(match).not.toBeNull();
    const result = resolveErrorBoundary(tree, match!);
    expect(result).not.toBeNull();
    expect(result).toContain("error.vaisx");
  });

  it("finds closest ancestor error boundary: /blog/hello uses blog error.vaisx", () => {
    const match = matchRoute("/blog/hello", tree);
    expect(match).not.toBeNull();
    const result = resolveErrorBoundary(tree, match!);
    expect(result).not.toBeNull();
    // The closest error boundary should be the blog-level one (slug has none)
    expect(result).toContain("error.vaisx");
    expect(result).toContain("blog");
  });

  it("falls back to root error boundary for /about", () => {
    const match = matchRoute("/about", tree);
    expect(match).not.toBeNull();
    const result = resolveErrorBoundary(tree, match!);
    expect(result).not.toBeNull();
    // Root error.vaisx should be returned since about has no error.vaisx
    expect(result).toContain("error.vaisx");
    expect(result).not.toContain("blog");
    expect(result).not.toContain("about");
  });
});

// ---------------------------------------------------------------------------
// 3. resolveLoading
// ---------------------------------------------------------------------------

describe("resolveLoading", () => {
  it("returns null when route has no loading file in the tree", () => {
    const minimalTree: RouteDefinition = {
      pattern: "/",
      segments: [],
      middleware: [],
      children: [
        {
          pattern: "/bar",
          segments: [{ type: "static", value: "bar" }],
          page: "app/bar/page.vaisx",
          middleware: [],
          children: [],
        },
      ],
    };
    const match = matchRoute("/bar", minimalTree);
    expect(match).not.toBeNull();
    const result = resolveLoading(minimalTree, match!);
    expect(result).toBeNull();
  });

  it("finds loading.vaisx on the matched route itself: /blog/hello", () => {
    const match = matchRoute("/blog/hello", tree);
    expect(match).not.toBeNull();
    const result = resolveLoading(tree, match!);
    expect(result).not.toBeNull();
    expect(result).toContain("loading.vaisx");
  });

  it("finds loading.vaisx for /about", () => {
    const match = matchRoute("/about", tree);
    expect(match).not.toBeNull();
    const result = resolveLoading(tree, match!);
    expect(result).not.toBeNull();
    expect(result).toContain("loading.vaisx");
    expect(result).toContain("about");
  });

  it("returns null for /dashboard which has no loading file", () => {
    const match = matchRoute("/dashboard", tree);
    expect(match).not.toBeNull();
    const result = resolveLoading(tree, match!);
    // Neither dashboard, admin group, nor root has loading.vaisx
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. resolveRoute
// ---------------------------------------------------------------------------

describe("resolveRoute", () => {
  it("returns null for an unmatched URL", () => {
    const result = resolveRoute("/does/not/exist", tree);
    expect(result).toBeNull();
  });

  it("resolves root '/'", () => {
    const result = resolveRoute("/", tree);
    expect(result).not.toBeNull();
    expect(result!.route.pattern).toBe("/");
    expect(result!.params).toEqual({});
  });

  it("resolves /blog/hello with correct params and layout chain", () => {
    const result = resolveRoute("/blog/hello", tree);
    expect(result).not.toBeNull();
    expect(result!.route.pattern).toBe("/blog/[slug]");
    expect(result!.params).toEqual({ slug: "hello" });

    // Layout chain: root layout → blog layout
    const rootIdx = result!.layoutChain.findIndex(
      (p) => p.endsWith("layout.vaisx") && !p.includes("blog")
    );
    const blogIdx = result!.layoutChain.findIndex(
      (p) => p.includes("blog") && p.endsWith("layout.vaisx")
    );
    expect(rootIdx).not.toBe(-1);
    expect(blogIdx).not.toBe(-1);
    expect(rootIdx).toBeLessThan(blogIdx);
  });

  it("resolves /blog/hello with closest error boundary (blog)", () => {
    const result = resolveRoute("/blog/hello", tree);
    expect(result).not.toBeNull();
    expect(result!.errorBoundary).not.toBeNull();
    expect(result!.errorBoundary).toContain("blog");
    expect(result!.errorBoundary).toContain("error.vaisx");
  });

  it("resolves /blog/hello with loading from slug directory", () => {
    const result = resolveRoute("/blog/hello", tree);
    expect(result).not.toBeNull();
    expect(result!.loading).not.toBeNull();
    expect(result!.loading).toContain("loading.vaisx");
  });

  it("resolves /dashboard with group layout included", () => {
    const result = resolveRoute("/dashboard", tree);
    expect(result).not.toBeNull();
    expect(result!.route.pattern).toBe("/dashboard");
    const hasGroupLayout = result!.layoutChain.some(
      (p) => p.includes("(admin)") || p.includes("admin")
    );
    expect(hasGroupLayout).toBe(true);
  });

  it("resolves /dashboard with no loading state", () => {
    const result = resolveRoute("/dashboard", tree);
    expect(result).not.toBeNull();
    expect(result!.loading).toBeNull();
  });

  it("includes middleware chain for root middleware", () => {
    const result = resolveRoute("/about", tree);
    expect(result).not.toBeNull();
    // Root middleware should be present
    expect(result!.middlewareChain.length).toBeGreaterThanOrEqual(1);
    expect(result!.middlewareChain.some((m) => m.includes("middleware.vais"))).toBe(true);
  });

  it("includes middleware chain for admin group: /dashboard", () => {
    const result = resolveRoute("/dashboard", tree);
    expect(result).not.toBeNull();
    // Should have root middleware + admin middleware
    expect(result!.middlewareChain.length).toBeGreaterThanOrEqual(2);
    const hasAdminMw = result!.middlewareChain.some((m) => m.includes("(admin)") || m.includes("admin"));
    expect(hasAdminMw).toBe(true);
  });

  it("resolves catch-all route /docs/a/b/c", () => {
    const result = resolveRoute("/docs/a/b/c", tree);
    expect(result).not.toBeNull();
    expect(result!.route.pattern).toBe("/docs/[...rest]");
    expect(result!.params).toEqual({ rest: ["a", "b", "c"] });
  });

  it("ResolvedRoute has all required fields", () => {
    const result = resolveRoute("/blog/hello", tree);
    expect(result).not.toBeNull();
    const r = result as ResolvedRoute;
    expect(r).toHaveProperty("route");
    expect(r).toHaveProperty("params");
    expect(r).toHaveProperty("layoutChain");
    expect(r).toHaveProperty("errorBoundary");
    expect(r).toHaveProperty("loading");
    expect(r).toHaveProperty("middlewareChain");
    expect(Array.isArray(r.layoutChain)).toBe(true);
    expect(Array.isArray(r.middlewareChain)).toBe(true);
  });
});
