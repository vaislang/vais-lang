/**
 * SSR rendering benchmarks.
 *
 * Targets:
 *   - Simple component (static text):      < 1ms
 *   - Medium component (3 layouts + page): < 5ms
 *   - Complex component (10 layouts):      < 20ms
 */

import { bench, describe } from "vitest";
import { renderToString } from "../src/ssr/renderer.js";
import type { RenderOptions } from "../src/ssr/renderer.js";
import type { ResolvedRoute } from "../src/router/resolver.js";
import type { RouteDefinition } from "../src/types.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeRouteDefinition(overrides: Partial<RouteDefinition> = {}): RouteDefinition {
  return {
    pattern: "/",
    segments: [{ type: "static", value: "" }],
    page: "/app/page.vaisx",
    middleware: [],
    children: [],
    ...overrides,
  };
}

function makeResolvedRoute(overrides: Partial<ResolvedRoute> = {}): ResolvedRoute {
  return {
    route: makeRouteDefinition(),
    params: {},
    layoutChain: [],
    errorBoundary: null,
    loading: null,
    middlewareChain: [],
    ...overrides,
  };
}

/**
 * Build a renderComponent mock that returns deterministic HTML
 * based on the file path index.
 */
function makeRenderComponent(
  layoutHtml: (index: number) => string = (i) => `<div class="layout-${i}">{slot}</div>`,
  pageHtml: string = "<main><h1>Hello, World!</h1><p>Static page content.</p></main>"
): RenderOptions["renderComponent"] {
  return async (filePath: string) => {
    if (filePath === "/app/page.vaisx") {
      return pageHtml;
    }
    // layout paths are like /app/layout-0.vaisx, /app/layout-1.vaisx, …
    const match = filePath.match(/layout-(\d+)\.vaisx$/);
    const index = match ? Number(match[1]) : 0;
    return layoutHtml(index);
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** Simple: single page component, no layouts */
const simpleOptions: RenderOptions = {
  route: makeResolvedRoute(),
  renderComponent: async () => "<p>Hello, World!</p>",
};

/** Medium: page + 3 nested layouts */
const mediumLayouts = [
  "/app/layout-0.vaisx",
  "/app/blog/layout-1.vaisx",
  "/app/blog/posts/layout-2.vaisx",
];
const mediumOptions: RenderOptions = {
  route: makeResolvedRoute({ layoutChain: mediumLayouts }),
  renderComponent: makeRenderComponent(),
  scripts: ["/bundle.js"],
  styles: ["/styles.css"],
};

/** Complex: page + 10 nested layouts */
const complexLayouts = Array.from(
  { length: 10 },
  (_, i) => `/app/nested/layout-${i}.vaisx`
);
const complexOptions: RenderOptions = {
  route: makeResolvedRoute({ layoutChain: complexLayouts }),
  renderComponent: makeRenderComponent(
    (i) =>
      `<section class="l${i}" data-depth="${i}" aria-label="layout-${i}">{slot}</section>`,
    "<article><h1>Deep page</h1>" +
      Array.from({ length: 20 }, (_, i) => `<p>Paragraph ${i + 1} with some content.</p>`).join("") +
      "</article>"
  ),
  scripts: ["/app.js", "/vendor.js"],
  styles: ["/main.css", "/theme.css"],
};

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("SSR Rendering", () => {
  bench("simple component — static text, no layouts", async () => {
    await renderToString(simpleOptions);
  });

  bench("medium component — 3 layouts + page", async () => {
    await renderToString(mediumOptions);
  });

  bench("complex component — 10 nested layouts", async () => {
    await renderToString(complexOptions);
  });
});
