import { describe, it, expect } from "vitest";
import { benchmarkSSR, compareSSR, percentile, sortedCopy } from "../src/ssr-bench.js";
import type { FrameworkAdapter } from "../src/types.js";

// ---------------------------------------------------------------------------
// percentile helper
// ---------------------------------------------------------------------------

describe("percentile", () => {
  it("returns the median of an odd-length array", () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentile(sorted, 50)).toBe(3);
  });

  it("returns the minimum for p0 equivalent", () => {
    const sorted = [10, 20, 30];
    expect(percentile(sorted, 1)).toBe(10);
  });

  it("returns the maximum for p100 equivalent", () => {
    const sorted = [10, 20, 30];
    expect(percentile(sorted, 100)).toBe(30);
  });

  it("returns 0 for an empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sortedCopy
// ---------------------------------------------------------------------------

describe("sortedCopy", () => {
  it("does not mutate the original array", () => {
    const arr = [3, 1, 2];
    sortedCopy(arr);
    expect(arr).toEqual([3, 1, 2]);
  });

  it("returns a sorted copy", () => {
    expect(sortedCopy([5, 3, 1, 4, 2])).toEqual([1, 2, 3, 4, 5]);
  });
});

// ---------------------------------------------------------------------------
// benchmarkSSR
// ---------------------------------------------------------------------------

describe("benchmarkSSR", () => {
  it("returns the correct iteration count", async () => {
    const result = await benchmarkSSR(() => "<div>hello</div>", 50);
    expect(result.iterations).toBe(50);
  });

  it("avgMs is a positive number", async () => {
    const result = await benchmarkSSR(() => "x".repeat(100), 30);
    expect(result.avgMs).toBeGreaterThan(0);
  });

  it("p99Ms >= p95Ms >= p50Ms >= 0", async () => {
    const result = await benchmarkSSR(() => "<ul>" + "<li>item</li>".repeat(10) + "</ul>", 100);
    expect(result.p50Ms).toBeGreaterThanOrEqual(0);
    expect(result.p95Ms).toBeGreaterThanOrEqual(result.p50Ms);
    expect(result.p99Ms).toBeGreaterThanOrEqual(result.p95Ms);
  });

  it("works with a single iteration", async () => {
    const result = await benchmarkSSR(() => "ok", 1);
    expect(result.iterations).toBe(1);
    expect(result.avgMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// compareSSR
// ---------------------------------------------------------------------------

function makeAdapter(name: string): FrameworkAdapter {
  return {
    name,
    async bundleSize() { return { raw: 1000, gzipped: 400 }; },
    async ssrRender(iterations) {
      // Use real benchmarkSSR so we get real timing data
      const { benchmarkSSR: bSSR } = await import("../src/ssr-bench.js");
      return bSSR(() => `<div>${name}</div>`, iterations);
    },
    async hydrate() { return { timeToInteractiveMs: 10, hydrationCostMs: 1 }; },
    async memoryUsage() { return { heapUsedBefore: 0, heapUsedAfter: 100, delta: 100 }; },
  };
}

describe("compareSSR", () => {
  it("returns one result per adapter", async () => {
    const { results } = await compareSSR([makeAdapter("A"), makeAdapter("B")], 20);
    expect(results).toHaveLength(2);
  });

  it("comparison metric is ssr-render", async () => {
    const { comparison } = await compareSSR([makeAdapter("X")], 20);
    expect(comparison.metric).toBe("ssr-render");
  });

  it("all result values are in ms unit", async () => {
    const { results } = await compareSSR([makeAdapter("A"), makeAdapter("B")], 20);
    for (const r of results) {
      expect(r.unit).toBe("ms");
    }
  });
});
