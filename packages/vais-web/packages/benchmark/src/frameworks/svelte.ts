/**
 * Svelte benchmark adapter — mock implementation.
 *
 * Simulates realistic Svelte 4 performance characteristics:
 *   - Bundle size: ~2.5 KB gzipped (compiled output, minimal runtime)
 *   - SSR: ~3 ms avg (server-rendered string template approach)
 *   - Hydration: lightweight — attaches listeners to pre-rendered DOM
 *   - Memory: moderate — uses a small runtime object per component
 *
 * No actual Svelte package is installed.
 */

import { benchmarkSSR } from "../ssr-bench.js";
import { measureHydration } from "../hydration.js";
import { measureMemory } from "../memory.js";
import type {
  FrameworkAdapter,
  BundleSizeResult,
  SSRResult,
  HydrationResult,
  MemoryResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// Simulated bundle (Svelte compiled output is very compact)
// ---------------------------------------------------------------------------

function buildMockSource(targetRawBytes: number): string {
  const base = `
import{SvelteComponent,init,safe_not_equal,append,detach,element,text,set_data,noop}from'svelte/internal';
function create_fragment(ctx){let ul,li;return{c(){ul=element('ul');li=element('li');append(ul,li);text(li,ctx[0]);},m(target,anchor){target.insertBefore(ul,anchor);},p(ctx,[dirty]){if(dirty&1)set_data(li,ctx[0]);},d(detaching){if(detaching)detach(ul);}}}
export default class App extends SvelteComponent{constructor(options){super();init(this,options,null,create_fragment,safe_not_equal,{});}}
`.trim();

  let src = base;
  while (src.length < targetRawBytes) {
    src += "\n" + base;
  }
  return src.slice(0, targetRawBytes);
}

// Svelte: ~6.5 KB raw → ~2.5 KB gzipped (compiled, minimal runtime)
const SVELTE_RAW_SOURCE = buildMockSource(6_656);

// ---------------------------------------------------------------------------
// Simulated render
// ---------------------------------------------------------------------------

function svelteRenderTemplate(): string {
  // Svelte SSR produces clean HTML without runtime markers
  const items = Array.from(
    { length: 10 },
    (_, i) => `<li class="item">${i}: Item ${i}</li>`
  );
  return `<ul class="list">${items.join("")}</ul>`;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const svelteAdapter: FrameworkAdapter = {
  name: "Svelte",

  async bundleSize(): Promise<BundleSizeResult> {
    const { measureBundleSize } = await import("../bundle-size.js");
    return measureBundleSize(SVELTE_RAW_SOURCE, true);
  },

  async ssrRender(iterations: number): Promise<SSRResult> {
    return benchmarkSSR(svelteRenderTemplate, iterations);
  },

  async hydrate(): Promise<HydrationResult> {
    const bundle = await this.bundleSize();
    return measureHydration(
      async () => {
        // Svelte hydration: walk DOM once, attach event delegates
        let _sum = 0;
        const nodes = Array.from({ length: 30 }, (_, i) => ({ id: i }));
        for (const n of nodes) {
          _sum += n.id * 1.2;
        }
      },
      bundle.gzipped,
      bundle.raw
    );
  },

  async memoryUsage(listSize: number): Promise<MemoryResult> {
    return measureMemory(() => {
      // Svelte component objects are lightweight
      const components: Array<{ $set: () => void; items: string[]; dirty: Set<number> }> = [];
      for (let i = 0; i < listSize; i++) {
        components.push({
          $set: () => undefined,
          items: [`Item ${i}`],
          dirty: new Set([0]),
        });
      }
      return components;
    });
  },
};
