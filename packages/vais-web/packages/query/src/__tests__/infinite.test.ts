/**
 * @vaisx/query — createInfiniteQuery tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInfiniteQuery } from "../infinite.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Build a simple paginated data source: pages of items identified by page number. */
function makePagedSource(totalPages: number) {
  return async ({ pageParam }: { pageParam: number; queryKey: readonly unknown[]; signal: AbortSignal }) => {
    return {
      items: [`item-${pageParam}-a`, `item-${pageParam}-b`],
      page: pageParam,
      nextPage: pageParam < totalPages - 1 ? pageParam + 1 : null,
      prevPage: pageParam > 0 ? pageParam - 1 : null,
    };
  };
}

type PagedData = Awaited<ReturnType<ReturnType<typeof makePagedSource>>>;

// ─── Initial state ─────────────────────────────────────────────────────────────

describe("createInfiniteQuery — initial state", () => {
  it("starts in loading state when enabled (default)", () => {
    const query = createInfiniteQuery({
      queryKey: ["test"],
      queryFn: makePagedSource(3),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    expect(query.isLoading).toBe(true);
    expect(query.isSuccess).toBe(false);
    expect(query.isIdle).toBe(false);
    expect(query.data).toBeUndefined();
  });

  it("starts in idle state when enabled is false", () => {
    const query = createInfiniteQuery({
      queryKey: ["disabled"],
      queryFn: makePagedSource(3),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
      enabled: false,
    });

    expect(query.isIdle).toBe(true);
    expect(query.isLoading).toBe(false);
    expect(query.isFetching).toBe(false);
    expect(query.data).toBeUndefined();
  });

  it("isFetching is true while the first page fetch is in progress", () => {
    const query = createInfiniteQuery({
      queryKey: ["fetching"],
      queryFn: makePagedSource(2),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    expect(query.isFetching).toBe(true);
  });
});

// ─── First page load ──────────────────────────────────────────────────────────

describe("createInfiniteQuery — first page load", () => {
  it("loads the first page and transitions to success state", async () => {
    const query = createInfiniteQuery({
      queryKey: ["first-page"],
      queryFn: makePagedSource(3),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();

    expect(query.isSuccess).toBe(true);
    expect(query.isLoading).toBe(false);
    expect(query.isFetching).toBe(false);
    expect(query.error).toBeNull();
  });

  it("data.pages contains the first page after load", async () => {
    const query = createInfiniteQuery({
      queryKey: ["pages-init"],
      queryFn: makePagedSource(3),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();

    expect(query.data).toBeDefined();
    expect(query.data!.pages).toHaveLength(1);
    expect(query.data!.pages[0].page).toBe(0);
    expect(query.data!.pages[0].items).toEqual(["item-0-a", "item-0-b"]);
  });

  it("data.pageParams contains the initial page param", async () => {
    const query = createInfiniteQuery({
      queryKey: ["params-init"],
      queryFn: makePagedSource(3),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();

    expect(query.data!.pageParams).toEqual([0]);
  });

  it("hasNextPage is true when getNextPageParam returns a value", async () => {
    const query = createInfiniteQuery({
      queryKey: ["has-next"],
      queryFn: makePagedSource(3),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();

    expect(query.hasNextPage).toBe(true);
  });

  it("hasNextPage is false when getNextPageParam returns undefined", async () => {
    const query = createInfiniteQuery({
      queryKey: ["no-next"],
      queryFn: makePagedSource(1), // only 1 page
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();

    expect(query.hasNextPage).toBe(false);
  });
});

// ─── fetchNextPage ─────────────────────────────────────────────────────────────

describe("createInfiniteQuery — fetchNextPage", () => {
  it("fetchNextPage appends the next page to data.pages", async () => {
    const query = createInfiniteQuery({
      queryKey: ["fetch-next"],
      queryFn: makePagedSource(3),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();
    expect(query.data!.pages).toHaveLength(1);

    await query.fetchNextPage();

    expect(query.data!.pages).toHaveLength(2);
    expect(query.data!.pages[1].page).toBe(1);
  });

  it("fetchNextPage updates pageParams correctly", async () => {
    const query = createInfiniteQuery({
      queryKey: ["next-params"],
      queryFn: makePagedSource(3),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();
    await query.fetchNextPage();

    expect(query.data!.pageParams).toEqual([0, 1]);
  });

  it("isFetchingNextPage is true while fetchNextPage is in progress", async () => {
    let resolveSecond!: (v: PagedData) => void;
    let callCount = 0;

    const query = createInfiniteQuery({
      queryKey: ["fetching-next"],
      queryFn: async ({ pageParam }: { pageParam: number; queryKey: readonly unknown[]; signal: AbortSignal }) => {
        callCount++;
        if (callCount === 1) {
          // First page resolves immediately
          return { items: [], page: 0, nextPage: 1, prevPage: null };
        }
        // Second page is held open
        return new Promise<PagedData>((resolve) => { resolveSecond = resolve; });
      },
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();

    // Start next page fetch (don't await yet)
    const nextPagePromise = query.fetchNextPage();
    expect(query.isFetchingNextPage).toBe(true);
    expect(query.isFetching).toBe(true);

    resolveSecond({ items: [], page: 1, nextPage: null, prevPage: 0 });
    await nextPagePromise;

    expect(query.isFetchingNextPage).toBe(false);
  });

  it("fetchNextPage is a no-op when hasNextPage is false", async () => {
    const fetchFn = vi.fn(makePagedSource(1));

    const query = createInfiniteQuery({
      queryKey: ["noop-next"],
      queryFn: fetchFn,
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();
    expect(query.hasNextPage).toBe(false);

    await query.fetchNextPage();

    // fetchFn should have been called exactly once (for the initial load)
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(query.data!.pages).toHaveLength(1);
  });

  it("multiple sequential fetchNextPage calls accumulate all pages", async () => {
    const query = createInfiniteQuery({
      queryKey: ["seq-pages"],
      queryFn: makePagedSource(4),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();
    await query.fetchNextPage();
    await query.fetchNextPage();
    await query.fetchNextPage();

    expect(query.data!.pages).toHaveLength(4);
    expect(query.data!.pageParams).toEqual([0, 1, 2, 3]);
    expect(query.hasNextPage).toBe(false);
  });
});

// ─── fetchPreviousPage ────────────────────────────────────────────────────────

describe("createInfiniteQuery — fetchPreviousPage", () => {
  it("fetchPreviousPage prepends a page to data.pages", async () => {
    // Start from page 2 to have a previous page
    const query = createInfiniteQuery({
      queryKey: ["fetch-prev"],
      queryFn: makePagedSource(4),
      initialPageParam: 2,
      getNextPageParam:     (last: PagedData) => last.nextPage ?? undefined,
      getPreviousPageParam: (first: PagedData) => first.prevPage ?? undefined,
    });

    await nextTick();
    expect(query.hasPreviousPage).toBe(true);

    await query.fetchPreviousPage();

    expect(query.data!.pages).toHaveLength(2);
    expect(query.data!.pages[0].page).toBe(1); // prepended
    expect(query.data!.pages[1].page).toBe(2); // original
  });

  it("fetchPreviousPage prepends to pageParams correctly", async () => {
    const query = createInfiniteQuery({
      queryKey: ["prev-params"],
      queryFn: makePagedSource(4),
      initialPageParam: 2,
      getNextPageParam:     (last: PagedData) => last.nextPage ?? undefined,
      getPreviousPageParam: (first: PagedData) => first.prevPage ?? undefined,
    });

    await nextTick();
    await query.fetchPreviousPage();

    expect(query.data!.pageParams).toEqual([1, 2]);
  });

  it("hasPreviousPage is false when getPreviousPageParam is not provided", async () => {
    const query = createInfiniteQuery({
      queryKey: ["no-prev-fn"],
      queryFn: makePagedSource(3),
      initialPageParam: 1,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
      // No getPreviousPageParam
    });

    await nextTick();

    expect(query.hasPreviousPage).toBe(false);
  });

  it("hasPreviousPage is false when getPreviousPageParam returns undefined", async () => {
    const query = createInfiniteQuery({
      queryKey: ["no-prev-param"],
      queryFn: makePagedSource(3),
      initialPageParam: 0, // no previous page from page 0
      getNextPageParam:     (last: PagedData) => last.nextPage ?? undefined,
      getPreviousPageParam: (first: PagedData) => first.prevPage ?? undefined,
    });

    await nextTick();

    expect(query.hasPreviousPage).toBe(false);
  });

  it("isFetchingPreviousPage is true while fetchPreviousPage is in progress", async () => {
    let resolvePrev!: (v: PagedData) => void;
    let callCount = 0;

    const query = createInfiniteQuery({
      queryKey: ["fetching-prev"],
      queryFn: async ({ pageParam }: { pageParam: number; queryKey: readonly unknown[]; signal: AbortSignal }) => {
        callCount++;
        if (callCount === 1) {
          return { items: [], page: 2, nextPage: null, prevPage: 1 };
        }
        return new Promise<PagedData>((resolve) => { resolvePrev = resolve; });
      },
      initialPageParam: 2,
      getNextPageParam:     (last: PagedData) => last.nextPage ?? undefined,
      getPreviousPageParam: (first: PagedData) => first.prevPage ?? undefined,
    });

    await nextTick();

    const prevPagePromise = query.fetchPreviousPage();
    expect(query.isFetchingPreviousPage).toBe(true);

    resolvePrev({ items: [], page: 1, nextPage: 2, prevPage: 0 });
    await prevPagePromise;

    expect(query.isFetchingPreviousPage).toBe(false);
  });

  it("fetchPreviousPage is a no-op when hasPreviousPage is false", async () => {
    const fetchFn = vi.fn(makePagedSource(3));

    const query = createInfiniteQuery({
      queryKey: ["noop-prev"],
      queryFn: fetchFn,
      initialPageParam: 0,
      getNextPageParam:     (last: PagedData) => last.nextPage ?? undefined,
      getPreviousPageParam: (first: PagedData) => first.prevPage ?? undefined,
    });

    await nextTick();
    expect(query.hasPreviousPage).toBe(false);

    await query.fetchPreviousPage();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(query.data!.pages).toHaveLength(1);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("createInfiniteQuery — error handling", () => {
  it("transitions to error state when the initial fetch fails", async () => {
    const query = createInfiniteQuery({
      queryKey: ["err-init"],
      queryFn: async () => { throw new Error("network error"); },
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      retry: false,
    });

    await nextTick();

    expect(query.isError).toBe(true);
    expect((query.error as Error)?.message).toBe("network error");
    expect(query.data).toBeUndefined();
  });

  it("error is null after a successful load", async () => {
    const query = createInfiniteQuery({
      queryKey: ["no-err"],
      queryFn: makePagedSource(2),
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
    });

    await nextTick();

    expect(query.error).toBeNull();
    expect(query.isError).toBe(false);
  });

  it("fetchNextPage error sets isError and preserves existing pages", async () => {
    let callCount = 0;

    const query = createInfiniteQuery({
      queryKey: ["err-next"],
      queryFn: async ({ pageParam }: { pageParam: number; queryKey: readonly unknown[]; signal: AbortSignal }) => {
        callCount++;
        if (callCount === 1) {
          return { items: ["a"], page: 0, nextPage: 1, prevPage: null };
        }
        throw new Error("page 2 failed");
      },
      initialPageParam: 0,
      getNextPageParam: (last: PagedData) => last.nextPage ?? undefined,
      retry: false,
    });

    await nextTick();
    expect(query.isSuccess).toBe(true);
    expect(query.data!.pages).toHaveLength(1);

    await query.fetchNextPage();

    expect(query.isError).toBe(true);
    expect((query.error as Error)?.message).toBe("page 2 failed");
  });

  it("isFetching returns to false after error", async () => {
    const query = createInfiniteQuery({
      queryKey: ["err-fetching"],
      queryFn: async () => { throw new Error("fail"); },
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      retry: false,
    });

    await nextTick();

    expect(query.isFetching).toBe(false);
    expect(query.isError).toBe(true);
  });
});

// ─── refetch ──────────────────────────────────────────────────────────────────

describe("createInfiniteQuery — refetch", () => {
  it("refetch resets pages and reloads from the initial page param", async () => {
    let callCount = 0;

    const query = createInfiniteQuery({
      queryKey: ["refetch-inf"],
      queryFn: async ({ pageParam }: { pageParam: number; queryKey: readonly unknown[]; signal: AbortSignal }) => {
        callCount++;
        return { items: [`item-${callCount}`], page: pageParam, nextPage: null, prevPage: null };
      },
      initialPageParam: 0,
      getNextPageParam: () => undefined,
    });

    await nextTick();
    expect(query.data!.pages[0].items[0]).toBe("item-1");

    await query.refetch();
    expect(callCount).toBe(2);
    expect(query.data!.pages).toHaveLength(1);
    expect(query.data!.pages[0].items[0]).toBe("item-2");
  });
});

// ─── getNextPageParam receives correct arguments ───────────────────────────────

describe("createInfiniteQuery — getNextPageParam arguments", () => {
  it("getNextPageParam receives lastPage, allPages, lastPageParam, allPageParams", async () => {
    const capturedArgs: unknown[] = [];

    const query = createInfiniteQuery<PagedData, Error, number>({
      queryKey: ["param-args"],
      queryFn: async ({ pageParam }) => ({
        items: [],
        page: pageParam,
        nextPage: pageParam < 2 ? pageParam + 1 : null,
        prevPage: null,
      }),
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) => {
        capturedArgs.push({ lastPage, allPages, lastPageParam, allPageParams });
        return lastPage.nextPage ?? undefined;
      },
    });

    await nextTick();
    await query.fetchNextPage();

    // After 2 pages loaded, check args for the second call
    const lastCall = capturedArgs[capturedArgs.length - 1] as {
      lastPage: PagedData;
      allPages: PagedData[];
      lastPageParam: number;
      allPageParams: number[];
    };

    expect(lastCall.allPages).toHaveLength(2);
    expect(lastCall.lastPageParam).toBe(1);
    expect(lastCall.allPageParams).toEqual([0, 1]);
  });

  it("cursor-based pagination works with string page params", async () => {
    const cursors = ["cursor-a", "cursor-b", "cursor-c"];

    const query = createInfiniteQuery<{ items: string[]; nextCursor: string | null }, Error, string | null>({
      queryKey: ["cursor-pages"],
      queryFn: async ({ pageParam }) => {
        const idx = pageParam === null ? 0 : cursors.indexOf(pageParam as string) + 1;
        return {
          items: [`item-${idx}`],
          nextCursor: idx < cursors.length - 1 ? cursors[idx] : null,
        };
      },
      initialPageParam: null,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

    await nextTick();
    expect(query.hasNextPage).toBe(true);

    await query.fetchNextPage();
    expect(query.data!.pages).toHaveLength(2);
    expect(query.data!.pageParams).toEqual([null, "cursor-a"]);
  });
});
