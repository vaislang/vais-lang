/**
 * @vaisx/query — RefetchManager
 *
 * Provides automatic refetch triggers for window focus, polling intervals,
 * and network reconnection events.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** A function that removes an event listener or clears a timer. */
export type Cleanup = () => void;

/** Options for createAutoRefetch(). */
export interface AutoRefetchOptions {
  /**
   * Whether to trigger a refetch when the window regains focus.
   * @default true
   */
  refetchOnWindowFocus?: boolean;

  /**
   * Interval in milliseconds for periodic refetching.
   * Set to false or 0 to disable.
   * @default false
   */
  refetchInterval?: number | false;

  /**
   * Whether to trigger a refetch when the network comes back online.
   * @default true
   */
  refetchOnReconnect?: boolean;
}

/** Handle returned by createAutoRefetch(). */
export interface AutoRefetchHandle {
  /** Attach all configured event listeners / timers. */
  start(): void;

  /** Detach all event listeners / timers without destroying the handle. */
  stop(): void;

  /**
   * Permanently clean up all resources.
   * The handle must not be used after destroy() is called.
   */
  destroy(): void;
}

// ── SSR guard ─────────────────────────────────────────────────────────────────

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// ── RefetchManager ────────────────────────────────────────────────────────────

/**
 * Low-level utilities and a high-level factory for automatic refetch triggers.
 *
 * All methods that attach browser events are no-ops (and return a no-op
 * cleanup) when running in an SSR environment (typeof window === "undefined").
 */
export class RefetchManager {
  // ── Individual trigger registrations ────────────────────────────────────────

  /**
   * Calls `callback` whenever the browser window receives the "focus" event.
   *
   * @returns A cleanup function that removes the event listener.
   */
  static onWindowFocus(callback: () => void): Cleanup {
    if (!isBrowser()) {
      return () => {};
    }

    const handler = () => callback();
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }

  /**
   * Calls `callback` on a repeating `ms`-millisecond interval.
   *
   * @returns A cleanup function that clears the interval.
   */
  static onInterval(callback: () => void, ms: number): Cleanup {
    if (!isBrowser() || ms <= 0) {
      return () => {};
    }

    const id = setInterval(() => callback(), ms);
    return () => clearInterval(id);
  }

  /**
   * Calls `callback` when the browser's "online" event fires (network
   * reconnection detected via `navigator.onLine`).
   *
   * @returns A cleanup function that removes the event listener.
   */
  static onReconnect(callback: () => void): Cleanup {
    if (!isBrowser()) {
      return () => {};
    }

    const handler = () => callback();
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }

  // ── High-level factory ───────────────────────────────────────────────────────

  /**
   * Creates an {@link AutoRefetchHandle} that combines window-focus, interval,
   * and reconnect triggers into a single start/stop/destroy lifecycle.
   *
   * @param callback - The refetch function to invoke on each trigger.
   * @param options  - Which triggers to enable.
   */
  static createAutoRefetch(
    callback: () => void,
    options: AutoRefetchOptions = {},
  ): AutoRefetchHandle {
    const {
      refetchOnWindowFocus = true,
      refetchInterval = false,
      refetchOnReconnect = true,
    } = options;

    let cleanups: Cleanup[] = [];
    let running = false;

    const start = (): void => {
      if (running) return;
      running = true;

      if (refetchOnWindowFocus) {
        cleanups.push(RefetchManager.onWindowFocus(callback));
      }

      if (refetchInterval && refetchInterval > 0) {
        cleanups.push(RefetchManager.onInterval(callback, refetchInterval));
      }

      if (refetchOnReconnect) {
        cleanups.push(RefetchManager.onReconnect(callback));
      }
    };

    const stop = (): void => {
      if (!running) return;
      running = false;

      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups = [];
    };

    const destroy = (): void => {
      stop();
    };

    return { start, stop, destroy };
  }
}
