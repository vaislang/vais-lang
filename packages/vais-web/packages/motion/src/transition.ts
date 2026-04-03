/**
 * transition — CSS class-based enter/leave transition manager.
 * SSR-safe: no DOM access outside of enter() / leave() calls.
 */

import type { TransitionOptions, TransitionHandle, TransitionState } from "./types.js";

/**
 * Creates a transition manager that applies CSS class-based enter/leave
 * transitions to DOM elements.
 *
 * The lifecycle mirrors Vue's `<Transition>` component semantics:
 *   enter: idle → entering → entered
 *   leave: entered/idle → leaving → left
 *
 * @param options Configuration for enter/leave classes and timing.
 * @returns       A {@link TransitionHandle} with enter/leave/destroy methods.
 */
export function createTransition(options: TransitionOptions = {}): TransitionHandle {
  const {
    enter: enterClass = "enter",
    leave: leaveClass = "leave",
    duration = 300,
  } = options;

  // Track active timers so destroy() can clear them.
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function scheduleTimer(fn: () => void, delay: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, delay);
    timers.add(id);
  }

  /**
   * Apply enter classes to `el` and remove them after `duration` ms.
   * Resolves once the enter transition is complete.
   */
  function enter(el: Element): Promise<void> {
    return new Promise<void>((resolve) => {
      setTransitionState(el, "entering");
      addClasses(el, enterClass);

      scheduleTimer(() => {
        removeClasses(el, enterClass);
        setTransitionState(el, "entered");
        resolve();
      }, duration);
    });
  }

  /**
   * Apply leave classes to `el` and remove them after `duration` ms.
   * Resolves once the leave transition is complete.
   */
  function leave(el: Element): Promise<void> {
    return new Promise<void>((resolve) => {
      setTransitionState(el, "leaving");
      addClasses(el, leaveClass);

      scheduleTimer(() => {
        removeClasses(el, leaveClass);
        setTransitionState(el, "left");
        resolve();
      }, duration);
    });
  }

  /** Cancel all active timers and clean up. */
  function destroy(): void {
    for (const id of timers) {
      clearTimeout(id);
    }
    timers.clear();
  }

  return { enter, leave, destroy };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Split a space-separated class string and add each class to the element. */
function addClasses(el: Element, classString: string): void {
  const classes = classString.split(/\s+/).filter(Boolean);
  if (classes.length > 0) {
    el.classList.add(...classes);
  }
}

/** Split a space-separated class string and remove each class from the element. */
function removeClasses(el: Element, classString: string): void {
  const classes = classString.split(/\s+/).filter(Boolean);
  if (classes.length > 0) {
    el.classList.remove(...classes);
  }
}

/** Write the current TransitionState onto the element as a data attribute. */
function setTransitionState(el: Element, state: TransitionState): void {
  (el as HTMLElement).dataset["motionState"] = state;
}
