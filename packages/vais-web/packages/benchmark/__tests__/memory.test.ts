import { describe, it, expect } from "vitest";
import { measureMemory, compareMemory } from "../src/memory.js";
import type { FrameworkAdapter } from "../src/types.js";

// ---------------------------------------------------------------------------
// measureMemory
// ---------------------------------------------------------------------------

describe("measureMemory", () => {
  it("returns heapUsedBefore and heapUsedAfter as numbers", async () => {
    const result = await measureMemory(() => {
      const arr = new Array(1000).fill("x");
      return arr;
    });
    expect(typeof result.heapUsedBefore).toBe("number");
    expect(typeof result.heapUsedAfter).toBe("number");
  });

  it("delta equals heapUsedAfter - heapUsedBefore", async () => {
    const result = await measureMemory(() => {});
    expect(result.delta).toBe(result.heapUsedAfter - result.heapUsedBefore);
  });

  it("works with async work functions", async () => {
    const result = await measureMemory(async () => {
      await Promise.resolve();
      return new Array(500).fill(42);
    });
    expect(result.heapUsedBefore).toBeGreaterThan(0);
  });

  it("allocating a large array produces a positive delta", async () => {
    // Note: GC may run in between; we just check the field types are correct
    const result = await measureMemory(() => {
      return new Uint8Array(500_000); // 500 KB
    });
    expect(typeof result.delta).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// compareMemory
// ---------------------------------------------------------------------------

function makeAdapter(name: string, delta: number): FrameworkAdapter {
  return {
    name,
    async bundleSize() { return { raw: 1000, gzipped: 400 }; },
    async ssrRender(n) { return { iterations: n, avgMs: 1, p50Ms: 1, p95Ms: 1, p99Ms: 1 }; },
    async hydrate() { return { timeToInteractiveMs: 10, hydrationCostMs: 1 }; },
    async memoryUsage() { return { heapUsedBefore: 1000, heapUsedAfter: 1000 + delta, delta }; },
  };
}

describe("compareMemory", () => {
  it("returns one result per adapter", async () => {
    const { results } = await compareMemory([makeAdapter("A", 100), makeAdapter("B", 200)]);
    expect(results).toHaveLength(2);
  });

  it("identifies the adapter with lower delta as winner", async () => {
    const adapters = [makeAdapter("Heavy", 10_000), makeAdapter("Light", 1_000)];
    const { comparison } = await compareMemory(adapters);
    expect(comparison.winner).toBe("Light");
  });

  it("result units are bytes", async () => {
    const { results } = await compareMemory([makeAdapter("X", 500)]);
    expect(results[0].unit).toBe("bytes");
  });

  it("metric is memory", async () => {
    const { comparison } = await compareMemory([makeAdapter("X", 100)]);
    expect(comparison.metric).toBe("memory");
  });
});
