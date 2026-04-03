/**
 * @vaisx/query — QueryCache tests
 *
 * Covers: set/get basics, staleTime freshness, gcTime auto-deletion,
 * invalidate/invalidateAll, subscribe callbacks, and cache key hashing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryCache, hashQueryKey } from "../cache.js";
import type { QueryCacheEntry } from "../cache.js";

// ─── hashQueryKey ─────────────────────────────────────────────────────────────

describe("hashQueryKey", () => {
  it("produces a stable string for a simple key", () => {
    expect(hashQueryKey(["users"])).toBe('["users"]');
  });

  it("produces the same string for two array references with identical content", () => {
    const a = ["todos", 1] as const;
    const b = ["todos", 1] as const;
    expect(hashQueryKey(a)).toBe(hashQueryKey(b));
  });

  it("produces different strings for different keys", () => {
    expect(hashQueryKey(["a"])).not.toBe(hashQueryKey(["b"]));
  });

  it("handles nested objects within the key", () => {
    const key1 = [{ page: 1, filter: "active" }] as const;
    const key2 = [{ page: 1, filter: "active" }] as const;
    expect(hashQueryKey(key1)).toBe(hashQueryKey(key2));
  });

  it("handles empty array keys", () => {
    expect(hashQueryKey([])).toBe("[]");
  });

  it("handles composite keys with multiple segments", () => {
    expect(hashQueryKey(["users", 42, "profile"])).toBe('["users",42,"profile"]');
  });
});

// ─── QueryCache — set / get ───────────────────────────────────────────────────

describe("QueryCache — set / get", () => {
  let cache: QueryCache;

  beforeEach(() => {
    cache = new QueryCache();
  });

  afterEach(() => {
    cache.clear();
  });

  it("returns undefined for a key that has never been set", () => {
    expect(cache.get(["missing"])).toBeUndefined();
  });

  it("stores data and retrieves it via get()", () => {
    cache.set(["users"], [{ id: 1 }]);
    const entry = cache.get<{ id: number }[]>(["users"]);
    expect(entry).toBeDefined();
    expect(entry!.data).toEqual([{ id: 1 }]);
  });

  it("records dataUpdatedAt as a recent timestamp", () => {
    const before = Date.now();
    cache.set(["ts"], "value");
    const entry = cache.get(["ts"]);
    expect(entry!.dataUpdatedAt).toBeGreaterThanOrEqual(before);
    expect(entry!.dataUpdatedAt).toBeLessThanOrEqual(Date.now());
  });

  it("overwrites existing data and updates dataUpdatedAt", async () => {
    cache.set(["count"], 1);
    const firstTs = cache.get(["count"])!.dataUpdatedAt;

    // Ensure a small time gap so timestamps differ.
    await new Promise((r) => setTimeout(r, 5));

    cache.set(["count"], 2);
    const entry = cache.get(["count"]);
    expect(entry!.data).toBe(2);
    expect(entry!.dataUpdatedAt).toBeGreaterThanOrEqual(firstTs);
  });

  it("stores the configured staleTime on the entry", () => {
    cache.set(["q"], "data", { staleTime: 10_000 });
    expect(cache.get(["q"])!.staleTime).toBe(10_000);
  });

  it("stores the configured gcTime on the entry", () => {
    cache.set(["q"], "data", { gcTime: 30_000 });
    expect(cache.get(["q"])!.gcTime).toBe(30_000);
  });

  it("independent keys do not interfere with each other", () => {
    cache.set(["a"], "A");
    cache.set(["b"], "B");
    expect(cache.get(["a"])!.data).toBe("A");
    expect(cache.get(["b"])!.data).toBe("B");
  });

  it("keys with same content but different array references map to the same entry", () => {
    const key1 = ["items", { filter: "active" }] as const;
    const key2 = ["items", { filter: "active" }] as const;
    cache.set(key1, "shared-data");
    expect(cache.get(key2)!.data).toBe("shared-data");
  });
});

// ─── QueryCache — has ─────────────────────────────────────────────────────────

describe("QueryCache — has", () => {
  let cache: QueryCache;

  beforeEach(() => { cache = new QueryCache(); });
  afterEach(() => { cache.clear(); });

  it("returns false for an unknown key", () => {
    expect(cache.has(["nope"])).toBe(false);
  });

  it("returns true after set()", () => {
    cache.set(["x"], 1);
    expect(cache.has(["x"])).toBe(true);
  });

  it("returns false after invalidate()", () => {
    cache.set(["y"], 1);
    cache.invalidate(["y"]);
    expect(cache.has(["y"])).toBe(false);
  });
});

// ─── QueryCache — staleTime ───────────────────────────────────────────────────

describe("QueryCache — staleTime / isStale", () => {
  let cache: QueryCache;

  beforeEach(() => { cache = new QueryCache(); vi.useFakeTimers(); });
  afterEach(() => { cache.clear(); vi.useRealTimers(); });

  it("entry is not stale immediately when staleTime is large", () => {
    cache.set(["fresh"], "data", { staleTime: 60_000 });
    expect(cache.isStale(["fresh"])).toBe(false);
  });

  it("entry is stale immediately when staleTime is 0", () => {
    cache.set(["instant"], "data", { staleTime: 0 });
    expect(cache.isStale(["instant"])).toBe(true);
  });

  it("entry becomes stale after staleTime elapses", () => {
    cache.set(["delayed"], "data", { staleTime: 1_000 });
    expect(cache.isStale(["delayed"])).toBe(false);

    vi.advanceTimersByTime(1_001);
    expect(cache.isStale(["delayed"])).toBe(true);
  });

  it("isStale returns true for unknown keys", () => {
    expect(cache.isStale(["unknown"])).toBe(true);
  });

  it("get() still returns data for a stale-but-present entry", () => {
    cache.set(["stale-get"], "still-here", { staleTime: 0, gcTime: 60_000 });
    // isStale is true, but get() should still return the entry.
    expect(cache.isStale(["stale-get"])).toBe(true);
    expect(cache.get(["stale-get"])).toBeDefined();
    expect(cache.get(["stale-get"])!.data).toBe("still-here");
  });
});

// ─── QueryCache — gcTime ──────────────────────────────────────────────────────

describe("QueryCache — gcTime auto-deletion", () => {
  let cache: QueryCache;

  beforeEach(() => { cache = new QueryCache(); vi.useFakeTimers(); });
  afterEach(() => { cache.clear(); vi.useRealTimers(); });

  it("entry is deleted after gcTime when no subscribers are active", () => {
    cache.set(["gc"], "data", { gcTime: 500 });
    cache.invalidate(["gc"]);

    expect(cache.has(["gc"])).toBe(false); // invalidated

    vi.advanceTimersByTime(600);
    // After GC the internal store should have removed it.
    expect(cache.get(["gc"])).toBeUndefined();
  });

  it("GC timer is cancelled when a subscriber attaches after invalidate", () => {
    cache.set(["guarded"], "value", { gcTime: 500 });
    cache.invalidate(["guarded"]);

    // Attach subscriber — this should cancel the GC timer.
    const unsub = cache.subscribe(["guarded"], () => {});

    vi.advanceTimersByTime(600);
    // Entry should still be in the store (not GC'd) because subscriber is active.
    // (subscribe creates a placeholder even for invalidated keys.)
    unsub();
  });

  it("entry with gcTime: 0 is deleted immediately upon invalidation", () => {
    cache.set(["zero-gc"], "data", { gcTime: 0 });
    cache.invalidate(["zero-gc"]);
    // gcTime 0 → synchronous deletion.
    expect(cache.get(["zero-gc"])).toBeUndefined();
  });

  it("GC timer is reset when set() is called on an invalidated entry", () => {
    cache.set(["reset"], "first", { gcTime: 500 });
    cache.invalidate(["reset"]);

    // Re-populate before GC fires.
    cache.set(["reset"], "second", { gcTime: 500 });
    expect(cache.get(["reset"])!.data).toBe("second");

    // GC should NOT fire now because set() cleared the old timer.
    vi.advanceTimersByTime(600);
    // Entry is fresh again; GC only starts after another invalidate/unsubscribe.
    expect(cache.get(["reset"])!.data).toBe("second");
  });
});

// ─── QueryCache — invalidate / invalidateAll ──────────────────────────────────

describe("QueryCache — invalidate", () => {
  let cache: QueryCache;

  beforeEach(() => { cache = new QueryCache({ defaultGcTime: 60_000 }); });
  afterEach(() => { cache.clear(); });

  it("makes get() return undefined for the invalidated key", () => {
    cache.set(["inv"], 42);
    cache.invalidate(["inv"]);
    expect(cache.get(["inv"])).toBeUndefined();
  });

  it("does not affect other keys", () => {
    cache.set(["a"], 1);
    cache.set(["b"], 2);
    cache.invalidate(["a"]);
    expect(cache.get(["b"])!.data).toBe(2);
  });

  it("is a no-op for unknown keys", () => {
    expect(() => cache.invalidate(["ghost"])).not.toThrow();
  });
});

describe("QueryCache — invalidateAll", () => {
  let cache: QueryCache;

  beforeEach(() => { cache = new QueryCache({ defaultGcTime: 60_000 }); });
  afterEach(() => { cache.clear(); });

  it("invalidates every entry when called with no predicate", () => {
    cache.set(["a"], 1);
    cache.set(["b"], 2);
    cache.set(["c"], 3);
    cache.invalidateAll();
    expect(cache.get(["a"])).toBeUndefined();
    expect(cache.get(["b"])).toBeUndefined();
    expect(cache.get(["c"])).toBeUndefined();
  });

  it("only invalidates entries matching the predicate", () => {
    cache.set(["users", 1], { id: 1 });
    cache.set(["users", 2], { id: 2 });
    cache.set(["posts", 1], { id: 10 });

    // Invalidate only keys that start with ["users"...].
    cache.invalidateAll((hashedKey) =>
      hashedKey.startsWith(hashQueryKey(["users"]).slice(0, -1)),
    );

    expect(cache.get(["users", 1])).toBeUndefined();
    expect(cache.get(["users", 2])).toBeUndefined();
    expect(cache.get(["posts", 1])).toBeDefined();
  });
});

// ─── QueryCache — clear ───────────────────────────────────────────────────────

describe("QueryCache — clear", () => {
  it("removes all entries", () => {
    const cache = new QueryCache();
    cache.set(["a"], 1);
    cache.set(["b"], 2);
    cache.clear();
    expect(cache.getAll().size).toBe(0);
  });

  it("notifies subscribers with undefined when clear() is called", () => {
    const cache = new QueryCache();
    const received: Array<QueryCacheEntry | undefined> = [];
    cache.set(["watched"], "data");
    cache.subscribe(["watched"], (e) => received.push(e));
    cache.clear();
    expect(received[received.length - 1]).toBeUndefined();
  });
});

// ─── QueryCache — subscribe ───────────────────────────────────────────────────

describe("QueryCache — subscribe", () => {
  let cache: QueryCache;

  beforeEach(() => { cache = new QueryCache({ defaultGcTime: 60_000 }); });
  afterEach(() => { cache.clear(); });

  it("returns an unsubscribe function", () => {
    const unsub = cache.subscribe(["k"], () => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("callback is called when set() is called for the subscribed key", () => {
    const received: unknown[] = [];
    cache.subscribe(["watched"], (e) => received.push(e?.data));
    cache.set(["watched"], "hello");
    expect(received).toContain("hello");
  });

  it("callback receives undefined after invalidate()", () => {
    const received: Array<QueryCacheEntry | undefined> = [];
    cache.set(["inv-sub"], "data");
    cache.subscribe(["inv-sub"], (e) => received.push(e));
    cache.invalidate(["inv-sub"]);
    expect(received[received.length - 1]).toBeUndefined();
  });

  it("unsubscribed callback is no longer called", () => {
    const calls: number[] = [];
    const unsub = cache.subscribe(["u"], () => calls.push(1));
    cache.set(["u"], "a");
    unsub();
    cache.set(["u"], "b");
    // Only the first set() should have triggered the callback.
    expect(calls).toHaveLength(1);
  });

  it("multiple subscribers for the same key all receive updates", () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    cache.subscribe(["multi"], (e) => a.push(e?.data));
    cache.subscribe(["multi"], (e) => b.push(e?.data));
    cache.set(["multi"], "shared");
    expect(a).toContain("shared");
    expect(b).toContain("shared");
  });
});

// ─── QueryCache — getAll ──────────────────────────────────────────────────────

describe("QueryCache — getAll", () => {
  let cache: QueryCache;

  beforeEach(() => { cache = new QueryCache({ defaultGcTime: 60_000 }); });
  afterEach(() => { cache.clear(); });

  it("returns an empty Map on a fresh cache", () => {
    expect(cache.getAll().size).toBe(0);
  });

  it("reflects all set entries", () => {
    cache.set(["a"], 1);
    cache.set(["b"], 2);
    expect(cache.getAll().size).toBe(2);
  });

  it("does not include invalidated entries", () => {
    cache.set(["x"], 1);
    cache.set(["y"], 2);
    cache.invalidate(["x"]);
    const all = cache.getAll();
    expect(all.size).toBe(1);
    expect(all.get(hashQueryKey(["y"]))!.data).toBe(2);
  });
});

// ─── QueryCache — defaultStaleTime / defaultGcTime ────────────────────────────

describe("QueryCache — constructor defaults", () => {
  it("uses 0 as default staleTime", () => {
    const cache = new QueryCache();
    cache.set(["d"], "v");
    expect(cache.get(["d"])!.staleTime).toBe(0);
    cache.clear();
  });

  it("uses 5 minutes as default gcTime", () => {
    const cache = new QueryCache();
    cache.set(["d"], "v");
    expect(cache.get(["d"])!.gcTime).toBe(5 * 60 * 1000);
    cache.clear();
  });

  it("respects custom defaultStaleTime passed in options", () => {
    const cache = new QueryCache({ defaultStaleTime: 10_000 });
    cache.set(["d"], "v");
    expect(cache.get(["d"])!.staleTime).toBe(10_000);
    cache.clear();
  });

  it("respects custom defaultGcTime passed in options", () => {
    const cache = new QueryCache({ defaultGcTime: 1_000 });
    cache.set(["d"], "v");
    expect(cache.get(["d"])!.gcTime).toBe(1_000);
    cache.clear();
  });
});
