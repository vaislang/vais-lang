/**
 * Memory usage benchmark utilities.
 *
 * Measures heap allocation delta while a "large list rendering" scenario
 * executes.  Uses `process.memoryUsage()` which is available in Node.js.
 * The garbage collector is optionally invoked before each measurement when
 * `--expose-gc` is passed to node (used in the `bench` script).
 */

import type {
  MemoryResult,
  FrameworkAdapter,
  BenchmarkResult,
  FrameworkComparison,
} from "./types.js";

declare const gc: (() => void) | undefined;

/** Attempt to run the GC if exposed via --expose-gc. */
function tryGC(): void {
  if (typeof gc === "function") {
    gc();
  }
}

/**
 * Measure heap-used delta while `workFn` executes.
 *
 * @param workFn - A synchronous or async function that performs the memory-
 *   intensive work (e.g. rendering a list).
 */
export async function measureMemory(
  workFn: () => unknown | Promise<unknown>
): Promise<MemoryResult> {
  tryGC();
  const before = process.memoryUsage().heapUsed;

  await workFn();

  // Allow micro-tasks to flush before taking the after snapshot
  await Promise.resolve();
  const after = process.memoryUsage().heapUsed;

  const delta = after - before;
  return { heapUsedBefore: before, heapUsedAfter: after, delta };
}

/**
 * Run memory benchmarks across all provided adapters for a given list size.
 *
 * @param adapters - Framework adapters
 * @param listSize - Number of items in the rendered list
 */
export async function compareMemory(
  adapters: FrameworkAdapter[],
  listSize = 1000
): Promise<{ results: BenchmarkResult[]; comparison: FrameworkComparison }> {
  const memResults = await Promise.all(
    adapters.map(async (a) => {
      const r = await a.memoryUsage(listSize);
      return { adapter: a, result: r };
    })
  );

  const results: BenchmarkResult[] = memResults.map(({ adapter, result }) => ({
    framework: adapter.name,
    metric: "memory",
    value: result.delta,
    unit: "bytes",
  }));

  // Lower delta is better; guard against negative deltas (GC reclaimed memory)
  const positive = results.filter((r) => r.value >= 0);
  const sortable = positive.length > 0 ? positive : [...results];
  const sorted = [...sortable].sort((a, b) => a.value - b.value);
  const winner = sorted[0];
  const secondBest = sorted[1];
  const improvementRatio =
    secondBest && winner.value > 0 ? secondBest.value / winner.value : 1;

  return {
    results,
    comparison: {
      metric: "memory",
      results,
      winner: winner.framework,
      improvementRatio,
    },
  };
}
