/**
 * @vaisx/store — defineStore tests
 * Comprehensive test coverage for the core store factory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineStore, resetAllStores, addStorePlugin, getStore } from "../src/store.js";

// Always start each test with a clean registry
beforeEach(() => resetAllStores());
afterEach(() => resetAllStores());

// ─── Basic state ─────────────────────────────────────────────────────────────

describe("defineStore — basic state", () => {
  it("creates a store with initial state", () => {
    const useCounter = defineStore({
      id: "counter",
      state: () => ({ count: 0 }),
    });
    const store = useCounter();
    expect(store.$state.count).toBe(0);
  });

  it("$id matches the given id", () => {
    const useA = defineStore({ id: "alpha", state: () => ({ x: 1 }) });
    expect(useA().$id).toBe("alpha");
  });

  it("state properties are accessible directly on the store", () => {
    const useCounter = defineStore({
      id: "counter2",
      state: () => ({ count: 5, name: "test" }),
    });
    const store = useCounter();
    expect((store as any).count).toBe(5);
    expect((store as any).name).toBe("test");
  });

  it("state properties are mutable via direct assignment", () => {
    const useCounter = defineStore({
      id: "counter3",
      state: () => ({ count: 0 }),
    });
    const store = useCounter();
    (store as any).count = 10;
    expect(store.$state.count).toBe(10);
  });

  it("returns the same singleton instance for the same id", () => {
    const useCounter = defineStore({ id: "singleton", state: () => ({ n: 0 }) });
    const a = useCounter();
    const b = useCounter();
    expect(a).toBe(b);
  });
});

// ─── Getters ─────────────────────────────────────────────────────────────────

describe("defineStore — getters", () => {
  it("getter computes derived value from state", () => {
    const useCounter = defineStore({
      id: "getter1",
      state: () => ({ count: 3 }),
      getters: {
        doubled() { return this.count * 2; },
      },
    });
    const store = useCounter();
    expect((store as any).doubled).toBe(6);
  });

  it("getter recomputes when state changes", () => {
    const useCounter = defineStore({
      id: "getter2",
      state: () => ({ count: 1 }),
      getters: {
        doubled() { return this.count * 2; },
      },
    });
    const store = useCounter();
    expect((store as any).doubled).toBe(2);
    store.$patch({ count: 5 });
    expect((store as any).doubled).toBe(10);
  });

  it("getter can reference another getter via this", () => {
    const useStore = defineStore({
      id: "getter3",
      state: () => ({ value: 4 }),
      getters: {
        doubled() { return (this as any).value * 2; },
        quadrupled() { return (this as any).doubled * 2; },
      },
    });
    const store = useStore();
    expect((store as any).quadrupled).toBe(16);
  });
});

// ─── Actions ─────────────────────────────────────────────────────────────────

describe("defineStore — actions", () => {
  it("action can mutate state via this", () => {
    const useCounter = defineStore({
      id: "action1",
      state: () => ({ count: 0 }),
      actions: {
        increment() { this.count++; },
      },
    });
    const store = useCounter();
    (store as any).increment();
    expect(store.$state.count).toBe(1);
  });

  it("action receives arguments", () => {
    const useCounter = defineStore({
      id: "action2",
      state: () => ({ count: 0 }),
      actions: {
        add(n: number) { this.count += n; },
      },
    });
    const store = useCounter();
    (store as any).add(5);
    expect(store.$state.count).toBe(5);
  });

  it("action can call another action via this", () => {
    const useStore = defineStore({
      id: "action3",
      state: () => ({ count: 0 }),
      actions: {
        step() { (this as any).count++; },
        doubleStep() { (this as any).step(); (this as any).step(); },
      },
    });
    const store = useStore();
    (store as any).doubleStep();
    expect(store.$state.count).toBe(2);
  });

  it("action can read getters via this", () => {
    const useStore = defineStore({
      id: "action4",
      state: () => ({ base: 3 }),
      getters: {
        doubled() { return this.base * 2; },
      },
      actions: {
        getDoubled() { return (this as any).doubled; },
      },
    });
    const store = useStore();
    expect((store as any).getDoubled()).toBe(6);
  });
});

// ─── $patch ──────────────────────────────────────────────────────────────────

describe("$patch", () => {
  it("merges partial state object", () => {
    const useStore = defineStore({
      id: "patch1",
      state: () => ({ a: 1, b: 2, c: 3 }),
    });
    const store = useStore();
    store.$patch({ b: 20 });
    expect(store.$state.a).toBe(1);
    expect(store.$state.b).toBe(20);
    expect(store.$state.c).toBe(3);
  });

  it("accepts an updater function", () => {
    const useStore = defineStore({
      id: "patch2",
      state: () => ({ items: [] as string[] }),
    });
    const store = useStore();
    store.$patch((s) => { s.items.push("hello"); });
    expect(store.$state.items).toEqual(["hello"]);
  });
});

// ─── $reset ──────────────────────────────────────────────────────────────────

describe("$reset", () => {
  it("restores state to initial values", () => {
    const useCounter = defineStore({
      id: "reset1",
      state: () => ({ count: 0 }),
    });
    const store = useCounter();
    store.$patch({ count: 99 });
    expect(store.$state.count).toBe(99);
    store.$reset();
    expect(store.$state.count).toBe(0);
  });

  it("each $reset produces a fresh state (factory called again)", () => {
    let callCount = 0;
    const useStore = defineStore({
      id: "reset2",
      state: () => { callCount++; return { x: callCount }; },
    });
    const store = useStore();
    expect(store.$state.x).toBe(1);
    store.$reset();
    expect(store.$state.x).toBe(2);
  });

  it("$reset removes keys that are not present in the fresh state", () => {
    const useStore = defineStore({
      id: "reset3",
      state: () => ({ count: 0 }),
    });
    const store = useStore();
    // Add an extra key via $patch
    store.$patch({ count: 5, extra: 99 } as any);
    expect((store.$state as any).extra).toBe(99);
    // $reset should restore to { count: 0 } and drop 'extra'
    store.$reset();
    expect(store.$state.count).toBe(0);
    expect("extra" in store.$state).toBe(false);
    expect(Object.keys(store.$state)).toEqual(["count"]);
  });
});

// ─── $subscribe ──────────────────────────────────────────────────────────────

describe("$subscribe", () => {
  it("calls callback when state changes via $patch", () => {
    const useStore = defineStore({ id: "sub1", state: () => ({ n: 0 }) });
    const store = useStore();
    const cb = vi.fn();
    store.$subscribe(cb);
    store.$patch({ n: 1 });
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ n: 1 }));
  });

  it("returns an unsubscribe function", () => {
    const useStore = defineStore({ id: "sub2", state: () => ({ n: 0 }) });
    const store = useStore();
    const cb = vi.fn();
    const unsub = store.$subscribe(cb);
    unsub();
    store.$patch({ n: 5 });
    expect(cb).not.toHaveBeenCalled();
  });

  it("multiple subscribers are all notified", () => {
    const useStore = defineStore({ id: "sub3", state: () => ({ n: 0 }) });
    const store = useStore();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    store.$subscribe(cb1);
    store.$subscribe(cb2);
    store.$patch({ n: 1 });
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it("subscriber is called after $reset", () => {
    const useStore = defineStore({ id: "sub4", state: () => ({ n: 7 }) });
    const store = useStore();
    const cb = vi.fn();
    store.$subscribe(cb);
    store.$reset();
    expect(cb).toHaveBeenCalled();
  });
});

// ─── Global plugin ────────────────────────────────────────────────────────────

describe("addStorePlugin / _applyPlugin", () => {
  it("global plugin is applied to every new store", () => {
    const sideEffects: string[] = [];
    addStorePlugin(({ store }) => {
      sideEffects.push(store.$id);
    });

    const useA = defineStore({ id: "plugin_a", state: () => ({ x: 0 }) });
    useA();
    expect(sideEffects).toContain("plugin_a");

    resetAllStores(); // clear registry so stores are re-created
    // The plugin list is module-level; reset it by resetting the module is not
    // feasible in tests, but we can verify the plugin was called.
    expect(sideEffects.length).toBeGreaterThan(0);
  });

  it("_applyPlugin applies a single plugin to the store", () => {
    const useStore = defineStore({ id: "plugin_b", state: () => ({ n: 0 }) });
    const store = useStore();
    let called = false;
    store._applyPlugin(() => { called = true; });
    expect(called).toBe(true);
  });
});

// ─── getStore ─────────────────────────────────────────────────────────────────

describe("getStore", () => {
  it("returns undefined before the store is created", () => {
    expect(getStore("nonexistent")).toBeUndefined();
  });

  it("returns the store after it is created", () => {
    const useA = defineStore({ id: "get_a", state: () => ({ v: 1 }) });
    useA();
    expect(getStore("get_a")).toBeDefined();
  });
});
