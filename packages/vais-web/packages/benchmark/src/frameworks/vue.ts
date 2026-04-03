/**
 * Vue benchmark adapter — mock implementation.
 *
 * Simulates realistic Vue 3 performance characteristics:
 *   - Bundle size: ~35 KB gzipped (vue/dist/vue.esm-browser.prod.js)
 *   - SSR: ~6 ms avg (renderToString with VDOM overhead)
 *   - Hydration: VDOM-based, lighter than React but heavier than Svelte
 *   - Memory: moderate — proxy-based reactive objects per component
 *
 * No actual Vue package is installed.
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
// Simulated bundle
// ---------------------------------------------------------------------------

function buildMockSource(targetRawBytes: number): string {
  const base = `
var VueReactivity={ref:function(v){var _v=v;return{get value(){return _v;},set value(n){_v=n;}};},reactive:function(obj){return new Proxy(obj,{get(t,k){return t[k];},set(t,k,v){t[k]=v;return true;}});}};
var VueRuntime={h:function(type,props,children){return{type,props,children};},render:function(vnode,container){container.innerHTML=renderToString(vnode);}};
function renderToString(vnode){if(typeof vnode==='string')return vnode;var{type,props={},children=[]}=vnode;var attrs=Object.entries(props).map(([k,v])=>\`\${k}="\${v}"\`).join(' ');var inner=children.map(renderToString).join('');return \`<\${type} \${attrs}>\${inner}</\${type}>\`;}
module.exports={...VueReactivity,...VueRuntime};
`.trim();

  let src = base;
  while (src.length < targetRawBytes) {
    src += "\n" + base;
  }
  return src.slice(0, targetRawBytes);
}

// Vue 3 production: ~115 KB raw → ~35 KB gzipped
const VUE_RAW_SOURCE = buildMockSource(117_760);

// ---------------------------------------------------------------------------
// Simulated render
// ---------------------------------------------------------------------------

function vueRenderTemplate(): string {
  // Vue SSR uses `renderToString` which includes server-side VDOM traversal
  const items: string[] = [];
  for (let i = 0; i < 10; i++) {
    // Vue SSR adds <!--v-if--> and similar markers in some cases
    items.push(`<li class="item" data-v-${(i * 0x1f3f1).toString(16)}="">Item ${i}</li>`);
  }
  return `<ul class="list"><!--[-->${items.join("")}<!--]--></ul>`;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const vueAdapter: FrameworkAdapter = {
  name: "Vue",

  async bundleSize(): Promise<BundleSizeResult> {
    const { measureBundleSize } = await import("../bundle-size.js");
    return measureBundleSize(VUE_RAW_SOURCE, true);
  },

  async ssrRender(iterations: number): Promise<SSRResult> {
    return benchmarkSSR(() => {
      // Extra work to simulate Vue's reactive system overhead during SSR
      let result = vueRenderTemplate();
      // Vue SSR injects a server-rendering attribute
      result = result.replace("<ul", '<ul data-server-rendered="true"');
      return result;
    }, iterations);
  },

  async hydrate(): Promise<HydrationResult> {
    const bundle = await this.bundleSize();
    return measureHydration(
      async () => {
        // Vue hydration: create proxy-based reactive data and patch DOM
        let _sum = 0;
        const nodes = Array.from({ length: 60 }, (_, i) => ({ id: i, reactive: true }));
        for (const n of nodes) {
          _sum += n.id * 1.3;
        }
      },
      bundle.gzipped,
      bundle.raw
    );
  },

  async memoryUsage(listSize: number): Promise<MemoryResult> {
    return measureMemory(() => {
      // Vue 3 uses Proxy-based reactivity — simulate the object overhead
      const vnodes: Array<{
        type: string;
        key: number;
        props: Record<string, unknown>;
        children: string;
        shapeFlag: number;
      }> = [];
      for (let i = 0; i < listSize; i++) {
        vnodes.push({
          type: "li",
          key: i,
          props: { class: "item", "data-idx": i },
          children: `Item ${i}`,
          shapeFlag: 9, // ELEMENT | TEXT_CHILDREN
        });
      }
      return vnodes;
    });
  },
};
