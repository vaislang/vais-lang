/**
 * SharedStore & MessageChannel — cross-app state synchronisation and messaging.
 *
 * Provides:
 *  - createSharedStore(name, initialState)  — reactive shared state store
 *  - SharedStoreRegistry                    — global registry for named stores
 *  - createMessageChannel()                 — typed message bus between apps
 *  - syncStores(source, target, options?)   — uni/bi-directional store sync
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A plain-object state shape. */
export type StateRecord = Record<string, unknown>;

/** Listener called whenever state changes. */
export type StateListener<S extends StateRecord> = (state: Readonly<S>) => void;

/** Cleanup function returned by subscribe(). */
export type Unsubscribe = () => void;

/** A shared store instance. */
export interface SharedStore<S extends StateRecord> {
  /** Return the current state. */
  getState(): Readonly<S>;
  /** Merge a partial update into the current state and notify subscribers. */
  setState(partial: Partial<S>): void;
  /** Subscribe to state changes; returns an unsubscribe cleanup function. */
  subscribe(listener: StateListener<S>): Unsubscribe;
  /** Return a frozen snapshot of the current state. */
  getSnapshot(): Readonly<S>;
}

/** Registry that holds named stores. */
export interface ISharedStoreRegistry {
  register<S extends StateRecord>(name: string, store: SharedStore<S>): void;
  get<S extends StateRecord>(name: string): SharedStore<S> | undefined;
  getAll(): ReadonlyMap<string, SharedStore<StateRecord>>;
  unregister(name: string): void;
}

/** A message envelope sent through a channel. */
export interface ChannelMessage<D = unknown> {
  type: string;
  data: D;
  /** Optional target app name; undefined means "broadcast". */
  target?: string;
  /** Timestamp at message creation. */
  timestamp: number;
}

/** Handler for incoming messages. */
export type MessageHandler<D = unknown> = (message: ChannelMessage<D>) => void;

/** Message channel for cross-app communication. */
export interface MessageChannel {
  /** Send a message, optionally to a specific target. */
  postMessage<D = unknown>(type: string, data: D, target?: string): void;
  /** Subscribe to messages of a given type; returns cleanup. */
  onMessage<D = unknown>(type: string, handler: MessageHandler<D>): Unsubscribe;
  /** Broadcast a message to all subscribers (no target). */
  broadcast<D = unknown>(type: string, data: D): void;
}

/** Direction for store synchronisation. */
export type SyncDirection = "bidirectional" | "source-to-target" | "target-to-source";

/** Conflict resolution strategy. */
export type ConflictStrategy = "lastWrite" | "merge";

/** Options for syncStores(). */
export interface SyncOptions {
  direction?: SyncDirection;
  conflict?: ConflictStrategy;
}

/** Handle returned by syncStores — call stop() to tear down. */
export interface SyncHandle {
  stop(): void;
}

// ─── createSharedStore ────────────────────────────────────────────────────────

/**
 * Create a named reactive shared store.
 *
 * @example
 * const store = createSharedStore("counter", { count: 0 });
 * store.subscribe(s => console.log(s.count));
 * store.setState({ count: 1 });
 */
