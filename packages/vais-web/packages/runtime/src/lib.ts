/**
 * @vaisx/runtime — VaisX minimal runtime (< 3KB gzipped)
 *
 * Re-exports all runtime helpers used by vaisx-compiler codegen output.
 */

// DOM helpers
export {
  $$element,
  $$text,
  $$append,
  $$attr,
  $$set_text,
  $$anchor,
  $$create_fragment,
  $$insert_before,
  $$remove_fragment,
  $$spread,
} from "./dom.js";

// Event helpers
export { $$listen } from "./event.js";

// Batch scheduler
export { $$schedule, $$flush } from "./scheduler.js";

// Lifecycle hooks
export { $$mount, $$destroy } from "./lifecycle.js";

// Dynamic signal fallback
export { createSignal, createComputed, createEffect, track } from "./signal.js";

// Type re-exports
export type { EventModifiers } from "./event.js";
export type { ComponentInstance } from "./lifecycle.js";
export type { Signal } from "./signal.js";
