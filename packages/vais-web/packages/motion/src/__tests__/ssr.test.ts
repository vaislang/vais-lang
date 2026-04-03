/**
 * Tests for packages/motion/src/ssr.ts
 *
 * The vitest environment is "jsdom", so `window` is defined by default.
 * To test SSR paths we temporarily delete `window` and restore it after each test.
 */

import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  isSSR,
  createSSRSafeAnimate,
  createSSRSafeTransition,
  onHydrated,
  reduceMotion,
  MotionProvider,
} from "../ssr.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Temporarily remove window to simulate an SSR environment. */
function simulateSSR(): () => void {
  const original = globalThis.window;
  // @ts-expect-error intentionally deleting window for SSR simulation
  delete globalThis.window;
  return () => {
    globalThis.window = original;
  };
}

// ─── isSSR() ────────────────────────────────────────────────────────────────────

describe("isSSR()", () => {
  it("returns false in a browser-like (jsdom) environment", () => {
    expect(isSSR()).toBe(false);
  });

  it("returns true when window is undefined (SSR)", () => {
    const restore = simulateSSR();
    try {
      expect(isSSR()).toBe(true);
    } finally {
      restore();
    }
  });
});

// ─── createSSRSafeAnimate() ──────────────────────────────────────────────────────

describe("createSSRSafeAnimate()", () => {
  it("returns a function", () => {
    const animate = createSSRSafeAnimate();
    expect(typeof animate).toBe("function");
  });

  it("returns a stub AnimationControls on the server (SSR)", () => {
    const restore = simulateSSR();
    try {
      const animate = createSSRSafeAnimate();
      // We need a fake Element — use a plain object that satisfies Element enough.
      const fakeEl = document.createElement("div");
      const controls = animate(fakeEl, [{ opacity: "0" }, { opacity: "1" }]);

      // All methods must be callable without throwing.
      expect(() => controls.play()).not.toThrow();
      expect(() => controls.pause()).not.toThrow();
      expect(() => controls.cancel()).not.toThrow();
      expect(() => controls.finish()).not.toThrow();
      expect(() => controls.reverse()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("stub AnimationControls.finished resolves immediately on the server", async () => {
    const restore = simulateSSR();
    try {
      const animate = createSSRSafeAnimate();
      const fakeEl = document.createElement("div");
      const controls = animate(fakeEl, []);
      await expect(controls.finished).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it("delegates to real animate on the client and returns AnimationControls", () => {
    const animate = createSSRSafeAnimate();
    const el = document.createElement("div");
    document.body.appendChild(el);

    const controls = animate(el, [{ opacity: "0" }, { opacity: "1" }], { duration: 100 });

    expect(typeof controls.play).toBe("function");
    expect(typeof controls.pause).toBe("function");
    expect(typeof controls.cancel).toBe("function");
    expect(controls.finished).toBeInstanceOf(Promise);

    controls.cancel();
    document.body.removeChild(el);
  });
});

// ─── createSSRSafeTransition() ────────────────────────────────────────────────

describe("createSSRSafeTransition()", () => {
  it("returns a TransitionHandle with enter / leave / destroy on the client", () => {
    const handle = createSSRSafeTransition({ enter: "fade-enter", leave: "fade-leave" });
    expect(typeof handle.enter).toBe("function");
    expect(typeof handle.leave).toBe("function");
    expect(typeof handle.destroy).toBe("function");
  });

  it("stub enter() resolves immediately on the server", async () => {
    const restore = simulateSSR();
    try {
      const handle = createSSRSafeTransition();
      const el = document.createElement("div");
      await expect(handle.enter(el)).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it("stub leave() resolves immediately on the server", async () => {
    const restore = simulateSSR();
    try {
      const handle = createSSRSafeTransition();
      const el = document.createElement("div");
      await expect(handle.leave(el)).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it("stub destroy() does not throw on the server", () => {
    const restore = simulateSSR();
    try {
      const handle = createSSRSafeTransition();
      expect(() => handle.destroy()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("client enter() returns a Promise", async () => {
    const handle = createSSRSafeTransition({ duration: 0 });
    const el = document.createElement("div");
    document.body.appendChild(el);

    const result = handle.enter(el);
    expect(result).toBeInstanceOf(Promise);
    handle.destroy();
    document.body.removeChild(el);
  });

  it("client leave() returns a Promise", async () => {
    const handle = createSSRSafeTransition({ duration: 0 });
    const el = document.createElement("div");
    document.body.appendChild(el);

    const result = handle.leave(el);
    expect(result).toBeInstanceOf(Promise);
    handle.destroy();
    document.body.removeChild(el);
  });
});

// ─── onHydrated() ───────────────────────────────────────────────────────────────

describe("onHydrated()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT execute the callback immediately on the server (SSR)", () => {
    const restore = simulateSSR();
    const cb = vi.fn();
    try {
      onHydrated(cb);
      expect(cb).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("defers the callback asynchronously on the client via setTimeout", async () => {
    const cb = vi.fn();
    onHydrated(cb);

    // Callback should not be called synchronously.
    expect(cb).not.toHaveBeenCalled();

    // Advance timers to flush the deferred callback.
    vi.runAllTimers();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("supports multiple callbacks on the client", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    onHydrated(cb1);
    onHydrated(cb2);
    vi.runAllTimers();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

// ─── reduceMotion() ──────────────────────────────────────────────────────────────

describe("reduceMotion()", () => {
  it("returns false on the server (SSR)", () => {
    const restore = simulateSSR();
    try {
      expect(reduceMotion()).toBe(false);
    } finally {
      restore();
    }
  });

  it("returns false when matchMedia is unavailable", () => {
    const original = window.matchMedia;
    // @ts-expect-error intentionally removing matchMedia
    delete window.matchMedia;
    try {
      expect(reduceMotion()).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it("returns false when prefers-reduced-motion does not match", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    try {
      expect(reduceMotion()).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it("returns true when prefers-reduced-motion: reduce is active", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    try {
      expect(reduceMotion()).toBe(true);
    } finally {
      window.matchMedia = original;
    }
  });
});

// ─── MotionProvider ──────────────────────────────────────────────────────────────

describe("MotionProvider", () => {
  it("exposes isSSR function", () => {
    expect(typeof MotionProvider.isSSR).toBe("function");
  });

  it("exposes animate function", () => {
    expect(typeof MotionProvider.animate).toBe("function");
  });

  it("exposes transition function", () => {
    expect(typeof MotionProvider.transition).toBe("function");
  });

  it("exposes onHydrated function", () => {
    expect(typeof MotionProvider.onHydrated).toBe("function");
  });

  it("MotionProvider.isSSR() returns false in jsdom", () => {
    expect(MotionProvider.isSSR()).toBe(false);
  });

  it("MotionProvider.isSSR() returns true when window is undefined", () => {
    const restore = simulateSSR();
    try {
      expect(MotionProvider.isSSR()).toBe(true);
    } finally {
      restore();
    }
  });

  it("MotionProvider.animate returns stub controls on the server", () => {
    const restore = simulateSSR();
    try {
      const el = document.createElement("div");
      const controls = MotionProvider.animate(el, []);
      expect(() => controls.play()).not.toThrow();
      expect(controls.finished).toBeInstanceOf(Promise);
    } finally {
      restore();
    }
  });

  it("MotionProvider.transition returns a stub TransitionHandle on the server", async () => {
    const restore = simulateSSR();
    try {
      const handle = MotionProvider.transition();
      const el = document.createElement("div");
      await expect(handle.enter(el)).resolves.toBeUndefined();
      await expect(handle.leave(el)).resolves.toBeUndefined();
      expect(() => handle.destroy()).not.toThrow();
    } finally {
      restore();
    }
  });
});
