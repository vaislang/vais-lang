/**
 * @vaisx/motion — easing tests
 */

import { describe, it, expect } from "vitest";
import {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  cubicBezier,
  easings,
} from "../src/easing.js";

// ─── Named presets ────────────────────────────────────────────────────────────

describe("easing presets", () => {
  it("linear is the string 'linear'", () => {
    expect(linear).toBe("linear");
  });

  it("easeIn is 'ease-in'", () => {
    expect(easeIn).toBe("ease-in");
  });

  it("easeOut is 'ease-out'", () => {
    expect(easeOut).toBe("ease-out");
  });

  it("easeInOut is 'ease-in-out'", () => {
    expect(easeInOut).toBe("ease-in-out");
  });
});

// ─── cubicBezier factory ──────────────────────────────────────────────────────

describe("cubicBezier()", () => {
  it("returns the correct cubic-bezier string", () => {
    expect(cubicBezier(0.25, 0.1, 0.25, 1)).toBe("cubic-bezier(0.25, 0.1, 0.25, 1)");
  });

  it("allows y values outside [0, 1] for overshoot", () => {
    expect(cubicBezier(0.34, 1.56, 0.64, 1)).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
  });

  it("throws RangeError when x1 < 0", () => {
    expect(() => cubicBezier(-0.1, 0, 0.5, 1)).toThrow(RangeError);
  });

  it("throws RangeError when x1 > 1", () => {
    expect(() => cubicBezier(1.1, 0, 0.5, 1)).toThrow(RangeError);
  });

  it("throws RangeError when x2 < 0", () => {
    expect(() => cubicBezier(0, 0, -0.1, 1)).toThrow(RangeError);
  });

  it("throws RangeError when x2 > 1", () => {
    expect(() => cubicBezier(0, 0, 1.1, 1)).toThrow(RangeError);
  });

  it("accepts boundary values x1=0 and x2=1", () => {
    expect(() => cubicBezier(0, 0, 1, 1)).not.toThrow();
  });

  it("result string starts with 'cubic-bezier'", () => {
    expect(cubicBezier(0.4, 0, 0.2, 1)).toMatch(/^cubic-bezier\(/);
  });
});

// ─── easings map ─────────────────────────────────────────────────────────────

describe("easings preset map", () => {
  it("includes all named presets", () => {
    expect(easings.linear).toBe("linear");
    expect(easings.easeIn).toBe("ease-in");
    expect(easings.easeOut).toBe("ease-out");
    expect(easings.easeInOut).toBe("ease-in-out");
  });

  it("includes Material Design 'standard' curve", () => {
    expect(easings.standard).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("includes Material Design 'decelerate' curve", () => {
    expect(easings.decelerate).toBe("cubic-bezier(0, 0, 0.2, 1)");
  });

  it("includes Material Design 'accelerate' curve", () => {
    expect(easings.accelerate).toBe("cubic-bezier(0.4, 0, 1, 1)");
  });

  it("includes 'backOut' overshoot curve", () => {
    expect(easings.backOut).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");
  });
});
