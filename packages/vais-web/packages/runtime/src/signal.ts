/**
 * Dynamic signal fallback for cases where compile-time analysis is insufficient.
 * Used when vaisx-compiler cannot statically determine dependency relationships.
 * Target size: ~800B gzipped
 */

import { $$schedule } from "./scheduler.js";

type Subscriber = () => void;

export interface Signal<T> {
  /** Get the current value */
  (): T;
  /** Set a new value */
  set(value: T): void;
}

/** Currently running computed/effect tracker */
let currentTracker: Subscriber | null = null;

/**
 * Create a reactive signal with getter and setter.
 * When the value changes, all subscribers (computed/effects) are re-scheduled.
 */
export function createSignal<T>(initialValue: T): Signal<T> {
  let value = initialValue;
  const subscribers = new Set<Subscriber>();

  const signal = (() => {
    // Track dependency if inside a computed/effect
    if (currentTracker) {
      subscribers.add(currentTracker);
    }
    return value;
  }) as Signal<T>;

  signal.set = (newValue: T) => {
    if (Object.is(value, newValue)) return;
    value = newValue;
    for (const sub of subscribers) {
      $$schedule(sub);
    }
  };

  return signal;
}

/**
 * Run a function while tracking signal reads.
 * @internal — used by createComputed and createEffect
 */
export function track<T>(fn: () => T, subscriber: Subscriber): T {
  const prev = currentTracker;
  currentTracker = subscriber;
  try {
    return fn();
  } finally {
    currentTracker = prev;
  }
}

/**
 * Create a computed signal that re-evaluates when dependencies change.
 */
export function createComputed<T>(fn: () => T): Signal<T> {
  const signal = createSignal<T>(undefined as T);
  const update = () => {
    signal.set(track(fn, update));
  };
  update(); // initial evaluation
  return signal;
}

/**
 * Create an effect that runs when dependencies change.
 * Returns a dispose function.
 */
export function createEffect(fn: () => void | (() => void)): () => void {
  let cleanup: void | (() => void);
  const run = () => {
    if (cleanup) cleanup();
    cleanup = track(fn, run);
  };
  run(); // initial run
  return () => {
    if (cleanup) cleanup();
  };
}
