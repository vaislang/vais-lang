/**
 * @vaisx/query — SSR utility tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClient } from "../client.js";
import {
  dehydrate,
  hydrate,
  prefetchQuery,
  createSSRQueryClient,
  renderDehydratedScript,
  hydrateFromDOM,
} from "../ssr.js";
import type { DehydratedState } from "../ssr.js";

// ─── dehydrate ────────────────────────────────────────────────────────────────

describe("dehydrate", () => {
  let client: QueryClient;

  beforeEach(() => { client = new QueryClient(); });
  afterEach(() => { client.clear(); });

  it("returns an empty queries array for a fresh client", () => {
    const state = dehydrate(client);
    expect(state).toEqual({ queries: [] });
  });

  it("captures a single cached entry", () => {
    client.setQueryData(["users"], [{ id: 1 }]);
    const state = dehydrate(client);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].data).toEqual([{ id: 1 }]);
  });

  it("captures the queryKey in each entry", () => {
    client.setQueryData(["posts", 42], { title: "Hello" });
    const state = dehydrate(client);
    expect(state.queries[0].queryKey).toEqual(["posts", 42]);
  });

  it("captures dataUpdatedAt as a number", () => {
    const before = Date.now();
    client.setQueryData(["ts"], "value");
    const state = dehydrate(client);
    expect(typeof state.queries[0].dataUpdatedAt).toBe("number");
    expect(state.queries[0].dataUpdatedAt).toBeGreaterThanOrEqual(before);
  });

  it("captures multiple entries", () => {
    client.setQueryData(["a"], 1);
    client.setQueryData(["b"], 2);
    client.setQueryData(["c"], 3);
    const state = dehydrate(client);
    expect(state.queries).toHaveLength(3);
  });

  it("skips entries that have no data", () => {
    // Force an entry with undefined data via subscribe (creates a placeholder)
    client.subscribe(["empty"], () => {});
    const state = dehydrate(client);
    // The placeholder has undefined data, so it must NOT appear in dehydrated output
    expect(state.queries).toHaveLength(0);
  });

  it("returns a plain serialisable object (JSON round-trip)", () => {
    client.setQueryData(["round"], { nested: { val: true } });
    const state = dehydrate(client);
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json) as DehydratedState;
    expect(parsed.queries[0].data).toEqual({ nested: { val: true } });
  });
});

// ─── hydrate ──────────────────────────────────────────────────────────────────

describe("hydrate", () => {
  let client: QueryClient;

  beforeEach(() => { client = new QueryClient(); });
  afterEach(() => { client.clear(); });

  it("restores data into the client cache", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["users"], data: [{ id: 1 }], dataUpdatedAt: Date.now() }],
    };
    hydrate(client, state);
    expect(client.getQueryData(["users"])).toEqual([{ id: 1 }]);
  });

  it("restores multiple entries", () => {
    const state: DehydratedState = {
      queries: [
        { queryKey: ["a"], data: "aaa", dataUpdatedAt: Date.now() },
        { queryKey: ["b"], data: "bbb", dataUpdatedAt: Date.now() },
      ],
    };
    hydrate(client, state);
    expect(client.getQueryData(["a"])).toBe("aaa");
    expect(client.getQueryData(["b"])).toBe("bbb");
  });

  it("is a no-op for an empty state", () => {
    hydrate(client, { queries: [] });
    expect(client.getQueryCache().size).toBe(0);
  });

  it("handles null/undefined state gracefully", () => {
    // Should not throw
    expect(() => hydrate(client, null as unknown as DehydratedState)).not.toThrow();
    expect(() => hydrate(client, undefined as unknown as DehydratedState)).not.toThrow();
  });

  it("dehydrate → hydrate round-trip preserves data", () => {
    client.setQueryData(["items"], [1, 2, 3]);
    const state = dehydrate(client);

    const newClient = new QueryClient();
    hydrate(newClient, state);
    expect(newClient.getQueryData(["items"])).toEqual([1, 2, 3]);
    newClient.clear();
  });

  it("skips entries with undefined data", () => {
    const state: DehydratedState = {
      queries: [
        { queryKey: ["defined"], data: "ok", dataUpdatedAt: Date.now() },
        { queryKey: ["undef"], data: undefined, dataUpdatedAt: Date.now() },
      ],
    };
    hydrate(client, state);
    expect(client.getQueryData(["defined"])).toBe("ok");
    expect(client.getQueryData(["undef"])).toBeUndefined();
    // Only one entry should be in the cache (the defined one)
    expect(client.getQueryCache().size).toBe(1);
  });
});

// ─── prefetchQuery ────────────────────────────────────────────────────────────

describe("prefetchQuery (SSR wrapper)", () => {
  let client: QueryClient;

  beforeEach(() => { client = new QueryClient(); });
  afterEach(() => { client.clear(); });

  it("executes queryFn and populates the cache", async () => {
    await prefetchQuery(client, {
      queryKey: ["ssr-data"],
      queryFn: async () => ({ message: "hello from server" }),
    });
    expect(client.getQueryData(["ssr-data"])).toEqual({ message: "hello from server" });
  });

  it("does not call queryFn again when data is still fresh", async () => {
    const queryFn = vi.fn(async () => "cached");
    await prefetchQuery(client, { queryKey: ["fresh"], queryFn, staleTime: 60_000 });
    await prefetchQuery(client, { queryKey: ["fresh"], queryFn, staleTime: 60_000 });
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("populates cache that can then be dehydrated", async () => {
    await prefetchQuery(client, {
      queryKey: ["server-users"],
      queryFn: async () => [{ id: 1 }, { id: 2 }],
    });
    const state = dehydrate(client);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].data).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

// ─── createSSRQueryClient ─────────────────────────────────────────────────────

describe("createSSRQueryClient", () => {
  it("returns a QueryClient instance", () => {
    const client = createSSRQueryClient();
    expect(client).toBeInstanceOf(QueryClient);
    client.clear();
  });

  it("created client accepts setQueryData / getQueryData", () => {
    const client = createSSRQueryClient();
    client.setQueryData(["ssr-key"], "ssr-value");
    expect(client.getQueryData(["ssr-key"])).toBe("ssr-value");
    client.clear();
  });

  it("created client can prefetch queries", async () => {
    const client = createSSRQueryClient();
    await client.prefetchQuery({
      queryKey: ["ssr-prefetch"],
      queryFn: async () => 42,
    });
    expect(client.getQueryData(["ssr-prefetch"])).toBe(42);
    client.clear();
  });

  it("does not throw when window is unavailable (simulated SSR)", () => {
    // createSSRQueryClient itself must not reference window at construction time.
    // We verify it constructs without error; the window guard is tested elsewhere.
    expect(() => createSSRQueryClient()).not.toThrow();
  });
});

// ─── renderDehydratedScript ───────────────────────────────────────────────────

describe("renderDehydratedScript", () => {
  it("returns a script tag string", () => {
    const state: DehydratedState = { queries: [] };
    const html = renderDehydratedScript(state);
    expect(html).toMatch(/^<script>/);
    expect(html).toMatch(/<\/script>$/);
  });

  it("assigns the state to the default window variable", () => {
    const state: DehydratedState = { queries: [] };
    const html = renderDehydratedScript(state);
    expect(html).toContain("window.__QUERY_STATE__");
  });

  it("assigns to a custom variable name", () => {
    const state: DehydratedState = { queries: [] };
    const html = renderDehydratedScript(state, "__MY_STATE__");
    expect(html).toContain("window.__MY_STATE__");
  });

  it("escapes < to prevent </script> injection (XSS)", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["xss"], data: "</script><script>alert(1)</script>", dataUpdatedAt: 0 }],
    };
    const html = renderDehydratedScript(state);
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("escapes & to prevent HTML entity injection (XSS)", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["amp"], data: "a&b", dataUpdatedAt: 0 }],
    };
    const html = renderDehydratedScript(state);
    expect(html).not.toContain('"a&b"');
    expect(html).toContain("\\u0026");
  });

  it("escapes > character", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["gt"], data: "a>b", dataUpdatedAt: 0 }],
    };
    const html = renderDehydratedScript(state);
    expect(html).toContain("\\u003e");
  });

  it("escapes Unicode line separator \\u2028", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["ls"], data: "a\u2028b", dataUpdatedAt: 0 }],
    };
    const html = renderDehydratedScript(state);
    expect(html).toContain("\\u2028");
  });

  it("escapes Unicode paragraph separator \\u2029", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["ps"], data: "a\u2029b", dataUpdatedAt: 0 }],
    };
    const html = renderDehydratedScript(state);
    expect(html).toContain("\\u2029");
  });

  it("produces valid JSON that round-trips", () => {
    const client = new QueryClient();
    client.setQueryData(["rt"], { ok: true });
    const state = dehydrate(client);
    const html = renderDehydratedScript(state);
    // Extract the JSON portion from the script tag
    const match = html.match(/window\.__QUERY_STATE__ = (.+)<\/script>$/);
    expect(match).not.toBeNull();
    // Un-escape the Unicode escapes so JSON.parse can handle them
    const jsonStr = match![1]
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&");
    const parsed = JSON.parse(jsonStr) as DehydratedState;
    expect(parsed.queries[0].data).toEqual({ ok: true });
    client.clear();
  });
});

// ─── hydrateFromDOM ───────────────────────────────────────────────────────────

describe("hydrateFromDOM", () => {
  let client: QueryClient;

  beforeEach(() => { client = new QueryClient(); });
  afterEach(() => {
    client.clear();
    // Clean up any window state we set
    delete (window as Record<string, unknown>)["__QUERY_STATE__"];
    delete (window as Record<string, unknown>)["__CUSTOM_STATE__"];
  });

  it("hydrates from window variable set by renderDehydratedScript", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["dom-key"], data: "dom-value", dataUpdatedAt: Date.now() }],
    };
    // Simulate what renderDehydratedScript injects via the browser parser
    (window as Record<string, unknown>)["__QUERY_STATE__"] = state;
    hydrateFromDOM(client);
    expect(client.getQueryData(["dom-key"])).toBe("dom-value");
  });

  it("hydrates from a DOM element's text content as fallback", () => {
    // Use a <div> instead of <script> — jsdom auto-executes <script> textContent
    // which would throw a SyntaxError on raw JSON.
    const el = document.createElement("div");
    el.id = "__FALLBACK_STATE__";
    const state: DehydratedState = {
      queries: [{ queryKey: ["fallback"], data: 99, dataUpdatedAt: Date.now() }],
    };
    el.textContent = JSON.stringify(state);
    document.body.appendChild(el);

    // Ensure the window variable is NOT set so the fallback path is used
    delete (window as Record<string, unknown>)["__FALLBACK_STATE__"];
    hydrateFromDOM(client, "__FALLBACK_STATE__");
    expect(client.getQueryData(["fallback"])).toBe(99);

    document.body.removeChild(el);
  });

  it("is a no-op when the target element does not exist", () => {
    expect(() => hydrateFromDOM(client, "__NONEXISTENT__")).not.toThrow();
    expect(client.getQueryCache().size).toBe(0);
  });

  it("is a no-op when the DOM element has malformed JSON", () => {
    // Use a <div> instead of <script> — jsdom auto-executes <script> textContent.
    const el = document.createElement("div");
    el.id = "__BAD_JSON__";
    el.textContent = "{ not valid json }}}";
    document.body.appendChild(el);

    delete (window as Record<string, unknown>)["__BAD_JSON__"];
    expect(() => hydrateFromDOM(client, "__BAD_JSON__")).not.toThrow();
    expect(client.getQueryCache().size).toBe(0);

    document.body.removeChild(el);
  });

  it("uses __QUERY_STATE__ as the default element id", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["default-id"], data: "default", dataUpdatedAt: Date.now() }],
    };
    (window as Record<string, unknown>)["__QUERY_STATE__"] = state;
    hydrateFromDOM(client); // no second arg → uses default
    expect(client.getQueryData(["default-id"])).toBe("default");
  });

  it("accepts a custom variable name", () => {
    const state: DehydratedState = {
      queries: [{ queryKey: ["custom"], data: "custom-val", dataUpdatedAt: Date.now() }],
    };
    (window as Record<string, unknown>)["__CUSTOM_STATE__"] = state;
    hydrateFromDOM(client, "__CUSTOM_STATE__");
    expect(client.getQueryData(["custom"])).toBe("custom-val");
  });
});

// ─── Full SSR round-trip ──────────────────────────────────────────────────────

describe("Full SSR round-trip", () => {
  it("server prefetch → dehydrate → renderDehydratedScript → hydrateFromDOM → client cache", async () => {
    // 1. Server side: prefetch data
    const serverClient = createSSRQueryClient();
    await prefetchQuery(serverClient, {
      queryKey: ["page-data"],
      queryFn: async () => ({ title: "SSR Page", items: [1, 2, 3] }),
    });

    // 2. Dehydrate for transport
    const state = dehydrate(serverClient);
    expect(state.queries).toHaveLength(1);

    // 3. Render to HTML
    const html = renderDehydratedScript(state);
    expect(html).toContain("window.__QUERY_STATE__");

    // 4. Simulate browser: execute the script tag's assignment
    // (jsdom does not auto-execute script tags, so we manually parse and assign)
    const match = html.match(/window\.__QUERY_STATE__ = (.+)<\/script>$/);
    const jsonStr = match![1]
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&")
      .replace(/\\u2028/g, "\u2028")
      .replace(/\\u2029/g, "\u2029");
    (window as Record<string, unknown>)["__QUERY_STATE__"] = JSON.parse(jsonStr);

    // 5. Client side: hydrate from DOM
    const clientClient = new QueryClient();
    hydrateFromDOM(clientClient);

    expect(clientClient.getQueryData(["page-data"])).toEqual({
      title: "SSR Page",
      items: [1, 2, 3],
    });

    serverClient.clear();
    clientClient.clear();
    delete (window as Record<string, unknown>)["__QUERY_STATE__"];
  });
});
