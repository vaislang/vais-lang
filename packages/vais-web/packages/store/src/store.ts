/**
 * defineStore — creates a named reactive store factory backed by @vaisx/runtime signals.
 *
 * Usage:
 *   const useCounter = defineStore({
 *     id: 'counter',
 *     state: () => ({ count: 0 }),
 *     getters: { doubled() { return this.count * 2; } },
 *     actions: { increment() { this.count++; } },
 *   });
 *
 *   const counter = useCounter();
 *   counter.increment();
 *   counter.$state.count; // 1
 */

import { createSignal } from "@vaisx/runtime";
import type {
  StoreDefinition,
  Store,
  StorePlugin,
  UnwrapGetters,
} from "./types.js";

/** Global registry: storeId → store instance (singleton per id). */
const storeRegistry = new Map<string, Store<any, any, any>>();

/** Globally installed plugins applied to every newly created store. */
const globalPlugins: StorePlugin[] = [];

/**
 * Install a global plugin that is applied to every store created after this call.
 */
export function addStorePlugin(plugin: StorePlugin): void {
  globalPlugins.push(plugin);
}

/**
 * Clear all singleton store instances from the registry.
 * Useful for server-side rendering (prevents state leaking across requests)
 * and for unit test isolation.
 */
export function resetAllStores(): void {
  storeRegistry.clear();
}

/**
 * Retrieve a raw store instance by id.  Returns undefined if not yet created.
 */
