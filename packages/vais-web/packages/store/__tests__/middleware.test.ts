/**
 * @vaisx/store — middleware tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineStore, resetAllStores } from "../src/store.js";
import { devtools, persist, logger, composePlugins } from "../src/middleware.js";

beforeEach(() => resetAllStores());
afterEach(() => resetAllStores());

// ─── logger ──────────────────────────────────────────────────────────────────

describe("logger plugin", () => {
  it("logs state changes to console", () => {
    const log = vi.fn();
    const useStore = defineStore({
      id: "log1",
      state: () => ({ count: 0 }),
    });
    const store = useStore();
    store._applyPlugin(logger({ log }));

    store.$patch({ count: 1 });
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("log1"),
      expect.any(String),
      expect.objectContaining({ count: 1 }),
    );
  });

  it("respects filter — does not log unmatched store ids", () => {
    const log = vi.fn();
    const useStore = defineStore({
      id: "log_filtered",
      state: () => ({ n: 0 }),
    });
    const store = useStore();
    store._applyPlugin(logger({ log, filter: ["other_store"] }));

    store.$patch({ n: 5 });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs matching store when filter is provided", () => {
    const log = vi.fn();
    const useStore = defineStore({
      id: "log_match",
      state: () => ({ n: 0 }),
    });
    const store = useStore();
    store._applyPlugin(logger({ log, filter: ["log_match"] }));

    store.$patch({ n: 5 });
    expect(log).toHaveBeenCalledOnce();
  });
});

// ─── devtools ────────────────────────────────────────────────────────────────

describe("devtools plugin", () => {
  it("registers the store in __VAISX_DEVTOOLS__ registry", () => {
    const useStore = defineStore({
      id: "devtools1",
      state: () => ({ value: 42 }),
    });
    const store = useStore();
    store._applyPlugin(devtools());

    const registry = (globalThis as any)["__VAISX_DEVTOOLS__"] as Map<string, any>;
    expect(registry).toBeDefined();
    expect(registry.has("devtools1")).toBe(true);
  });

  it("getState() returns a snapshot of current state", () => {
    const useStore = defineStore({
      id: "devtools2",
      state: () => ({ x: 10 }),
    });
    const store = useStore();
    store._applyPlugin(devtools());

    const registry = (globalThis as any)["__VAISX_DEVTOOLS__"] as Map<string, any>;
    const entry = registry.get("devtools2");
    expect(entry.getState()).toEqual({ x: 10 });
  });

  it("custom name option overrides the store id in devtools", () => {
    const useStore = defineStore({
      id: "devtools3",
      state: () => ({ y: 1 }),
    });
    const store = useStore();
    store._applyPlugin(devtools({ name: "MyCustomStore" }));

    const registry = (globalThis as any)["__VAISX_DEVTOOLS__"] as Map<string, any>;
    expect(registry.has("MyCustomStore")).toBe(true);
  });
});

// ─── persist ─────────────────────────────────────────────────────────────────

describe("persist plugin", () => {
  // Node.js v25+ has a built-in localStorage that lacks Storage API methods.
  // Create a proper mock and install it on both globalThis and window.
  let mockStorage: Storage;
  let origLocalStorage: Storage;

  function createMockStorage(): Storage {
    const store = new Map<string, string>();
    return {
      get length() { return store.size; },
      clear() { store.clear(); },
      getItem(key: string) { return store.get(key) ?? null; },
      key(index: number) { return [...store.keys()][index] ?? null; },
      removeItem(key: string) { store.delete(key); },
      setItem(key: string, value: string) { store.set(key, value); },
    };
  }

  beforeEach(() => {
    mockStorage = createMockStorage();
    origLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", { value: mockStorage, writable: true, configurable: true });
    }
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
    }
  });

  it("saves state to localStorage on change", () => {
    const useStore = defineStore({
      id: "persist1",
      state: () => ({ count: 0 }),
    });
    const store = useStore();
    store._applyPlugin(persist());

    store.$patch({ count: 7 });
    const raw = mockStorage.getItem("persist1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ count: 7 });
  });

  it("hydrates state from localStorage on plugin install", () => {
    mockStorage.setItem("persist2", JSON.stringify({ count: 99 }));

    const useStore = defineStore({
      id: "persist2",
      state: () => ({ count: 0 }),
    });
    const store = useStore();
    store._applyPlugin(persist());

    expect(store.$state.count).toBe(99);
  });

  it("respects custom key option", () => {
    const useStore = defineStore({
      id: "persist3",
      state: () => ({ n: 0 }),
    });
    const store = useStore();
    store._applyPlugin(persist({ key: "my_custom_key" }));

    store.$patch({ n: 5 });
    expect(mockStorage.getItem("my_custom_key")).not.toBeNull();
    expect(mockStorage.getItem("persist3")).toBeNull();
  });

  it("only persists specified paths when paths option is provided", () => {
    const useStore = defineStore({
      id: "persist4",
      state: () => ({ a: 1, b: 2, c: 3 }),
    });
    const store = useStore();
    store._applyPlugin(persist({ paths: ["a", "c"] }));

    store.$patch({ a: 10, b: 20, c: 30 });
    const saved = JSON.parse(mockStorage.getItem("persist4")!);
    expect(saved).toEqual({ a: 10, c: 30 });
    expect(saved.b).toBeUndefined();
  });

  it("uses custom serializer when provided", () => {
    const serialize = vi.fn((s: Record<string, unknown>) => JSON.stringify(s));
    const deserialize = vi.fn((r: string) => JSON.parse(r) as Record<string, unknown>);

    const useStore = defineStore({
      id: "persist5",
      state: () => ({ val: 0 }),
    });
    const store = useStore();
    store._applyPlugin(persist({ serializer: { serialize, deserialize } }));

    store.$patch({ val: 5 });
    expect(serialize).toHaveBeenCalled();
  });

  it("handles corrupt localStorage data gracefully", () => {
    mockStorage.setItem("persist6", "not-valid-json{{");

    const useStore = defineStore({
      id: "persist6",
      state: () => ({ n: 0 }),
    });
    const store = useStore();
    // Should not throw
    expect(() => store._applyPlugin(persist())).not.toThrow();
    // State should remain at default
    expect(store.$state.n).toBe(0);
  });
});

// ─── composePlugins ───────────────────────────────────────────────────────────

describe("composePlugins", () => {
  it("applies all composed plugins in order", () => {
    const order: number[] = [];
    const p1: import("../src/types.js").StorePlugin = () => order.push(1);
    const p2: import("../src/types.js").StorePlugin = () => order.push(2);
    const p3: import("../src/types.js").StorePlugin = () => order.push(3);

    const composed = composePlugins(p1, p2, p3);

    const useStore = defineStore({ id: "compose1", state: () => ({ x: 0 }) });
    const store = useStore();
    store._applyPlugin(composed);

    expect(order).toEqual([1, 2, 3]);
  });
});
