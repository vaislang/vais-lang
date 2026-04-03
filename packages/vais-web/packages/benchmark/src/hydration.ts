/**
 * Hydration time measurement utilities.
 *
 * Simulates hydration cost by measuring the time a "re-attach" function takes
 * and estimates time-to-interactive (TTI) based on bundle transfer + parse
 * time heuristics and the measured hydration overhead.
 */

import type {
  HydrationResult,
  FrameworkAdapter,
  BenchmarkResult,
  FrameworkComparison,
} from "./types.js";

/**
 * Estimate parse time for a given bundle size.
 *
 * Heuristic: modern V8 parses approximately 1 MB of JS per 10 ms on a
 * mid-range device (100 KB / ms).  We use a conservative 50 KB/ms figure.
 */
export function estimateParseTimeMs(bundleSizeBytes: number): number {
  const KB_PER_MS = 50;
  return bundleSizeBytes / 1024 / KB_PER_MS;
}

/**
 * Estimate network transfer time for a gzipped bundle on a 3G-like connection
 * (1 Mbps effective throughput after TCP overhead).
 */
export function estimateTransferTimeMs(
  gzippedBytes: number,
  throughputBytesPerSec = 125_000 // 1 Mbps ≈ 125 KB/s
): number {
  return (gzippedBytes / throughputBytesPerSec) * 1000;
}

/**
 * Measure the hydration cost of an adapter by timing its `hydrate()` call
 * and computing a TTI estimate from bundle characteristics.
 *
 * @param hydrateFn - An async function that performs the hydration work.
 *   In real usage this would attach event listeners; here it may be a mock.
 * @param gzippedBundleBytes - Gzipped bundle size, used for TTI estimation.
 * @param rawBundleBytes - Raw (uncompressed) bundle size, used for parse-time
 *   estimation.
 */
export async function measureHydration(
  hydrateFn: () => Promise<void> | void,
  gzippedBundleBytes: number,
  rawBundleBytes: number
): Promise<HydrationResult> {
  const start = performance.now();
  await hydrateFn();
  const hydrationCostMs = performance.now() - start;

  const transferMs = estimateTransferTimeMs(gzippedBundleBytes);
  const parseMs = estimateParseTimeMs(rawBundleBytes);

  const timeToInteractiveMs = transferMs + parseMs + hydrationCostMs;

  return { timeToInteractiveMs, hydrationCostMs };
}

/**
 * Run hydration benchmarks across all provided adapters and return
 * BenchmarkResult[] (value = timeToInteractiveMs).
 */
export async function compareHydration(
  adapters: FrameworkAdapter[]
): Promise<{ results: BenchmarkResult[]; comparison: FrameworkComparison }> {
  const hydrationResults = await Promise.all(
    adapters.map(async (a) => {
      const r = await a.hydrate();
      return { adapter: a, result: r };
    })
  );

  const results: BenchmarkResult[] = hydrationResults.map(
    ({ adapter, result }) => ({
      framework: adapter.name,
      metric: "hydration",
      value: result.timeToInteractiveMs,
      unit: "ms",
    })
  );

  // Lower TTI is better
  const sorted = [...results].sort((a, b) => a.value - b.value);
  const winner = sorted[0];
  const secondBest = sorted[1];
  const improvementRatio =
    secondBest && winner.value > 0 ? secondBest.value / winner.value : 1;

  return {
    results,
    comparison: {
      metric: "hydration",
      results,
      winner: winner.framework,
      improvementRatio,
    },
  };
}
