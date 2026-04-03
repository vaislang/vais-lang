/**
 * hydrate.ts — Core hydration logic
 */

import type { HydrationTarget } from "./markers.js";
import { findHydrationTargets } from "./markers.js";
import { deserializeState } from "./state.js";
import { createEventQueue } from "./queue.js";

export interface ComponentInstance {
  $$update?: () => void;
  $$destroy?: () => void;
}

// Shared event queue for the lifecycle of the page
const globalEventQueue = createEventQueue();

/**
 * Hydrate a single component by its componentId.
 *
 * @param componentId - The component ID matching the data-vx attribute
 * @param importFn - Dynamic import returning a module with a default export (mount function)
 */
export async function hydrate(
  componentId: string,
  importFn: () => Promise<{ default: (target: HTMLElement, state?: Record<string, unknown>) => ComponentInstance }>,
): Promise<void> {
  if (typeof document === "undefined") return;

  // Find the target element in the document
  const allTargets = findHydrationTargets(document.documentElement);
  const target = allTargets.find((t) => t.componentId === componentId);

  if (!target) return;

  await hydrateTarget(target, importFn);
}

/**
 * Hydrate a single HydrationTarget.
 */
async function hydrateTarget(
  target: HydrationTarget,
  importFn: () => Promise<{ default: (target: HTMLElement, state?: Record<string, unknown>) => ComponentInstance }>,
): Promise<void> {
  const { element, stateBase64 } = target;

  // Deserialize state
  const state = deserializeState(stateBase64);

  // Import the component module
  const module = await importFn();
  const mountFn = module.default;

  // Mount the component on the existing DOM element (reuse, don't replace)
  mountFn(element as HTMLElement, state);

  // Replay any queued events on the element
  globalEventQueue.replay(element);

  // Remove hydration attributes after successful hydration
  element.removeAttribute("data-vx");
  element.removeAttribute("data-vx-state");
}

/**
 * Hydrate all components found in the document.
 *
 * @param modules - Map of componentId to dynamic import function
 */
export async function hydrateAll(
  modules: Record<string, () => Promise<{ default: (target: HTMLElement, state?: Record<string, unknown>) => ComponentInstance }>>,
): Promise<void> {
  if (typeof document === "undefined") return;

  const targets = findHydrationTargets(document.documentElement);

  await Promise.all(
    targets
      .filter((t) => t.componentId in modules)
      .map((t) => hydrateTarget(t, modules[t.componentId])),
  );
}

export { globalEventQueue as eventQueue };
