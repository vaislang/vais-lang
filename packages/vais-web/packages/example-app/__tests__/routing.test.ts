/**
 * Routing tests — route matching and navigation.
 */

import { describe, it, expect } from "vitest";
import { Router, createRouter, VaisXApp } from "../src/app.js";
import { HomePage } from "../src/pages/home.js";
import { AboutPage } from "../src/pages/about.js";

// ── Router.match ───────────────────────────────────────────────────────────────

describe("Router — match()", () => {
  it("matches the root path /", () => {
    const router = createRouter();
    const match = router.match("/");
    expect(match).not.toBeNull();
  });

  it("matches /about", () => {
    const router = createRouter();
    const match = router.match("/about");
    expect(match).not.toBeNull();
  });

  it("matches /posts/create", () => {
    const router = createRouter();
    const match = router.match("/posts/create");
    expect(match).not.toBeNull();
  });

  it("matches /posts/:postId and extracts the param", () => {
    const router = createRouter();
    const match = router.match("/posts/post-42");
    expect(match).not.toBeNull();
    expect(match!.params["postId"]).toBe("post-42");
  });

  it("returns null for unregistered paths", () => {
    const router = createRouter();
    expect(router.match("/not-a-real-page")).toBeNull();
    expect(router.match("/posts/foo/bar/baz")).toBeNull();
  });

  it("extracts param correctly for different post IDs", () => {
    const router = createRouter();
    const ids = ["post-1", "my-slug-here", "123abc"];
    for (const id of ids) {
      const match = router.match(`/posts/${id}`);
      expect(match).not.toBeNull();
      expect(match!.params["postId"]).toBe(id);
    }
  });
});

// ── Router.handle ─────────────────────────────────────────────────────────────

describe("Router — handle()", () => {
  it("handles / and returns status 200", () => {
    const router = createRouter();
    const result = router.handle({ pathname: "/", locale: "en" });
    expect(result.statusCode).toBe(200);
    expect(result.html).toBeTruthy();
  });

  it("handles /about and returns status 200", () => {
    const router = createRouter();
    const result = router.handle({ pathname: "/about", locale: "en" });
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("About");
  });

  it("handles /posts/:id and passes postId to query context", () => {
    const router = createRouter();
    const result = router.handle({ pathname: "/posts/post-1", locale: "en" });
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("Getting Started with VaisX");
  });

  it("handles /posts/create and returns the create form", () => {
    const router = createRouter();
    const result = router.handle({ pathname: "/posts/create", locale: "en" });
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain('name="title"');
  });

  it("handles unknown paths with a 404 response", () => {
    const router = createRouter();
    const result = router.handle({ pathname: "/does-not-exist", locale: "en" });
    expect(result.statusCode).toBe(404);
    expect(result.html).toContain("404");
  });

  it("passes query parameters through to the page", () => {
    const router = createRouter();
    const result = router.handle({
      pathname: "/",
      locale: "en",
      query: { page: "2" },
    });
    expect(result.statusCode).toBe(200);
  });

  it("locale is passed to the rendered page", () => {
    const router = createRouter();
    const result = router.handle({ pathname: "/about", locale: "ko" });
    expect(result.html).toContain('lang="ko"');
  });
});

// ── VaisXApp ───────────────────────────────────────────────────────────────────

describe("VaisXApp", () => {
  it("creates an app with default locale", () => {
    const app = new VaisXApp({ defaultLocale: "en" });
    const result = app.handle({ pathname: "/" });
    expect(result.statusCode).toBe(200);
  });

  it("falls back to defaultLocale for unsupported locales", () => {
    const app = new VaisXApp({
      defaultLocale: "en",
      supportedLocales: ["en", "ko"],
    });
    // "fr" is not in supported — falls back to "en"
    const result = app.handle({ pathname: "/about", locale: "fr" });
    expect(result.html).toContain('lang="en"');
  });

  it("uses requested locale when supported", () => {
    const app = new VaisXApp({
      defaultLocale: "en",
      supportedLocales: ["en", "ko", "ja"],
    });
    const result = app.handle({ pathname: "/about", locale: "ja" });
    expect(result.html).toContain('lang="ja"');
  });

  it("handles /posts/:id through the app", () => {
    const app = new VaisXApp();
    const result = app.handle({ pathname: "/posts/post-2", locale: "en" });
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("Designing with VaisX Components");
  });

  it("exposes the routerInstance", () => {
    const app = new VaisXApp();
    expect(app.routerInstance).toBeDefined();
    expect(typeof app.routerInstance.match).toBe("function");
  });
});

// ── Custom Router ──────────────────────────────────────────────────────────────

describe("Router — custom route registration", () => {
  it("supports registering a custom route", () => {
    const router = new Router();
    router.register({
      path: "/custom",
      pattern: /^\/custom$/,
      handler: (ctx) => ({
        title: "Custom Page",
        body: `<p>Custom: ${ctx.locale}</p>`,
      }),
    });
    const match = router.match("/custom");
    expect(match).not.toBeNull();
  });

  it("registered custom route renders correctly", () => {
    const router = new Router();
    router.register({
      path: "/hello/:name",
      pattern: /^\/hello\/([^/]+)$/,
      handler: (ctx) => ({
        title: "Hello",
        body: `<p>Hello, ${ctx.query["name"]}!</p>`,
      }),
    });
    const result = router.handle({ pathname: "/hello/World", locale: "en" });
    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("Hello, World!");
  });

  it("chaining register() returns the router", () => {
    const router = new Router();
    const r1 = router.register({ path: "/a", pattern: /^\/a$/, handler: AboutPage });
    const r2 = r1.register({ path: "/b", pattern: /^\/b$/, handler: HomePage });
    expect(r2).toBe(router);
  });
});
