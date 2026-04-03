/**
 * @vaisx/motion — animate() tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { animate } from "../src/animate.js";

// ─── Minimal Animation stub ───────────────────────────────────────────────────

function makeAnimationStub() {
  let resolveFn!: () => void;
  const finished = new Promise<Animation>((res) => {
    resolveFn = () => res({} as Animation);
  });

  const stub = {
    play: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    finish: vi.fn(() => resolveFn()),
    reverse: vi.fn(),
    finished,
  };

  return { stub, resolve: resolveFn };
}

function makeElement(withAnimate = true): Element {
  const el = document.createElement("div");
  if (!withAnimate) {
    // Remove animate to simulate unsupported environment
    (el as unknown as Record<string, unknown>)["animate"] = undefined;
  }
  return el;
}

// ─── Patch Element.prototype.animate per test ─────────────────────────────────

// jsdom does not implement Element.prototype.animate — install a stub so
// vi.spyOn can intercept it.
if (typeof HTMLElement.prototype.animate !== "function") {
  HTMLElement.prototype.animate = function () {
    return {} as Animation;
  };
}

let currentStub: ReturnType<typeof makeAnimationStub>["stub"] | null = null;

beforeEach(() => {
  currentStub = null;
  vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(function () {
    const { stub } = makeAnimationStub();
    currentStub = stub;
    return stub as unknown as Animation;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("animate — basic", () => {
  it("returns an AnimationControls object with required methods", () => {
    const el = makeElement();
    const controls = animate(el, [{ opacity: "0" }, { opacity: "1" }]);

    expect(typeof controls.play).toBe("function");
    expect(typeof controls.pause).toBe("function");
    expect(typeof controls.cancel).toBe("function");
    expect(typeof controls.finish).toBe("function");
    expect(typeof controls.reverse).toBe("function");
    expect(controls.finished).toBeInstanceOf(Promise);
  });

  it("calls element.animate with default duration when no options given", () => {
    const el = makeElement();
    const spy = vi.spyOn(el, "animate").mockImplementation(() => {
      const { stub } = makeAnimationStub();
      return stub as unknown as Animation;
    });

    animate(el, [{ opacity: "0" }, { opacity: "1" }]);

    expect(spy).toHaveBeenCalledOnce();
    const callOptions = spy.mock.calls[0]?.[1] as KeyframeAnimationOptions;
    expect(callOptions.duration).toBe(300);
  });

  it("passes provided options to element.animate", () => {
    const el = makeElement();
    const spy = vi.spyOn(el, "animate").mockImplementation(() => {
      const { stub } = makeAnimationStub();
      return stub as unknown as Animation;
    });

    animate(el, [{ opacity: "0" }, { opacity: "1" }], {
      duration: 500,
      easing: "ease-in-out",
      delay: 100,
      fill: "forwards",
      iterations: 2,
    });

    const callOptions = spy.mock.calls[0]?.[1] as KeyframeAnimationOptions;
    expect(callOptions.duration).toBe(500);
    expect(callOptions.easing).toBe("ease-in-out");
    expect(callOptions.delay).toBe(100);
    expect(callOptions.fill).toBe("forwards");
    expect(callOptions.iterations).toBe(2);
  });

  it("play() delegates to the underlying animation", () => {
    const el = makeElement();
    const controls = animate(el, [{ opacity: "0" }]);
    controls.play();
    expect(currentStub?.play).toHaveBeenCalledOnce();
  });

  it("pause() delegates to the underlying animation", () => {
    const el = makeElement();
    const controls = animate(el, [{ opacity: "0" }]);
    controls.pause();
    expect(currentStub?.pause).toHaveBeenCalledOnce();
  });

  it("cancel() delegates to the underlying animation", () => {
    const el = makeElement();
    const controls = animate(el, [{ opacity: "0" }]);
    controls.cancel();
    expect(currentStub?.cancel).toHaveBeenCalledOnce();
  });

  it("finish() delegates to the underlying animation", () => {
    const el = makeElement();
    const controls = animate(el, [{ opacity: "0" }]);
    controls.finish();
    expect(currentStub?.finish).toHaveBeenCalledOnce();
  });

  it("reverse() delegates to the underlying animation", () => {
    const el = makeElement();
    const controls = animate(el, [{ opacity: "0" }]);
    controls.reverse();
    expect(currentStub?.reverse).toHaveBeenCalledOnce();
  });

  it("finished resolves as a Promise<void>", async () => {
    const el = makeElement();
    const controls = animate(el, [{ opacity: "0" }]);
    controls.finish(); // trigger resolution
    await expect(controls.finished).resolves.toBeUndefined();
  });
});

describe("animate — SSR safety", () => {
  it("returns a no-op stub when element.animate is not a function", () => {
    const el = document.createElement("div");
    // Override animate to simulate missing API
    Object.defineProperty(el, "animate", { value: undefined, configurable: true });

    const controls = animate(el, [{ opacity: "0" }]);
    // These should not throw
    expect(() => controls.play()).not.toThrow();
    expect(() => controls.pause()).not.toThrow();
    expect(() => controls.cancel()).not.toThrow();
    expect(() => controls.finish()).not.toThrow();
    expect(() => controls.reverse()).not.toThrow();
    expect(controls.finished).toBeInstanceOf(Promise);
  });

  it("no-op finished promise resolves with undefined", async () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "animate", { value: undefined, configurable: true });

    const controls = animate(el, [{ opacity: "0" }]);
    await expect(controls.finished).resolves.toBeUndefined();
  });
});
