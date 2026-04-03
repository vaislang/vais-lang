/**
 * @vaisx/motion — Public API
 *
 * Animation and transition primitives built on the Web Animations API.
 */

// Core animation function
export { animate } from "./animate.js";

// CSS class-based transition manager
export { createTransition } from "./transition.js";

// CSS enter/leave transition (Vue-style) and list transition with FLIP
export {
  createCSSTransition,
  createListTransition,
  capturePositions,
} from "./css-transition.js";

// Easing presets and cubic-bezier factory
export { linear, easeIn, easeOut, easeInOut, cubicBezier, easings } from "./easing.js";

// Spring physics engine
export { spring, springValue, createSpringAnimation, presets as springPresets } from "./spring.js";
export type { SpringAnimationOptions, SpringAnimation, SpringPreset } from "./spring.js";


// SSR-safe utilities and hydration helpers
export {
  isSSR,
  createSSRSafeAnimate,
  createSSRSafeTransition,
  onHydrated,
  reduceMotion,
  MotionProvider,
} from "./ssr.js";

// Gesture primitives — drag, swipe, pinch
export {
  createDragGesture,
  createSwipeGesture,
  createPinchGesture,
} from "./gesture.js";

export type {
  GestureState,
  DragOptions,
  DragBounds,
  SwipeOptions,
  PinchOptions,
} from "./gesture.js";

// Type definitions
export type {
  AnimationOptions,
  TransitionOptions,
  SpringOptions,
  AnimationControls,
  TransitionState,
  GestureOptions,
  MotionValue,
  TransitionHandle,
} from "./types.js";

export type {
  CSSTransitionOptions,
  CSSTransitionHandle,
  ListTransitionOptions,
  ListTransitionHandle,
} from "./css-transition.js";

// FLIP animation technique and shared layout transitions
export {
  flipAnimate,
  createLayoutGroup,
  createSharedTransition,
  captureLayout,
  applyInverse,
} from "./layout.js";

export type {
  FLIPOptions,
  FLIPControls,
  LayoutSnapshot,
  LayoutGroupHandle,
  SharedTransitionOptions,
} from "./layout.js";
