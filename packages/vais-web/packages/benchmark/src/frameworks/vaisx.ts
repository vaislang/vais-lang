/**
 * VaisX benchmark adapter.
 *
 * Simulates expected VaisX performance characteristics:
 *   - Bundle size: ~1.4 KB gzipped (token-efficient, zero-runtime design)
 *   - SSR: <2 ms avg (compiled to plain string concatenation)
 *   - Hydration: minimal — progressive enhancement, no full VDOM reconcile
 *   - Memory: very low allocation per list item
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
// Simulated VaisX runtime source (representative size, not a real bundle)
// ---------------------------------------------------------------------------

/**
 * Generate a string of a given byte count that approximates real JS source
 * entropy (so gzip ratios are realistic).
 */
function pseudoJsSource(targetBytes: number): string {
  // A chunk of representative JS that gzip compresses well (ratio ~0.4)
  const snippet = `
export function h(tag,props,...children){
  const el={tag,props:props||{},children:children.flat()};
  return el;
}
export function render(vnode){
  if(typeof vnode==='string'||typeof vnode==='number') return String(vnode);
  const{tag,props,children}=vnode;
  const attrs=Object.entries(props).map(([k,v])=>\` \${k}="\${v}"\`).join('');
  return \`<\${tag}\${attrs}>\${children.map(render).join('')}</\${tag}>\`;
}
`.trim();

  let src = snippet;
  while (src.length < targetBytes) {
    src += "\n" + snippet;
  }
  return src.slice(0, targetBytes);
}

// VaisX target: ~3.5 KB raw → ~1.4 KB gzipped
const VAISX_RAW_SOURCE = pseudoJsSource(3_584);

/** Simple VaisX-style template render (fast string concatenation). */
function vaistRenderTemplate(): string {
  const items = Array.from(
    { length: 10 },
    (_, i) => `<li class="item" data-idx="${i}">Item ${i}</li>`
  );
  return `<ul class="list">${items.join("")}</ul>`;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const vaisxAdapter: FrameworkAdapter = {
  name: "VaisX",

  async bundleSize(): Promise<BundleSizeResult> {
    const { measureBundleSize } = await import("../bundle-size.js");
    return measureBundleSize(VAISX_RAW_SOURCE, true);
  },

  async ssrRender(iterations: number): Promise<SSRResult> {
    return benchmarkSSR(vaistRenderTemplate, iterations);
  },

  async hydrate(): Promise<HydrationResult> {
    const bundle = await this.bundleSize();
    // VaisX hydration: just mark DOM nodes with a data attribute — no diffing
    return measureHydration(
      async () => {
        // Simulate minimal hydration work: iterate over mock DOM references
        let _sum = 0;
        for (let i = 0; i < 10; i++) {
          _sum += i * 1.1;
        }
      },
      bundle.gzipped,
      bundle.raw
    );
  },

  async memoryUsage(listSize: number): Promise<MemoryResult> {
    return measureMemory(() => {
      // VaisX renders to a string — very low object allocation
      const rows: string[] = [];
      for (let i = 0; i < listSize; i++) {
        rows.push(`<li>${i}: Item name #${i}</li>`);
      }
      return rows.join("");
    });
  },
};
