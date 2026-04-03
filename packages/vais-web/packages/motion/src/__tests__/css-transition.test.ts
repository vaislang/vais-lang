/**
 * @vaisx/motion — createCSSTransition() and createListTransition() tests
 *
 * jsdom environment — transitionend events are dispatched manually.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCSSTransition,
  createListTransition,
  capturePositions,
} from "../css-transition.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeElement(): HTMLElement {
  return document.createElement("div");
}

/**
 * Advance fake timers by 0 ms to flush the nextFrame setTimeout(0) calls
 * scheduled inside createCSSTransition, then drain the microtask queue.
 */
async function flushRaf(): Promise<void> {
  vi.advanceTimersByTime(0);
  await Promise.resolve();
}

/** Fire a transitionend event on an element. */
function fireTransitionEnd(el: Element): void {
  el.dispatchEvent(new Event("transitionend", { bubbles: true }));
}

/** Fire an animationend event on an element. */
function fireAnimationEnd(el: Element): void {
  el.dispatchEvent(new Event("animationend", { bubbles: true }));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── createCSSTransition — enter ──────────────────────────────────────────────

describe("createCSSTransition — enter", () => {
  it("applies enterFrom and enterActive classes immediately on enter()", () => {
    const t = createCSSTransition({
      enterFrom: "opacity-0",
      enterActive: "transition-opacity",
      enterTo: "opacity-100",
      duration: 300,
    });
    const el = makeElement();

    t.enter(el);

    expect(el.classList.contains("opacity-0")).toBe(true);
    expect(el.classList.contains("transition-opacity")).toBe(true);
  });

  it("removes enterFrom and adds enterTo after the next frame", async () => {
    const t = createCSSTransition({
      enterFrom: "opacity-0",
      enterActive: "transition-opacity",
      enterTo: "opacity-100",
      duration: 300,
    });
    const el = makeElement();

    t.enter(el);
    await flushRaf();

    expect(el.classList.contains("opacity-0")).toBe(false);
    expect(el.classList.contains("opacity-100")).toBe(true);
    expect(el.classList.contains("transition-opacity")).toBe(true);
  });

  it("removes enterActive and enterTo when transitionend fires", async () => {
    const t = createCSSTransition({
      enterFrom: "opacity-0",
      enterActive: "transition-opacity",
      enterTo: "opacity-100",
      duration: 300,
    });
    const el = makeElement();

    t.enter(el);
    await flushRaf();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(el.classList.contains("transition-opacity")).toBe(false);
    expect(el.classList.contains("opacity-100")).toBe(false);
  });

  it("resolves the enter() promise when transitionend fires", async () => {
    const t = createCSSTransition({
      enterFrom: "opacity-0",
      enterActive: "transition-opacity",
      enterTo: "opacity-100",
      duration: 300,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.enter(el).then(resolved);
    await flushRaf();

    expect(resolved).not.toHaveBeenCalled();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });

  it("resolves via duration fallback when transitionend never fires", async () => {
    const t = createCSSTransition({
      enterFrom: "opacity-0",
      enterActive: "transition-opacity",
      enterTo: "opacity-100",
      duration: 200,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.enter(el).then(resolved);
    await flushRaf();

    vi.advanceTimersByTime(200);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });

  it("calls onEnter callback after the enter transition completes", async () => {
    const onEnter = vi.fn();
    const t = createCSSTransition({
      enterFrom: "scale-0",
      enterTo: "scale-100",
      duration: 100,
      onEnter,
    });
    const el = makeElement();

    t.enter(el);
    await flushRaf();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(onEnter).toHaveBeenCalledOnce();
    expect(onEnter).toHaveBeenCalledWith(el);
  });

  it("resolves when animationend fires instead of transitionend", async () => {
    const t = createCSSTransition({
      enterFrom: "slide-from",
      enterActive: "slide-active",
      enterTo: "slide-to",
      duration: 300,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.enter(el).then(resolved);
    await flushRaf();
    fireAnimationEnd(el);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });

  it("only resolves once even if multiple transitionend events fire", async () => {
    const onEnter = vi.fn();
    const t = createCSSTransition({
      enterFrom: "opacity-0",
      enterTo: "opacity-100",
      duration: 300,
      onEnter,
    });
    const el = makeElement();

    t.enter(el);
    await flushRaf();
    fireTransitionEnd(el);
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(onEnter).toHaveBeenCalledOnce();
  });
});

// ─── createCSSTransition — leave ──────────────────────────────────────────────

describe("createCSSTransition — leave", () => {
  it("applies leaveFrom and leaveActive classes immediately on leave()", () => {
    const t = createCSSTransition({
      leaveFrom: "opacity-100",
      leaveActive: "transition-opacity",
      leaveTo: "opacity-0",
      duration: 300,
    });
    const el = makeElement();

    t.leave(el);

    expect(el.classList.contains("opacity-100")).toBe(true);
    expect(el.classList.contains("transition-opacity")).toBe(true);
  });

  it("removes leaveFrom and adds leaveTo after the next frame", async () => {
    const t = createCSSTransition({
      leaveFrom: "opacity-100",
      leaveActive: "transition-opacity",
      leaveTo: "opacity-0",
      duration: 300,
    });
    const el = makeElement();

    t.leave(el);
    await flushRaf();

    expect(el.classList.contains("opacity-100")).toBe(false);
    expect(el.classList.contains("opacity-0")).toBe(true);
    expect(el.classList.contains("transition-opacity")).toBe(true);
  });

  it("removes leaveActive and leaveTo when transitionend fires", async () => {
    const t = createCSSTransition({
      leaveFrom: "opacity-100",
      leaveActive: "transition-opacity",
      leaveTo: "opacity-0",
      duration: 300,
    });
    const el = makeElement();

    t.leave(el);
    await flushRaf();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(el.classList.contains("transition-opacity")).toBe(false);
    expect(el.classList.contains("opacity-0")).toBe(false);
  });

  it("resolves the leave() promise when transitionend fires", async () => {
    const t = createCSSTransition({
      leaveFrom: "opacity-100",
      leaveActive: "transition-opacity",
      leaveTo: "opacity-0",
      duration: 300,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.leave(el).then(resolved);
    await flushRaf();

    expect(resolved).not.toHaveBeenCalled();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });

  it("resolves via duration fallback when transitionend never fires", async () => {
    const t = createCSSTransition({
      leaveFrom: "opacity-100",
      leaveTo: "opacity-0",
      duration: 150,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.leave(el).then(resolved);
    await flushRaf();

    vi.advanceTimersByTime(150);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });

  it("calls onLeave callback after the leave transition completes", async () => {
    const onLeave = vi.fn();
    const t = createCSSTransition({
      leaveFrom: "opacity-100",
      leaveTo: "opacity-0",
      duration: 100,
      onLeave,
    });
    const el = makeElement();

    t.leave(el);
    await flushRaf();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(onLeave).toHaveBeenCalledOnce();
    expect(onLeave).toHaveBeenCalledWith(el);
  });
});

// ─── createCSSTransition — destroy ───────────────────────────────────────────

describe("createCSSTransition — destroy", () => {
  it("destroy() prevents the fallback timer from resolving the promise", async () => {
    const t = createCSSTransition({
      enterFrom: "opacity-0",
      enterTo: "opacity-100",
      duration: 300,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.enter(el).then(resolved);
    await flushRaf();

    t.destroy();
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(resolved).not.toHaveBeenCalled();
  });

  it("destroy() removes transitionend listeners so late events are ignored", async () => {
    const onEnter = vi.fn();
    const t = createCSSTransition({
      enterFrom: "opacity-0",
      enterTo: "opacity-100",
      duration: 300,
      onEnter,
    });
    const el = makeElement();

    t.enter(el);
    await flushRaf();

    t.destroy();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(onEnter).not.toHaveBeenCalled();
  });
});

// ─── createCSSTransition — multi-word class strings ───────────────────────────

describe("createCSSTransition — multi-word class strings", () => {
  it("supports space-separated enterFrom classes", () => {
    const t = createCSSTransition({
      enterFrom: "opacity-0 scale-95",
      enterActive: "transition ease-out",
      enterTo: "opacity-100 scale-100",
      duration: 200,
    });
    const el = makeElement();

    t.enter(el);

    expect(el.classList.contains("opacity-0")).toBe(true);
    expect(el.classList.contains("scale-95")).toBe(true);
    expect(el.classList.contains("transition")).toBe(true);
    expect(el.classList.contains("ease-out")).toBe(true);
  });

  it("removes all enterFrom multi-word classes after the next frame", async () => {
    const t = createCSSTransition({
      enterFrom: "opacity-0 scale-95",
      enterTo: "opacity-100 scale-100",
      duration: 200,
    });
    const el = makeElement();

    t.enter(el);
    await flushRaf();

    expect(el.classList.contains("opacity-0")).toBe(false);
    expect(el.classList.contains("scale-95")).toBe(false);
  });
});

// ─── createCSSTransition — no-op when options are empty ──────────────────────

describe("createCSSTransition — empty options", () => {
  it("enter() resolves via fallback even with no classes specified", async () => {
    const t = createCSSTransition({ duration: 50 });
    const el = makeElement();
    const resolved = vi.fn();

    t.enter(el).then(resolved);
    await flushRaf();

    vi.advanceTimersByTime(50);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });

  it("leave() resolves via fallback even with no classes specified", async () => {
    const t = createCSSTransition({ duration: 50 });
    const el = makeElement();
    const resolved = vi.fn();

    t.leave(el).then(resolved);
    await flushRaf();

    vi.advanceTimersByTime(50);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });
});

// ─── capturePositions ─────────────────────────────────────────────────────────

describe("capturePositions", () => {
  it("returns a map with DOMRect entries for each element", () => {
    const a = makeElement();
    const b = makeElement();

    const snapshot = capturePositions([a, b]);

    expect(snapshot.has(a)).toBe(true);
    expect(snapshot.has(b)).toBe(true);
    // jsdom returns a DOMRect-shaped object; check duck-typing rather than instanceof.
    expect(typeof snapshot.get(a)?.width).toBe("number");
    expect(typeof snapshot.get(b)?.height).toBe("number");
  });

  it("returns an empty map for an empty array", () => {
    expect(capturePositions([])).toEqual(new Map());
  });
});

// ─── createListTransition — itemEnter / itemLeave ────────────────────────────

describe("createListTransition — itemEnter", () => {
  it("runs the enter animation when itemEnter() is called", () => {
    const t = createListTransition({
      enterFrom: "opacity-0",
      enterActive: "transition-opacity",
      enterTo: "opacity-100",
      duration: 200,
    });
    const el = makeElement();

    t.itemEnter(el);

    expect(el.classList.contains("opacity-0")).toBe(true);
    expect(el.classList.contains("transition-opacity")).toBe(true);
  });

  it("resolves itemEnter() promise when transitionend fires", async () => {
    const t = createListTransition({
      enterFrom: "opacity-0",
      enterTo: "opacity-100",
      duration: 200,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.itemEnter(el).then(resolved);
    await flushRaf();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });
});

describe("createListTransition — itemLeave", () => {
  it("runs the leave animation when itemLeave() is called", () => {
    const t = createListTransition({
      leaveFrom: "opacity-100",
      leaveActive: "transition-opacity",
      leaveTo: "opacity-0",
      duration: 200,
    });
    const el = makeElement();

    t.itemLeave(el);

    expect(el.classList.contains("opacity-100")).toBe(true);
    expect(el.classList.contains("transition-opacity")).toBe(true);
  });

  it("resolves itemLeave() promise when transitionend fires", async () => {
    const t = createListTransition({
      leaveFrom: "opacity-100",
      leaveTo: "opacity-0",
      duration: 200,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.itemLeave(el).then(resolved);
    await flushRaf();
    fireTransitionEnd(el);
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });
});

// ─── createListTransition — applyMoveTransitions (FLIP) ──────────────────────

describe("createListTransition — applyMoveTransitions (FLIP)", () => {
  it("applies moveClass to elements that have moved", () => {
    const t = createListTransition({ moveClass: "list-move", duration: 200 });
    const el = makeElement();
    document.body.appendChild(el);

    // Simulate a position snapshot before a DOM mutation.
    const before = new DOMRect(0, 0, 100, 50);
    const snapshots = new Map<Element, DOMRect>([[el, before]]);

    // getBoundingClientRect returns all zeros in jsdom, so delta will be
    // dx = 0 - 0 = 0 and dy = 0 - 0 = 0 — no movement.  Override to simulate.
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(
      new DOMRect(50, 0, 100, 50),
    );

    t.applyMoveTransitions([el], snapshots);

    expect(el.classList.contains("list-move")).toBe(true);

    document.body.removeChild(el);
  });

  it("skips elements not present in the snapshot map", () => {
    const t = createListTransition({ moveClass: "list-move", duration: 200 });
    const el = makeElement();

    // Empty snapshot — el has no before rect.
    t.applyMoveTransitions([el], new Map());

    expect(el.classList.contains("list-move")).toBe(false);
  });

  it("skips elements whose position has not changed", () => {
    const t = createListTransition({ moveClass: "list-move", duration: 200 });
    const el = makeElement();
    document.body.appendChild(el);

    const rect = new DOMRect(0, 0, 100, 50);
    const snapshots = new Map<Element, DOMRect>([[el, rect]]);

    // getBoundingClientRect returns all zeros by default in jsdom.
    // snapshot.left = 0, after.left = 0 → dx = 0, same for dy → skip.
    t.applyMoveTransitions([el], snapshots);

    expect(el.classList.contains("list-move")).toBe(false);

    document.body.removeChild(el);
  });

  it("removes moveClass when transitionend fires on a moved element", () => {
    const t = createListTransition({ moveClass: "list-move", duration: 200 });
    const el = makeElement();
    document.body.appendChild(el);

    const before = new DOMRect(0, 0, 100, 50);
    const snapshots = new Map<Element, DOMRect>([[el, before]]);

    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(
      new DOMRect(50, 0, 100, 50),
    );

    t.applyMoveTransitions([el], snapshots);
    expect(el.classList.contains("list-move")).toBe(true);

    fireTransitionEnd(el);
    expect(el.classList.contains("list-move")).toBe(false);

    document.body.removeChild(el);
  });

  it("uses default moveClass 'move' when no moveClass is specified", () => {
    const t = createListTransition({ duration: 200 });
    const el = makeElement();
    document.body.appendChild(el);

    const before = new DOMRect(0, 0, 100, 50);
    const snapshots = new Map<Element, DOMRect>([[el, before]]);

    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(
      new DOMRect(10, 0, 100, 50),
    );

    t.applyMoveTransitions([el], snapshots);
    expect(el.classList.contains("move")).toBe(true);

    document.body.removeChild(el);
  });
});

// ─── createListTransition — destroy ──────────────────────────────────────────

describe("createListTransition — destroy", () => {
  it("destroy() stops pending enter/leave transitions", async () => {
    const t = createListTransition({
      enterFrom: "opacity-0",
      enterTo: "opacity-100",
      duration: 300,
    });
    const el = makeElement();
    const resolved = vi.fn();

    t.itemEnter(el).then(resolved);
    await flushRaf();

    t.destroy();
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(resolved).not.toHaveBeenCalled();
  });
});
