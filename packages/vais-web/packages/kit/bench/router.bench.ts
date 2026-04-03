/**
 * Router matching benchmarks.
 *
 * A route tree with 100+ routes is generated programmatically.
 *
 * Targets:
 *   - Static route match:       < 0.1ms
 *   - Dynamic route match:      < 0.5ms
 *   - Deeply nested (5 levels): < 1ms
 */

import { bench, describe } from "vitest";
import { matchRoute } from "../src/router/matcher.js";
import type { RouteDefinition } from "../src/types.js";

// ---------------------------------------------------------------------------
// Route tree generation helpers
// ---------------------------------------------------------------------------

function makeLeaf(
  segment: string,
  type: "static" | "dynamic" | "catch-all" = "static"
): RouteDefinition {
  return {
    pattern: `/${segment}`,
    segments: [{ type, value: segment }],
    page: `/app/${segment}/page.vaisx`,
    middleware: [],
    children: [],
  };
}

function makeNode(
  segment: string,
  type: "static" | "dynamic" | "catch-all",
  children: RouteDefinition[]
): RouteDefinition {
  return {
    pattern: `/${segment}`,
    segments: [{ type, value: segment }],
    page: `/app/${segment}/page.vaisx`,
    layout: `/app/${segment}/layout.vaisx`,
    middleware: [],
    children,
  };
}

/**
 * Build a large, realistic route tree with 100+ routes.
 *
 * Structure overview:
 *   /                          ← root (index)
 *   /about
 *   /contact
 *   /pricing
 *   /blog                      ← has 20 static sub-pages + dynamic [slug]
 *   /blog/[slug]
 *   /blog/[slug]/comments
 *   /docs                      ← has 30 static section pages
 *   /docs/[...rest]            ← catch-all
 *   /products                  ← has 20 static product pages + dynamic [id]
 *   /products/[id]
 *   /products/[id]/reviews
 *   /dashboard                 ← 5-level deep nesting for deep-nest bench
 *   /dashboard/settings
 *   /dashboard/settings/profile
 *   /dashboard/settings/profile/security
 *   /dashboard/settings/profile/security/sessions
 *   /api/[...path]
 *   … misc static routes to push total well past 100
 */
