/**
 * Bundle size measurement utilities.
 *
 * Computes gzipped (and optionally brotli-compressed) sizes for JS source
 * strings, and aggregates comparisons across multiple framework adapters.
 */

import { createGzip, createBrotliCompress } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";
import type {
  BundleSizeResult,
  FrameworkAdapter,
  BenchmarkResult,
  FrameworkComparison,
} from "./types.js";

/** Compress a Buffer using gzip and return the compressed size in bytes. */
export async function gzipSize(source: Buffer | string): Promise<number> {
  const input = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
  let size = 0;

  const readable = Readable.from([input]);
  const gzip = createGzip({ level: 9 });
  const counter = new Writable({
    write(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      cb();
    },
  });

  await pipeline(readable, gzip, counter);
  return size;
}

/** Compress a Buffer using brotli and return the compressed size in bytes. */
export async function brotliSize(source: Buffer | string): Promise<number> {
  const input = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
  let size = 0;

  const readable = Readable.from([input]);
  const br = createBrotliCompress();
  const counter = new Writable({
    write(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      cb();
    },
  });

  await pipeline(readable, br, counter);
  return size;
}

/**
 * Measure bundle size for a raw JS/CSS source string.
 *
 * @param source - The raw source code string (or pre-built Buffer)
 * @param includeBrotli - Whether to also measure brotli size (slightly slower)
 */
export async function measureBundleSize(
  source: string | Buffer,
  includeBrotli = false
): Promise<BundleSizeResult> {
  const buf = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
  const raw = buf.length;
  const [gzipped, brotli] = await Promise.all([
    gzipSize(buf),
    includeBrotli ? brotliSize(buf) : Promise.resolve(undefined),
  ]);

  return { raw, gzipped, ...(brotli !== undefined ? { brotli } : {}) };
}

/**
 * Run bundle-size benchmarks across all provided adapters and return
 * a BenchmarkResult array (one per framework, value = gzipped bytes).
 */
export async function compareBundleSizes(
  adapters: FrameworkAdapter[]
): Promise<{ results: BenchmarkResult[]; comparison: FrameworkComparison }> {
  const bundleResults = await Promise.all(
    adapters.map(async (a) => {
      const r = await a.bundleSize();
      return { adapter: a, result: r };
    })
  );

  const results: BenchmarkResult[] = bundleResults.map(({ adapter, result }) => ({
    framework: adapter.name,
    metric: "bundle-size",
    value: result.gzipped,
    unit: "bytes",
  }));

  // Lower gzipped size is better
  const sorted = [...results].sort((a, b) => a.value - b.value);
  const winner = sorted[0];
  const secondBest = sorted[1];
  const improvementRatio =
    secondBest && winner.value > 0 ? secondBest.value / winner.value : 1;

  const comparison: FrameworkComparison = {
    metric: "bundle-size",
    results,
    winner: winner.framework,
    improvementRatio,
  };

  return { results, comparison };
}
