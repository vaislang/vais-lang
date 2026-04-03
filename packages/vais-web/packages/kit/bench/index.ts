/**
 * VaisX Kit — Benchmark Entry Point
 *
 * This file documents how to run the available benchmarks.
 *
 * ---------------------------------------------------------------------------
 * Run benchmarks:
 *   pnpm run bench        — vitest bench (SSR rendering + router matching)
 *   pnpm run bench:size   — bundle size report (reads dist/ output)
 * ---------------------------------------------------------------------------
 *
 * Benchmark files:
 *   bench/ssr.bench.ts    — SSR renderToString performance
 *                           · simple component (static text):     target < 1ms
 *                           · medium component (3 layouts+page):  target < 5ms
 *                           · complex component (10 layouts):     target < 20ms
 *
 *   bench/router.bench.ts — matchRoute performance over 100+ route tree
 *                           · static route match:                 target < 0.1ms
 *                           · dynamic route match:                target < 0.5ms
 *                           · deeply nested (5 levels):           target < 1ms
 *
 *   bench/bundle-size.ts  — Node.js script; reports raw bytes and gzip
 *                           estimate for each file in dist/
 */

// No runtime exports — this file is documentation only.
export {};
