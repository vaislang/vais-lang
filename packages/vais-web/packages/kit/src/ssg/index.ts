/**
 * SSG engine — public API re-exports.
 */

export type { StaticPath } from "./paths.js";
export { determineRenderMode, collectStaticPaths } from "./paths.js";

export type {
  PrerenderOptions,
  PrerenderResult,
  PrerenderFile,
} from "./prerender.js";
export { prerender } from "./prerender.js";
