import { describe, it, expect } from "vitest";
import { toMarkdownTable, toASCIIChart, generateReport } from "../src/report.js";
import type {
  BenchmarkResult,
  FrameworkComparison,
  FrameworkBenchmarkSummary,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const bundleResults: BenchmarkResult[] = [
  { framework: "VaisX", metric: "bundle-size", value: 1400, unit: "bytes" },
  { framework: "React", metric: "bundle-size", value: 43_000, unit: "bytes" },
  { framework: "Svelte", metric: "bundle-size", value: 2_560, unit: "bytes" },
  { framework: "Vue", metric: "bundle-size", value: 35_840, unit: "bytes" },
];

const ssrResults: BenchmarkResult[] = [
  { framework: "VaisX", metric: "ssr-render", value: 0.8, unit: "ms" },
  { framework: "React", metric: "ssr-render", value: 8.2, unit: "ms" },
  { framework: "Svelte", metric: "ssr-render", value: 3.1, unit: "ms" },
  { framework: "Vue", metric: "ssr-render", value: 6.0, unit: "ms" },
];

const bundleComparison: FrameworkComparison = {
  metric: "bundle-size",
  results: bundleResults,
  winner: "VaisX",
  improvementRatio: 43_000 / 1_400,
};

const ssrComparison: FrameworkComparison = {
  metric: "ssr-render",
  results: ssrResults,
  winner: "VaisX",
  improvementRatio: 3.1 / 0.8,
};

const summaries: FrameworkBenchmarkSummary[] = [
  {
    framework: "VaisX",
    bundleSize: { raw: 3_584, gzipped: 1_400 },
    ssr: { iterations: 200, avgMs: 0.8, p50Ms: 0.7, p95Ms: 1.2, p99Ms: 1.8 },
    hydration: { timeToInteractiveMs: 12, hydrationCostMs: 0.5 },
    memory: { heapUsedBefore: 10_000, heapUsedAfter: 50_000, delta: 40_000 },
  },
  {
    framework: "React",
    bundleSize: { raw: 143_360, gzipped: 43_000 },
    ssr: { iterations: 200, avgMs: 8.2, p50Ms: 7.9, p95Ms: 12.0, p99Ms: 18.0 },
    hydration: { timeToInteractiveMs: 350, hydrationCostMs: 10.0 },
    memory: { heapUsedBefore: 10_000, heapUsedAfter: 800_000, delta: 790_000 },
  },
];

// ---------------------------------------------------------------------------
// toMarkdownTable
// ---------------------------------------------------------------------------

describe("toMarkdownTable", () => {
  it("includes the metric name in the output", () => {
    const md = toMarkdownTable(bundleResults);
    expect(md).toContain("bundle-size");
  });

  it("includes all framework names", () => {
    const md = toMarkdownTable(bundleResults);
    for (const r of bundleResults) {
      expect(md).toContain(r.framework);
    }
  });

  it("marks the winner with a trophy emoji", () => {
    const md = toMarkdownTable(bundleResults);
    expect(md).toContain("🏆");
  });

  it("contains markdown table separators", () => {
    const md = toMarkdownTable(bundleResults);
    expect(md).toContain("|");
    expect(md).toContain("---");
  });

  it("returns empty string for empty results", () => {
    expect(toMarkdownTable([])).toBe("");
  });

  it("formats byte values in KB when appropriate", () => {
    const md = toMarkdownTable(bundleResults);
    expect(md).toContain("KB");
  });
});

// ---------------------------------------------------------------------------
// toASCIIChart
// ---------------------------------------------------------------------------

describe("toASCIIChart", () => {
  it("includes all framework names", () => {
    const chart = toASCIIChart(ssrResults);
    for (const r of ssrResults) {
      expect(chart).toContain(r.framework);
    }
  });

  it("includes the metric name", () => {
    const chart = toASCIIChart(ssrResults);
    expect(chart).toContain("ssr-render");
  });

  it("uses block characters for bars", () => {
    const chart = toASCIIChart(ssrResults);
    expect(chart).toContain("█");
  });

  it("returns empty string for empty results", () => {
    expect(toASCIIChart([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// generateReport
// ---------------------------------------------------------------------------

describe("generateReport", () => {
  it("starts with the report title", () => {
    const report = generateReport(summaries, [bundleComparison, ssrComparison]);
    expect(report).toContain("VaisX Framework Benchmark Report");
  });

  it("includes framework names from summaries", () => {
    const report = generateReport(summaries, [bundleComparison, ssrComparison]);
    expect(report).toContain("VaisX");
    expect(report).toContain("React");
  });

  it("includes the Detailed Results section", () => {
    const report = generateReport(summaries, [bundleComparison, ssrComparison]);
    expect(report).toContain("Detailed Results");
  });

  it("contains winner information for each comparison", () => {
    const report = generateReport(summaries, [bundleComparison, ssrComparison]);
    expect(report).toContain("Winner");
  });

  it("includes an ASCII chart block", () => {
    const report = generateReport(summaries, [bundleComparison, ssrComparison]);
    expect(report).toContain("```");
  });
});
