/**
 * @vaisx/query — type definition tests
 *
 * Validates that the core type contracts are correctly defined and usable.
 * These are compile-time + runtime structural tests.
 */

import { describe, it, expect } from "vitest";
import type {
  QueryKey,
  QueryStatus,
  MutationStatus,
  QueryOptions,
  QueryResult,
  MutationOptions,
  MutationResult,
  QueryClientInterface,
  QueryCacheEntry,
} from "../types.js";

// ─── QueryKey ────────────────────────────────────────────────────────────────

describe("QueryKey", () => {
  it("accepts a simple string array key", () => {
    const key: QueryKey = ["users"];
    expect(key).toEqual(["users"]);
  });

  it("accepts a composite key with multiple segments", () => {
    const key: QueryKey = ["users", 42, { role: "admin" }];
    expect(key[0]).toBe("users");
    expect(key[1]).toBe(42);
    expect(key[2]).toEqual({ role: "admin" });
  });

  it("accepts a numeric-only key", () => {
    const key: QueryKey = [1, 2, 3];
    expect(Array.isArray(key)).toBe(true);
  });

  it("accepts an empty array as a valid key", () => {
    const key: QueryKey = [];
    expect(key.length).toBe(0);
  });
});

// ─── QueryStatus / MutationStatus ───────────────────────────────────────────

describe("QueryStatus", () => {
  it("includes all four status values", () => {
    const statuses: QueryStatus[] = ["idle", "loading", "error", "success"];
    expect(statuses).toHaveLength(4);
  });

  it("can be narrowed to individual values", () => {
    const status: QueryStatus = "loading";
    expect(status).toBe("loading");
  });
});

describe("MutationStatus", () => {
  it("includes all four mutation status values", () => {
    const statuses: MutationStatus[] = ["idle", "loading", "error", "success"];
    expect(statuses).toHaveLength(4);
  });
});

// ─── QueryOptions structure ──────────────────────────────────────────────────

describe("QueryOptions", () => {
  it("can be constructed with required fields only", () => {
    const opts: QueryOptions<string> = {
      queryKey: ["test"],
      queryFn: async () => "hello",
    };
    expect(opts.queryKey).toEqual(["test"]);
    expect(typeof opts.queryFn).toBe("function");
  });

  it("accepts all optional fields", () => {
    const opts: QueryOptions<number> = {
      queryKey: ["count"],
      queryFn: async () => 42,
      staleTime: 1000,
      gcTime: 5000,
      enabled: false,
      refetchOnWindowFocus: false,
      refetchInterval: 3000,
      initialData: 0,
      retry: 2,
      retryDelay: 500,
    };
    expect(opts.staleTime).toBe(1000);
    expect(opts.enabled).toBe(false);
    expect(opts.retry).toBe(2);
  });
});

// ─── MutationOptions structure ───────────────────────────────────────────────

describe("MutationOptions", () => {
  it("can be constructed with required mutationFn only", () => {
    const opts: MutationOptions<string, Error, { name: string }> = {
      mutationFn: async (vars) => `Hello ${vars.name}`,
    };
    expect(typeof opts.mutationFn).toBe("function");
  });

  it("accepts all lifecycle callbacks", () => {
    const calls: string[] = [];
    const opts: MutationOptions<string, Error, string, { prev: string }> = {
      mutationFn: async (v) => v.toUpperCase(),
      onMutate:   (v)    => { calls.push("mutate"); return { prev: v }; },
      onSuccess:  ()     => { calls.push("success"); },
      onError:    ()     => { calls.push("error"); },
      onSettled:  ()     => { calls.push("settled"); },
    };
    // Validate that all callbacks are functions
    expect(typeof opts.onMutate).toBe("function");
    expect(typeof opts.onSuccess).toBe("function");
    expect(typeof opts.onError).toBe("function");
    expect(typeof opts.onSettled).toBe("function");
  });
});

// ─── QueryCacheEntry structure ───────────────────────────────────────────────

describe("QueryCacheEntry", () => {
  it("can be structurally constructed with all required fields", () => {
    const entry: QueryCacheEntry<string> = {
      queryKey:  ["test"],
      data:      "cached",
      updatedAt: Date.now(),
      error:     null,
      observers: new Set(),
      gcTimer:   null,
    };
    expect(entry.data).toBe("cached");
    expect(entry.error).toBeNull();
    expect(entry.observers).toBeInstanceOf(Set);
  });
});

// ─── QueryClientInterface ────────────────────────────────────────────────────

describe("QueryClientInterface structural check", () => {
  it("defines all expected method names on the interface contract", () => {
    // Create a minimal conforming object
    const mockClient: QueryClientInterface = {
      getQueryData:       () => undefined,
      setQueryData:       () => undefined,
      invalidateQueries:  async () => undefined,
      prefetchQuery:      async () => undefined,
      getQueryCache:      () => new Map(),
    };

    expect(typeof mockClient.getQueryData).toBe("function");
    expect(typeof mockClient.setQueryData).toBe("function");
    expect(typeof mockClient.invalidateQueries).toBe("function");
    expect(typeof mockClient.prefetchQuery).toBe("function");
    expect(typeof mockClient.getQueryCache).toBe("function");
  });
});

// ─── QueryResult / MutationResult structural check ───────────────────────────

describe("QueryResult / MutationResult structural check", () => {
  it("QueryResult includes all expected fields", () => {
    const result: QueryResult<string> = {
      data:       undefined,
      error:      null,
      isLoading:  false,
      isFetching: false,
      isError:    false,
      isSuccess:  false,
      isIdle:     true,
      status:     "idle",
      refetch:    async () => undefined,
    };
    expect(result.isIdle).toBe(true);
    expect(result.status).toBe("idle");
  });

  it("MutationResult includes all expected fields", () => {
    const result: MutationResult<string, Error, string> = {
      mutate:      () => undefined,
      mutateAsync: async () => "ok",
      data:        undefined,
      error:       null,
      isLoading:   false,
      isError:     false,
      isSuccess:   false,
      isIdle:      true,
      status:      "idle",
      reset:       () => undefined,
    };
    expect(result.isIdle).toBe(true);
    expect(typeof result.mutate).toBe("function");
    expect(typeof result.mutateAsync).toBe("function");
    expect(typeof result.reset).toBe("function");
  });
});
