/**
 * Client navigation tests (jsdom environment).
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { createRouter } from "../src/client/navigator.js";
import { interceptLinks } from "../src/client/link.js";
import { prefetchRoute, setupPrefetch } from "../src/client/prefetch.js";
import { createScrollManager } from "../src/client/scroll.js";
import type { RouteDefinition, RouteParams } from "../src/types.js";
import type { ResolvedRoute, RouterOptions } from "../src/client/navigator.js";

// ---------------------------------------------------------------------------
// Global setup: stub window.scrollTo which jsdom doesn't implement
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (typeof window !== "undefined" && !window.scrollTo.toString().includes("native")) {
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });
  }
});

// ---------------------------------------------------------------------------
// Shared fixture: a minimal route tree
// ---------------------------------------------------------------------------

const rootRoute: RouteDefinition = {
  pattern: "/",
  segments: [],
  page: "app/page.vaisx",
  layout: "app/layout.vaisx",
  middleware: [],
  children: [
    {
      pattern: "/about",
      segments: [{ type: "static", value: "about" }],
      page: "app/about/page.vaisx",
      middleware: [],
      children: [],
    },
    {
      pattern: "/blog",
      segments: [{ type: "static", value: "blog" }],
      page: "app/blog/page.vaisx",
      layout: "app/blog/layout.vaisx",
      middleware: [],
      children: [
        {
          pattern: "/blog/[slug]",
          segments: [
            { type: "static", value: "blog" },
            { type: "dynamic", value: "slug" },
          ],
          page: "app/blog/[slug]/page.vaisx",
          loading: "app/blog/[slug]/loading.vaisx",
          middleware: [],
          children: [],
        },
      ],
    },
  ],
};

function makeOptions(
  onNavigate: RouterOptions["onNavigate"]
): RouterOptions {
  return { routes: rootRoute, onNavigate };
}

// ---------------------------------------------------------------------------
// navigator.ts — createRouter
// ---------------------------------------------------------------------------

describe("createRouter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a router with a navigate method", () => {
    const router = createRouter(makeOptions(() => {}));
    expect(typeof router.navigate).toBe("function");
    expect(typeof router.back).toBe("function");
    expect(typeof router.forward).toBe("function");
    expect(typeof router.getCurrentRoute).toBe("function");
    expect(typeof router.start).toBe("function");
    expect(typeof router.destroy).toBe("function");
  });

  it("getCurrentRoute returns null before any navigation", () => {
    const router = createRouter(makeOptions(() => {}));
    expect(router.getCurrentRoute()).toBeNull();
  });

  it("navigate calls onNavigate with resolved route", async () => {
    const resolved: ResolvedRoute[] = [];
    const router = createRouter(
      makeOptions((r) => { resolved.push(r); })
    );

    await router.navigate("/about");

    expect(resolved).toHaveLength(1);
    expect(resolved[0].route.pattern).toBe("/about");
    expect(resolved[0].params).toEqual({});
  });

  it("navigate pushes to history by default", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const router = createRouter(makeOptions(() => {}));

    await router.navigate("/about");

    expect(pushState).toHaveBeenCalledWith(null, "", "/about");
  });

  it("navigate with replace:true calls replaceState", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const router = createRouter(makeOptions(() => {}));

    await router.navigate("/about", { replace: true });

    expect(replaceState).toHaveBeenCalledWith(null, "", "/about");
  });

  it("navigate resolves dynamic params correctly", async () => {
    const resolved: ResolvedRoute[] = [];
    const router = createRouter(makeOptions((r) => { resolved.push(r); }));

    await router.navigate("/blog/hello-world");

    expect(resolved).toHaveLength(1);
    expect(resolved[0].params).toEqual({ slug: "hello-world" });
    expect(resolved[0].loading).toBe("app/blog/[slug]/loading.vaisx");
  });

  it("navigate updates getCurrentRoute", async () => {
    const router = createRouter(makeOptions(() => {}));
    await router.navigate("/about");

    const current = router.getCurrentRoute();
    expect(current).not.toBeNull();
    expect(current!.route.pattern).toBe("/about");
  });

  it("start listens to popstate and destroy removes the listener", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const router = createRouter(makeOptions(() => {}));
    router.start();

    const added = addSpy.mock.calls.some((c) => c[0] === "popstate");
    expect(added).toBe(true);

    router.destroy();

    const removed = removeSpy.mock.calls.some((c) => c[0] === "popstate");
    expect(removed).toBe(true);
  });

  it("popstate triggers onNavigate", async () => {
    const resolved: ResolvedRoute[] = [];
    const router = createRouter(makeOptions((r) => { resolved.push(r); }));
    router.start();

    // Simulate pushState then popstate
    window.history.pushState(null, "", "/about");
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 0));

    // start() itself triggers a navigation for the current URL + popstate adds one more
    const aboutNavigations = resolved.filter(
      (r) => r.route.pattern === "/about"
    );
    expect(aboutNavigations.length).toBeGreaterThanOrEqual(1);

    router.destroy();
  });
});

// ---------------------------------------------------------------------------
// link.ts — interceptLinks
// ---------------------------------------------------------------------------

describe("interceptLinks", () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    cleanup?.();
    container.remove();
  });

  it("intercepts internal link clicks and calls router.navigate", async () => {
    const navigateMock = vi.fn().mockResolvedValue(undefined);
    const fakeRouter = { navigate: navigateMock } as any;

    cleanup = interceptLinks(fakeRouter, container);

    const a = document.createElement("a");
    a.href = "/about";
    a.setAttribute("href", "/about");
    container.appendChild(a);

    a.click();

    expect(navigateMock).toHaveBeenCalledWith("/about");
  });

  it("does not intercept external links", () => {
    const navigateMock = vi.fn();
    const fakeRouter = { navigate: navigateMock } as any;

    cleanup = interceptLinks(fakeRouter, container);

    const a = document.createElement("a");
    a.setAttribute("href", "https://external.com/page");
    container.appendChild(a);

    a.click();

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does not intercept target=_blank links", () => {
    const navigateMock = vi.fn();
    const fakeRouter = { navigate: navigateMock } as any;

    cleanup = interceptLinks(fakeRouter, container);

    const a = document.createElement("a");
    a.setAttribute("href", "/about");
    a.setAttribute("target", "_blank");
    container.appendChild(a);

    a.click();

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does not intercept download links", () => {
    const navigateMock = vi.fn();
    const fakeRouter = { navigate: navigateMock } as any;

    cleanup = interceptLinks(fakeRouter, container);

    const a = document.createElement("a");
    a.setAttribute("href", "/file.pdf");
    a.setAttribute("download", "");
    container.appendChild(a);

    a.click();

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("cleanup function removes the listener", () => {
    const navigateMock = vi.fn();
    const fakeRouter = { navigate: navigateMock } as any;

    const clean = interceptLinks(fakeRouter, container);
    clean();

    const a = document.createElement("a");
    a.setAttribute("href", "/about");
    container.appendChild(a);

    a.click();

    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// prefetch.ts — prefetchRoute & setupPrefetch
// ---------------------------------------------------------------------------

describe("prefetchRoute", () => {
  beforeEach(() => {
    // Clear head of any previous modulepreload links
    document
      .querySelectorAll('link[rel="modulepreload"]')
      .forEach((el) => el.remove());
  });

  it("adds a modulepreload link to document.head", () => {
    prefetchRoute("/test-prefetch");

    const link = document.querySelector(
      'link[rel="modulepreload"][href="/test-prefetch"]'
    );
    expect(link).not.toBeNull();
  });

  it("does not add duplicate modulepreload links", () => {
    prefetchRoute("/dedup-route");
    prefetchRoute("/dedup-route");

    const links = document.querySelectorAll(
      'link[rel="modulepreload"][href="/dedup-route"]'
    );
    expect(links.length).toBe(1);
  });
});

describe("setupPrefetch", () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    document
      .querySelectorAll('link[rel="modulepreload"]')
      .forEach((el) => el.remove());
  });

  afterEach(() => {
    cleanup?.();
    container.remove();
  });

  it("prefetches on mouseenter for internal links", () => {
    cleanup = setupPrefetch(container);

    const a = document.createElement("a");
    a.setAttribute("href", "/prefetch-on-hover");
    container.appendChild(a);

    a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    const link = document.querySelector(
      'link[rel="modulepreload"][href="/prefetch-on-hover"]'
    );
    expect(link).not.toBeNull();
  });

  it("does not prefetch external links on mouseenter", () => {
    cleanup = setupPrefetch(container);

    const a = document.createElement("a");
    a.setAttribute("href", "https://example.com/page");
    container.appendChild(a);

    a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    const link = document.querySelector(
      'link[rel="modulepreload"][href="https://example.com/page"]'
    );
    expect(link).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scroll.ts — createScrollManager
// ---------------------------------------------------------------------------

describe("createScrollManager", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.scrollTo(0, 0);
  });

  it("scrollToTop scrolls window to (0, 0)", () => {
    const scrollTo = vi.spyOn(window, "scrollTo");
    const sm = createScrollManager();
    sm.scrollToTop();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("save persists scroll position in sessionStorage", () => {
    const sm = createScrollManager();
    // Simulate a scroll position (jsdom always returns 0, so we mock)
    vi.spyOn(window, "scrollY", "get").mockReturnValue(300);
    vi.spyOn(window, "scrollX", "get").mockReturnValue(50);

    sm.save("/about");

    const raw = sessionStorage.getItem("__vaisx_scroll__");
    expect(raw).not.toBeNull();
    const map = JSON.parse(raw!);
    expect(map["/about"]).toEqual({ x: 50, y: 300 });
  });

  it("restore scrolls to saved position", () => {
    const scrollTo = vi.spyOn(window, "scrollTo");
    const sm = createScrollManager();

    // Pre-populate sessionStorage
    sessionStorage.setItem(
      "__vaisx_scroll__",
      JSON.stringify({ "/blog": { x: 0, y: 500 } })
    );

    sm.restore("/blog");

    expect(scrollTo).toHaveBeenCalledWith(0, 500);
  });

  it("restore scrolls to top if no saved position", () => {
    const scrollTo = vi.spyOn(window, "scrollTo");
    const sm = createScrollManager();

    sm.restore("/unknown");

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
