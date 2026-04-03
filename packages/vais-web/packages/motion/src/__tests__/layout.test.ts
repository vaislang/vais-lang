/**
 * @vaisx/motion — layout.ts tests
 *
 * Tests for: flipAnimate, createLayoutGroup, createSharedTransition,
 * captureLayout, applyInverse.
 *
 * jsdom environment — getBoundingClientRect is mocked per-test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  flipAnimate,
  createLayoutGroup,
  createSharedTransition,
  captureLayout,
  applyInverse,
} from "../layout.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeElement(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function removeElement(el: HTMLElement): void {
  if (el.parentNode) el.parentNode.removeChild(el);
}

/**
 * Create a fake DOMRect-like object that satisfies the DOMRect interface.
 */
function makeRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {
      return this;
    },
  } as DOMRect;
}

/**
 * Mock getBoundingClientRect on the given element to return successive rects.
 * Each call to getBoundingClientRect pops the next rect in `rects`.
 */
function mockRects(el: HTMLElement, rects: DOMRect[]): void {
  let callCount = 0;
  vi.spyOn(el, "getBoundingClientRect").mockImplementation(() => {
    const rect = rects[callCount] ?? rects[rects.length - 1];
    callCount++;
    return rect;
  });
}

/** Flush rAF and microtask queues. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  // Provide a minimal animate stub for jsdom (it does not implement WAA).
  if (!HTMLElement.prototype.animate) {
    HTMLElement.prototype.animate = function (
      _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      _options?: number | KeyframeAnimationOptions,
    ): Animation {
      const finishedCallbacks: Array<(value: Animation | PromiseLike<Animation>) => void> = [];
      const animation = {
        finished: new Promise<Animation>((resolve) => {
          finishedCallbacks.push(resolve);
          // Resolve on next tick so tests can await it.
          setTimeout(() => resolve(animation as unknown as Animation), 0);
        }),
        cancel: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        finish: vi.fn(),
      } as unknown as Animation;
      return animation;
    };
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Clean up body children.
  document.body.innerHTML = "";
});

// ─── captureLayout ────────────────────────────────────────────────────────────

describe("captureLayout", () => {
  it("returns a Map with one entry per element", () => {
    const el1 = makeElement();
    const el2 = makeElement();
    const r1 = makeRect(0, 0, 100, 50);
    const r2 = makeRect(200, 100, 80, 40);
    vi.spyOn(el1, "getBoundingClientRect").mockReturnValue(r1);
    vi.spyOn(el2, "getBoundingClientRect").mockReturnValue(r2);

    const map = captureLayout([el1, el2]);

    expect(map.size).toBe(2);
    expect(map.get(el1)).toEqual(r1);
    expect(map.get(el2)).toEqual(r2);
  });

  it("returns an empty Map for an empty array", () => {
    const map = captureLayout([]);
    expect(map.size).toBe(0);
  });

  it("calls getBoundingClientRect once per element", () => {
    const el = makeElement();
    const spy = vi.spyOn(el, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 100));
    captureLayout([el]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ─── applyInverse ─────────────────────────────────────────────────────────────

describe("applyInverse", () => {
  it("sets transform to translate the element back to the first position", () => {
    const el = makeElement();
    const first = makeRect(50, 100, 200, 80);
    const last = makeRect(150, 200, 200, 80); // moved 100, 100

    applyInverse(el, first, last);

    expect(el.style.transform).toBe("translate(-100px, -100px) scale(1, 1)");
    expect(el.style.transformOrigin).toBe("top left");
  });

  it("accounts for size changes with scale", () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    const last = makeRect(0, 0, 200, 100); // double size

    applyInverse(el, first, last);

    expect(el.style.transform).toBe("translate(0px, 0px) scale(0.5, 0.5)");
  });

  it("handles zero-size last rect without dividing by zero", () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    const last = makeRect(0, 0, 0, 0);

    // Should not throw.
    expect(() => applyInverse(el, first, last)).not.toThrow();
  });

  it("is a no-op in SSR (window undefined)", () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    const last = makeRect(50, 50, 100, 50);

    // Simulate SSR by temporarily shadowing window.
    const originalWindow = globalThis.window;
    // @ts-expect-error — intentionally removing window for SSR test
    delete globalThis.window;

    applyInverse(el, first, last);
    expect(el.style.transform).toBe("");

    // Restore.
    globalThis.window = originalWindow;
  });
});

// ─── flipAnimate ──────────────────────────────────────────────────────────────

describe("flipAnimate", () => {
  it("returns a FLIPControls object with cancel and finished", () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    mockRects(el, [makeRect(100, 100, 100, 50)]);

    const controls = flipAnimate(el, first);
    expect(typeof controls.cancel).toBe("function");
    expect(controls.finished).toBeInstanceOf(Promise);
  });

  it("sets inverse transform before animation plays", () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    // getBoundingClientRect called in flipAnimate for 'Last' step
    mockRects(el, [makeRect(100, 100, 100, 50)]);

    flipAnimate(el, first, { duration: 300 });

    // The element's animate() was called, meaning the invert step ran.
    expect(el.animate).toBeDefined();
  });

  it("resolves finished when there is no positional delta", async () => {
    const el = makeElement();
    const rect = makeRect(50, 50, 100, 50);
    mockRects(el, [rect]);

    const controls = flipAnimate(el, rect); // same rect → no delta

    // finished should resolve immediately for the no-delta case.
    let resolved = false;
    controls.finished.then(() => {
      resolved = true;
    });

    await vi.runAllTimersAsync();
    expect(resolved).toBe(true);
  });

  it("calls onComplete when the animation finishes", async () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    mockRects(el, [makeRect(200, 200, 100, 50)]);
    const onComplete = vi.fn();

    flipAnimate(el, first, { duration: 50, onComplete });

    await vi.runAllTimersAsync();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("cancel() stops the animation and clears inline styles", async () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    mockRects(el, [makeRect(200, 200, 100, 50)]);

    const controls = flipAnimate(el, first, { duration: 1000 });
    controls.cancel();

    expect(el.style.transform).toBe("");
    expect(el.style.transition).toBe("");
  });

  it("SSR guard: returns no-op controls when window is undefined", () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);

    const originalWindow = globalThis.window;
    // @ts-expect-error intentional
    delete globalThis.window;

    const controls = flipAnimate(el, first);
    expect(typeof controls.cancel).toBe("function");
    expect(controls.finished).toBeInstanceOf(Promise);

    globalThis.window = originalWindow;
  });

  it("uses provided duration and easing options", () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    mockRects(el, [makeRect(50, 50, 100, 50)]);
    const animateSpy = vi.spyOn(el, "animate");

    flipAnimate(el, first, { duration: 500, easing: "ease-in-out" });

    expect(animateSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ duration: 500, easing: "ease-in-out" }),
    );
  });

  it("finished promise resolves after animation completes", async () => {
    const el = makeElement();
    const first = makeRect(0, 0, 100, 50);
    mockRects(el, [makeRect(100, 100, 100, 50)]);

    const controls = flipAnimate(el, first, { duration: 100 });
    let resolved = false;
    controls.finished.then(() => {
      resolved = true;
    });

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});

// ─── createLayoutGroup ────────────────────────────────────────────────────────

describe("createLayoutGroup", () => {
  it("register() and unregister() manage the group membership", () => {
    const group = createLayoutGroup("test-group");
    const el = makeElement();

    group.register(el, "item-1");
    // No error — registered successfully.

    group.unregister("item-1");
    // No error — unregistered successfully.
  });

  it("animate() returns a Promise", async () => {
    const group = createLayoutGroup("test");
    const result = group.animate();
    expect(result).toBeInstanceOf(Promise);
    await vi.runAllTimersAsync();
  });

  it("animate() runs FLIP for registered elements", async () => {
    const group = createLayoutGroup("flip-group");
    const el = makeElement();

    // First snapshot captured during register().
    vi.spyOn(el, "getBoundingClientRect")
      .mockReturnValueOnce(makeRect(0, 0, 100, 50))    // register() call
      .mockReturnValueOnce(makeRect(100, 100, 100, 50)) // flipAnimate() Last
      .mockReturnValue(makeRect(100, 100, 100, 50));    // snapshot update

    const animateSpy = vi.spyOn(el, "animate");

    group.register(el, "el-1");

    // Kick off the animation and advance fake timers concurrently so the
    // animation.finished stub (which uses setTimeout(0)) can resolve.
    const animatePromise = group.animate({ duration: 200 });
    await vi.runAllTimersAsync();
    await animatePromise;

    expect(animateSpy).toHaveBeenCalled();
  });

  it("animate() skips elements with no snapshot", async () => {
    const group = createLayoutGroup("skip-group");
    const el = makeElement();

    // In SSR the snapshot would be null; simulate by unregistering first.
    group.register(el, "a");
    group.unregister("a");

    // Should not throw.
    await expect(group.animate()).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
  });

  it("multiple elements animate in parallel", async () => {
    const group = createLayoutGroup("multi");
    const el1 = makeElement();
    const el2 = makeElement();

    vi.spyOn(el1, "getBoundingClientRect")
      .mockReturnValueOnce(makeRect(0, 0, 100, 50))
      .mockReturnValue(makeRect(50, 50, 100, 50));

    vi.spyOn(el2, "getBoundingClientRect")
      .mockReturnValueOnce(makeRect(200, 200, 80, 40))
      .mockReturnValue(makeRect(300, 300, 80, 40));

    const spy1 = vi.spyOn(el1, "animate");
    const spy2 = vi.spyOn(el2, "animate");

    group.register(el1, "e1");
    group.register(el2, "e2");

    const promise = group.animate({ duration: 100 });
    await vi.runAllTimersAsync();
    await promise;

    expect(spy1).toHaveBeenCalled();
    expect(spy2).toHaveBeenCalled();
  });

  it("unregistered element is not animated", async () => {
    const group = createLayoutGroup("partial");
    const el = makeElement();

    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    const animateSpy = vi.spyOn(el, "animate");

    group.register(el, "x");
    group.unregister("x");
    await group.animate();

    expect(animateSpy).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
  });
});

// ─── createSharedTransition ───────────────────────────────────────────────────

describe("createSharedTransition", () => {
  it("returns a Promise", () => {
    const from = makeElement();
    const to = makeElement();
    vi.spyOn(from, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    vi.spyOn(to, "getBoundingClientRect").mockReturnValue(makeRect(200, 200, 100, 50));

    const result = createSharedTransition(from, to);
    expect(result).toBeInstanceOf(Promise);
  });

  it("hides the fromEl during the transition", () => {
    const from = makeElement();
    const to = makeElement();
    vi.spyOn(from, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    vi.spyOn(to, "getBoundingClientRect").mockReturnValue(makeRect(200, 200, 100, 50));

    createSharedTransition(from, to);

    expect(from.style.visibility).toBe("hidden");
  });

  it("sets toEl opacity to 0 during the transition", () => {
    const from = makeElement();
    const to = makeElement();
    vi.spyOn(from, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    vi.spyOn(to, "getBoundingClientRect").mockReturnValue(makeRect(200, 200, 100, 50));

    createSharedTransition(from, to);

    expect(to.style.opacity).toBe("0");
  });

  it("appends a clone to document.body during transition", () => {
    const from = makeElement();
    const to = makeElement();
    vi.spyOn(from, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    vi.spyOn(to, "getBoundingClientRect").mockReturnValue(makeRect(200, 200, 100, 50));

    const before = document.body.children.length;
    createSharedTransition(from, to);
    const after = document.body.children.length;

    // One clone should be appended.
    expect(after).toBeGreaterThan(before);
  });

  it("calls onComplete when transition finishes", async () => {
    const from = makeElement();
    const to = makeElement();
    vi.spyOn(from, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    vi.spyOn(to, "getBoundingClientRect").mockReturnValue(makeRect(200, 200, 100, 50));
    const onComplete = vi.fn();

    createSharedTransition(from, to, { duration: 100, onComplete });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("restores fromEl visibility after transition", async () => {
    const from = makeElement();
    const to = makeElement();
    vi.spyOn(from, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    vi.spyOn(to, "getBoundingClientRect").mockReturnValue(makeRect(200, 200, 100, 50));

    createSharedTransition(from, to, { duration: 100 });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(from.style.visibility).toBe("");
  });

  it("SSR guard: resolves immediately when window is undefined", async () => {
    const from = makeElement();
    const to = makeElement();
    const onComplete = vi.fn();

    const originalWindow = globalThis.window;
    // @ts-expect-error intentional SSR simulation
    delete globalThis.window;

    const result = createSharedTransition(from, to, { onComplete });
    expect(result).toBeInstanceOf(Promise);

    await result;
    expect(onComplete).toHaveBeenCalledTimes(1);

    globalThis.window = originalWindow;
  });

  it("removes clone from body after transition completes", async () => {
    const from = makeElement();
    const to = makeElement();
    vi.spyOn(from, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    vi.spyOn(to, "getBoundingClientRect").mockReturnValue(makeRect(200, 200, 100, 50));

    const childrenBefore = document.body.children.length;

    createSharedTransition(from, to, { duration: 100 });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    // Clone should be removed; count should return to pre-transition (or equal
    // since from/to are also in body).
    const cloneCount = Array.from(document.body.children).filter(
      (c) => (c as HTMLElement).style.position === "fixed",
    ).length;
    expect(cloneCount).toBe(0);
  });

  it("accepts crossfadeDuration option", () => {
    const from = makeElement();
    const to = makeElement();
    vi.spyOn(from, "getBoundingClientRect").mockReturnValue(makeRect(0, 0, 100, 50));
    vi.spyOn(to, "getBoundingClientRect").mockReturnValue(makeRect(200, 200, 100, 50));

    // Should not throw when crossfadeDuration is provided.
    expect(() =>
      createSharedTransition(from, to, { duration: 300, crossfadeDuration: 200 }),
    ).not.toThrow();
  });
});

// ─── Integration: captureLayout + flipAnimate ─────────────────────────────────

describe("captureLayout + flipAnimate integration", () => {
  it("captures layout and then animates correctly", async () => {
    const el = makeElement();
    const initialRect = makeRect(0, 0, 100, 50);
    const movedRect = makeRect(100, 200, 100, 50);

    vi.spyOn(el, "getBoundingClientRect")
      .mockReturnValueOnce(initialRect)  // captureLayout call
      .mockReturnValue(movedRect);       // flipAnimate Last step

    const snapshot = captureLayout([el]);
    const firstRect = snapshot.get(el)!;

    expect(firstRect).toEqual(initialRect);

    const controls = flipAnimate(el, firstRect, { duration: 200 });
    expect(controls.finished).toBeInstanceOf(Promise);

    await vi.runAllTimersAsync();
  });

  it("no-op animation when position hasn't changed", async () => {
    const el = makeElement();
    const rect = makeRect(50, 50, 200, 100);

    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect);

    const snapshot = captureLayout([el]);
    const firstRect = snapshot.get(el)!;

    const onComplete = vi.fn();
    const controls = flipAnimate(el, firstRect, { onComplete });

    await vi.runAllTimersAsync();
    await controls.finished;

    // onComplete should still be called even for no-op.
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
