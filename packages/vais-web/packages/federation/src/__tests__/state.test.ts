/**
 * Tests for createSharedStore, SharedStoreRegistry, createMessageChannel, and syncStores.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSharedStore,
  SharedStoreRegistry,
  createMessageChannel,
  syncStores,
} from "../state.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRegistry() {
  // Each test uses a fresh registry-like object to avoid global state pollution.
  const stores = new Map();
  return {
    register: (name: string, store: ReturnType<typeof createSharedStore>) =>
      stores.set(name, store),
    get: (name: string) => stores.get(name),
    getAll: () => stores as ReadonlyMap<string, ReturnType<typeof createSharedStore>>,
    unregister: (name: string) => stores.delete(name),
  };
}

// ─── createSharedStore ────────────────────────────────────────────────────────

describe("createSharedStore", () => {
  it("1. returns initial state via getState()", () => {
    const store = createSharedStore("app", { count: 0, label: "hello" });
    expect(store.getState()).toEqual({ count: 0, label: "hello" });
  });

  it("2. setState merges partial update into state", () => {
    const store = createSharedStore("app", { count: 0, label: "hello" });
    store.setState({ count: 5 });
    expect(store.getState()).toEqual({ count: 5, label: "hello" });
  });

  it("3. setState with full object replaces all keys", () => {
    const store = createSharedStore("app", { a: 1, b: 2 });
    store.setState({ a: 10, b: 20 });
    expect(store.getState()).toEqual({ a: 10, b: 20 });
  });

  it("4. subscribe listener is called on setState", () => {
    const store = createSharedStore("app", { count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ count: 1 });
  });

  it("5. multiple listeners are all notified", () => {
    const store = createSharedStore("app", { x: 0 });
    const l1 = vi.fn();
    const l2 = vi.fn();
    store.subscribe(l1);
    store.subscribe(l2);
    store.setState({ x: 99 });
    expect(l1).toHaveBeenCalledWith({ x: 99 });
    expect(l2).toHaveBeenCalledWith({ x: 99 });
  });

  it("6. subscribe returns a cleanup that stops future notifications", () => {
    const store = createSharedStore("app", { count: 0 });
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.setState({ count: 1 });
    unsub();
    store.setState({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("7. calling cleanup twice is safe (no error)", () => {
    const store = createSharedStore("app", { v: 0 });
    const unsub = store.subscribe(vi.fn());
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });

  it("8. getSnapshot returns a frozen copy of current state", () => {
    const store = createSharedStore("app", { count: 0 });
    store.setState({ count: 7 });
    const snap = store.getSnapshot();
    expect(snap).toEqual({ count: 7 });
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("9. getSnapshot is independent of later mutations", () => {
    const store = createSharedStore("app", { count: 0 });
    const snap1 = store.getSnapshot();
    store.setState({ count: 42 });
    expect(snap1).toEqual({ count: 0 });
  });

  it("10. setState with empty object triggers listeners but state unchanged", () => {
    const store = createSharedStore("app", { count: 3 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.setState({});
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).toEqual({ count: 3 });
  });
});

// ─── SharedStoreRegistry ──────────────────────────────────────────────────────

describe("SharedStoreRegistry", () => {
  // Use the module-level singleton but clean up after each test.
  const names: string[] = [];

  beforeEach(() => {
    // unregister any stores registered during previous tests.
    names.forEach((n) => SharedStoreRegistry.unregister(n));
    names.length = 0;
  });

  function reg(name: string, initial: Record<string, unknown> = {}) {
    const store = createSharedStore(name, initial);
    SharedStoreRegistry.register(name, store);
    names.push(name);
    return store;
  }

  it("11. register and get returns the same store", () => {
    const store = reg("test-store-1");
    expect(SharedStoreRegistry.get("test-store-1")).toBe(store);
  });

  it("12. get returns undefined for unregistered name", () => {
    expect(SharedStoreRegistry.get("nonexistent-xyz")).toBeUndefined();
  });

  it("13. getAll includes all registered stores", () => {
    const s1 = reg("ts-a");
    const s2 = reg("ts-b");
    const all = SharedStoreRegistry.getAll();
    expect(all.get("ts-a")).toBe(s1);
    expect(all.get("ts-b")).toBe(s2);
  });

  it("14. unregister removes store from registry", () => {
    reg("ts-c");
    SharedStoreRegistry.unregister("ts-c");
    expect(SharedStoreRegistry.get("ts-c")).toBeUndefined();
  });

  it("15. unregister non-existent key is a no-op", () => {
    expect(() => SharedStoreRegistry.unregister("never-existed")).not.toThrow();
  });

  it("16. re-registering under same name overwrites previous store", () => {
    const s1 = createSharedStore("ts-d", { v: 1 });
    const s2 = createSharedStore("ts-d", { v: 2 });
    SharedStoreRegistry.register("ts-d", s1);
    names.push("ts-d");
    SharedStoreRegistry.register("ts-d", s2);
    expect(SharedStoreRegistry.get("ts-d")).toBe(s2);
  });
});

// ─── createMessageChannel ────────────────────────────────────────────────────

describe("createMessageChannel", () => {
  it("17. onMessage handler is called when postMessage sends matching type", () => {
    const ch = createMessageChannel();
    const handler = vi.fn();
    ch.onMessage("greet", handler);
    ch.postMessage("greet", { who: "world" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "greet", data: { who: "world" } }),
    );
  });

  it("18. handler is NOT called for a different message type", () => {
    const ch = createMessageChannel();
    const handler = vi.fn();
    ch.onMessage("type-a", handler);
    ch.postMessage("type-b", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("19. postMessage envelope contains target when provided", () => {
    const ch = createMessageChannel();
    const handler = vi.fn();
    ch.onMessage("ping", handler);
    ch.postMessage("ping", null, "app-remote");
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ target: "app-remote" }),
    );
  });

  it("20. postMessage envelope has a numeric timestamp", () => {
    const ch = createMessageChannel();
    const handler = vi.fn();
    ch.onMessage("ts-check", handler);
    ch.postMessage("ts-check", {});
    const msg = handler.mock.calls[0][0];
    expect(typeof msg.timestamp).toBe("number");
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it("21. onMessage cleanup unsubscribes the handler", () => {
    const ch = createMessageChannel();
    const handler = vi.fn();
    const unsub = ch.onMessage("bye", handler);
    unsub();
    ch.postMessage("bye", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("22. broadcast sends to all handlers of that type (no target)", () => {
    const ch = createMessageChannel();
    const h1 = vi.fn();
    const h2 = vi.fn();
    ch.onMessage("news", h1);
    ch.onMessage("news", h2);
    ch.broadcast("news", { headline: "test" });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    // Broadcast should not set a target.
    expect(h1.mock.calls[0][0].target).toBeUndefined();
  });

  it("23. multiple handlers for same type all receive the message", () => {
    const ch = createMessageChannel();
    const results: unknown[] = [];
    ch.onMessage("multi", (msg) => results.push(msg.data));
    ch.onMessage("multi", (msg) => results.push(msg.data));
    ch.postMessage("multi", 42);
    expect(results).toEqual([42, 42]);
  });
});

// ─── syncStores ───────────────────────────────────────────────────────────────

describe("syncStores", () => {
  it("24. source-to-target: source change propagates to target", () => {
    const source = createSharedStore("s", { value: 0 });
    const target = createSharedStore("t", { value: 0 });
    syncStores(source, target, { direction: "source-to-target" });
    source.setState({ value: 5 });
    expect(target.getState().value).toBe(5);
  });

  it("25. source-to-target: target change does NOT propagate to source", () => {
    const source = createSharedStore("s", { value: 0 });
    const target = createSharedStore("t", { value: 0 });
    syncStores(source, target, { direction: "source-to-target" });
    target.setState({ value: 99 });
    expect(source.getState().value).toBe(0);
  });

  it("26. target-to-source: target change propagates to source", () => {
    const source = createSharedStore("s", { value: 0 });
    const target = createSharedStore("t", { value: 0 });
    syncStores(source, target, { direction: "target-to-source" });
    target.setState({ value: 7 });
    expect(source.getState().value).toBe(7);
  });

  it("27. bidirectional (default): source change propagates to target", () => {
    const source = createSharedStore("s", { n: 1 });
    const target = createSharedStore("t", { n: 1 });
    syncStores(source, target);
    source.setState({ n: 10 });
    expect(target.getState().n).toBe(10);
  });

  it("28. bidirectional (default): target change propagates to source", () => {
    const source = createSharedStore("s", { n: 1 });
    const target = createSharedStore("t", { n: 1 });
    syncStores(source, target);
    target.setState({ n: 20 });
    expect(source.getState().n).toBe(20);
  });

  it("29. stop() tears down sync — changes no longer propagate", () => {
    const source = createSharedStore("s", { v: 0 });
    const target = createSharedStore("t", { v: 0 });
    const handle = syncStores(source, target, { direction: "source-to-target" });
    handle.stop();
    source.setState({ v: 55 });
    expect(target.getState().v).toBe(0);
  });

  it("30. conflict=lastWrite overwrites existing keys with incoming values", () => {
    const source = createSharedStore("s", { a: 1, b: 2 });
    const target = createSharedStore("t", { a: 10, b: 20 });
    syncStores(source, target, { direction: "source-to-target", conflict: "lastWrite" });
    source.setState({ a: 99 });
    expect(target.getState().a).toBe(99);
    // b was not changed on source so it stays 20 on target
    expect(target.getState().b).toBe(20);
  });

  it("31. conflict=merge keeps existing target keys alongside incoming values", () => {
    const source = createSharedStore("s", { x: 1, y: 2 });
    const target = createSharedStore("t", { x: 0, y: 0 });
    syncStores(source, target, { direction: "source-to-target", conflict: "merge" });
    source.setState({ x: 5 });
    // merge: x is updated, y remains what target had
    expect(target.getState().x).toBe(5);
    expect(target.getState().y).toBe(0);
  });
});
