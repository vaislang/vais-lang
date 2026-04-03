/**
 * createInfiniteQuery — infinite scroll / pagination primitive for @vaisx/query.
 *
 * Wraps a multi-page fetch cycle in VaisX signals so UI layers can subscribe
 * reactively to pages, loading state, and pagination helpers.
 *
 * Usage:
 *   const feed = createInfiniteQuery({
 *     queryKey: ["feed"],
 *     queryFn: ({ pageParam }) => fetchPage(pageParam),
 *     initialPageParam: 0,
 *     getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
 *   });
 *   feed.data.pages;        // TData[]
 *   feed.hasNextPage;       // boolean
 *   feed.fetchNextPage();   // Promise<void>
 */

import { createSignal } from "@vaisx/runtime";
import type { Signal } from "@vaisx/runtime";
import type { QueryOptions, QueryStatus } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Options accepted by createInfiniteQuery().
 *
 * @template TData      - The resolved value type of a single page.
 * @template TError     - The rejected error type (defaults to Error).
 * @template TPageParam - The type used to identify a page (e.g. number, string, cursor).
 */
export interface InfiniteQueryOptions<
  TData = unknown,
  TError = Error,
  TPageParam = unknown,
> extends Omit<QueryOptions<TData, TError>, "queryFn" | "initialData"> {
  /**
   * Async function that fetches a single page.
   * Receives the page param and returns a promise resolving to TData.
   */
  queryFn: (context: {
    queryKey: readonly unknown[];
    signal: AbortSignal;
    pageParam: TPageParam;
  }) => Promise<TData>;

  /**
   * The page param to use for the very first fetch.
   */
  initialPageParam: TPageParam;

  /**
   * Derive the next page param from the last fetched page and all pages.
   * Return undefined (or nothing) to signal that there are no more pages.
   */
  getNextPageParam: (
    lastPage: TData,
    allPages: TData[],
    lastPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | undefined | null;

  /**
   * Derive the previous page param for bidirectional pagination.
   * Return undefined (or nothing) to signal that there are no previous pages.
   */
  getPreviousPageParam?: (
    firstPage: TData,
    allPages: TData[],
    firstPageParam: TPageParam,
    allPageParams: TPageParam[],
  ) => TPageParam | undefined | null;
}

/**
 * The merged data shape returned by an infinite query.
 */
export interface InfiniteData<TData, TPageParam = unknown> {
  /** All fetched pages in order (oldest first). */
  pages: TData[];
  /** The page params that were used to fetch each corresponding page. */
  pageParams: TPageParam[];
}

/**
 * Reactive state object returned by createInfiniteQuery().
 *
 * @template TData      - The resolved single-page data type.
 * @template TError     - The error type.
 * @template TPageParam - The page param type.
 */
export interface InfiniteQueryResult<
  TData = unknown,
  TError = Error,
  TPageParam = unknown,
> {
  /** Merged pages + params. undefined until the first page is fetched. */
  readonly data: InfiniteData<TData, TPageParam> | undefined;

  /** The error thrown during the last failed fetch, or null. */
  readonly error: TError | null;

  /** True while the initial load (no data yet) is in progress. */
  readonly isLoading: boolean;

  /** True whenever any fetch (initial, next, previous) is in progress. */
  readonly isFetching: boolean;

  /** True while fetchNextPage is in flight. */
  readonly isFetchingNextPage: boolean;

  /** True while fetchPreviousPage is in flight. */
  readonly isFetchingPreviousPage: boolean;

  /** True when the last fetch threw an error. */
  readonly isError: boolean;

  /** True when at least one page has been fetched successfully. */
  readonly isSuccess: boolean;

  /** True before any fetch has been attempted (enabled: false). */
  readonly isIdle: boolean;

  /** Current lifecycle status. */
  readonly status: QueryStatus;

  /**
   * True when getNextPageParam returned a non-undefined/null value for the
   * last fetched page.
   */
  readonly hasNextPage: boolean;

  /**
   * True when getPreviousPageParam returned a non-undefined/null value for the
   * first fetched page.
   */
  readonly hasPreviousPage: boolean;

  /** Fetch the next page using the param returned by getNextPageParam. */
  fetchNextPage: () => Promise<void>;

  /** Fetch the previous page using the param returned by getPreviousPageParam. */
  fetchPreviousPage: () => Promise<void>;

  /** Manually re-fetch all pages (re-runs from the initial page param). */
  refetch: () => Promise<void>;
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface InfiniteState<TData, TError, TPageParam> {
  pages:                   Signal<TData[]>;
  pageParams:              Signal<TPageParam[]>;
  error:                   Signal<TError | null>;
  status:                  Signal<QueryStatus>;
  isFetching:              Signal<boolean>;
  isFetchingNextPage:      Signal<boolean>;
  isFetchingPreviousPage:  Signal<boolean>;
  nextPageParam:           Signal<TPageParam | undefined | null>;
  previousPageParam:       Signal<TPageParam | undefined | null>;
}

// ─── createInfiniteQuery ──────────────────────────────────────────────────────

/**
 * Create a reactive infinite query that supports loading pages one at a time
 * and merging them into a flat pages array.
 *
 * @param options - Infinite query configuration.
 * @returns An InfiniteQueryResult with reactive signal-backed getters.
 */
export function createInfiniteQuery<
  TData = unknown,
  TError = Error,
  TPageParam = unknown,
>(
  options: InfiniteQueryOptions<TData, TError, TPageParam>,
): InfiniteQueryResult<TData, TError, TPageParam> {

  // ── Initialise reactive signals ─────────────────────────────────────────────
  const state: InfiniteState<TData, TError, TPageParam> = {
    pages:                  createSignal<TData[]>([]),
    pageParams:             createSignal<TPageParam[]>([]),
    error:                  createSignal<TError | null>(null),
    status:                 createSignal<QueryStatus>("idle"),
    isFetching:             createSignal<boolean>(false),
    isFetchingNextPage:     createSignal<boolean>(false),
    isFetchingPreviousPage: createSignal<boolean>(false),
    nextPageParam:          createSignal<TPageParam | undefined | null>(undefined),
    previousPageParam:      createSignal<TPageParam | undefined | null>(undefined),
  };

  // ── Helper: compute derived page params after page list changes ─────────────
  function updateDerivedParams(): void {
    const pages      = state.pages();
    const pageParams = state.pageParams();

    if (pages.length === 0) {
      state.nextPageParam.set(undefined);
      state.previousPageParam.set(undefined);
      return;
    }

    const lastPage      = pages[pages.length - 1];
    const lastPageParam = pageParams[pageParams.length - 1];
    const next = options.getNextPageParam(lastPage, pages, lastPageParam, pageParams);
    state.nextPageParam.set(next ?? undefined);

    if (options.getPreviousPageParam) {
      const firstPage      = pages[0];
      const firstPageParam = pageParams[0];
      const prev = options.getPreviousPageParam(firstPage, pages, firstPageParam, pageParams);
      state.previousPageParam.set(prev ?? undefined);
    } else {
      state.previousPageParam.set(undefined);
    }
  }

  // ── Core page fetch ─────────────────────────────────────────────────────────
  async function fetchPage(
    pageParam: TPageParam,
    direction: "next" | "previous" | "initial",
  ): Promise<void> {
    if (direction === "next") {
      state.isFetchingNextPage.set(true);
    } else if (direction === "previous") {
      state.isFetchingPreviousPage.set(true);
    }

    state.isFetching.set(true);

    if (state.status() === "idle" || state.status() === "error") {
      state.status.set("loading");
    }

    const controller = new AbortController();

    const retryCount = options.retry === false ? 0 : (options.retry ?? 3);
    const retryDelay = options.retryDelay ?? 1000;

    let lastError: unknown;
    let succeeded = false;
    let fetchedData: TData | undefined;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        fetchedData = await options.queryFn({
          queryKey: options.queryKey,
          signal: controller.signal,
          pageParam,
        });
        succeeded = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < retryCount) {
          await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    if (succeeded && fetchedData !== undefined) {
      const currentPages      = state.pages();
      const currentPageParams = state.pageParams();

      if (direction === "previous") {
        state.pages.set([fetchedData, ...currentPages]);
        state.pageParams.set([pageParam, ...currentPageParams]);
      } else {
        state.pages.set([...currentPages, fetchedData]);
        state.pageParams.set([...currentPageParams, pageParam]);
      }

      state.error.set(null);
      state.status.set("success");
      updateDerivedParams();
    } else {
      state.error.set(lastError as TError);
      state.status.set("error");
    }

    state.isFetching.set(false);
    state.isFetchingNextPage.set(false);
    state.isFetchingPreviousPage.set(false);
  }

  // ── Auto-fetch first page on creation ──────────────────────────────────────
  if (options.enabled !== false) {
    void fetchPage(options.initialPageParam, "initial");
  }

  // ── Public actions ──────────────────────────────────────────────────────────
  async function fetchNextPage(): Promise<void> {
    const nextParam = state.nextPageParam();
    if (nextParam === undefined || nextParam === null) return;
    if (state.isFetchingNextPage()) return;
    await fetchPage(nextParam, "next");
  }

  async function fetchPreviousPage(): Promise<void> {
    const prevParam = state.previousPageParam();
    if (prevParam === undefined || prevParam === null) return;
    if (state.isFetchingPreviousPage()) return;
    await fetchPage(prevParam, "previous");
  }

  async function refetch(): Promise<void> {
    // Reset and re-fetch from the beginning
    state.pages.set([]);
    state.pageParams.set([]);
    state.nextPageParam.set(undefined);
    state.previousPageParam.set(undefined);
    state.status.set("idle");
    await fetchPage(options.initialPageParam, "initial");
  }

  // ── Build InfiniteQueryResult ───────────────────────────────────────────────
  const result: InfiniteQueryResult<TData, TError, TPageParam> = {
    get data() {
      const pages      = state.pages();
      const pageParams = state.pageParams();
      if (pages.length === 0 && state.status() !== "success") return undefined;
      return { pages, pageParams };
    },

    get error()                  { return state.error(); },
    get status()                 { return state.status(); },
    get isFetching()             { return state.isFetching(); },
    get isFetchingNextPage()     { return state.isFetchingNextPage(); },
    get isFetchingPreviousPage() { return state.isFetchingPreviousPage(); },
    get isLoading()              { return state.status() === "loading"; },
    get isError()                { return state.status() === "error"; },
    get isSuccess()              { return state.status() === "success"; },
    get isIdle()                 { return state.status() === "idle"; },

    get hasNextPage() {
      const param = state.nextPageParam();
      return param !== undefined && param !== null;
    },

    get hasPreviousPage() {
      const param = state.previousPageParam();
      return param !== undefined && param !== null;
    },

    fetchNextPage,
    fetchPreviousPage,
    refetch,
  };

  return result;
}
