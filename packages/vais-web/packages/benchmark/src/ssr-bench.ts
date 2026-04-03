/**
 * SSR rendering speed benchmark utilities.
 *
 * Renders a template function N times using `performance.now()` for
 * high-resolution timing, then computes avg / p50 / p95 / p99.
 */

import type {
  SSRResult,
  FrameworkAdapter,
  BenchmarkResult,
  FrameworkComparison,
} from "./types.js";

/** Sort an array of numbers in-place and return it. */
function sortedCopy(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

/** Return the value at the given percentile (0-100) from a pre-sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * Time a render function over `iterations` calls and return statistical
 * aggregates.
 *
 * @param renderFn - A synchronous function that produces HTML output.
 *   It must be callable repeatedly; the output is discarded.
 * @param iterations - Number of render iterations (default: 1000)
 */
export async function benchmarkSSR(
  renderFn: () => string,
  iterations = 1000
): Promise<SSRResult> {
  const timings: number[] = [];

  // Warm-up: 10 % of iterations (minimum 10) to prime JIT
  const warmup = Math.max(10, Math.floor(iterations * 0.1));
  for (let i = 0; i < warmup; i++) {
    renderFn();
  }

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    renderFn();
    timings.push(performance.now() - start);
  }

  const sorted = sortedCopy(timings);
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;

  return {
    iterations,
    avgMs: avg,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
  };
}

/**
 * Run SSR benchmarks across all provided adapters.
 *
 * @param adapters - Framework adapters to benchmark
 * @param iterations - Number of SSR render iterations per adapter
 */
export async function compareSSR(
  adapters: FrameworkAdapter[],
  iterations = 1000
): Promise<{ results: BenchmarkResult[]; comparison: FrameworkComparison }> {
  const ssrResults = await Promise.all(
    adapters.map(async (a) => {
      const r = await a.ssrRender(iterations);
      return { adapter: a, result: r };
    })
  );

  const results: BenchmarkResult[] = ssrResults.map(({ adapter, result }) => ({
    framework: adapter.name,
    metric: "ssr-render",
    value: result.avgMs,
    unit: "ms",
  }));

  // Lower avg render time is better
  const sorted = [...results].sort((a, b) => a.value - b.value);
  const winner = sorted[0];
  const secondBest = sorted[1];
  const improvementRatio =
    secondBest && winner.value > 0 ? secondBest.value / winner.value : 1;

  return {
    results,
    comparison: {
      metric: "ssr-render",
      results,
      winner: winner.framework,
      improvementRatio,
    },
  };
}

// Re-export helpers for testability
export { percentile, sortedCopy };
