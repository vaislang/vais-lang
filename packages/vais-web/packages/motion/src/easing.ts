/**
 * easing — CSS easing string presets and a cubic-bezier factory.
 *
 * All values are CSS `<easing-function>` strings compatible with both
 * Web Animations API (KeyframeAnimationOptions.easing) and CSS properties.
 */

/** No easing — constant velocity throughout. */
export const linear = "linear" as const;

/** Starts slow, then accelerates. Equivalent to `cubic-bezier(0.42, 0, 1, 1)`. */
export const easeIn = "ease-in" as const;

/** Starts fast, then decelerates. Equivalent to `cubic-bezier(0, 0, 0.58, 1)`. */
export const easeOut = "ease-out" as const;

/** Starts slow, accelerates through the middle, then decelerates. Equivalent to `cubic-bezier(0.42, 0, 0.58, 1)`. */
export const easeInOut = "ease-in-out" as const;

/**
 * Generate a `cubic-bezier(x1, y1, x2, y2)` easing string.
 *
 * Control point coordinates follow CSS conventions:
 * - x values must be in [0, 1].
 * - y values may exceed [0, 1] for overshoot/bounce effects.
 *
 * @example
 * cubicBezier(0.25, 0.1, 0.25, 1) // => "cubic-bezier(0.25, 0.1, 0.25, 1)"
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new RangeError(
      `cubicBezier: x1 and x2 must be in the range [0, 1]. Received x1=${x1}, x2=${x2}.`,
    );
  }
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

/**
 * Convenience preset map for named access.
 *
 * @example
 * import { easings } from "@vaisx/motion";
 * element.style.transitionTimingFunction = easings.easeInOut;
 */
export const easings = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  /** Material Design "standard" curve. */
  standard: cubicBezier(0.4, 0, 0.2, 1),
  /** Material Design "decelerate" curve — for elements entering the screen. */
  decelerate: cubicBezier(0, 0, 0.2, 1),
  /** Material Design "accelerate" curve — for elements leaving the screen. */
  accelerate: cubicBezier(0.4, 0, 1, 1),
  /** Gentle spring-like overshoot. */
  backOut: cubicBezier(0.34, 1.56, 0.64, 1),
} as const;