export function getStore(id: string): Store<any, any, any> | undefined {
  return storeRegistry.get(id);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Notify all subscribers of the current state snapshot.
 */
function notifySubscribers<S extends object>(
  subscribers: Set<(state: S) => void>,
  state: S,
): void {
  for (const cb of subscribers) {
    cb(state);
  }
}

/**
 * Build the reactive state proxy.
 * Each property is backed by its own Signal so that getters / effects that
 * read individual properties react only to those properties' changes.
 *
 * The `isBatching` flag is checked before calling `onChange` so that
 * bulk operations ($patch, $reset) can suppress per-property notifications
 * and instead send a single notification after all properties are updated.
 */
function buildStateProxy<S extends object>(
  initialState: S,
  onChange: () => void,
  batchingRef: { value: boolean },
): { stateProxy: S; signals: Map<string | symbol, ReturnType<typeof createSignal<unknown>>> } {
  const signals = new Map<string | symbol, ReturnType<typeof createSignal<unknown>>>();

  // Initialise one signal per top-level property.
  for (const key of Object.keys(initialState) as (keyof S)[]) {
    signals.set(key as string, createSignal(initialState[key] as unknown));
  }

  const stateProxy = new Proxy({} as S, {
    get(_target, prop) {
      const sig = signals.get(prop);
      if (sig) return sig();
      return undefined;
    },
    set(_target, prop, value) {
      let sig = signals.get(prop);
      if (!sig) {
        // Allow new properties added via $patch
        sig = createSignal(value as unknown);
        signals.set(prop, sig);
      }
      const prev = sig();
      sig.set(value as unknown);
      // Only fire onChange for individual property changes when NOT batching
      if (!batchingRef.value && !Object.is(prev, value)) {
        onChange();
      }
      return true;
    },
    deleteProperty(_target, prop) {
      signals.delete(prop);
      return true;
    },
    has(_target, prop) {
      return signals.has(prop);
    },
    ownKeys() {
      return [...signals.keys()] as string[];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (signals.has(prop)) {
        return { configurable: true, enumerable: true };
      }
      return undefined;
    },
  });

  return { stateProxy, signals };
}

/**
 * Take a plain snapshot of the proxy state (non-reactive).
 */
function snapshotState<S extends object>(state: S): S {
  return { ...state } as S;
}

// ─── defineStore ─────────────────────────────────────────────────────────────

/**
 * Define a store.  Returns a factory function (useXxxStore) that always returns
 * the same singleton instance for the given id within the current registry.
 */
export function defineStore<
  S extends object,
  G extends Record<string, (this: S & UnwrapGetters<G>) => unknown>,
  A extends Record<string, (this: S & UnwrapGetters<G> & A, ...args: any[]) => unknown>,
>(
  options: StoreDefinition<S, G, A>,
): () => Store<S, G, A> & UnwrapGetters<G> & A {
  const { id, state: stateFactory, getters = {} as G, actions = {} as A } = options;

  function useStore(): Store<S, G, A> & UnwrapGetters<G> & A {
    // Return cached singleton if already created.
    if (storeRegistry.has(id)) {
      return storeRegistry.get(id) as Store<S, G, A> & UnwrapGetters<G> & A;
    }

    const subscribers = new Set<(state: S) => void>();

    // Shared batching flag — when true, per-property onChange is suppressed.
    const batchingRef = { value: false };

    // Build reactive proxy
    const { stateProxy } = buildStateProxy<S>(
      stateFactory(),
      () => {
        // Called when a single property changes outside of a batch (e.g. direct assignment)
        notifySubscribers(subscribers, snapshotState(stateProxy));
      },
      batchingRef,
    );

    // ── Getters — build computed accessors on the store object ───────────────
    // (Evaluated lazily via proxy get trap below)

    // ── Actions — bind `this` to the full store proxy ────────────────────────
    const boundActions: Record<string, (...args: unknown[]) => unknown> = {};
    for (const key of Object.keys(actions) as (keyof A & string)[]) {
      boundActions[key] = function (...args: unknown[]) {
        return (actions[key] as Function).apply(fullStoreProxy, args);
      };
    }

    // ── Core store API ───────────────────────────────────────────────────────
    const coreStore: Store<S, G, A> = {
      $id: id,
      get $state() {
        return stateProxy;
      },
      $subscribe(callback: (state: S) => void): () => void {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
      $reset(): void {
        batchingRef.value = true;
        const fresh = stateFactory();
        for (const key of Object.keys(fresh) as (keyof S)[]) {
          stateProxy[key] = fresh[key];
        }
        // Remove keys that no longer exist in fresh state
        for (const key of Object.keys(stateProxy) as (keyof S)[]) {
          if (!(key in fresh)) {
            delete stateProxy[key];
          }
        }
        batchingRef.value = false;
        notifySubscribers(subscribers, snapshotState(stateProxy));
      },
      $patch(partial: Partial<S> | ((state: S) => void)): void {
        batchingRef.value = true;
        if (typeof partial === "function") {
          partial(stateProxy);
        } else {
          for (const key of Object.keys(partial) as (keyof S)[]) {
            stateProxy[key] = (partial as S)[key];
          }
        }
        batchingRef.value = false;
        notifySubscribers(subscribers, snapshotState(stateProxy));
      },
      /**
       * Apply one or more plugins to this store instance.
       */
      _applyPlugin(plugin: StorePlugin<S, G, A>): void {
        plugin({ store: coreStore, options: options as StoreDefinition<S, G, A> });
      },
    };

    // Assemble the full store proxy: core API + getters + actions + state forwarding
    const fullStoreProxy = new Proxy(coreStore, {
      get(target, prop) {
        // 1. Core API ($id, $state, $subscribe, $reset, $patch, _applyPlugin)
        if (prop in target) {
          return (target as any)[prop];
        }
        // 2. State properties
        if (prop in stateProxy) {
          return (stateProxy as any)[prop];
        }
        // 3. Getters (lazy evaluation)
        if (prop in getters) {
          return (getters as any)[prop].call(fullStoreProxy);
        }
        // 4. Actions
        if (prop in boundActions) {
          return boundActions[prop as string];
        }
        return undefined;
      },
      set(target, prop, value) {
        // Allow setting state properties directly on the store
        if (prop in stateProxy || !(prop in target)) {
          (stateProxy as any)[prop] = value;
          return true;
        }
        (target as any)[prop] = value;
        return true;
      },
      has(target, prop) {
        return (
          prop in target ||
          prop in stateProxy ||
          prop in getters ||
          prop in boundActions
        );
      },
      ownKeys(target) {
        const stateKeys = Object.keys(stateProxy);
        const getterKeys = Object.keys(getters);
        const actionKeys = Object.keys(boundActions);
        const coreKeys = Object.keys(target);
        return [...new Set([...coreKeys, ...stateKeys, ...getterKeys, ...actionKeys])];
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop in target) {
          return Object.getOwnPropertyDescriptor(target, prop) ?? {
            configurable: true,
            enumerable: true,
          };
        }
        if (prop in stateProxy || prop in getters || prop in boundActions) {
          return { configurable: true, enumerable: true };
        }
        return undefined;
      },
    }) as Store<S, G, A> & UnwrapGetters<G> & A;

    // Apply global plugins
    for (const plugin of globalPlugins) {
      plugin({ store: coreStore as Store<any, any, any>, options: options as StoreDefinition<any, any, any> });
    }

    storeRegistry.set(id, fullStoreProxy);
    return fullStoreProxy;
  }

  return useStore;
}
