/**
 * @vaisx/store — SSR utilities tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defineStore, resetAllStores } from "../src/store.js";
import {
  serializeStores,
  snapshotToJSON,
  renderStateScript,
  hydrateStores,
  hydrateFromDOM,
  consumeHydration,
  hasPendingHydration,
  clearHydration,
  createSSRContext,
  hydrateStore,
  getHydratedState,
  ssrHydrationPlugin,
  SSR_STATE_ELEMENT_ID,
} from "../src/ssr.js";

beforeEach(() => {
  resetAllStores();
  clearHydration();
});

afterEach(() => {
  resetAllStores();
  clearHydration();
});

// ─── serializeStores ──────────────────────────────────────────────────────────

describe("serializeStores", () => {
  it("collects state from multiple stores into a snapshot", () => {
    const useA = defineStore({ id: "ssr_a", state: () => ({ x: 1 }) });
    const useB = defineStore({ id: "ssr_b", state: () => ({ y: 2 }) });
    const a = useA();
    const b = useB();

    const snapshot = serializeStores([a, b]);
    expect(snapshot).toEqual({ ssr_a: { x: 1 }, ssr_b: { y: 2 } });
  });

  it("reflects mutations made before serialisation", () => {
    const useStore = defineStore({ id: "ssr_mut", state: () => ({ count: 0 }) });
    const store = useStore();
    store.$patch({ count: 42 });

    const snapshot = serializeStores([store]);
    expect(snapshot["ssr_mut"]).toEqual({ count: 42 });
  });
});

// ─── snapshotToJSON ───────────────────────────────────────────────────────────

describe("snapshotToJSON", () => {
  it("returns valid JSON string", () => {
    const snapshot = { store1: { n: 10 } };
    const json = snapshotToJSON(snapshot);
    expect(JSON.parse(json)).toEqual(snapshot);
  });

  it("escapes </script> sequences to prevent XSS", () => {
    const snapshot = { x: "</script><script>alert(1)</script>" };
    const json = snapshotToJSON(snapshot);
    expect(json).not.toContain("</script>");
  });

  it("escapes <!-- sequences to prevent HTML comment injection", () => {
    const snapshot = { x: "<!--<script>alert(1)</script>-->" };
    const json = snapshotToJSON(snapshot);
    expect(json).not.toContain("<");
    expect(json).not.toContain(">");
  });

  it("escapes </style> sequences to prevent style-tag breakout", () => {
    const snapshot = { x: "</style><style>body{display:none}</style>" };
    const json = snapshotToJSON(snapshot);
    expect(json).not.toContain("</style>");
    expect(json).not.toContain("<");
    expect(json).not.toContain(">");
  });

  it("escapes Unicode LINE SEPARATOR (U+2028) to prevent JS parse errors", () => {
    const snapshot = { x: "line\u2028break" };
    const json = snapshotToJSON(snapshot);
    expect(json).not.toContain("\u2028");
    expect(json).toContain("\\u2028");
  });

  it("escapes Unicode PARAGRAPH SEPARATOR (U+2029) to prevent JS parse errors", () => {
    const snapshot = { x: "para\u2029break" };
    const json = snapshotToJSON(snapshot);
    expect(json).not.toContain("\u2029");
    expect(json).toContain("\\u2029");
  });

  it("escaped output is still parseable by JSON.parse and round-trips correctly", () => {
    const snapshot = {
      xss: "</script><script>alert(1)</script>",
      comment: "<!--injected-->",
      style: "</style><style>body{}</style>",
      ls: "line\u2028sep",
      ps: "para\u2029sep",
    };
    const json = snapshotToJSON(snapshot);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(snapshot);
  });
});

// ─── renderStateScript ────────────────────────────────────────────────────────

describe("renderStateScript", () => {
  it("wraps snapshot in a <script> tag with the correct id", () => {
    const html = renderStateScript({ store1: { v: 5 } });
    expect(html).toContain(`id="${SSR_STATE_ELEMENT_ID}"`);
    expect(html).toContain("application/json");
  });

  it("contains the serialised state", () => {
    const html = renderStateScript({ myStore: { count: 7 } });
    expect(html).toContain('"myStore"');
    expect(html).toContain('"count":7');
  });
});

// ─── hydrateStores / consumeHydration ─────────────────────────────────────────

describe("hydrateStores / consumeHydration", () => {
  it("registers pending hydration data for each store id", () => {
    hydrateStores({ storeA: { n: 5 }, storeB: { v: 10 } });
    expect(hasPendingHydration()).toBe(true);
    expect(consumeHydration("storeA")).toEqual({ n: 5 });
    expect(consumeHydration("storeB")).toEqual({ v: 10 });
  });

  it("consumeHydration removes the entry after reading", () => {
    hydrateStores({ once: { x: 1 } });
    consumeHydration("once");
    expect(consumeHydration("once")).toBeUndefined();
    expect(hasPendingHydration()).toBe(false);
  });

  it("returns undefined for an id that was not registered", () => {
    expect(consumeHydration("no_such_store")).toBeUndefined();
  });
});

// ─── hydrateFromDOM ───────────────────────────────────────────────────────────

describe("hydrateFromDOM", () => {
  it("reads state from the DOM script element", () => {
    // Insert a fake script element
    const el = document.createElement("script");
    el.id = SSR_STATE_ELEMENT_ID;
    el.type = "application/json";
    el.textContent = JSON.stringify({ dom_store: { val: 99 } });
    document.body.appendChild(el);

    hydrateFromDOM();
    expect(consumeHydration("dom_store")).toEqual({ val: 99 });

    document.body.removeChild(el);
  });

  it("does nothing when the element is absent", () => {
    hydrateFromDOM("__NONEXISTENT_ID__");
    expect(hasPendingHydration()).toBe(false);
  });

  it("handles malformed JSON without throwing", () => {
    const el = document.createElement("script");
    el.id = "__VAISX_BAD__";
    el.type = "application/json";
    el.textContent = "{{not json}}";
    document.body.appendChild(el);

    expect(() => hydrateFromDOM("__VAISX_BAD__")).not.toThrow();
    document.body.removeChild(el);
  });
});

// ─── ssrHydrationPlugin ───────────────────────────────────────────────────────

describe("ssrHydrationPlugin", () => {
  it("hydrates a store from pending data on plugin install", () => {
    hydrateStores({ hydrate_plug: { score: 88 } });

    const useStore = defineStore({
      id: "hydrate_plug",
      state: () => ({ score: 0 }),
    });
    const store = useStore();
    store._applyPlugin(ssrHydrationPlugin() as any);

    expect(store.$state.score).toBe(88);
  });

  it("does nothing if no hydration data is pending", () => {
    const useStore = defineStore({
      id: "hydrate_empty",
      state: () => ({ n: 0 }),
    });
    const store = useStore();
    // Should not throw, state should remain default
    expect(() => store._applyPlugin(ssrHydrationPlugin() as any)).not.toThrow();
    expect(store.$state.n).toBe(0);
  });
});

// ─── hydrateStore ─────────────────────────────────────────────────────────────

describe("hydrateStore", () => {
  it("patches the store with provided state", () => {
    const useStore = defineStore({ id: "hydrate_fn", state: () => ({ a: 0, b: 0 }) });
    const store = useStore();
    hydrateStore(store, { a: 5 });
    expect(store.$state.a).toBe(5);
    expect(store.$state.b).toBe(0);
  });
});

// ─── getHydratedState ─────────────────────────────────────────────────────────

describe("getHydratedState", () => {
  it("returns the state for the given store id", () => {
    const snapshot = { myStore: { x: 42 } };
    expect(getHydratedState(snapshot, "myStore")).toEqual({ x: 42 });
  });

  it("returns undefined when id is not in snapshot", () => {
    expect(getHydratedState({}, "missing")).toBeUndefined();
  });
});

// ─── createSSRContext ─────────────────────────────────────────────────────────

describe("createSSRContext", () => {
  it("runs the callback and returns its result", async () => {
    const ctx = createSSRContext();
    const result = await ctx.runWithContext(() => 42);
    expect(result).toBe(42);
  });

  it("serialize returns snapshot of tracked stores", async () => {
    const ctx = createSSRContext();
    await ctx.runWithContext(() => {
      const useStore = defineStore({ id: "ctx_store", state: () => ({ v: 7 }) });
      const store = useStore();
      ctx.trackStore(store);
    });

    const snapshot = ctx.serialize();
    expect(snapshot["ctx_store"]).toEqual({ v: 7 });
  });

  it("resets global registry before running the callback", async () => {
    // Create a store before the context
    const useA = defineStore({ id: "before_ctx", state: () => ({ n: 0 }) });
    useA();

    const ctx = createSSRContext();
    await ctx.runWithContext(() => {
      // Registry is reset inside; "before_ctx" is gone
      // Creating a new store with the same id will use fresh state
      const useA2 = defineStore({ id: "before_ctx", state: () => ({ n: 99 }) });
      const store = useA2();
      expect(store.$state.n).toBe(99);
    });
  });
});
