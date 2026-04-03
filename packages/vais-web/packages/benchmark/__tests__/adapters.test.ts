import { describe, it, expect } from "vitest";
import { vaisxAdapter } from "../src/frameworks/vaisx.js";
import { reactAdapter } from "../src/frameworks/react.js";
import { svelteAdapter } from "../src/frameworks/svelte.js";
import { vueAdapter } from "../src/frameworks/vue.js";

// ---------------------------------------------------------------------------
// Shared adapter contract tests
// ---------------------------------------------------------------------------

const allAdapters = [vaisxAdapter, reactAdapter, svelteAdapter, vueAdapter];

for (const adapter of allAdapters) {
  describe(`FrameworkAdapter contract — ${adapter.name}`, () => {
    it("has a non-empty name", () => {
      expect(adapter.name.length).toBeGreaterThan(0);
    });

    it("bundleSize() returns positive raw and gzipped values", async () => {
      const r = await adapter.bundleSize();
      expect(r.raw).toBeGreaterThan(0);
      expect(r.gzipped).toBeGreaterThan(0);
    });

    it("gzipped <= raw", async () => {
      const r = await adapter.bundleSize();
      expect(r.gzipped).toBeLessThanOrEqual(r.raw);
    });

    it("ssrRender() returns correct iteration count", async () => {
      const r = await adapter.ssrRender(10);
      expect(r.iterations).toBe(10);
    });

    it("ssrRender() p99 >= p95 >= p50 >= 0", async () => {
      const r = await adapter.ssrRender(30);
      expect(r.p50Ms).toBeGreaterThanOrEqual(0);
      expect(r.p95Ms).toBeGreaterThanOrEqual(r.p50Ms);
      expect(r.p99Ms).toBeGreaterThanOrEqual(r.p95Ms);
    });

    it("hydrate() returns non-negative values", async () => {
      const r = await adapter.hydrate();
      expect(r.timeToInteractiveMs).toBeGreaterThanOrEqual(0);
      expect(r.hydrationCostMs).toBeGreaterThanOrEqual(0);
    });

    it("memoryUsage() delta equals heapUsedAfter - heapUsedBefore", async () => {
      const r = await adapter.memoryUsage(50);
      expect(r.delta).toBeCloseTo(r.heapUsedAfter - r.heapUsedBefore, 0);
    });
  });
}

// ---------------------------------------------------------------------------
// Cross-framework relative comparisons
// ---------------------------------------------------------------------------

describe("Cross-framework bundle size ordering", () => {
  it("VaisX bundle is smaller than React bundle", async () => {
    const [v, r] = await Promise.all([vaisxAdapter.bundleSize(), reactAdapter.bundleSize()]);
    expect(v.gzipped).toBeLessThan(r.gzipped);
  });

  it("VaisX bundle is smaller than Vue bundle", async () => {
    const [v, vue] = await Promise.all([vaisxAdapter.bundleSize(), vueAdapter.bundleSize()]);
    expect(v.gzipped).toBeLessThan(vue.gzipped);
  });

  it("Svelte bundle is smaller than React bundle", async () => {
    const [s, r] = await Promise.all([svelteAdapter.bundleSize(), reactAdapter.bundleSize()]);
    expect(s.gzipped).toBeLessThan(r.gzipped);
  });
});
