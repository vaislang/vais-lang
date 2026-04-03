import { describe, it, expect } from "vitest";
import {
  runAllBenchmarks,
  vaisxAdapter,
  reactAdapter,
} from "../src/index.js";

describe("runAllBenchmarks", () => {
  it("returns summaries for all four default frameworks", async () => {
    const { summaries } = await runAllBenchmarks({ ssrIterations: 10, memoryListSize: 50 });
    expect(summaries).toHaveLength(4);
    const names = summaries.map((s) => s.framework);
    expect(names).toContain("VaisX");
    expect(names).toContain("React");
    expect(names).toContain("Svelte");
    expect(names).toContain("Vue");
  });

  it("returns four comparisons (one per metric)", async () => {
    const { comparisons } = await runAllBenchmarks({ ssrIterations: 10, memoryListSize: 50 });
    expect(comparisons).toHaveLength(4);
    const metrics = comparisons.map((c) => c.metric);
    expect(metrics).toContain("bundle-size");
    expect(metrics).toContain("ssr-render");
    expect(metrics).toContain("hydration");
    expect(metrics).toContain("memory");
  });

  it("markdownReport is a non-empty string", async () => {
    const { markdownReport } = await runAllBenchmarks({ ssrIterations: 10, memoryListSize: 50 });
    expect(typeof markdownReport).toBe("string");
    expect(markdownReport.length).toBeGreaterThan(100);
  });

  it("respects custom adapter list", async () => {
    const { summaries } = await runAllBenchmarks({
      adapters: [vaisxAdapter, reactAdapter],
      ssrIterations: 10,
      memoryListSize: 20,
    });
    expect(summaries).toHaveLength(2);
  });

  it("each summary has all four property groups", async () => {
    const { summaries } = await runAllBenchmarks({
      adapters: [vaisxAdapter],
      ssrIterations: 10,
      memoryListSize: 20,
    });
    const s = summaries[0];
    expect(s).toHaveProperty("bundleSize");
    expect(s).toHaveProperty("ssr");
    expect(s).toHaveProperty("hydration");
    expect(s).toHaveProperty("memory");
  });
});
