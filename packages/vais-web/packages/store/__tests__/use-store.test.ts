/**
 * @vaisx/store — useStore / connectStore hook tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineStore, resetAllStores } from "../src/store.js";
import { useStore, connectStore } from "../src/use-store.js";

beforeEach(() => resetAllStores());
afterEach(() => resetAllStores());

// ─── useStore ────────────────────────────────────────────────────────────────

describe("useStore", () => {
  it("returns the store instance unchanged", () => {
    const useCounter = defineStore({ id: "hook1", state: () => ({ count: 0 }) });
    const store = useCounter();
    const ctx = { scheduleUpdate: vi.fn(), onDestroy: vi.fn() };
    const result = useStore(store as any, ctx);
    expect(result).toBe(store);
  });

  it("calls scheduleUpdate when state changes", () => {
    const useCounter = defineStore({ id: "hook2", state: () => ({ count: 0 }) });
    const store = useCounter();
    const scheduleUpdate = vi.fn();
    const ctx = { scheduleUpdate, onDestroy: vi.fn() };
    useStore(store as any, ctx);

    store.$patch({ count: 1 });
    expect(scheduleUpdate).toHaveBeenCalledOnce();
  });

  it("registers cleanup via ctx.onDestroy", () => {
    const useCounter = defineStore({ id: "hook3", state: () => ({ count: 0 }) });
    const store = useCounter();
    const onDestroy = vi.fn();
    const ctx = { scheduleUpdate: vi.fn(), onDestroy };
    useStore(store as any, ctx);

    expect(onDestroy).toHaveBeenCalledWith(expect.any(Function));
  });

  it("stops calling scheduleUpdate after cleanup is invoked", () => {
    const useCounter = defineStore({ id: "hook4", state: () => ({ count: 0 }) });
    const store = useCounter();
    const scheduleUpdate = vi.fn();
    let cleanup!: () => void;
    const ctx = {
      scheduleUpdate,
      onDestroy: (fn: () => void) => { cleanup = fn; },
    };
    useStore(store as any, ctx);

    // Invoke the registered cleanup (simulating component destroy)
    cleanup();
    store.$patch({ count: 5 });
    expect(scheduleUpdate).not.toHaveBeenCalled();
  });
});

// ─── connectStore ─────────────────────────────────────────────────────────────

describe("connectStore", () => {
  it("calls onChange when state changes", () => {
    const useCounter = defineStore({ id: "connect1", state: () => ({ n: 0 }) });
    const store = useCounter();
    const onChange = vi.fn();
    connectStore(store as any, onChange);

    store.$patch({ n: 3 });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ n: 3 }));
  });

  it("returns [store, unsubscribe]", () => {
    const useCounter = defineStore({ id: "connect2", state: () => ({ n: 0 }) });
    const store = useCounter();
    const [returnedStore, unsubscribe] = connectStore(store as any, vi.fn());
    expect(returnedStore).toBe(store);
    expect(typeof unsubscribe).toBe("function");
  });

  it("stops calling onChange after unsubscribe", () => {
    const useCounter = defineStore({ id: "connect3", state: () => ({ n: 0 }) });
    const store = useCounter();
    const onChange = vi.fn();
    const [, unsubscribe] = connectStore(store as any, onChange);

    unsubscribe();
    store.$patch({ n: 99 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
