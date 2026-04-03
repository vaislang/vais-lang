/**
 * animate — Web Animations API wrapper.
 * SSR-safe: guards against missing `window`/`Element.prototype.animate`.
 */

import type { AnimationOptions, AnimationControls } from "./types.js";

/**
 * Animate a DOM element using the Web Animations API.
 *
 * Returns an {@link AnimationControls} object that lets callers play, pause,
 * cancel, finish, or reverse the animation and await its completion.
 *
 * In SSR environments (no `window`) a no-op stub is returned so that
 * server-side code does not throw.
 *
 * @param element   The DOM element to animate.
 * @param keyframes Keyframes array or a `PropertyIndexedKeyframes` object.
 * @param options   Optional timing options (duration, easing, delay, …).
 * @returns         An `AnimationControls` instance.
 */
export function animate(
  element: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options?: AnimationOptions,
): AnimationControls {
  // SSR guard — return a no-op stub when the DOM is not available.
  if (typeof window === "undefined" || typeof element.animate !== "function") {
    return createNoopControls();
  }

  const keyframeEffect: KeyframeAnimationOptions = {
    duration: options?.duration ?? 300,
    easing: options?.easing ?? "linear",
    delay: options?.delay ?? 0,
    fill: options?.fill ?? "none",
    iterations: options?.iterations ?? 1,
  };

  const animation = element.animate(keyframes, keyframeEffect);

  // `animation.finished` resolves with the Animation object; we expose void.
  const finished: Promise<void> = animation.finished.then(() => undefined);

  return {
    play() {
      animation.play();
    },
    pause() {
      animation.pause();
    },
    cancel() {
      animation.cancel();
    },
    finish() {
      animation.finish();
    },
    reverse() {
      animation.reverse();
    },
    finished,
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Creates a no-op AnimationControls for SSR environments. */
function createNoopControls(): AnimationControls {
  return {
    play() {},
    pause() {},
    cancel() {},
    finish() {},
    reverse() {},
    finished: Promise.resolve(),
  };
}
