/**
 * useStore — hook for component integration.
 *
 * Returns a reactive proxy of the store.  When the store's state changes,
 * the provided re-render callback is invoked so the component can schedule
 * a DOM update.  Unsubscribes automatically via the returned cleanup function.
 *
 * This module is intentionally framework-agnostic.  The VaisX compiler /
 * runtime calls `onMount` / `onDestroy` equivalents where the returned
 * cleanup should be registered.
 */

import type { Store } from "./types.js";

/**
 * Minimal component context interface.
 * The VaisX component runtime is expected to satisfy this shape.
 */
export interface ComponentContext {
  /** Schedule a re-render of the component. */
  scheduleUpdate(): void;
  /**
   * Register a cleanup callback to be called when the component is destroyed.
   * Returns a function that cancels the registration (optional).
   */
  onDestroy(cleanup: () => void): void;
}

/**
 * Connect a store to a component context.
 *
 * - Subscribes to state changes; calls ctx.scheduleUpdate() on each change.
 * - Registers cleanup via ctx.onDestroy() so the subscription is removed
 *   when the component is destroyed.
 *
 * Returns the store unchanged — it is already a reactive proxy.
 */
export function useStore<
  S extends object,
  G extends Record<string, () => unknown>,
  A extends Record<string, (...args: any[]) => unknown>,
>(
  store: Store<S, G, A> & G & A,
  ctx: ComponentContext,
): Store<S, G, A> & G & A {
  const unsubscribe = store.$subscribe(() => {
    ctx.scheduleUpdate();
  });

  ctx.onDestroy(unsubscribe);

  return store;
}

/**
 * Lightweight alternative when no component context is available (e.g. scripts,
 * server utilities).  Returns [store, unsubscribe].
 *
 * The caller is responsible for calling unsubscribe() when done.
 */
export function connectStore<
  S extends object,
  G extends Record<string, () => unknown>,
  A extends Record<string, (...args: any[]) => unknown>,
>(
  store: Store<S, G, A> & G & A,
  onChange: (state: S) => void,
): [Store<S, G, A> & G & A, () => void] {
  const unsubscribe = store.$subscribe(onChange);
  return [store, unsubscribe];
}