export function createSharedStore<S extends StateRecord>(
  _name: string,
  initialState: S,
): SharedStore<S> {
  let current: S = { ...initialState };
  const listeners = new Set<StateListener<S>>();

  function getState(): Readonly<S> {
    return current;
  }

  function setState(partial: Partial<S>): void {
    current = { ...current, ...partial };
    // Snapshot listeners before iterating so that unsubscriptions inside a
    // listener don't disturb the current notification round.
    for (const listener of [...listeners]) {
      listener(current);
    }
  }

  function subscribe(listener: StateListener<S>): Unsubscribe {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot(): Readonly<S> {
    return Object.freeze({ ...current });
  }

  return { getState, setState, subscribe, getSnapshot };
}

// ─── SharedStoreRegistry ─────────────────────────────────────────────────────

/**
 * Global registry for named shared stores.
 *
 * Allows any app in the federation to look up a store by name.
 */
class SharedStoreRegistryImpl implements ISharedStoreRegistry {
  private readonly stores = new Map<string, SharedStore<StateRecord>>();

  register<S extends StateRecord>(name: string, store: SharedStore<S>): void {
    this.stores.set(name, store as SharedStore<StateRecord>);
  }

  get<S extends StateRecord>(name: string): SharedStore<S> | undefined {
    return this.stores.get(name) as SharedStore<S> | undefined;
  }

  getAll(): ReadonlyMap<string, SharedStore<StateRecord>> {
    return this.stores;
  }

  unregister(name: string): void {
    this.stores.delete(name);
  }
}

/** Singleton registry shared across the federation. */
export const SharedStoreRegistry: ISharedStoreRegistry = new SharedStoreRegistryImpl();

// ─── createMessageChannel ─────────────────────────────────────────────────────

/**
 * Create an in-process message channel for cross-app communication.
 *
 * @example
 * const channel = createMessageChannel();
 * channel.onMessage("user:login", (msg) => console.log(msg.data));
 * channel.postMessage("user:login", { id: 42 });
 */
export function createMessageChannel(): MessageChannel {
  // type → set of handlers
  const handlers = new Map<string, Set<MessageHandler>>();

  function getHandlers(type: string): Set<MessageHandler> {
    let set = handlers.get(type);
    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }
    return set;
  }

  function postMessage<D = unknown>(type: string, data: D, target?: string): void {
    const envelope: ChannelMessage<D> = { type, data, target, timestamp: Date.now() };
    const set = handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      (handler as MessageHandler<D>)(envelope);
    }
  }

  function onMessage<D = unknown>(type: string, handler: MessageHandler<D>): Unsubscribe {
    getHandlers(type).add(handler as MessageHandler);
    return () => {
      const set = handlers.get(type);
      if (set) {
        set.delete(handler as MessageHandler);
        if (set.size === 0) handlers.delete(type);
      }
    };
  }

  function broadcast<D = unknown>(type: string, data: D): void {
    postMessage(type, data, undefined);
  }

  return { postMessage, onMessage, broadcast };
}

// ─── syncStores ──────────────────────────────────────────────────────────────

/**
 * Synchronise two stores.
 *
 * @param source  - The source store.
 * @param target  - The target store.
 * @param options - Sync direction and conflict resolution strategy.
 * @returns A SyncHandle with a stop() method to tear down subscriptions.
 *
 * @example
 * const handle = syncStores(storeA, storeB, { direction: "bidirectional" });
 * // …later
 * handle.stop();
 */
export function syncStores<S extends StateRecord>(
  source: SharedStore<S>,
  target: SharedStore<S>,
  options?: SyncOptions,
): SyncHandle {
  const direction: SyncDirection = options?.direction ?? "bidirectional";
  const conflict: ConflictStrategy = options?.conflict ?? "lastWrite";

  /**
   * Apply an update from `from` into `to`, respecting the conflict strategy.
   * `isSyncing` is a flag reference used to prevent echo-loops in bidirectional mode.
   */
  function applyUpdate(from: SharedStore<S>, to: SharedStore<S>, partial: Partial<S>): void {
    if (conflict === "merge") {
      // Merge: deep-spread new values on top of the existing target state.
      to.setState({ ...to.getState(), ...partial });
    } else {
      // lastWrite: the incoming partial completely overwrites matching keys.
      to.setState(partial);
    }
  }

  let cleanups: Unsubscribe[] = [];

  if (direction === "source-to-target" || direction === "bidirectional") {
    // Track previous source state to compute the delta.
    let prevSource: Readonly<S> = source.getSnapshot();

    const unsub = source.subscribe((newState) => {
      // Compute the keys that actually changed.
      const delta: Partial<S> = {};
      for (const key of Object.keys(newState) as (keyof S)[]) {
        if (newState[key] !== prevSource[key]) {
          (delta as S)[key] = newState[key];
        }
      }
      prevSource = newState;
      if (Object.keys(delta).length > 0) {
        applyUpdate(source, target, delta);
      }
    });
    cleanups.push(unsub);
  }

  if (direction === "target-to-source" || direction === "bidirectional") {
    let prevTarget: Readonly<S> = target.getSnapshot();

    const unsub = target.subscribe((newState) => {
      const delta: Partial<S> = {};
      for (const key of Object.keys(newState) as (keyof S)[]) {
        if (newState[key] !== prevTarget[key]) {
          (delta as S)[key] = newState[key];
        }
      }
      prevTarget = newState;
      if (Object.keys(delta).length > 0) {
        applyUpdate(target, source, delta);
      }
    });
    cleanups.push(unsub);
  }

  return {
    stop() {
      for (const cleanup of cleanups) cleanup();
      cleanups = [];
    },
  };
}
