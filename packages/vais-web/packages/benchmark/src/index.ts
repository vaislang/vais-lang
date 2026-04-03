/**
 * @vaisx/benchmark — public API and orchestrator.
 *
 * Re-exports all public types, utilities, and adapters, plus the
 * `runAllBenchmarks()` top-level function that runs the full suite.
 */

// Types
export type {
  MetricType,
  BenchmarkResult,
  FrameworkComparison,
  BundleSizeResult,
  SSRResult,
  HydrationResult,
  MemoryResult,
  FrameworkBenchmarkSummary,
  FrameworkAdapter,
} from "./types.js";

// Measurement utilities
export { measureBundleSize, gzipSize, brotliSize, compareBundleSizes } from "./bundle-size.js";
export { benchmarkSSR, compareSSR, percentile, sortedCopy } from "./ssr-bench.js";
export {
  measureHydration,
  estimateParseTimeMs,
  estimateTransferTimeMs,
  compareHydration,
} from "./hydration.js";
export { measureMemory, compareMemory } from "./memory.js";

// Reporter
export { toMarkdownTable, toASCIIChart, generateReport } from "./report.js";

// Framework adapters
export { vaisxAdapter } from "./frameworks/vaisx.js";
export { reactAdapter } from "./frameworks/react.js";
export { svelteAdapter } from "./frameworks/svelte.js";
export { vueAdapter } from "./frameworks/vue.js";

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

import type { FrameworkAdapter, FrameworkBenchmarkSummary, FrameworkComparison } from "./types.js";
import { compareBundleSizes } from "./bundle-size.js";
import { compareSSR } from "./ssr-bench.js";
import { compareHydration } from "./hydration.js";
import { compareMemory } from "./memory.js";
import { generateReport } from "./report.js";
import { vaisxAdapter } from "./frameworks/vaisx.js";
import { reactAdapter } from "./frameworks/react.js";
import { svelteAdapter } from "./frameworks/svelte.js";
import { vueAdapter } from "./frameworks/vue.js";

export interface RunAllBenchmarksOptions {
  /** Adapters to include. Defaults to all four (VaisX, React, Svelte, Vue). */
  adapters?: FrameworkAdapter[];
  /** Number of SSR render iterations per adapter. Default: 200. */
  ssrIterations?: number;
  /** List size for memory benchmark. Default: 500. */
  memoryListSize?: number;
}

export interface BenchmarkRunResult {
  summaries: FrameworkBenchmarkSummary[];
  comparisons: FrameworkComparison[];
  markdownReport: string;
}

/**
 * Run the full benchmark suite across all (or selected) framework adapters.
 *
 * @param options - Customise which adapters to use and iteration counts.
 * @returns Summaries, per-metric comparisons, and a formatted markdown report.
 */
export async function runAllBenchmarks(
  options: RunAllBenchmarksOptions = {}
): Promise<BenchmarkRunResult> {
  const {
    adapters = [vaisxAdapter, reactAdapter, svelteAdapter, vueAdapter],
    ssrIterations = 200,
    memoryListSize = 500,
  } = options;

  // Run all benchmark categories in parallel where possible
  const [bundleOut, ssrOut, hydrationOut, memoryOut] = await Promise.all([
    compareBundleSizes(adapters),
    compareSSR(adapters, ssrIterations),
    compareHydration(adapters),
    compareMemory(adapters, memoryListSize),
  ]);

  // Build per-framework summaries
  const summaries: FrameworkBenchmarkSummary[] = await Promise.all(
    adapters.map(async (adapter) => {
      const [bundle, ssr, hydration, memory] = await Promise.all([
        adapter.bundleSize(),
        adapter.ssrRender(ssrIterations),
        adapter.hydrate(),
        adapter.memoryUsage(memoryListSize),
      ]);
      return { framework: adapter.name, bundleSize: bundle, ssr, hydration, memory };
    })
  );

  const comparisons: FrameworkComparison[] = [
    bundleOut.comparison,
    ssrOut.comparison,
    hydrationOut.comparison,
    memoryOut.comparison,
  ];

  const markdownReport = generateReport(summaries, comparisons);

  return { summaries, comparisons, markdownReport };
}
