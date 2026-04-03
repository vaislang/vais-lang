/**
 * @vaisx/query — RefetchManager tests
 *
 * All tests run in a jsdom environment (see vitest.config.ts).
 * Browser events are simulated with window.dispatchEvent().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RefetchManager } from "../refetch.js";
import type { AutoRefetchHandle } from "../refetch.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fireFocus(): void {
  window.dispatchEvent(new Event("focus"));
}

function fireOnline(): void {
  window.dispatchEvent(new Event("online"));
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// onWindowFocus
// ─────────────────────────────────────────────────────────────────────────────

describe("RefetchManager.onWindowFocus", () => {
  it("calls the callback when the window gains focus", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onWindowFocus(cb);

    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("calls the callback multiple times on repeated focus events", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onWindowFocus(cb);

    fireFocus();
    fireFocus();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(3);

    cleanup();
  });

  it("stops calling callback after cleanup is invoked", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onWindowFocus(cb);

    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);

    cleanup();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1); // no additional calls
  });

  it("returns a function as the cleanup", () => {
    const cleanup = RefetchManager.onWindowFocus(vi.fn());
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("multiple independent listeners do not interfere", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const c1 = RefetchManager.onWindowFocus(cb1);
    const c2 = RefetchManager.onWindowFocus(cb2);

    fireFocus();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    c1();
    fireFocus();
    expect(cb1).toHaveBeenCalledTimes(1); // no new call
    expect(cb2).toHaveBeenCalledTimes(2); // still active

    c2();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onInterval
// ─────────────────────────────────────────────────────────────────────────────

describe("RefetchManager.onInterval", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("calls the callback after the specified interval", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onInterval(cb, 1000);

    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("calls the callback multiple times over multiple intervals", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onInterval(cb, 500);

    vi.advanceTimersByTime(2500);
    expect(cb).toHaveBeenCalledTimes(5);

    cleanup();
  });

  it("stops calling callback after cleanup is invoked", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onInterval(cb, 1000);

    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);

    cleanup();
    vi.advanceTimersByTime(3000);
    expect(cb).toHaveBeenCalledTimes(1); // no additional calls
  });

  it("does not call callback before the first interval elapses", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onInterval(cb, 1000);

    vi.advanceTimersByTime(999);
    expect(cb).toHaveBeenCalledTimes(0);

    cleanup();
  });

  it("returns a function as the cleanup", () => {
    const cleanup = RefetchManager.onInterval(vi.fn(), 1000);
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("does nothing when ms is 0", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onInterval(cb, 0);

    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(0);

    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// onReconnect
// ─────────────────────────────────────────────────────────────────────────────

describe("RefetchManager.onReconnect", () => {
  it("calls the callback when the network comes online", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onReconnect(cb);

    fireOnline();
    expect(cb).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("calls the callback multiple times on repeated online events", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onReconnect(cb);

    fireOnline();
    fireOnline();
    expect(cb).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it("stops calling callback after cleanup is invoked", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onReconnect(cb);

    fireOnline();
    expect(cb).toHaveBeenCalledTimes(1);

    cleanup();
    fireOnline();
    expect(cb).toHaveBeenCalledTimes(1); // no additional calls
  });

  it("returns a function as the cleanup", () => {
    const cleanup = RefetchManager.onReconnect(vi.fn());
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("does not react to offline events — only online", () => {
    const cb = vi.fn();
    const cleanup = RefetchManager.onReconnect(cb);

    window.dispatchEvent(new Event("offline"));
    expect(cb).toHaveBeenCalledTimes(0);

    fireOnline();
    expect(cb).toHaveBeenCalledTimes(1);

    cleanup();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createAutoRefetch — window focus trigger
// ─────────────────────────────────────────────────────────────────────────────

describe("createAutoRefetch — refetchOnWindowFocus", () => {
  it("triggers callback on window focus when refetchOnWindowFocus is true", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnWindowFocus: true });

    handle.start();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  it("does not trigger callback on focus when refetchOnWindowFocus is false", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnWindowFocus: false });

    handle.start();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(0);

    handle.destroy();
  });

  it("stops focus trigger after stop() is called", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnWindowFocus: true });

    handle.start();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);

    handle.stop();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);

    handle.destroy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createAutoRefetch — interval trigger
// ─────────────────────────────────────────────────────────────────────────────

describe("createAutoRefetch — refetchInterval", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("triggers callback on interval when refetchInterval is set", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchInterval: 2000 });

    handle.start();
    vi.advanceTimersByTime(6000);
    expect(cb).toHaveBeenCalledTimes(3);

    handle.destroy();
  });

  it("does not trigger interval callback when refetchInterval is false", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchInterval: false });

    handle.start();
    vi.advanceTimersByTime(10000);
    expect(cb).toHaveBeenCalledTimes(0);

    handle.destroy();
  });

  it("stops interval callbacks after stop() is called", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchInterval: 1000 });

    handle.start();
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);

    handle.stop();
    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(1);

    handle.destroy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createAutoRefetch — reconnect trigger
// ─────────────────────────────────────────────────────────────────────────────

describe("createAutoRefetch — refetchOnReconnect", () => {
  it("triggers callback on network reconnect when refetchOnReconnect is true", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnReconnect: true });

    handle.start();
    fireOnline();
    expect(cb).toHaveBeenCalledTimes(1);

    handle.destroy();
  });

  it("does not trigger callback on reconnect when refetchOnReconnect is false", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnReconnect: false });

    handle.start();
    fireOnline();
    expect(cb).toHaveBeenCalledTimes(0);

    handle.destroy();
  });

  it("stops reconnect trigger after stop() is called", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnReconnect: true });

    handle.start();
    fireOnline();
    expect(cb).toHaveBeenCalledTimes(1);

    handle.stop();
    fireOnline();
    expect(cb).toHaveBeenCalledTimes(1);

    handle.destroy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createAutoRefetch — combined / lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("createAutoRefetch — lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("all three triggers work simultaneously when all options are enabled", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, {
      refetchOnWindowFocus: true,
      refetchInterval: 1000,
      refetchOnReconnect: true,
    });

    handle.start();

    fireFocus();                    // +1
    vi.advanceTimersByTime(2000);   // +2
    fireOnline();                   // +1
    expect(cb).toHaveBeenCalledTimes(4);

    handle.destroy();
  });

  it("does not trigger before start() is called", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });

    // NOT started yet
    fireFocus();
    fireOnline();
    expect(cb).toHaveBeenCalledTimes(0);

    handle.destroy();
  });

  it("can be restarted after stop()", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnWindowFocus: true });

    handle.start();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);

    handle.stop();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1); // paused

    handle.start();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(2); // resumed

    handle.destroy();
  });

  it("destroy() prevents further callbacks even if start() is called again", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnWindowFocus: true });

    handle.start();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);

    handle.destroy();
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("calling stop() when not running is a no-op", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnWindowFocus: true });

    expect(() => handle.stop()).not.toThrow();
    handle.destroy();
  });

  it("calling start() multiple times does not double-register listeners", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb, { refetchOnWindowFocus: true });

    handle.start();
    handle.start(); // second call should be a no-op
    fireFocus();
    expect(cb).toHaveBeenCalledTimes(1); // not 2

    handle.destroy();
  });

  it("default options enable window focus and reconnect, disable interval", () => {
    const cb = vi.fn();
    const handle = RefetchManager.createAutoRefetch(cb); // no options → defaults

    handle.start();

    fireFocus();     // should trigger (refetchOnWindowFocus defaults to true)
    fireOnline();    // should trigger (refetchOnReconnect defaults to true)
    vi.advanceTimersByTime(10000); // should NOT trigger (interval defaults to false)

    expect(cb).toHaveBeenCalledTimes(2);

    handle.destroy();
  });

  it("handle returned by createAutoRefetch has start, stop, destroy methods", () => {
    const handle: AutoRefetchHandle = RefetchManager.createAutoRefetch(vi.fn());
    expect(typeof handle.start).toBe("function");
    expect(typeof handle.stop).toBe("function");
    expect(typeof handle.destroy).toBe("function");
    handle.destroy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSR safety
// ─────────────────────────────────────────────────────────────────────────────

describe("RefetchManager — SSR safety (simulated)", () => {
  it("onWindowFocus returns a no-op when window is undefined", () => {
    // Temporarily shadow window to simulate SSR
    const originalWindow = globalThis.window;
    // @ts-expect-error intentional undefined for SSR simulation
    delete globalThis.window;

    try {
      const cb = vi.fn();
      let cleanup!: () => void;
      expect(() => {
        cleanup = RefetchManager.onWindowFocus(cb);
      }).not.toThrow();
      expect(typeof cleanup).toBe("function");
      expect(() => cleanup()).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("onInterval returns a no-op when window is undefined", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error intentional undefined for SSR simulation
    delete globalThis.window;

    try {
      const cb = vi.fn();
      let cleanup!: () => void;
      expect(() => {
        cleanup = RefetchManager.onInterval(cb, 1000);
      }).not.toThrow();
      expect(typeof cleanup).toBe("function");
      expect(() => cleanup()).not.toThrow();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("onReconnect returns a no-op when window is undefined", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error intentional undefined for SSR simulation
    delete globalThis.window;

    try {
      const cb = vi.fn();
      let cleanup!: () => void;
      expect(() => {
        cleanup = RefetchManager.onReconnect(cb);
      }).not.toThrow();
      expect(typeof cleanup).toBe("function");
      expect(() => cleanup()).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("createAutoRefetch.start() is safe when window is undefined", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error intentional undefined for SSR simulation
    delete globalThis.window;

    try {
      const cb = vi.fn();
      let handle!: ReturnType<typeof RefetchManager.createAutoRefetch>;
      expect(() => {
        handle = RefetchManager.createAutoRefetch(cb, {
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
        });
        handle.start();
      }).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
      handle.destroy();
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
