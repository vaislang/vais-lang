/**
 * gesture.test.ts — unit tests for drag, swipe, and pinch gesture primitives.
 *
 * Environment: jsdom (PointerEvent / Touch mocked when not natively available).
 * We simulate pointer / touch sequences by dispatching events directly on
 * elements and on `window`.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import {
  createDragGesture,
  createSwipeGesture,
  createPinchGesture,
  type GestureState,
} from "../gesture.js";

// ─── Global mocks (PointerEvent / Touch) ─────────────────────────────────────

beforeAll(() => {
  // Mock PointerEvent if jsdom does not provide it.
  if (typeof globalThis.PointerEvent === "undefined") {
    class MockPointerEvent extends MouseEvent {
      constructor(type: string, init?: PointerEventInit) {
        super(type, { bubbles: true, cancelable: true, ...init });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).PointerEvent = MockPointerEvent;
  }

  // Mock Touch if jsdom does not provide it.
  if (typeof globalThis.Touch === "undefined") {
    class MockTouch {
      identifier: number;
      target: EventTarget;
      clientX: number;
      clientY: number;
      constructor(init: {
        identifier: number;
        target: EventTarget;
        clientX: number;
        clientY: number;
      }) {
        this.identifier = init.identifier;
        this.target = init.target;
        this.clientX = init.clientX;
        this.clientY = init.clientY;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Touch = MockTouch;
  }

  // Mock TouchEvent if jsdom does not provide it.
  if (typeof globalThis.TouchEvent === "undefined") {
    class MockTouchEvent extends Event {
      touches: TouchList;
      changedTouches: TouchList;
      constructor(
        type: string,
        init?: { touches?: Touch[]; changedTouches?: Touch[]; bubbles?: boolean; cancelable?: boolean },
      ) {
        super(type, { bubbles: init?.bubbles ?? true, cancelable: init?.cancelable ?? true });
        // Convert array to TouchList-like structure.
        const toTouchList = (arr: Touch[] = []): TouchList => {
          const list = [...arr] as unknown as TouchList;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (list as any).item = (i: number) => arr[i] ?? null;
          Object.defineProperty(list, "length", { get: () => arr.length });
          return list;
        };
        this.touches = toTouchList(init?.touches);
        this.changedTouches = toTouchList(init?.changedTouches);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).TouchEvent = MockTouchEvent;
  }
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeEl(): HTMLElement {
  return document.createElement("div");
}

/** Fire a PointerEvent on a target. */
function firePointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Build a Touch array for use in TouchEvent. */
function makeTouches(
  points: Array<{ x: number; y: number; id?: number }>,
): Touch[] {
  return points.map(
    ({ x, y, id = 0 }) =>
      new Touch({
        identifier: id,
        target: document.body,
        clientX: x,
        clientY: y,
      }),
  );
}

function fireTouchEvent(
  target: EventTarget,
  type: string,
  touches: Touch[],
): void {
  target.dispatchEvent(
    new TouchEvent(type, {
      touches,
      changedTouches: touches,
      bubbles: true,
      cancelable: true,
    }),
  );
}

// ─── GestureState shape ───────────────────────────────────────────────────────

describe("GestureState shape", () => {
  it("drag state has all required fields", () => {
    const el = makeEl();
    let capturedState: GestureState | undefined;
    const cleanup = createDragGesture(el, {
      onDragStart: (s) => {
        capturedState = s;
      },
    });
    firePointer(el, "pointerdown", 10, 20);
    expect(capturedState).toBeDefined();
    expect(typeof capturedState!.x).toBe("number");
    expect(typeof capturedState!.y).toBe("number");
    expect(typeof capturedState!.dx).toBe("number");
    expect(typeof capturedState!.dy).toBe("number");
    expect(typeof capturedState!.velocity).toBe("number");
    expect(typeof capturedState!.scale).toBe("number");
    expect(typeof capturedState!.active).toBe("boolean");
    cleanup();
  });
});

// ─── createDragGesture ────────────────────────────────────────────────────────

