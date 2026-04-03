/**
 * Built-in middleware (plugins) for @vaisx/store.
 *
 * Plugins follow the StorePlugin interface — a function that receives a
 * { store, options } context and installs side-effects on the store.
 *
 * Available plugins:
 *  - devtools(options?)  — state inspection via window.__VAISX_DEVTOOLS__
 *  - persist(options?)   — automatic localStorage persistence
 *  - logger(options?)    — console logging of every state change
 */

import type { StorePlugin, PersistOptions, LoggerOptions, DevtoolsOptions } from "./types.js";

// ─── Devtools ────────────────────────────────────────────────────────────────

/** Shape registered in the global devtools hook. */
interface DevtoolsEntry {
  id: string;
  getState: () => unknown;
  reset: () => void;
}

/** Global devtools registry placed on `window` (browser only). */
function getDevtoolsRegistry(): Map<string, DevtoolsEntry> | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const win = globalThis as Record<string, unknown>;
  if (!win["__VAISX_DEVTOOLS__"]) {
    win["__VAISX_DEVTOOLS__"] = new Map<string, DevtoolsEntry>();
  }
  const registry = win["__VAISX_DEVTOOLS__"];
  return registry instanceof Map ? registry : undefined;
}

/**
 * Create a devtools plugin that registers the store with the VaisX devtools
 * extension (window.__VAISX_DEVTOOLS__).
 */
export function devtools(options: DevtoolsOptions = {}): StorePlugin {
  return ({ store, options: storeOptions }) => {
    const registry = getDevtoolsRegistry();
    if (!registry) return;

    const entryId = options.name ?? storeOptions.id;

    const entry: DevtoolsEntry = {
      id: entryId,
      getState: () => ({ ...store.$state }),
      reset: () => store.$reset(),
    };

    registry.set(entryId, entry);

    // Update devtools whenever state changes
    store.$subscribe(() => {
      const e = registry.get(entryId);
      if (e) {
        // Devtools consumers can poll getState() or listen to a custom event
        if (typeof globalThis !== "undefined") {
          const win = globalThis as Record<string, unknown>;
          if (typeof (win["dispatchEvent"] as unknown) === "function") {
            try {
              (globalThis as Window & typeof globalThis).dispatchEvent(
                new CustomEvent("vaisx:store:update", {
                  detail: { id: entryId, state: e.getState() },
                }),
              );
            } catch {
              // non-browser environment — ignore
            }
          }
        }
      }
    });
  };
}

// ─── Persist ─────────────────────────────────────────────────────────────────

function getLocalStorage(): Storage | undefined {
  try {
    // Prefer window.localStorage (jsdom/browser) over Node.js built-in localStorage
    // which may lack getItem/setItem methods
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      return localStorage;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Create a persist plugin that saves/restores store state via localStorage.
 *
 * @param options.key      - Storage key (default: store id)
 * @param options.paths    - Subset of state keys to persist (default: all)
 * @param options.serializer - Custom serialize/deserialize pair
 */
export function persist(options: PersistOptions = {}): StorePlugin {
  return ({ store, options: storeOptions }) => {
    const storage = getLocalStorage();
    if (!storage) return;

    const storageKey = options.key ?? storeOptions.id;
    const { paths } = options;
    const serializer = options.serializer ?? {
      serialize: (s: Record<string, unknown>) => JSON.stringify(s),
      deserialize: (r: string) => JSON.parse(r) as Record<string, unknown>,
    };

    // Hydrate from storage on init
    try {
      const raw = storage.getItem(storageKey);
      if (raw !== null) {
        const saved = serializer.deserialize(raw);
        store.$patch(saved as Parameters<typeof store.$patch>[0]);
      }
    } catch {
      // Corrupt data — ignore and start fresh
    }

    // Persist on every state change
    store.$subscribe((state) => {
      try {
        let snapshot: Record<string, unknown> = state as Record<string, unknown>;
        if (paths && paths.length > 0) {
          snapshot = {};
          for (const path of paths) {
            snapshot[path] = (state as Record<string, unknown>)[path];
          }
        }
        storage.setItem(storageKey, serializer.serialize(snapshot));
      } catch {
        // Storage quota exceeded etc. — ignore
      }
    });
  };
}

// ─── Logger ──────────────────────────────────────────────────────────────────

/**
 * Create a logger plugin that logs state snapshots to the console whenever
 * the store state changes.
 *
 * @param options.logBefore - Whether to log the state before mutation (default: true)
 * @param options.log       - Custom log function (default: console.log)
 * @param options.filter    - Array of store ids to log (default: all)
 */
export function logger(options: LoggerOptions = {}): StorePlugin {
  const { logBefore = true, log = console.log, filter } = options;

  return ({ store, options: storeOptions }) => {
    const storeId = storeOptions.id;

    // Respect filter list
    if (filter && filter.length > 0 && !filter.includes(storeId)) {
      return;
    }

    store.$subscribe((state) => {
      if (logBefore) {
        log(`[vaisx:store:${storeId}]`, "state updated →", { ...state });
      } else {
        log(`[vaisx:store:${storeId}]`, "state →", { ...state });
      }
    });
  };
}

// ─── Compose helpers ─────────────────────────────────────────────────────────

/**
 * Compose multiple plugins into a single plugin.
 * Plugins are applied in the order they are provided.
 */
export function composePlugins(...plugins: StorePlugin[]): StorePlugin {
  return (context) => {
    for (const plugin of plugins) {
      plugin(context);
    }
  };
}
