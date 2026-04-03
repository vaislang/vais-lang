/**
 * index.ts — Re-exports for the hydration module
 */

export type { HydrationTarget } from "./markers.js";
export { findHydrationTargets } from "./markers.js";

export { deserializeState, serializeState } from "./state.js";

export type { EventQueue } from "./queue.js";
export { createEventQueue } from "./queue.js";

export type { ComponentInstance } from "./hydrate.js";
export { hydrate, hydrateAll, eventQueue } from "./hydrate.js";