describe("createDragGesture", () => {
  let el: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    el = makeEl();
  });
  afterEach(() => {
    cleanup?.();
  });

  it("fires onDragStart on pointerdown", () => {
    const onDragStart = vi.fn();
    cleanup = createDragGesture(el, { onDragStart });
    firePointer(el, "pointerdown", 100, 200);
    expect(onDragStart).toHaveBeenCalledOnce();
    const state: GestureState = onDragStart.mock.calls[0][0];
    expect(state.active).toBe(true);
    expect(state.x).toBe(100);
    expect(state.y).toBe(200);
  });

  it("fires onDrag on pointermove after pointerdown", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, { onDrag });
    firePointer(el, "pointerdown", 0, 0);
    firePointer(window, "pointermove", 30, 40);
    expect(onDrag).toHaveBeenCalledOnce();
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.dx).toBe(30);
    expect(state.dy).toBe(40);
  });

  it("does not fire onDrag if drag has not started", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, { onDrag });
    firePointer(window, "pointermove", 50, 50);
    expect(onDrag).not.toHaveBeenCalled();
  });

  it("fires onDragEnd on pointerup", () => {
    const onDragEnd = vi.fn();
    cleanup = createDragGesture(el, { onDragEnd });
    firePointer(el, "pointerdown", 10, 10);
    firePointer(window, "pointerup", 60, 10);
    expect(onDragEnd).toHaveBeenCalledOnce();
    const state: GestureState = onDragEnd.mock.calls[0][0];
    expect(state.active).toBe(false);
  });

  it("axis=x constrains dy to 0", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, { axis: "x", onDrag });
    firePointer(el, "pointerdown", 0, 0);
    firePointer(window, "pointermove", 50, 80);
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.dy).toBe(0);
    expect(state.dx).toBe(50);
  });

  it("axis=y constrains dx to 0", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, { axis: "y", onDrag });
    firePointer(el, "pointerdown", 0, 0);
    firePointer(window, "pointermove", 50, 80);
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.dx).toBe(0);
    expect(state.dy).toBe(80);
  });

  it("bounds clamps x position to right", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, {
      bounds: { left: 0, right: 100, top: 0, bottom: 100 },
      onDrag,
    });
    firePointer(el, "pointerdown", 50, 50);
    firePointer(window, "pointermove", 200, 50);
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.x).toBe(100);
  });

  it("bounds clamps y position to bottom", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, {
      bounds: { left: 0, right: 200, top: 0, bottom: 100 },
      onDrag,
    });
    firePointer(el, "pointerdown", 50, 50);
    firePointer(window, "pointermove", 50, 300);
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.y).toBe(100);
  });

  it("bounds clamps negative positions to left/top", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, {
      bounds: { left: 10, right: 200, top: 20, bottom: 200 },
      onDrag,
    });
    firePointer(el, "pointerdown", 50, 50);
    firePointer(window, "pointermove", -5, -5);
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.x).toBe(10);
    expect(state.y).toBe(20);
  });

  it("velocity is non-negative after movement", () => {
    const onDragEnd = vi.fn();
    cleanup = createDragGesture(el, { onDragEnd });
    firePointer(el, "pointerdown", 0, 0);
    firePointer(window, "pointermove", 50, 0);
    firePointer(window, "pointerup", 100, 0);
    const state: GestureState = onDragEnd.mock.calls[0][0];
    expect(state.velocity).toBeGreaterThanOrEqual(0);
  });

  it("cleanup removes listeners — no callbacks after cleanup", () => {
    const onDragStart = vi.fn();
    cleanup = createDragGesture(el, { onDragStart });
    cleanup();
    firePointer(el, "pointerdown", 10, 10);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("direction is set during drag", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, { onDrag });
    firePointer(el, "pointerdown", 0, 0);
    firePointer(window, "pointermove", 100, 10);
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.direction).toBe("right");
  });

  it("direction is left when dx < 0", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, { onDrag });
    firePointer(el, "pointerdown", 200, 0);
    firePointer(window, "pointermove", 50, 0);
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.direction).toBe("left");
  });

  it("scale is always 1 in drag gesture", () => {
    const onDrag = vi.fn();
    cleanup = createDragGesture(el, { onDrag });
    firePointer(el, "pointerdown", 0, 0);
    firePointer(window, "pointermove", 50, 50);
    const state: GestureState = onDrag.mock.calls[0][0];
    expect(state.scale).toBe(1);
  });

  it("returns a function (cleanup) in all environments", () => {
    const fn = createDragGesture(makeEl(), {});
    expect(typeof fn).toBe("function");
    fn(); // must not throw
  });

  it("multiple move events accumulate dx correctly", () => {
    const states: GestureState[] = [];
    cleanup = createDragGesture(el, { onDrag: (s) => states.push(s) });
    firePointer(el, "pointerdown", 0, 0);
    firePointer(window, "pointermove", 20, 0);
    firePointer(window, "pointermove", 50, 0);
    expect(states).toHaveLength(2);
    expect(states[0].dx).toBe(20);
    expect(states[1].dx).toBe(50);
  });
});

