/**
 * @vaisx/query — createQuery tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createQuery } from "../query.js";
import { QueryClient } from "../client.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient(): QueryClient {
  return new QueryClient({ defaultStaleTime: 0, defaultGcTime: 0 });
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── Initial state ─────────────────────────────────────────────────────────────

describe("createQuery — initial state", () => {
  it("starts in loading state when no cached data exists", () => {
    const client = makeClient();
    const query = createQuery(
      { queryKey: ["init"], queryFn: async () => "data" },
      client,
    );
    // isLoading should be true before the first fetch resolves
    expect(query.isLoading).toBe(true);
    expect(query.isSuccess).toBe(false);
    expect(query.isError).toBe(false);
    expect(query.data).toBeUndefined();
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
    client.clear();
  });

  it("starts in idle state when enabled is false", () => {
    const client = makeClient();
    const query = createQuery(
      { queryKey: ["disabled"], queryFn: async () => "data", enabled: false },
      client,
    );
    expect(query.isIdle).toBe(true);
    expect(query.isLoading).toBe(false);
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
    client.clear();
  });

  it("uses initialData and starts in success state", () => {
    const client = makeClient();
    const query = createQuery(
      { queryKey: ["initial"], queryFn: async () => "fresh", initialData: "seed" },
      client,
    );
    expect(query.isSuccess).toBe(true);
    expect(query.data).toBe("seed");
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
    client.clear();
  });
});

// ─── Successful fetch ──────────────────────────────────────────────────────────

describe("createQuery — successful fetch", () => {
  let client: QueryClient;

  beforeEach(() => { client = makeClient(); });
  afterEach(() => { client.clear(); });

  it("transitions to success state after fetch resolves", async () => {
    const query = createQuery(
      { queryKey: ["success"], queryFn: async () => "result" },
      client,
    );
    await nextTick();
    expect(query.isSuccess).toBe(true);
    expect(query.data).toBe("result");
    expect(query.isLoading).toBe(false);
    expect(query.error).toBeNull();
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });

  it("isFetching is true while fetch is in progress", async () => {
    let resolveFn!: (v: string) => void;
    const promise = new Promise<string>((r) => { resolveFn = r; });

    const query = createQuery(
      { queryKey: ["fetching"], queryFn: () => promise },
      client,
    );
    expect(query.isFetching).toBe(true);
    resolveFn("done");
    await nextTick();
    expect(query.isFetching).toBe(false);
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });

  it("data is populated after a successful fetch", async () => {
    const users = [{ id: 1, name: "Alice" }];
    const query = createQuery(
      { queryKey: ["users"], queryFn: async () => users },
      client,
    );
    await nextTick();
    expect(query.data).toEqual(users);
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe("createQuery — error state", () => {
  let client: QueryClient;

  beforeEach(() => { client = makeClient(); });
  afterEach(() => { client.clear(); });

  it("transitions to error state when queryFn throws", async () => {
    const query = createQuery(
      {
        queryKey: ["err"],
        queryFn: async () => { throw new Error("fetch failed"); },
        retry: false,
      },
      client,
    );
    await nextTick();
    expect(query.isError).toBe(true);
    expect((query.error as Error)?.message).toBe("fetch failed");
    expect(query.data).toBeUndefined();
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });

  it("error is null in success state", async () => {
    const query = createQuery(
      { queryKey: ["noerr"], queryFn: async () => 42 },
      client,
    );
    await nextTick();
    expect(query.error).toBeNull();
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });
});

// ─── refetch ──────────────────────────────────────────────────────────────────

describe("createQuery — refetch", () => {
  let client: QueryClient;

  beforeEach(() => { client = makeClient(); });
  afterEach(() => { client.clear(); });

  it("refetch triggers a new fetch and returns updated data", async () => {
    let callCount = 0;
    const query = createQuery(
      {
        queryKey: ["refetch"],
        queryFn: async () => { callCount++; return `call-${callCount}`; },
      },
      client,
    );
    await nextTick();
    expect(query.data).toBe("call-1");

    const result = await query.refetch();
    expect(result).toBe("call-2");
    expect(query.data).toBe("call-2");
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });
});

// ─── enabled: false ───────────────────────────────────────────────────────────

describe("createQuery — enabled option", () => {
  let client: QueryClient;

  beforeEach(() => { client = makeClient(); });
  afterEach(() => { client.clear(); });

  it("does not fetch when enabled is false", async () => {
    const queryFn = vi.fn(async () => "data");
    const query = createQuery(
      { queryKey: ["disabled"], queryFn, enabled: false },
      client,
    );
    await nextTick();
    expect(queryFn).not.toHaveBeenCalled();
    expect(query.data).toBeUndefined();
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });
});

// ─── Cache integration ─────────────────────────────────────────────────────────

describe("createQuery — cache integration", () => {
  let client: QueryClient;

  beforeEach(() => { client = makeClient(); });
  afterEach(() => { client.clear(); });

  it("uses pre-populated cache data and skips fetch when not stale", async () => {
    // Seed the cache with fresh data
    client.setQueryData(["cached"], "cached-value");

    const queryFn = vi.fn(async () => "fresh-value");
    const query = createQuery(
      { queryKey: ["cached"], queryFn, staleTime: 60_000 },
      client,
    );
    await nextTick();

    // queryFn should NOT be called as the cache is still fresh
    expect(queryFn).not.toHaveBeenCalled();
    expect(query.data).toBe("cached-value");
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });

  it("reflects data written via setQueryData to the cache", async () => {
    const query = createQuery(
      { queryKey: ["ext"], queryFn: async () => "original" },
      client,
    );
    await nextTick();
    expect(query.data).toBe("original");

    // External write — observers should be notified
    client.setQueryData(["ext"], "updated");
    expect(query.data).toBe("updated");
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });

  it("queryFn receives the queryKey and signal in context", async () => {
    let receivedKey: readonly unknown[] | undefined;
    let receivedSignal: AbortSignal | undefined;

    const query = createQuery(
      {
        queryKey: ["ctx", 1],
        queryFn: async ({ queryKey, signal }) => {
          receivedKey    = queryKey;
          receivedSignal = signal;
          return "ok";
        },
      },
      client,
    );
    await nextTick();
    expect(receivedKey).toEqual(["ctx", 1]);
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    // @ts-expect-error dispose is internal extension
    query.dispose?.();
  });
});

// ─── Multiple queries on the same client ──────────────────────────────────────

describe("createQuery — multiple queries", () => {
  let client: QueryClient;

  beforeEach(() => { client = makeClient(); });
  afterEach(() => { client.clear(); });

  it("two queries with different keys are independent", async () => {
    const q1 = createQuery({ queryKey: ["q1"], queryFn: async () => "one" }, client);
    const q2 = createQuery({ queryKey: ["q2"], queryFn: async () => "two" }, client);

    await nextTick();

    expect(q1.data).toBe("one");
    expect(q2.data).toBe("two");

    // @ts-expect-error dispose is internal extension
    q1.dispose?.();
    // @ts-expect-error dispose is internal extension
    q2.dispose?.();
  });
});
