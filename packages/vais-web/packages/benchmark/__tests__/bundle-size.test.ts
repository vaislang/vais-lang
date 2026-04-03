import { describe, it, expect } from "vitest";
import { gzipSize, brotliSize, measureBundleSize, compareBundleSizes } from "../src/bundle-size.js";
import type { FrameworkAdapter } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(name: string, raw: number, gzipped: number): FrameworkAdapter {
  return {
    name,
    async bundleSize() {
      return { raw, gzipped };
    },
    async ssrRender(_iterations) {
      return { iterations: _iterations, avgMs: 1, p50Ms: 1, p95Ms: 1, p99Ms: 1 };
    },
    async hydrate() {
      return { timeToInteractiveMs: 10, hydrationCostMs: 1 };
    },
    async memoryUsage(_size) {
      return { heapUsedBefore: 0, heapUsedAfter: 100, delta: 100 };
    },
  };
}

// ---------------------------------------------------------------------------
// gzipSize
// ---------------------------------------------------------------------------

describe("gzipSize", () => {
  it("returns a number less than the raw size for compressible input", async () => {
    const src = "hello world ".repeat(1000);
    const gz = await gzipSize(src);
    expect(gz).toBeGreaterThan(0);
    expect(gz).toBeLessThan(Buffer.byteLength(src, "utf8"));
  });

  it("accepts a Buffer as input", async () => {
    const buf = Buffer.from("a".repeat(500));
    const gz = await gzipSize(buf);
    expect(gz).toBeGreaterThan(0);
    expect(gz).toBeLessThan(buf.length);
  });

  it("returns a positive size for a single byte", async () => {
    const gz = await gzipSize("x");
    expect(gz).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// brotliSize
// ---------------------------------------------------------------------------

describe("brotliSize", () => {
  it("returns a positive compressed size", async () => {
    const br = await brotliSize("const foo = 'bar';".repeat(100));
    expect(br).toBeGreaterThan(0);
  });

  it("is generally smaller than gzip for the same input", async () => {
    const src = "export function render(vnode){return vnode.tag;}".repeat(200);
    const [gz, br] = await Promise.all([gzipSize(src), brotliSize(src)]);
    // Brotli is typically better; allow small exceptions in test environment
    expect(br).toBeLessThanOrEqual(gz * 1.05);
  });
});

// ---------------------------------------------------------------------------
// measureBundleSize
// ---------------------------------------------------------------------------

describe("measureBundleSize", () => {
  it("returns correct raw byte count", async () => {
    const src = "hello";
    const result = await measureBundleSize(src);
    expect(result.raw).toBe(5);
  });

  it("sets brotli when includeBrotli=true", async () => {
    const result = await measureBundleSize("test source".repeat(50), true);
    expect(result.brotli).toBeTypeOf("number");
    expect(result.brotli).toBeGreaterThan(0);
  });

  it("does not set brotli when includeBrotli=false", async () => {
    const result = await measureBundleSize("abc", false);
    expect(result.brotli).toBeUndefined();
  });

  it("gzipped < raw for typical JS source", async () => {
    const src = "export function foo(x){return x*2;}\n".repeat(100);
    const result = await measureBundleSize(src);
    expect(result.gzipped).toBeLessThan(result.raw);
  });
});

// ---------------------------------------------------------------------------
// compareBundleSizes
// ---------------------------------------------------------------------------

describe("compareBundleSizes", () => {
  it("returns one BenchmarkResult per adapter", async () => {
    const adapters = [
      makeAdapter("A", 10_000, 4_000),
      makeAdapter("B", 80_000, 30_000),
    ];
    const { results } = await compareBundleSizes(adapters);
    expect(results).toHaveLength(2);
  });

  it("identifies the smaller gzipped size as the winner", async () => {
    const adapters = [
      makeAdapter("Big", 80_000, 30_000),
      makeAdapter("Small", 10_000, 4_000),
    ];
    const { comparison } = await compareBundleSizes(adapters);
    expect(comparison.winner).toBe("Small");
  });

  it("improvement ratio reflects size difference", async () => {
    const adapters = [
      makeAdapter("A", 1_000, 500),
      makeAdapter("B", 10_000, 5_000),
    ];
    const { comparison } = await compareBundleSizes(adapters);
    expect(comparison.improvementRatio).toBeCloseTo(10, 1);
  });

  it("sets metric to bundle-size on comparison", async () => {
    const adapters = [makeAdapter("X", 1000, 400)];
    const { comparison } = await compareBundleSizes(adapters);
    expect(comparison.metric).toBe("bundle-size");
  });
});
