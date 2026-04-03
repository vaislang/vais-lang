/**
 * @vaisx/motion — createTransition() tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTransition } from "../src/transition.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeElement(): HTMLElement {
  return document.createElement("div");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("createTransition — enter", () => {
  it("adds the enter class immediately when enter() is called", () => {
    const handle = createTransition({ enter: "fade-enter", duration: 200 });
    const el = makeElement();

    handle.enter(el);
    expect(el.classList.contains("fade-enter")).toBe(true);
  });

  it("sets data-motion-state to 'entering' at the start", () => {
    const handle = createTransition({ enter: "slide-enter", duration: 200 });
    const el = makeElement();

    handle.enter(el);
    expect(el.dataset["motionState"]).toBe("entering");
  });

  it("removes the enter class after duration", async () => {
    const handle = createTransition({ enter: "fade-enter", duration: 200 });
    const el = makeElement();

    const promise = handle.enter(el);
    vi.advanceTimersByTime(200);
    await promise;

    expect(el.classList.contains("fade-enter")).toBe(false);
  });

  it("sets data-motion-state to 'entered' after duration", async () => {
    const handle = createTransition({ enter: "fade-enter", duration: 200 });
    const el = makeElement();

    const promise = handle.enter(el);
    vi.advanceTimersByTime(200);
    await promise;

    expect(el.dataset["motionState"]).toBe("entered");
  });

  it("resolves the enter() promise after duration", async () => {
    const handle = createTransition({ enter: "enter", duration: 150 });
    const el = makeElement();

    const resolved = vi.fn();
    handle.enter(el).then(resolved);

    expect(resolved).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toHaveBeenCalledOnce();
  });
});

describe("createTransition — leave", () => {
  it("adds the leave class immediately when leave() is called", () => {
    const handle = createTransition({ leave: "fade-leave", duration: 200 });
    const el = makeElement();

    handle.leave(el);
    expect(el.classList.contains("fade-leave")).toBe(true);
  });

  it("sets data-motion-state to 'leaving' at the start", () => {
    const handle = createTransition({ leave: "slide-leave", duration: 200 });
    const el = makeElement();

    handle.leave(el);
    expect(el.dataset["motionState"]).toBe("leaving");
  });

  it("removes the leave class after duration", async () => {
    const handle = createTransition({ leave: "fade-leave", duration: 200 });
    const el = makeElement();

    const promise = handle.leave(el);
    vi.advanceTimersByTime(200);
    await promise;

    expect(el.classList.contains("fade-leave")).toBe(false);
  });

  it("sets data-motion-state to 'left' after duration", async () => {
    const handle = createTransition({ leave: "fade-leave", duration: 200 });
    const el = makeElement();

    const promise = handle.leave(el);
    vi.advanceTimersByTime(200);
    await promise;

    expect(el.dataset["motionState"]).toBe("left");
  });

  it("resolves the leave() promise after duration", async () => {
    const handle = createTransition({ leave: "leave", duration: 150 });
    const el = makeElement();

    const resolved = vi.fn();
    handle.leave(el).then(resolved);

    expect(resolved).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    await Promise.resolve();
    expect(resolved).toHaveBeenCalledOnce();
  });
});

describe("createTransition — destroy", () => {
  it("destroy() prevents timer callbacks from firing", async () => {
    const handle = createTransition({ enter: "enter", duration: 300 });
    const el = makeElement();

    const resolved = vi.fn();
    handle.enter(el).then(resolved);

    handle.destroy();
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    // The promise is pending because the timer was cleared.
    expect(resolved).not.toHaveBeenCalled();
    // Class should still be present (timer never fired)
    expect(el.classList.contains("enter")).toBe(true);
  });
});

describe("createTransition — multiple classes", () => {
  it("supports space-separated class strings for enter", () => {
    const handle = createTransition({ enter: "fade slide", duration: 100 });
    const el = makeElement();

    handle.enter(el);
    expect(el.classList.contains("fade")).toBe(true);
    expect(el.classList.contains("slide")).toBe(true);
  });

  it("removes all space-separated classes after duration", async () => {
    const handle = createTransition({ enter: "fade slide", duration: 100 });
    const el = makeElement();

    const promise = handle.enter(el);
    vi.advanceTimersByTime(100);
    await promise;

    expect(el.classList.contains("fade")).toBe(false);
    expect(el.classList.contains("slide")).toBe(false);
  });
});

describe("createTransition — defaults", () => {
  it("uses 'enter' as the default enter class", () => {
    const handle = createTransition({ duration: 100 });
    const el = makeElement();

    handle.enter(el);
    expect(el.classList.contains("enter")).toBe(true);
  });

  it("uses 'leave' as the default leave class", () => {
    const handle = createTransition({ duration: 100 });
    const el = makeElement();

    handle.leave(el);
    expect(el.classList.contains("leave")).toBe(true);
  });
});
