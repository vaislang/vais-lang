/**
 * Benchmark result types for VaisX framework comparison suite.
 */

export type MetricType = "bundle-size" | "ssr-render" | "hydration" | "memory";

export interface BenchmarkResult {
  framework: string;
  metric: MetricType | string;
  value: number;
  unit: string;
}

export interface FrameworkComparison {
  metric: MetricType | string;
  results: BenchmarkResult[];
  winner: string;
  /** Ratio: winner_value / second_best_value — lower is better for time/size metrics */
  improvementRatio: number;
}

export interface BundleSizeResult {
  raw: number; // bytes
  gzipped: number; // bytes
  brotli?: number; // bytes
}

export interface SSRResult {
  iterations: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface HydrationResult {
  /** Estimated time-to-interactive in milliseconds */
  timeToInteractiveMs: number;
  /** Cost of re-attaching event listeners / diffing, in ms */
  hydrationCostMs: number;
}

export interface MemoryResult {
  heapUsedBefore: number; // bytes
  heapUsedAfter: number; // bytes
  delta: number; // bytes
}

export interface FrameworkBenchmarkSummary {
  framework: string;
  bundleSize: BundleSizeResult;
  ssr: SSRResult;
  hydration: HydrationResult;
  memory: MemoryResult;
}

export interface FrameworkAdapter {
  name: string;
  bundleSize(): Promise<BundleSizeResult>;
  ssrRender(iterations: number): Promise<SSRResult>;
  hydrate(): Promise<HydrationResult>;
  memoryUsage(listSize: number): Promise<MemoryResult>;
}