// ─── createSwipeGesture ───────────────────────────────────────────────────────

describe("createSwipeGesture", () => {
  let el: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    el = makeEl();
  });
  afterEach(() => {
    cleanup?.();
  });

  /** Simulate a complete swipe sequence (pointerdown → pointermove → pointerup). */
  function simulateSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): void {
    firePointer(el, "pointerdown", startX, startY);
    firePointer(window, "pointermove", endX, endY);
    firePointer(window, "pointerup", endX, endY);
  }

  it("detects a left swipe", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 50, velocity: 0, onSwipe });
    simulateSwipe(200, 100, 100, 100);
    expect(onSwipe).toHaveBeenCalledOnce();
    expect(onSwipe.mock.calls[0][0].direction).toBe("left");
  });

  it("detects a right swipe", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 50, velocity: 0, onSwipe });
    simulateSwipe(100, 100, 200, 100);
    expect(onSwipe).toHaveBeenCalledOnce();
    expect(onSwipe.mock.calls[0][0].direction).toBe("right");
  });

  it("detects an up swipe", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 50, velocity: 0, onSwipe });
    simulateSwipe(100, 200, 100, 100);
    expect(onSwipe).toHaveBeenCalledOnce();
    expect(onSwipe.mock.calls[0][0].direction).toBe("up");
  });

  it("detects a down swipe", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 50, velocity: 0, onSwipe });
    simulateSwipe(100, 100, 100, 200);
    expect(onSwipe).toHaveBeenCalledOnce();
    expect(onSwipe.mock.calls[0][0].direction).toBe("down");
  });

  it("does not fire when displacement is below threshold", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 100, velocity: 0, onSwipe });
    simulateSwipe(100, 100, 130, 100); // only 30 px
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("velocity in swipe state is non-negative", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 10, velocity: 0, onSwipe });
    simulateSwipe(0, 0, 100, 0);
    expect(onSwipe.mock.calls[0][0].velocity).toBeGreaterThanOrEqual(0);
  });

  it("swipe state has active=false", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 10, velocity: 0, onSwipe });
    simulateSwipe(0, 0, 100, 0);
    expect(onSwipe.mock.calls[0][0].active).toBe(false);
  });

  it("cleanup stops swipe detection", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 10, velocity: 0, onSwipe });
    cleanup();
    simulateSwipe(0, 0, 200, 0);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("dx/dy reflect total displacement", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 50, velocity: 0, onSwipe });
    simulateSwipe(50, 50, 50, 150);
    const state: GestureState = onSwipe.mock.calls[0][0];
    expect(state.dy).toBe(100);
    expect(state.dx).toBe(0);
  });

  it("scale is always 1 in swipe state", () => {
    const onSwipe = vi.fn();
    cleanup = createSwipeGesture(el, { threshold: 10, velocity: 0, onSwipe });
    simulateSwipe(0, 0, 100, 0);
    expect(onSwipe.mock.calls[0][0].scale).toBe(1);
  });
});

// ─── createPinchGesture ───────────────────────────────────────────────────────

