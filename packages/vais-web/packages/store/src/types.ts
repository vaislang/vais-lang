/**
 * Core type definitions for @vaisx/store.
 * API inspired by Pinia, adapted for VaisX reactivity.
 */

/**
 * Factory function that returns the initial state object.
 */
export type StateFactory<S> = () => S;

/**
 * Getters definition — a record of functions that compute derived state.
 * Each getter receives the full state (and other getters) as `this`.
 */
export type GettersDefinition<S, G> = G & ThisType<S & UnwrapGetters<G>>;

/**
 * Actions definition — a record of functions that can mutate state.
 * Each action has access to state, getters and other actions via `this`.
 */
export type ActionsDefinition<S, G, A> = A & ThisType<S & UnwrapGetters<G> & A>;

/**
 * Unwraps getter functions to their return types, creating computed property types.
 */
export type UnwrapGetters<G> = {
  readonly [K in keyof G]: G[K] extends (...args: any[]) => infer R ? R : never;
};

/**
 * Definition object passed to defineStore().
 */
export interface StoreDefinition<S extends object, G extends Record<string, (this: S & UnwrapGetters<G>) => unknown>, A extends Record<string, (this: S & UnwrapGetters<G> & A, ...args: any[]) => unknown>> {
  /** Unique identifier for this store. */
  id: string;
  /** Factory function that returns fresh initial state. */
  state: StateFactory<S>;
  /** Computed getters derived from state. */
  getters?: G & ThisType<S & UnwrapGetters<G>>;
  /** Methods that can read and mutate state. */
  actions?: A & ThisType<S & UnwrapGetters<G> & A>;
}

/**
 * The reactive store instance returned by useStore() or the store factory.
 */
export interface Store<S extends object, G extends Record<string, () => unknown>, A extends Record<string, (...args: any[]) => unknown>> {
  /** Unique store identifier. */
  readonly $id: string;
  /** Direct access to the reactive state object. */
  readonly $state: S;
  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   * The callback is invoked synchronously after each state mutation.
   */
  $subscribe(callback: (state: S) => void): () => void;
  /** Reset state back to its initial value (as returned by the state factory). */
  $reset(): void;
  /**
   * Partially update state.
   * Accepts either a partial state object (shallow merge) or an updater function
   * that receives a mutable draft of the state.
   */
  $patch(partial: Partial<S> | ((state: S) => void)): void;
  /**
   * Apply one or more plugins to this store instance.
   * @internal — called by createPinia / plugin installation.
   */
  _applyPlugin(plugin: StorePlugin<S, G, A>): void;
}

/**
 * A plugin receives the store instance and its definition after the store
 * has been created, allowing side-effects like persistence or devtools.
 */
export interface StorePlugin<
  S extends object = Record<string, unknown>,
  G extends Record<string, () => unknown> = Record<string, () => unknown>,
  A extends Record<string, (...args: any[]) => unknown> = Record<string, (...args: any[]) => unknown>,
> {
  (context: {
    store: Store<S, G, A>;
    options: StoreDefinition<S, G, A>;
  }): void;
}

/**
 * Options for the persist middleware.
 */
export interface PersistOptions {
  /** localStorage key (defaults to store.$id). */
  key?: string;
  /** Which state keys to persist. Persists everything if omitted. */
  paths?: string[];
  /** Custom serializer (defaults to JSON.stringify/parse). */
  serializer?: {
    serialize: (state: Record<string, unknown>) => string;
    deserialize: (raw: string) => Record<string, unknown>;
  };
}

/**
 * Options for the logger middleware.
 */
export interface LoggerOptions {
  /** Whether to log state before mutation (default: true). */
  logBefore?: boolean;
  /** Custom log function (defaults to console.log). */
  log?: (...args: unknown[]) => void;
  /** Store ids to restrict logging to (logs all if omitted). */
  filter?: string[];
}

/**
 * Options for the devtools middleware.
 */
export interface DevtoolsOptions {
  /** Custom name shown in devtools (defaults to store.$id). */
  name?: string;
}

/**
 * SSR snapshot — a plain object mapping store IDs to their serialized state.
 */
export type SSRSnapshot = Record<string, unknown>;
