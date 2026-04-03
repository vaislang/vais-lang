/**
 * EventBus — lightweight publish/subscribe bus for cross-remote communication.
 *
 * Supports persistent listeners (on/off) and one-shot listeners (once).
 * Handlers are invoked synchronously in registration order.
 */

import type { EventBus, EventHandler } from "./types.js";

// ─── Internal handler set ────────────────────────────────────────────────────

interface InternalHandler<T = unknown> {
  fn: EventHandler<T>;
  /** When true this handler is removed after its first invocation. */
  once: boolean;
}

// ─── createEventBus ──────────────────────────────────────────────────────────

/**
 * Create a new EventBus instance.
 *
 * Each bus maintains its own isolated handler registry so multiple buses
 * can coexist without interference.
 *
 * @example
 * const bus = createEventBus();
 * bus.on("remote:loaded", (data) => console.log(data));
 * bus.emit("remote:loaded", { name: "shop" });
 */
export function createEventBus(): EventBus {
  // Registry: event name → ordered list of handlers.
  const registry = new Map<string, InternalHandler[]>();

  /**
   * Return the handler list for an event, creating it on first access.
   */
  function getHandlers(event: string): InternalHandler[] {
    let handlers = registry.get(event);
    if (!handlers) {
      handlers = [];
      registry.set(event, handlers);
    }
    return handlers;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function on<T = unknown>(event: string, handler: EventHandler<T>): void {
    getHandlers(event).push({ fn: handler as EventHandler, once: false });
  }

  function off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const handlers = registry.get(event);
    if (!handlers) return;

    const index = handlers.findIndex((h) => h.fn === (handler as EventHandler));
    if (index !== -1) {
      handlers.splice(index, 1);
    }

    // Clean up empty lists to avoid memory leaks.
    if (handlers.length === 0) {
      registry.delete(event);
    }
  }

  function once<T = unknown>(event: string, handler: EventHandler<T>): void {
    getHandlers(event).push({ fn: handler as EventHandler, once: true });
  }

  function emit<T = unknown>(event: string, data: T): void {
    const handlers = registry.get(event);
    if (!handlers || handlers.length === 0) return;

    // Snapshot the list before iterating so that once-handlers removed
    // mid-iteration don't affect the current call.
    const snapshot = [...handlers];

    // Remove all once-handlers before invoking (prevents double-removal issues
    // when a handler itself calls emit).
    const remaining = handlers.filter((h) => !h.once);
    registry.set(event, remaining);
    if (remaining.length === 0) {
      registry.delete(event);
    }

    for (const handler of snapshot) {
      handler.fn(data as unknown);
    }
  }

  return { emit, on, off, once };
}
