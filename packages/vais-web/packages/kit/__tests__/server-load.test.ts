import { describe, it, expect } from "vitest";
import { createLoadContext, createCookieStore, getSetCookieHeaders } from "../src/server/context.js";
import { executeLoad, redirect, LoadRedirect } from "../src/server/load.js";
import { handleDataRequest } from "../src/server/data-endpoint.js";
import type { RouteDefinition, RouteParams, LoadFunction } from "../src/types.js";
import type { ResolvedRoute } from "../src/router/resolver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, options);
}

function makeResolvedRoute(
  params: RouteParams = {},
  overrides: Partial<ResolvedRoute> = {}
): ResolvedRoute {
  const route: RouteDefinition = {
    pattern: "/test",
    segments: [{ type: "static", value: "test" }],
    page: "/app/test/page.vaisx",
    middleware: [],
    children: [],
  };
  return {
    route,
    params,
    layoutChain: [],
    errorBoundary: null,
    loading: null,
    middlewareChain: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// context.ts — createCookieStore
// ---------------------------------------------------------------------------

describe("createCookieStore", () => {
  it("returns undefined for non-existent cookie", () => {
    const request = makeRequest("http://localhost/");
    const store = createCookieStore(request);
    expect(store.get("missing")).toBeUndefined();
  });

  it("parses a single cookie from Cookie header", () => {
    const request = makeRequest("http://localhost/", {
      headers: { cookie: "session=abc123" },
    });
    const store = createCookieStore(request);
    expect(store.get("session")).toBe("abc123");
  });

  it("parses multiple cookies: 'a=1; b=2'", () => {
    const request = makeRequest("http://localhost/", {
      headers: { cookie: "a=1; b=2" },
    });
    const store = createCookieStore(request);
    expect(store.get("a")).toBe("1");
    expect(store.get("b")).toBe("2");
  });

  it("set() stores a new cookie value", () => {
    const request = makeRequest("http://localhost/");
    const store = createCookieStore(request);
    store.set("token", "xyz");
    expect(store.get("token")).toBe("xyz");
  });

  it("set() overrides an existing cookie value", () => {
    const request = makeRequest("http://localhost/", {
      headers: { cookie: "count=5" },
    });
    const store = createCookieStore(request);
    store.set("count", "10");
    expect(store.get("count")).toBe("10");
  });

  it("delete() removes a cookie from get()", () => {
    const request = makeRequest("http://localhost/", {
      headers: { cookie: "session=abc" },
    });
    const store = createCookieStore(request);
    store.delete("session");
    expect(store.get("session")).toBeUndefined();
  });

  it("handles empty cookie header gracefully", () => {
    const request = makeRequest("http://localhost/", {
      headers: { cookie: "" },
    });
    const store = createCookieStore(request);
    expect(store.get("anything")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// context.ts — getSetCookieHeaders
// ---------------------------------------------------------------------------

describe("getSetCookieHeaders", () => {
  it("returns empty array when no cookies were modified", () => {
    const request = makeRequest("http://localhost/");
    const store = createCookieStore(request);
    expect(getSetCookieHeaders(store)).toEqual([]);
  });

  it("includes set cookie in Set-Cookie headers", () => {
    const request = makeRequest("http://localhost/");
    const store = createCookieStore(request);
    store.set("token", "abc");
    const headers = getSetCookieHeaders(store);
    expect(headers.length).toBe(1);
    expect(headers[0]).toContain("token=abc");
  });

  it("includes deleted cookie with Max-Age=0 in Set-Cookie headers", () => {
    const request = makeRequest("http://localhost/", {
      headers: { cookie: "session=old" },
    });
    const store = createCookieStore(request);
    store.delete("session");
    const headers = getSetCookieHeaders(store);
    expect(headers.length).toBe(1);
    expect(headers[0]).toContain("Max-Age=0");
  });

  it("includes cookie options in Set-Cookie header", () => {
    const request = makeRequest("http://localhost/");
    const store = createCookieStore(request);
    store.set("pref", "dark", { httpOnly: true, secure: true, path: "/" });
    const headers = getSetCookieHeaders(store);
    expect(headers[0]).toContain("pref=dark");
    expect(headers[0]).toContain("HttpOnly");
    expect(headers[0]).toContain("Secure");
    expect(headers[0]).toContain("Path=/");
  });
});

// ---------------------------------------------------------------------------
// context.ts — createLoadContext
// ---------------------------------------------------------------------------

describe("createLoadContext", () => {
  it("creates a valid LoadContext with all fields", () => {
    const request = makeRequest("http://localhost/blog/hello");
    const params: RouteParams = { slug: "hello" };
    const url = new URL(request.url);
    const ctx = createLoadContext(request, params, url);

    expect(ctx.request).toBe(request);
    expect(ctx.params).toBe(params);
    expect(ctx.url).toBe(url);
    expect(ctx.cookies).toBeDefined();
  });

  it("provides working CookieStore via context", () => {
    const request = makeRequest("http://localhost/", {
      headers: { cookie: "user=alice" },
    });
    const ctx = createLoadContext(request, {}, new URL(request.url));
    expect(ctx.cookies.get("user")).toBe("alice");
  });
});

// ---------------------------------------------------------------------------
// load.ts — executeLoad
// ---------------------------------------------------------------------------

describe("executeLoad", () => {
  it("returns success result with data from load function", async () => {
    const loadFn: LoadFunction = async () => ({ title: "Hello", count: 42 });
    const request = makeRequest("http://localhost/");
    const context = createLoadContext(request, {}, new URL(request.url));

    const result = await executeLoad({ loadFn, context });

    expect(result.status).toBe("success");
    expect(result.data).toEqual({ title: "Hello", count: 42 });
  });

  it("returns error result when load function throws", async () => {
    const loadFn: LoadFunction = async () => {
      throw new Error("DB connection failed");
    };
    const request = makeRequest("http://localhost/");
    const context = createLoadContext(request, {}, new URL(request.url));

    const result = await executeLoad({ loadFn, context });

    expect(result.status).toBe("error");
    expect(result.error?.message).toBe("DB connection failed");
    expect(result.error?.status).toBe(500);
  });

  it("returns error result with status 500 for unknown throw", async () => {
    const loadFn: LoadFunction = async () => {
      throw "something went wrong";
    };
    const request = makeRequest("http://localhost/");
    const context = createLoadContext(request, {}, new URL(request.url));

    const result = await executeLoad({ loadFn, context });

    expect(result.status).toBe("error");
    expect(result.error?.status).toBe(500);
  });

  it("returns redirect result when load function throws LoadRedirect", async () => {
    const loadFn: LoadFunction = async () => {
      redirect("/login");
    };
    const request = makeRequest("http://localhost/");
    const context = createLoadContext(request, {}, new URL(request.url));

    const result = await executeLoad({ loadFn, context });

    expect(result.status).toBe("redirect");
    expect(result.redirectTo).toBe("/login");
  });

  it("passes params and url via context to load function", async () => {
    let capturedContext: Parameters<LoadFunction>[0] | undefined;
    const loadFn: LoadFunction = async (ctx) => {
      capturedContext = ctx;
      return {};
    };

    const request = makeRequest("http://localhost/blog/post-1");
    const params: RouteParams = { slug: "post-1" };
    const url = new URL(request.url);
    const context = createLoadContext(request, params, url);

    await executeLoad({ loadFn, context });

    expect(capturedContext?.params).toEqual({ slug: "post-1" });
    expect(capturedContext?.url.pathname).toBe("/blog/post-1");
  });

  it("supports synchronous load function (returns PageData directly)", async () => {
    const loadFn: LoadFunction = () => ({ sync: true });
    const request = makeRequest("http://localhost/");
    const context = createLoadContext(request, {}, new URL(request.url));

    const result = await executeLoad({ loadFn, context });

    expect(result.status).toBe("success");
    expect(result.data).toEqual({ sync: true });
  });
});

// ---------------------------------------------------------------------------
// data-endpoint.ts — handleDataRequest
// ---------------------------------------------------------------------------

describe("handleDataRequest", () => {
  it("returns JSON response with data on success", async () => {
    const loadFn: LoadFunction = async () => ({ posts: ["a", "b"] });
    const request = makeRequest("http://localhost/__data.json?route=/blog");
    const resolvedRoute = makeResolvedRoute();

    const response = await handleDataRequest(request, resolvedRoute, loadFn);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toHaveProperty("data");
    expect(body.data).toEqual({ posts: ["a", "b"] });
  });

  it("returns JSON error with status 500 when load throws", async () => {
    const loadFn: LoadFunction = async () => {
      throw new Error("Failed to fetch");
    };
    const request = makeRequest("http://localhost/__data.json");
    const resolvedRoute = makeResolvedRoute();

    const response = await handleDataRequest(request, resolvedRoute, loadFn);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toHaveProperty("error");
    expect(body.error).toBe("Failed to fetch");
  });

  it("returns 302 redirect response when load redirects", async () => {
    const loadFn: LoadFunction = async () => {
      redirect("/login");
    };
    const request = makeRequest("http://localhost/__data.json");
    const resolvedRoute = makeResolvedRoute();

    const response = await handleDataRequest(request, resolvedRoute, loadFn);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("includes route params in context when calling load", async () => {
    let capturedParams: RouteParams | undefined;
    const loadFn: LoadFunction = async (ctx) => {
      capturedParams = ctx.params;
      return {};
    };

    const request = makeRequest("http://localhost/__data.json");
    const resolvedRoute = makeResolvedRoute({ slug: "my-post" });

    await handleDataRequest(request, resolvedRoute, loadFn);

    expect(capturedParams).toEqual({ slug: "my-post" });
  });

  it("empty data returns { data: {} } in response body", async () => {
    const loadFn: LoadFunction = async () => ({});
    const request = makeRequest("http://localhost/__data.json");
    const resolvedRoute = makeResolvedRoute();

    const response = await handleDataRequest(request, resolvedRoute, loadFn);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// load.ts — redirect helper and LoadRedirect
// ---------------------------------------------------------------------------

describe("redirect", () => {
  it("throws a LoadRedirect instance", () => {
    expect(() => redirect("/home")).toThrow(LoadRedirect);
  });

  it("LoadRedirect carries the target path", () => {
    try {
      redirect("/dashboard");
    } catch (err) {
      expect(err).toBeInstanceOf(LoadRedirect);
      expect((err as LoadRedirect).to).toBe("/dashboard");
    }
  });
});