function buildLargeRouteTree(): RouteDefinition {
  // --- Blog section (20 static posts + dynamic slug) ---
  const blogChildren: RouteDefinition[] = [];

  for (let i = 1; i <= 20; i++) {
    blogChildren.push(makeLeaf(`post-${i}`));
  }

  const blogSlugComments: RouteDefinition = makeLeaf("comments");
  const blogSlug: RouteDefinition = {
    ...makeNode("slug", "dynamic", [blogSlugComments]),
    pattern: "/blog/[slug]",
    segments: [{ type: "dynamic", value: "slug" }],
  };
  blogChildren.push(blogSlug);

  const blogNode = makeNode("blog", "static", blogChildren);

  // --- Docs section (30 static section pages + catch-all) ---
  const docsChildren: RouteDefinition[] = [];

  const docsSections = [
    "getting-started", "installation", "configuration", "deployment",
    "authentication", "routing", "data-loading", "server-actions",
    "middleware", "adapters", "ssr", "ssg", "hydration",
    "components", "layouts", "error-handling", "loading-states",
    "prefetching", "caching", "streaming",
  ];
  for (const section of docsSections) {
    docsChildren.push(makeLeaf(section));
  }
  // add extra static pages to ensure 30+
  for (let i = 1; i <= 10; i++) {
    docsChildren.push(makeLeaf(`guide-${i}`));
  }

  const docsCatchAll: RouteDefinition = {
    pattern: "/docs/[...rest]",
    segments: [{ type: "catch-all", value: "rest" }],
    page: "/app/docs/[...rest]/page.vaisx",
    middleware: [],
    children: [],
  };
  docsChildren.push(docsCatchAll);

  const docsNode = makeNode("docs", "static", docsChildren);

  // --- Products section (20 static product pages + dynamic [id]) ---
  const productChildren: RouteDefinition[] = [];

  for (let i = 1; i <= 20; i++) {
    productChildren.push(makeLeaf(`product-${i}`));
  }

  const productReviews: RouteDefinition = makeLeaf("reviews");
  const productId: RouteDefinition = {
    ...makeNode("id", "dynamic", [productReviews]),
    pattern: "/products/[id]",
    segments: [{ type: "dynamic", value: "id" }],
  };
  productChildren.push(productId);

  const productsNode = makeNode("products", "static", productChildren);

  // --- Dashboard — 5-level deep nesting ---
  const sessions = makeLeaf("sessions");
  const security: RouteDefinition = makeNode("security", "static", [sessions]);
  const profile: RouteDefinition = makeNode("profile", "static", [security]);
  const settings: RouteDefinition = makeNode("settings", "static", [profile]);
  const dashboard: RouteDefinition = makeNode("dashboard", "static", [settings]);

  // --- API catch-all ---
  const apiCatchAll: RouteDefinition = {
    pattern: "/api/[...path]",
    segments: [{ type: "catch-all", value: "path" }],
    page: undefined,
    middleware: [],
    children: [],
  };
  const apiNode = makeNode("api", "static", [apiCatchAll]);

  // --- Misc top-level static routes ---
  const topLevelStatic = [
    "about", "contact", "pricing", "careers", "press",
    "legal", "privacy", "terms", "cookies", "sitemap",
    "status", "changelog", "support", "faq",
  ].map((s) => makeLeaf(s));

  // --- Root ---
  const root: RouteDefinition = {
    pattern: "/",
    segments: [],
    page: "/app/page.vaisx",
    layout: "/app/layout.vaisx",
    middleware: ["/app/middleware.vais"],
    children: [
      ...topLevelStatic,
      blogNode,
      docsNode,
      productsNode,
      dashboard,
      apiNode,
    ],
  };

  return root;
}

// Build once; reuse across all bench iterations
const routeTree = buildLargeRouteTree();

// ---------------------------------------------------------------------------
// Verify route count (informational — not a benchmark)
// ---------------------------------------------------------------------------

function countRoutes(node: RouteDefinition): number {
  return 1 + node.children.reduce((acc, c) => acc + countRoutes(c), 0);
}

const totalRoutes = countRoutes(routeTree);
// totalRoutes should be well over 100
if (totalRoutes < 100) {
  throw new Error(`Route tree only has ${totalRoutes} routes — need 100+`);
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe(`Router Matching (${totalRoutes} routes in tree)`, () => {
  bench("static route — /about", () => {
    matchRoute("/about", routeTree);
  });

  bench("static route — /pricing", () => {
    matchRoute("/pricing", routeTree);
  });

  bench("static route — /docs/installation", () => {
    matchRoute("/docs/installation", routeTree);
  });

  bench("dynamic route — /blog/[slug] (hello-world)", () => {
    matchRoute("/blog/hello-world", routeTree);
  });

  bench("dynamic route — /products/[id] (42)", () => {
    matchRoute("/products/42", routeTree);
  });

  bench("dynamic route — /products/[id]/reviews", () => {
    matchRoute("/products/42/reviews", routeTree);
  });

  bench("catch-all — /docs/[...rest] (a/b/c)", () => {
    matchRoute("/docs/a/b/c", routeTree);
  });

  bench("catch-all — /api/[...path] (v2/users/me)", () => {
    matchRoute("/api/v2/users/me", routeTree);
  });

  bench("deeply nested (5 levels) — /dashboard/settings/profile/security/sessions", () => {
    matchRoute("/dashboard/settings/profile/security/sessions", routeTree);
  });

  bench("root route — /", () => {
    matchRoute("/", routeTree);
  });
});