describe("createPinchGesture", () => {
  let el: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    el = makeEl();
    document.body.appendChild(el);
  });
  afterEach(() => {
    cleanup?.();
    el.remove();
  });

  it("fires onPinch during a two-finger spread (scale > 1)", () => {
    const onPinch = vi.fn();
    cleanup = createPinchGesture(el, { onPinch });

    // Start: fingers 100 px apart.
    fireTouchEvent(
      el,
      "touchstart",
      makeTouches([
        { x: 100, y: 200, id: 0 },
        { x: 200, y: 200, id: 1 },
      ]),
    );
    // Move: fingers 200 px apart.
    fireTouchEvent(
      el,
      "touchmove",
      makeTouches([
        { x: 50, y: 200, id: 0 },
        { x: 250, y: 200, id: 1 },
      ]),
    );

    expect(onPinch).toHaveBeenCalled();
    const state: GestureState = onPinch.mock.calls[0][0];
    expect(state.scale).toBeGreaterThan(1);
  });

  it("fires onPinch during a two-finger pinch (scale < 1)", () => {
    const onPinch = vi.fn();
    cleanup = createPinchGesture(el, { onPinch });

    // Start: fingers 200 px apart.
    fireTouchEvent(
      el,
      "touchstart",
      makeTouches([
        { x: 50, y: 200, id: 0 },
        { x: 250, y: 200, id: 1 },
      ]),
    );
    // Move: fingers 100 px apart.
    fireTouchEvent(
      el,
      "touchmove",
      makeTouches([
        { x: 100, y: 200, id: 0 },
        { x: 200, y: 200, id: 1 },
      ]),
    );

    expect(onPinch).toHaveBeenCalled();
    expect(onPinch.mock.calls[0][0].scale).toBeLessThan(1);
  });

  it("clamps scale to maxScale", () => {
    const onPinch = vi.fn();
    cleanup = createPinchGesture(el, { maxScale: 2, onPinch });

    fireTouchEvent(
      el,
      "touchstart",
      makeTouches([
        { x: 100, y: 200, id: 0 },
        { x: 102, y: 200, id: 1 }, // 2 px apart
      ]),
    );
    fireTouchEvent(
      el,
      "touchmove",
      makeTouches([
        { x: 0, y: 200, id: 0 },
        { x: 500, y: 200, id: 1 }, // 500 px apart
      ]),
    );

    expect(onPinch.mock.calls[0][0].scale).toBeLessThanOrEqual(2);
  });

  it("clamps scale to minScale", () => {
    const onPinch = vi.fn();
    cleanup = createPinchGesture(el, { minScale: 0.8, onPinch });

    fireTouchEvent(
      el,
      "touchstart",
      makeTouches([
        { x: 0, y: 200, id: 0 },
        { x: 500, y: 200, id: 1 },
      ]),
    );
    fireTouchEvent(
      el,
      "touchmove",
      makeTouches([
        { x: 100, y: 200, id: 0 },
        { x: 102, y: 200, id: 1 },
      ]),
    );

    expect(onPinch.mock.calls[0][0].scale).toBeGreaterThanOrEqual(0.8);
  });

  it("pinch state has active=true during pinch", () => {
    const onPinch = vi.fn();
    cleanup = createPinchGesture(el, { onPinch });

    fireTouchEvent(
      el,
      "touchstart",
      makeTouches([
        { x: 100, y: 200, id: 0 },
        { x: 200, y: 200, id: 1 },
      ]),
    );
    fireTouchEvent(
      el,
      "touchmove",
      makeTouches([
        { x: 50, y: 200, id: 0 },
        { x: 250, y: 200, id: 1 },
      ]),
    );

    expect(onPinch.mock.calls[0][0].active).toBe(true);
  });

  it("cleanup removes touch listeners", () => {
    const onPinch = vi.fn();
    cleanup = createPinchGesture(el, { onPinch });
    cleanup();

    fireTouchEvent(
      el,
      "touchstart",
      makeTouches([
        { x: 100, y: 200, id: 0 },
        { x: 200, y: 200, id: 1 },
      ]),
    );
    fireTouchEvent(
      el,
      "touchmove",
      makeTouches([
        { x: 50, y: 200, id: 0 },
        { x: 250, y: 200, id: 1 },
      ]),
    );

    expect(onPinch).not.toHaveBeenCalled();
  });

  it("pinch midpoint x/y are computed correctly", () => {
    const onPinch = vi.fn();
    cleanup = createPinchGesture(el, { onPinch });

    fireTouchEvent(
      el,
      "touchstart",
      makeTouches([
        { x: 100, y: 100, id: 0 },
        { x: 300, y: 100, id: 1 },
      ]),
    );
    fireTouchEvent(
      el,
      "touchmove",
      makeTouches([
        { x: 50, y: 150, id: 0 },
        { x: 250, y: 150, id: 1 },
      ]),
    );

    const state: GestureState = onPinch.mock.calls[0][0];
    // midpoint x = (50 + 250) / 2 = 150, y = (150 + 150) / 2 = 150
    expect(state.x).toBe(150);
    expect(state.y).toBe(150);
  });

  it("does not fire onPinch for a single-touch touchmove", () => {
    const onPinch = vi.fn();
    cleanup = createPinchGesture(el, { onPinch });

    fireTouchEvent(el, "touchstart", makeTouches([{ x: 100, y: 200, id: 0 }]));
    fireTouchEvent(el, "touchmove", makeTouches([{ x: 150, y: 200, id: 0 }]));

    expect(onPinch).not.toHaveBeenCalled();
  });

  it("returns a function (cleanup) in all environments", () => {
    const fn = createPinchGesture(makeEl(), {});
    expect(typeof fn).toBe("function");
    fn(); // must not throw
  });
});
