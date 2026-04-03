import { describe, it, expect } from "vitest";
import {
  estimateParseTimeMs,
  estimateTransferTimeMs,
  measureHydration,
  compareHydration,
} from "../src/hydration.js";
import type { FrameworkAdapter } from "../src/types.js";

// ---------------------------------------------------------------------------
// estimateParseTimeMs
// ---------------------------------------------------------------------------

describe("estimateParseTimeMs", () => {
  it("returns 0 for a zero-byte bundle", () => {
    expect(estimateParseTimeMs(0)).toBe(0);
  });

  it("returns a positive value for a non-zero bundle", () => {
    expect(estimateParseTimeMs(50 * 1024)).toBeGreaterThan(0);
  });

  it("scales linearly with bundle size", () => {
    const t1 = estimateParseTimeMs(10_000);
    const t2 = estimateParseTimeMs(20_000);
    expect(t2).toBeCloseTo(t1 * 2, 5);
  });
});

// ---------------------------------------------------------------------------
// estimateTransferTimeMs
// ---------------------------------------------------------------------------

describe("estimateTransferTimeMs", () => {
  it("returns 0 for empty bundle", () => {
    expect(estimateTransferTimeMs(0)).toBe(0);
  });

  it("returns positive ms for a realistic bundle", () => {
    // 42 KB gzipped on 1 Mbps
    expect(estimateTransferTimeMs(42 * 1024)).toBeGreaterThan(0);
  });

  it("uses custom throughput when provided", () => {
    const fast = estimateTransferTimeMs(100_000, 1_000_000); // 1 MB/s
    const slow = estimateTransferTimeMs(100_000, 125_000);   // 1 Mbps
    expect(slow).toBeGreaterThan(fast);
  });
});

// ---------------------------------------------------------------------------
// measureHydration
// ---------------------------------------------------------------------------

describe("measureHydration", () => {
  it("returns non-negative hydrationCostMs", async () => {
    const result = await measureHydration(async () => {}, 1400, 3584);
    expect(result.hydrationCostMs).toBeGreaterThanOrEqual(0);
  });

  it("timeToInteractiveMs includes transfer + parse + hydration cost", async () => {
    const gzip = 1400;
    const raw = 3584;
    const result = await measureHydration(async () => {}, gzip, raw);
    const minExpected = estimateTransferTimeMs(gzip) + estimateParseTimeMs(raw);
    expect(result.timeToInteractiveMs).toBeGreaterThanOrEqual(minExpected - 0.01);
  });

  it("awaits async hydration functions", async () => {
    let called = false;
    await measureHydration(async () => {
      await Promise.resolve();
      called = true;
    }, 0, 0);
    expect(called).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compareHydration
// ---------------------------------------------------------------------------

function makeAdapter(name: string, tti: number, cost: number): FrameworkAdapter {
  return {
    name,
    async bundleSize() { return { raw: 1000, gzipped: 400 }; },
    async ssrRender(n) { return { iterations: n, avgMs: 1, p50Ms: 1, p95Ms: 1, p99Ms: 1 }; },
    async hydrate() { return { timeToInteractiveMs: tti, hydrationCostMs: cost }; },
    async memoryUsage() { return { heapUsedBefore: 0, heapUsedAfter: 100, delta: 100 }; },
  };
}

describe("compareHydration", () => {
  it("identifies the framework with lowest TTI as winner", async () => {
    const adapters = [
      makeAdapter("Slow", 500, 10),
      makeAdapter("Fast", 50, 1),
    ];
    const { comparison } = await compareHydration(adapters);
    expect(comparison.winner).toBe("Fast");
  });

  it("returns one result per adapter", async () => {
    const adapters = [makeAdapter("A", 100, 5), makeAdapter("B", 200, 8)];
    const { results } = await compareHydration(adapters);
    expect(results).toHaveLength(2);
  });

  it("result units are ms", async () => {
    const { results } = await compareHydration([makeAdapter("X", 100, 5)]);
    expect(results[0].unit).toBe("ms");
  });
});
