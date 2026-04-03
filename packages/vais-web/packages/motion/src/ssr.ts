/**
 * ssr — SSR-safe animation and transition utilities.
 *
 * Provides guards and wrappers that skip animations/transitions during
 * server-side rendering and activate them after client hydration.
 */

import { animate as clientAnimate } from "./animate.js";
import { createTransition as clientCreateTransition } from "./transition.js";
import type {
  AnimationControls,
  AnimationOptions,
  TransitionHandle,
  TransitionOptions,
} from "./types.js";

// ─── Server environment detection ──────────────────────────────────────────────

/**
 * Returns `true` when running in a server (non-browser) environment.
 * Uses the canonical `typeof window === "undefined"` guard.
 */
export function isSSR(): boolean {
  return typeof window === "undefined";
}

// ─── SSR-safe animate ──────────────────────────────────────────────────────────

/**
 * Creates an SSR-safe animate function.
 *
 * - **Server**: returns an immediately-resolved stub {@link AnimationControls}
 *   without touching the DOM.
 * - **Client**: delegates to the real {@link animate} from `./animate.ts`.
 *
 * @returns An animate function with the same signature as the real `animate`.
 */
export function createSSRSafeAnimate(): (
  element: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options?: AnimationOptions,
) => AnimationControls {
  return function ssrSafeAnimate(
    element: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: AnimationOptions,
  ): AnimationControls {
    if (typeof window === "undefined") {
      return createStubControls();
    }
    return clientAnimate(element, keyframes, options);
  };
}

// ─── SSR-safe transition ───────────────────────────────────────────────────────

/**
 * Creates an SSR-safe CSS transition manager.
 *
 * - **Server**: `enter` and `leave` resolve immediately without mutating any
 *   element; `destroy` is a no-op.
 * - **Client**: delegates to the real {@link createTransition}.
 *
 * @param options CSS class / duration configuration.
 * @returns A {@link TransitionHandle}.
 */
export function createSSRSafeTransition(options: TransitionOptions = {}): TransitionHandle {
  if (typeof window === "undefined") {
    return createStubTransition();
  }
  return clientCreateTransition(options);
}

// ─── Hydration callback ────────────────────────────────────────────────────────

/** Internal store for callbacks registered during SSR. */
const _pendingHydrationCallbacks: Array<() => void> = [];

/**
 * Schedule `callback` to run after hydration.
 *
 * - **Server**: the callback is stored but never executed (the array is
 *   never drained on the server).
 * - **Client**: the callback is deferred via `requestIdleCallback` (when
 *   available) or `setTimeout(fn, 0)`, allowing the main thread to remain
 *   responsive.
 *
 * @param callback Function to invoke after the client is hydrated.
 */
export function onHydrated(callback: () => void): void {
  if (typeof window === "undefined") {
    // SSR: store without executing.
    _pendingHydrationCallbacks.push(callback);
    return;
  }

  // Client: defer until the browser is idle or the current task is done.
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => callback());
  } else {
    setTimeout(callback, 0);
  }
}

// ─── reduceMotion ──────────────────────────────────────────────────────────────

/**
 * Returns `true` when the user has requested reduced motion via the
 * `prefers-reduced-motion: reduce` media query.
 *
 * Always returns `false` in SSR environments where `window.matchMedia` is
 * not available.
 */
export function reduceMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── MotionProvider ────────────────────────────────────────────────────────────

/**
 * Unified SSR-safe interface that bundles all motion utilities.
 *
 * Consume this object in components to get SSR-aware behaviour without
 * importing each utility separately.
 *
 * @example
 * ```ts
 * import { MotionProvider } from "@vaisx/motion";
 *
 * if (!MotionProvider.isSSR()) {
 *   MotionProvider.animate(el, [{ opacity: 0 }, { opacity: 1 }]);
 * }
 * ```
 */
export const MotionProvider = {
  /** Whether the current execution context is a server (no `window`). */
  isSSR,

  /**
   * SSR-safe animate — no-op on the server, real animation on the client.
   * Matches the signature of the core `animate` function.
   */
  animate: createSSRSafeAnimate(),

  /**
   * SSR-safe transition factory — returns an immediately-resolving stub on
   * the server and the real CSS transition manager on the client.
   */
  transition: createSSRSafeTransition,

  /**
   * Register a callback to run after client hydration.
   * Stored silently on the server, deferred asynchronously on the client.
   */
  onHydrated,
} as const;

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Returns an AnimationControls stub where every operation is a no-op. */
function createStubControls(): AnimationControls {
  return {
    play() {},
    pause() {},
    cancel() {},
    finish() {},
    reverse() {},
    finished: Promise.resolve(),
  };
}

/** Returns a TransitionHandle stub where enter/leave resolve immediately. */
function createStubTransition(): TransitionHandle {
  return {
    enter(_el: Element): Promise<void> {
      return Promise.resolve();
    },
    leave(_el: Element): Promise<void> {
      return Promise.resolve();
    },
    destroy(): void {},
  };
}
