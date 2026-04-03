/**
 * Core type definitions for @vaisx/motion.
 * Web Animations API-based animation and transition primitives.
 */

/**
 * Options for the animate() function, wrapping Web Animations API KeyframeAnimationOptions.
 */
export interface AnimationOptions {
  /** Duration of the animation in milliseconds. */
  duration?: number;
  /** CSS easing string or cubic-bezier descriptor. */
  easing?: string;
  /** Delay before the animation starts, in milliseconds. */
  delay?: number;
  /** Fill mode: how the animation applies styles before/after it runs. */
  fill?: "none" | "forwards" | "backwards" | "both" | "auto";
  /** Number of times the animation repeats. Use Infinity for looping. */
  iterations?: number;
}

/**
 * Options for CSS class-based enter/leave transitions.
 */
export interface TransitionOptions {
  /** CSS class(es) applied during the enter phase. */
  enter?: string;
  /** CSS class(es) applied during the leave phase. */
  leave?: string;
  /** Duration of the transition in milliseconds (used for timing callbacks). */
  duration?: number;
  /** CSS easing string applied to the transition. */
  easing?: string;
}

/**
 * Options for spring-based physics animations.
 */
export interface SpringOptions {
  /** Spring stiffness constant (default: 100). */
  stiffness?: number;
  /** Damping coefficient (default: 10). */
  damping?: number;
  /** Mass of the animated object (default: 1). */
  mass?: number;
  /** Initial velocity of the spring (default: 0). */
  velocity?: number;
}

/**
 * Controls returned by animate() to manage a running animation.
 * Maps directly onto the Web Animations API Animation interface.
 */
export interface AnimationControls {
  /** Resume a paused animation. */
  play(): void;
  /** Pause the animation at its current position. */
  pause(): void;
  /** Cancel the animation and revert to the unanimated state. */
  cancel(): void;
  /** Jump immediately to the end of the animation. */
  finish(): void;
  /** Reverse the playback direction. */
  reverse(): void;
  /** Promise that resolves when the animation finishes naturally. */
  finished: Promise<void>;
}

/**
 * Lifecycle state of a CSS transition managed by createTransition().
 */
export type TransitionState =
  | "entering"
  | "entered"
  | "leaving"
  | "left"
  | "idle";

/**
 * Options for gesture recognition.
 */
export interface GestureOptions {
  /** Enable drag gesture recognition. */
  drag?: boolean;
  /** Enable swipe gesture recognition. */
  swipe?: boolean;
  /** Enable pinch gesture recognition. */
  pinch?: boolean;
}

/**
 * A reactive motion value that holds a typed value and notifies subscribers.
 */
export interface MotionValue<T> {
  /** Get the current value. */
  get(): T;
  /** Set a new value and notify all subscribers. */
  set(v: T): void;
  /**
   * Subscribe to value changes.
   * @returns An unsubscribe function.
   */
  subscribe(cb: (value: T) => void): () => void;
}

/**
 * Handle returned by createTransition() for managing enter/leave transitions on elements.
 */
export interface TransitionHandle {
  /** Apply enter transition classes to the element. */
  enter(el: Element): Promise<void>;
  /** Apply leave transition classes to the element. */
  leave(el: Element): Promise<void>;
  /** Clean up all active transitions. */
  destroy(): void;
}
