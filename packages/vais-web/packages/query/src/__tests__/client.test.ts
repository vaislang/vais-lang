/**
 * @vaisx/query — QueryClient tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, serializeKey, getDefaultClient, setDefaultClient } from "../client.js";

// ─── serializeKey ─────────────────────────────────────────────────────────────

describe("serializeKey", () => {
  it("serialises a simple string key", () => {
    expect(serializeKey(["users"])).toBe('["users"]');
  });

  it("serialises a composite key", () => {
    expect(serializeKey(["users", 1])).toBe('["users",1]');
  });

  it("serialises an empty key", () => {
    expect(serializeKey([])).toBe("[]");
  });

  it("produces the same string for identical keys", () => {
    expect(serializeKey(["a", "b"])).toBe(serializeKey(["a", "b"]));
  });

  it("produces different strings for different keys", () => {
    expect(serializeKey(["a"])).not.toBe(serializeKey(["b"]));
  });
});

// ─── QueryClient — getQueryData / setQueryData ────────────────────────────────

describe("QueryClient — cache read/write", () => {
  let client: QueryClient;

  beforeEach(() => { client = new QueryClient(); });
  afterEach(() => { client.clear(); });

  it("returns undefined for a key that has never been set", () => {
    expect(client.getQueryData(["missing"])).toBeUndefined();
  });

  it("setQueryData stores data and getQueryData retrieves it", () => {
    client.setQueryData(["users"], [{ id: 1 }]);
    expect(client.getQueryData(["users"])).toEqual([{ id: 1 }]);
  });

  it("setQueryData overwrites existing data", () => {
    client.setQueryData(["count"], 1);
    client.setQueryData(["count"], 2);
    expect(client.getQueryData(["count"])).toBe(2);
  });

  it("setQueryData updates the updatedAt timestamp", () => {
    const before = Date.now();
    client.setQueryData(["ts"], "v");
    const entry = client.getQueryCache().get(serializeKey(["ts"]));
    expect(entry?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("different keys are independent in the cache", () => {
    client.setQueryData(["a"], "A");
    client.setQueryData(["b"], "B");
    expect(client.getQueryData(["a"])).toBe("A");
    expect(client.getQueryData(["b"])).toBe("B");
  });
});

// ─── QueryClient — getQueryCache ──────────────────────────────────────────────

describe("QueryClient — getQueryCache", () => {
  it("returns an empty Map on a fresh client", () => {
    const client = new QueryClient();
    expect(client.getQueryCache().size).toBe(0);
    client.clear();
  });

  it("reflects entries after setQueryData", () => {
    const client = new QueryClient();
    client.setQueryData(["x"], 42);
    expect(client.getQueryCache().size).toBe(1);
    client.clear();
  });
});

// ─── QueryClient — invalidateQueries ─────────────────────────────────────────

describe("QueryClient — invalidateQueries", () => {
  let client: QueryClient;

  beforeEach(() => { client = new QueryClient(); });
  afterEach(() => { client.clear(); });

  it("notifies observers of matching keys", async () => {
    const notified: string[] = [];
    client.setQueryData(["users"], []);
    client.subscribe(["users"], () => notified.push("users"));

    await client.invalidateQueries(["users"]);
    expect(notified).toContain("users");
  });

  it("notifies all observers when called with no key argument", async () => {
    const notified: string[] = [];
    client.setQueryData(["a"], 1);
    client.setQueryData(["b"], 2);
    client.subscribe(["a"], () => notified.push("a"));
    client.subscribe(["b"], () => notified.push("b"));

    await client.invalidateQueries();
    expect(notified).toContain("a");
    expect(notified).toContain("b");
  });
});

// ─── QueryClient — prefetchQuery ──────────────────────────────────────────────

describe("QueryClient — prefetchQuery", () => {
  let client: QueryClient;

  beforeEach(() => { client = new QueryClient(); });
  afterEach(() => { client.clear(); });

  it("calls queryFn and populates the cache", async () => {
    await client.prefetchQuery({
      queryKey: ["prefetch"],
      queryFn: async () => "prefetched-data",
    });
    expect(client.getQueryData(["prefetch"])).toBe("prefetched-data");
  });

  it("skips fetching when data is already fresh", async () => {
    const queryFn = vi.fn(async () => "data");

    await client.prefetchQuery({
      queryKey: ["fresh"],
      queryFn,
      staleTime: 60_000,
    });

    // Second prefetch — data is still fresh, queryFn should NOT be called again
    await client.prefetchQuery({
      queryKey: ["fresh"],
      queryFn,
      staleTime: 60_000,
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when data is stale (staleTime: 0)", async () => {
    const queryFn = vi.fn(async () => "data");

    await client.prefetchQuery({ queryKey: ["stale"], queryFn, staleTime: 0 });
    await client.prefetchQuery({ queryKey: ["stale"], queryFn, staleTime: 0 });

    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});

// ─── QueryClient — subscribe / GC ─────────────────────────────────────────────

describe("QueryClient — subscribe", () => {
  it("returns an unsubscribe function", () => {
    const client = new QueryClient();
    const unsub = client.subscribe(["sub"], () => {});
    expect(typeof unsub).toBe("function");
    unsub();
    client.clear();
  });

  it("observer is called when setQueryData is invoked for the same key", () => {
    const client = new QueryClient();
    const calls: unknown[] = [];
    client.subscribe(["watch"], () => calls.push(client.getQueryData(["watch"])));
    client.setQueryData(["watch"], "first");
    client.setQueryData(["watch"], "second");
    expect(calls).toEqual(["first", "second"]);
    client.clear();
  });

  it("unsubscribed observer is no longer called", () => {
    const client = new QueryClient();
    const calls: number[] = [];
    const unsub = client.subscribe(["u"], () => calls.push(1));
    client.setQueryData(["u"], "a");
    unsub();
    client.setQueryData(["u"], "b");
    expect(calls).toHaveLength(1);
    client.clear();
  });
});

// ─── QueryClient — fetchQuery ─────────────────────────────────────────────────

describe("QueryClient — fetchQuery", () => {
  let client: QueryClient;

  beforeEach(() => { client = new QueryClient(); });
  afterEach(() => { client.clear(); });

  it("resolves and caches data", async () => {
    const data = await client.fetchQuery({
      queryKey: ["fetch"],
      queryFn: async () => 99,
    });
    expect(data).toBe(99);
    expect(client.getQueryData(["fetch"])).toBe(99);
  });

  it("de-duplicates concurrent fetches for the same key", async () => {
    const queryFn = vi.fn(async () => "dedup");
    const [a, b] = await Promise.all([
      client.fetchQuery({ queryKey: ["dup"], queryFn }),
      client.fetchQuery({ queryKey: ["dup"], queryFn }),
    ]);
    expect(a).toBe("dedup");
    expect(b).toBe("dedup");
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("throws and updates error state when queryFn rejects", async () => {
    await expect(
      client.fetchQuery({
        queryKey: ["fail"],
        queryFn: async () => { throw new Error("oops"); },
        retry: false,
      }),
    ).rejects.toThrow("oops");

    const entry = client.getQueryCache().get(serializeKey(["fail"]));
    expect((entry?.error as Error)?.message).toBe("oops");
  });
});

// ─── QueryClient — isStale ────────────────────────────────────────────────────

describe("QueryClient — isStale", () => {
  it("returns true when there is no cached data", () => {
    const client = new QueryClient();
    expect(client.isStale(["missing"], 1000)).toBe(true);
    client.clear();
  });

  it("returns false immediately after setQueryData with large staleTime", () => {
    const client = new QueryClient();
    client.setQueryData(["fresh"], "data");
    expect(client.isStale(["fresh"], 60_000)).toBe(false);
    client.clear();
  });

  it("returns true when staleTime is 0", () => {
    const client = new QueryClient();
    client.setQueryData(["instant"], "data");
    expect(client.isStale(["instant"], 0)).toBe(true);
    client.clear();
  });
});

// ─── QueryClient — clear ──────────────────────────────────────────────────────

describe("QueryClient — clear", () => {
  it("empties the cache", () => {
    const client = new QueryClient();
    client.setQueryData(["a"], 1);
    client.setQueryData(["b"], 2);
    client.clear();
    expect(client.getQueryCache().size).toBe(0);
  });
});

// ─── getDefaultClient / setDefaultClient ──────────────────────────────────────

describe("getDefaultClient / setDefaultClient", () => {
  afterEach(() => {
    // Reset the default client between tests
    setDefaultClient(null);
  });

  it("getDefaultClient returns a QueryClient instance", () => {
    const client = getDefaultClient();
    expect(client).toBeInstanceOf(QueryClient);
  });

  it("getDefaultClient returns the same instance on subsequent calls", () => {
    const a = getDefaultClient();
    const b = getDefaultClient();
    expect(a).toBe(b);
  });

  it("setDefaultClient replaces the module-level default", () => {
    const custom = new QueryClient({ defaultStaleTime: 9999 });
    setDefaultClient(custom);
    expect(getDefaultClient()).toBe(custom);
  });
});
