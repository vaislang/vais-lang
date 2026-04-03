/**
 * @vaisx/query — OptimisticUpdateManager tests
 *
 * Covers:
 *   - Immediate cache update (UI pre-reflection)
 *   - Cache invalidation on success
 *   - Rollback on failure
 *   - Callback ordering (onSuccess, onError, onSettled)
 *   - Multiple concurrent mutations
 *   - rollback() helper
 *   - Status transitions
 *   - mutateAsync() API
 *   - Edge cases (undefined initial cache, no callbacks, …)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryCache } from "../cache.js";
import { OptimisticUpdateManager } from "../optimistic.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Todo = { id: number; text: string };

function makeCache() {
  return new QueryCache({ defaultGcTime: 60_000 });
}

function makeManager(cache: QueryCache) {
  return new OptimisticUpdateManager(cache);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── Optimistic update — immediate cache change ───────────────────────────────

describe("OptimisticUpdateManager — immediate cache update", () => {
  let cache: QueryCache;
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    cache   = makeCache();
    manager = makeManager(cache);
  });

  it("updates the cache synchronously before mutationFn resolves", async () => {
    const QUERY_KEY = ["todos"] as const;
    cache.set(QUERY_KEY, [{ id: 1, text: "Existing" }]);

    let cacheValueDuringMutation: Todo[] | undefined;

    const mutation = manager.createOptimisticMutation<Todo[], Error, Todo, Todo[]>({
      queryKey:    QUERY_KEY,
      mutationFn:  async (todo) => {
        // Read the cache while the server call is "in flight".
        cacheValueDuringMutation = cache.get<Todo[]>(QUERY_KEY)?.data;
        await sleep(10);
        return [{ id: 1, text: "Existing" }, todo];
      },
      updater: (old, newTodo) => [...(old ?? []), newTodo],
    });

    const promise = mutation.mutateAsync({ id: 2, text: "New" });

    // The cache should already contain the optimistic value.
    expect(cache.get<Todo[]>(QUERY_KEY)?.data).toEqual([
      { id: 1, text: "Existing" },
      { id: 2, text: "New" },
    ]);

    await promise;

    // During the mutation, the cache had the optimistic value.
    expect(cacheValueDuringMutation).toEqual([
      { id: 1, text: "Existing" },
      { id: 2, text: "New" },
    ]);
  });

  it("applies the updater with undefined when cache is empty", async () => {
    const QUERY_KEY = ["items"] as const;

    const mutation = manager.createOptimisticMutation<string[], Error, string, string[]>({
      queryKey:   QUERY_KEY,
      mutationFn: async (item) => [item],
      updater:    (old, item) => [...(old ?? []), item],
    });

    const promise = mutation.mutateAsync("hello");

    expect(cache.get<string[]>(QUERY_KEY)?.data).toEqual(["hello"]);

    await promise;
  });

  it("updater receives the current cache data as first argument", async () => {
    const QUERY_KEY = ["counter"] as const;
    cache.set(QUERY_KEY, 5);

    const capturedOld: (number | undefined)[] = [];

    const mutation = manager.createOptimisticMutation<number, Error, number, number>({
      queryKey:   QUERY_KEY,
      mutationFn: async (delta) => 5 + delta,
      updater:    (old, delta) => {
        capturedOld.push(old);
        return (old ?? 0) + delta;
      },
    });

    await mutation.mutateAsync(3);

    expect(capturedOld[0]).toBe(5);
  });
});

// ─── Success path — cache invalidation ───────────────────────────────────────

describe("OptimisticUpdateManager — success: cache invalidation", () => {
  let cache: QueryCache;
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    cache   = makeCache();
    manager = makeManager(cache);
  });

  it("invalidates the cache entry after a successful mutation", async () => {
    const QUERY_KEY = ["posts"] as const;
    cache.set(QUERY_KEY, [{ id: 1 }]);

    const mutation = manager.createOptimisticMutation({
      queryKey:   QUERY_KEY,
      mutationFn: async () => ({ id: 2 }),
      updater:    (old: unknown) => old,
    });

    await mutation.mutateAsync(undefined);

    // After success, the cache should be invalidated (get returns undefined).
    expect(cache.get(QUERY_KEY)).toBeUndefined();
  });

  it("sets status to 'success' after mutationFn resolves", async () => {
    const QUERY_KEY = ["x"] as const;
    const mutation = manager.createOptimisticMutation({
      queryKey:   QUERY_KEY,
      mutationFn: async () => "ok",
      updater:    () => "optimistic",
    });

    await mutation.mutateAsync(undefined);

    expect(mutation.status).toBe("success");
    expect(mutation.isSuccess).toBe(true);
    expect(mutation.data).toBe("ok");
  });

  it("stores the resolved data on the result after success", async () => {
    const mutation = manager.createOptimisticMutation<{ id: number }, Error, void>({
      queryKey:   ["d"],
      mutationFn: async () => ({ id: 99 }),
      updater:    () => undefined as unknown,
    });

    await mutation.mutateAsync(undefined);

    expect(mutation.data).toEqual({ id: 99 });
  });
});

// ─── Failure path — rollback ──────────────────────────────────────────────────

describe("OptimisticUpdateManager — failure: rollback", () => {
  let cache: QueryCache;
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    cache   = makeCache();
    manager = makeManager(cache);
  });

  it("restores the previous cache value when mutationFn rejects", async () => {
    const QUERY_KEY  = ["todos"] as const;
    const initial: Todo[] = [{ id: 1, text: "Original" }];
    cache.set(QUERY_KEY, initial);

    const mutation = manager.createOptimisticMutation<Todo[], Error, Todo, Todo[]>({
      queryKey:   QUERY_KEY,
      mutationFn: async () => { throw new Error("Network error"); },
      updater:    (old, t) => [...(old ?? []), t],
    });

    await expect(mutation.mutateAsync({ id: 2, text: "Optimistic" })).rejects.toThrow("Network error");

    // Cache should be back to the original data.
    expect(cache.get<Todo[]>(QUERY_KEY)?.data).toEqual(initial);
  });

  it("invalidates the cache entry (instead of rollback) when there was no prior data", async () => {
    const QUERY_KEY = ["new-key"] as const;

    const mutation = manager.createOptimisticMutation<string, Error, string, string>({
      queryKey:   QUERY_KEY,
      mutationFn: async () => { throw new Error("fail"); },
      updater:    (_, v) => v,
    });

    await expect(mutation.mutateAsync("opt")).rejects.toThrow();

    // No prior data → cache should be invalidated (undefined).
    expect(cache.get(QUERY_KEY)).toBeUndefined();
  });

  it("sets status to 'error' after mutationFn rejects", async () => {
    const mutation = manager.createOptimisticMutation({
      queryKey:   ["e"],
      mutationFn: async () => { throw new Error("oops"); },
      updater:    () => "opt",
    });

    await mutation.mutateAsync(undefined).catch(() => {});

    expect(mutation.status).toBe("error");
    expect(mutation.isError).toBe(true);
  });

  it("captures the thrown error on the result", async () => {
    const mutation = manager.createOptimisticMutation({
      queryKey:   ["err-capture"],
      mutationFn: async () => { throw new Error("bad"); },
      updater:    () => null,
    });

    await mutation.mutateAsync(undefined).catch(() => {});

    expect(mutation.error).toBeInstanceOf(Error);
    expect((mutation.error as Error).message).toBe("bad");
  });
});

// ─── Callbacks — ordering ─────────────────────────────────────────────────────

describe("OptimisticUpdateManager — callback ordering", () => {
  let cache: QueryCache;
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    cache   = makeCache();
    manager = makeManager(cache);
  });

  it("calls onSuccess then onSettled on success (in order)", async () => {
    const order: string[] = [];

    const mutation = manager.createOptimisticMutation({
      queryKey:   ["order-ok"],
      mutationFn: async () => "result",
      updater:    () => "opt",
      onSuccess:  () => { order.push("onSuccess"); },
      onSettled:  () => { order.push("onSettled"); },
    });

    await mutation.mutateAsync(undefined);

    expect(order).toEqual(["onSuccess", "onSettled"]);
  });

  it("calls onError then onSettled on failure (in order)", async () => {
    const order: string[] = [];

    const mutation = manager.createOptimisticMutation({
      queryKey:   ["order-err"],
      mutationFn: async () => { throw new Error("x"); },
      updater:    () => "opt",
      onError:    () => { order.push("onError"); },
      onSettled:  () => { order.push("onSettled"); },
    });

    await mutation.mutateAsync(undefined).catch(() => {});

    expect(order).toEqual(["onError", "onSettled"]);
  });

  it("does NOT call onError on success", async () => {
    const onError = vi.fn();

    const mutation = manager.createOptimisticMutation({
      queryKey:   ["no-err"],
      mutationFn: async () => "ok",
      updater:    () => "opt",
      onError,
    });

    await mutation.mutateAsync(undefined);

    expect(onError).not.toHaveBeenCalled();
  });

  it("does NOT call onSuccess on failure", async () => {
    const onSuccess = vi.fn();

    const mutation = manager.createOptimisticMutation({
      queryKey:   ["no-success"],
      mutationFn: async () => { throw new Error("fail"); },
      updater:    () => "opt",
      onSuccess,
    });

    await mutation.mutateAsync(undefined).catch(() => {});

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("always calls onSettled on success", async () => {
    const onSettled = vi.fn();

    const mutation = manager.createOptimisticMutation({
      queryKey:   ["settled-ok"],
      mutationFn: async () => 42,
      updater:    () => 0,
      onSettled,
    });

    await mutation.mutateAsync(undefined);

    expect(onSettled).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledWith(42, null, undefined);
  });

  it("always calls onSettled on failure", async () => {
    const onSettled = vi.fn();
    const err = new Error("settled-fail");

    const mutation = manager.createOptimisticMutation({
      queryKey:   ["settled-err"],
      mutationFn: async () => { throw err; },
      updater:    () => 0,
      onSettled,
    });

    await mutation.mutateAsync(undefined).catch(() => {});

    expect(onSettled).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledWith(undefined, err, undefined);
  });

  it("passes variables to onSuccess callback", async () => {
    const onSuccess = vi.fn();

    const mutation = manager.createOptimisticMutation<string, Error, string>({
      queryKey:   ["vars-ok"],
      mutationFn: async (v) => `done:${v}`,
      updater:    (_, v) => v,
      onSuccess,
    });

    await mutation.mutateAsync("hello");

    expect(onSuccess).toHaveBeenCalledWith("done:hello", "hello");
  });

  it("passes variables to onError callback", async () => {
    const onError = vi.fn();

    const mutation = manager.createOptimisticMutation<string, Error, string>({
      queryKey:   ["vars-err"],
      mutationFn: async () => { throw new Error("e"); },
      updater:    (_, v) => v,
      onError,
    });

    await mutation.mutateAsync("world").catch(() => {});

    expect(onError).toHaveBeenCalledWith(expect.any(Error), "world");
  });
});

// ─── rollback() helper ────────────────────────────────────────────────────────

describe("OptimisticUpdateManager — rollback() helper", () => {
  let cache: QueryCache;
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    cache   = makeCache();
    manager = makeManager(cache);
  });

  it("restores a previous value when called with a snapshot", () => {
    const QUERY_KEY = ["snap"] as const;
    cache.set(QUERY_KEY, "original");
    cache.set(QUERY_KEY, "changed");

    manager.rollback(QUERY_KEY, "original");

    expect(cache.get<string>(QUERY_KEY)?.data).toBe("original");
  });

  it("invalidates the cache entry when called with undefined", () => {
    const QUERY_KEY = ["snap-undef"] as const;
    cache.set(QUERY_KEY, "some-data");

    manager.rollback(QUERY_KEY, undefined);

    expect(cache.get(QUERY_KEY)).toBeUndefined();
  });
});

// ─── Multiple concurrent mutations ────────────────────────────────────────────

describe("OptimisticUpdateManager — concurrent mutations", () => {
  let cache: QueryCache;
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    cache   = makeCache();
    manager = makeManager(cache);
  });

  it("applies each mutation's optimistic update to the cache independently", async () => {
    const QUERY_KEY_A = ["counters", "a"] as const;
    const QUERY_KEY_B = ["counters", "b"] as const;
    cache.set(QUERY_KEY_A, 0);
    cache.set(QUERY_KEY_B, 100);

    const mutationA = manager.createOptimisticMutation<number, Error, number, number>({
      queryKey:   QUERY_KEY_A,
      mutationFn: async (delta) => { await sleep(20); return delta; },
      updater:    (old, delta) => (old ?? 0) + delta,
    });

    const mutationB = manager.createOptimisticMutation<number, Error, number, number>({
      queryKey:   QUERY_KEY_B,
      mutationFn: async (delta) => { await sleep(10); return delta; },
      updater:    (old, delta) => (old ?? 0) - delta,
    });

    const promiseA = mutationA.mutateAsync(5);
    const promiseB = mutationB.mutateAsync(10);

    // Both caches should be updated optimistically immediately.
    expect(cache.get<number>(QUERY_KEY_A)?.data).toBe(5);
    expect(cache.get<number>(QUERY_KEY_B)?.data).toBe(90);

    await Promise.all([promiseA, promiseB]);

    // After success both keys are invalidated.
    expect(cache.get(QUERY_KEY_A)).toBeUndefined();
    expect(cache.get(QUERY_KEY_B)).toBeUndefined();
  });

  it("rolls back only the failed mutation's cache key when one of two mutations fails", async () => {
    const KEY_OK  = ["concurrent", "ok"]  as const;
    const KEY_FAIL = ["concurrent", "fail"] as const;
    cache.set(KEY_OK,   "original-ok");
    cache.set(KEY_FAIL, "original-fail");

    const mutOk = manager.createOptimisticMutation<string, Error, string, string>({
      queryKey:   KEY_OK,
      mutationFn: async (v) => v,
      updater:    (_, v) => v,
    });

    const mutFail = manager.createOptimisticMutation<string, Error, string, string>({
      queryKey:   KEY_FAIL,
      mutationFn: async () => { throw new Error("partial fail"); },
      updater:    (_, v) => v,
    });

    const p1 = mutOk.mutateAsync("new-ok");
    const p2 = mutFail.mutateAsync("new-fail");

    await p1;
    await p2.catch(() => {});

    // Success key → invalidated.
    expect(cache.get(KEY_OK)).toBeUndefined();
    // Fail key → rolled back to original.
    expect(cache.get<string>(KEY_FAIL)?.data).toBe("original-fail");
  });

  it("handles multiple sequential mutations on the same key", async () => {
    const QUERY_KEY = ["seq"] as const;
    cache.set(QUERY_KEY, [1]);

    const mutation = manager.createOptimisticMutation<number[], Error, number, number[]>({
      queryKey:   QUERY_KEY,
      mutationFn: async (n) => [n],
      updater:    (old, n) => [...(old ?? []), n],
    });

    await mutation.mutateAsync(2);

    // After success, cache is invalidated. Re-seed for next call.
    cache.set(QUERY_KEY, [1, 2]);
    await mutation.mutateAsync(3);

    // Cache invalidated after second success.
    expect(cache.get(QUERY_KEY)).toBeUndefined();
  });
});

// ─── Status lifecycle ─────────────────────────────────────────────────────────

describe("OptimisticUpdateManager — status lifecycle", () => {
  let cache: QueryCache;
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    cache   = makeCache();
    manager = makeManager(cache);
  });

  it("starts in idle status", () => {
    const mutation = manager.createOptimisticMutation({
      queryKey:   ["s"],
      mutationFn: async () => "ok",
      updater:    () => "opt",
    });

    expect(mutation.status).toBe("idle");
    expect(mutation.isIdle).toBe(true);
    expect(mutation.data).toBeUndefined();
    expect(mutation.error).toBeNull();
  });

  it("transitions to loading during mutation and success after resolve", async () => {
    const statuses: string[] = [];
    let resolve!: (v: string) => void;
    const blocker = new Promise<string>((res) => { resolve = res; });

    const mutation = manager.createOptimisticMutation<string, Error, void>({
      queryKey:   ["lifecycle"],
      mutationFn: () => blocker,
      updater:    () => "opt",
    });

    const promise = mutation.mutateAsync(undefined);
    statuses.push(mutation.status); // should be loading

    resolve("done");
    await promise;
    statuses.push(mutation.status); // should be success

    expect(statuses).toEqual(["loading", "success"]);
  });

  it("reset() restores idle state after success", async () => {
    const mutation = manager.createOptimisticMutation({
      queryKey:   ["reset-ok"],
      mutationFn: async () => "val",
      updater:    () => "opt",
    });

    await mutation.mutateAsync(undefined);
    expect(mutation.isSuccess).toBe(true);

    mutation.reset();

    expect(mutation.status).toBe("idle");
    expect(mutation.data).toBeUndefined();
    expect(mutation.error).toBeNull();
  });

  it("reset() restores idle state after error", async () => {
    const mutation = manager.createOptimisticMutation({
      queryKey:   ["reset-err"],
      mutationFn: async () => { throw new Error("x"); },
      updater:    () => "opt",
    });

    await mutation.mutateAsync(undefined).catch(() => {});
    expect(mutation.isError).toBe(true);

    mutation.reset();

    expect(mutation.status).toBe("idle");
    expect(mutation.error).toBeNull();
  });
});
