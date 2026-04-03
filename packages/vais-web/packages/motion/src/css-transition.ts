/**
 * css-transition — Vue-style CSS class-based enter/leave transition manager.
 * Applies enterFrom/enterActive/enterTo and leaveFrom/leaveActive/leaveTo
 * classes in the correct sequence, using transitionend events with a
 * duration-based fallback.
 *
 * Also provides createListTransition() for animating list items with enter,
 * leave, and FLIP-based move animations.
 *
 * SSR-safe: all DOM access is guarded by typeof window checks.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Options for createCSSTransition().
 *
 * Class lifecycle mirrors Vue's <Transition> semantics:
 *   enter: [enterFrom + enterActive] → (next frame) → [enterTo + enterActive] → done → []
 *   leave: [leaveFrom + leaveActive] → (next frame) → [leaveTo + leaveActive] → done → []
 */
export interface CSSTransitionOptions {
  /** Class applied at the very start of the enter phase (e.g. "opacity-0"). */
  enterFrom?: string;
  /** Class applied throughout the enter phase (e.g. "transition-opacity"). */
  enterActive?: string;
  /** Class applied once the element has entered (e.g. "opacity-100"). */
  enterTo?: string;
  /** Class applied at the very start of the leave phase (e.g. "opacity-100"). */
  leaveFrom?: string;
  /** Class applied throughout the leave phase (e.g. "transition-opacity"). */
  leaveActive?: string;
  /** Class applied once leaving is in progress (e.g. "opacity-0"). */
  leaveTo?: string;
  /**
   * Fallback duration in milliseconds used when the transitionend event
   * does not fire (e.g. no CSS transition is defined).  Defaults to 300.
   */
  duration?: number;
  /** Callback invoked when the enter transition completes. */
  onEnter?: (el: Element) => void;
  /** Callback invoked when the leave transition completes. */
  onLeave?: (el: Element) => void;
}

/**
 * Handle returned by createCSSTransition().
 */
export interface CSSTransitionHandle {
  /** Run the enter transition on `el`. Resolves when complete. */
  enter(el: Element): Promise<void>;
  /** Run the leave transition on `el`. Resolves when complete. */
  leave(el: Element): Promise<void>;
  /** Cancel all pending timers and listeners. */
  destroy(): void;
}

/**
 * Options for createListTransition().
 */
export interface ListTransitionOptions extends CSSTransitionOptions {
  /**
   * CSS class applied to items that are moving to a new position (FLIP).
   * Defaults to "move".
   */
  moveClass?: string;
}

/**
 * Handle returned by createListTransition().
 */
export interface ListTransitionHandle {
  /**
   * Notify the transition manager that `el` has been added to the list.
   * Runs the enter animation.
   */
  itemEnter(el: Element): Promise<void>;
  /**
   * Notify the transition manager that `el` is about to be removed from the
   * list.  Runs the leave animation; resolves when the element can be
   * removed from the DOM.
   */
  itemLeave(el: Element): Promise<void>;
  /**
   * Call this after mutating the list DOM to animate items moving to their
   * new positions using the FLIP technique.
   *
   * @param elements  All currently visible list items (in new DOM order).
   * @param snapshots A map from element to its DOMRect **before** the mutation
   *                  (captured with capturePositions()).
   */
  applyMoveTransitions(
    elements: Element[],
    snapshots: Map<Element, DOMRect>,
  ): void;
  /** Cancel all pending timers and listeners. */
  destroy(): void;
}

// ─── createCSSTransition ─────────────────────────────────────────────────────

/**
 * Creates a CSS class-based transition manager that follows Vue's
 * `<Transition>` class lifecycle.
 *
 * Enter sequence:
 *   1. Apply `enterFrom` + `enterActive`
 *   2. Wait one animation frame so the browser paints the initial state
 *   3. Remove `enterFrom`, apply `enterTo`
 *   4. Wait for `transitionend` (or `duration` ms fallback)
 *   5. Remove `enterActive` + `enterTo`, call `onEnter`
 *
 * Leave sequence mirrors enter with `leaveFrom`/`leaveActive`/`leaveTo`.
 */
export function createCSSTransition(
  options: CSSTransitionOptions = {},
): CSSTransitionHandle {
  const {
    enterFrom = "",
    enterActive = "",
    enterTo = "",
    leaveFrom = "",
    leaveActive = "",
    leaveTo = "",
    duration = 300,
    onEnter,
    onLeave,
  } = options;

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const cleanups = new Set<() => void>();

  function scheduleTimer(fn: () => void, delay: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, delay);
    timers.add(id);
    return id;
  }

  /**
   * Wait for the first transitionend / animationend event on `el`, with a
   * fallback timeout of `duration` ms.  Returns a cleanup function that
   * removes the listener and clears the timer.
   */
  function waitForTransitionEnd(el: Element, resolve: () => void): () => void {
    // SSR guard — no DOM events available.
    if (typeof window === "undefined") {
      const id = scheduleTimer(resolve, 0);
      return () => {
        clearTimeout(id);
        timers.delete(id);
      };
    }

    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackId);
      timers.delete(fallbackId);
      el.removeEventListener("transitionend", onEnd);
      el.removeEventListener("animationend", onEnd);
      resolve();
    };

    const onEnd = (): void => finish();

    el.addEventListener("transitionend", onEnd);
    el.addEventListener("animationend", onEnd);

    const fallbackId = scheduleTimer(finish, duration);

    return () => {
      settled = true;
      clearTimeout(fallbackId);
      timers.delete(fallbackId);
      el.removeEventListener("transitionend", onEnd);
      el.removeEventListener("animationend", onEnd);
    };
  }

  function addClasses(el: Element, classString: string): void {
    const classes = classString.split(/\s+/).filter(Boolean);
    if (classes.length > 0) el.classList.add(...classes);
  }

  function removeClasses(el: Element, classString: string): void {
    const classes = classString.split(/\s+/).filter(Boolean);
    if (classes.length > 0) el.classList.remove(...classes);
  }

  /**
   * Defer `fn` to the next event-loop turn so the browser (or jsdom) can
   * paint the initial from-state before the to-state classes are swapped in.
   *
   * We use setTimeout(0) rather than requestAnimationFrame because:
   *   - It works identically in jsdom test environments with fake timers.
   *   - It is SSR-safe (no window dependency).
   *   - In real browsers a 0 ms timer still defers past the current
   *     synchronous layout, which is sufficient for CSS transitions to pick
   *     up the initial keyframe state.
   */
  function nextFrame(fn: () => void): void {
    scheduleTimer(fn, 0);
  }

  function enter(el: Element): Promise<void> {
    return new Promise<void>((resolve) => {
      // Step 1 — apply initial state classes.
      addClasses(el, enterFrom);
      addClasses(el, enterActive);

      // Step 2 — next frame: swap enterFrom → enterTo.
      nextFrame(() => {
        removeClasses(el, enterFrom);
        addClasses(el, enterTo);

        // Step 3 — wait for CSS transition to end.
        const cleanup = waitForTransitionEnd(el, () => {
          cleanups.delete(cleanup);
          removeClasses(el, enterActive);
          removeClasses(el, enterTo);
          onEnter?.(el);
          resolve();
        });
        cleanups.add(cleanup);
      });
    });
  }

  function leave(el: Element): Promise<void> {
    return new Promise<void>((resolve) => {
      addClasses(el, leaveFrom);
      addClasses(el, leaveActive);

      nextFrame(() => {
        removeClasses(el, leaveFrom);
        addClasses(el, leaveTo);

        const cleanup = waitForTransitionEnd(el, () => {
          cleanups.delete(cleanup);
          removeClasses(el, leaveActive);
          removeClasses(el, leaveTo);
          onLeave?.(el);
          resolve();
        });
        cleanups.add(cleanup);
      });
    });
  }

  function destroy(): void {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const cleanup of cleanups) cleanup();
    cleanups.clear();
  }

  return { enter, leave, destroy };
}

// ─── capturePositions ─────────────────────────────────────────────────────────

/**
 * Snapshot the bounding rects of each element before a DOM mutation so that
 * applyMoveTransitions() can compute FLIP deltas.
 */
export function capturePositions(elements: Element[]): Map<Element, DOMRect> {
  const map = new Map<Element, DOMRect>();
  for (const el of elements) {
    map.set(el, el.getBoundingClientRect());
  }
  return map;
}

// ─── createListTransition ─────────────────────────────────────────────────────

/**
 * Creates a transition manager for animating list items.
 *
 * - itemEnter()  — plays the enter animation when a new item is added.
 * - itemLeave()  — plays the leave animation before an item is removed.
 * - applyMoveTransitions() — uses the FLIP technique to smoothly animate
 *   items that shifted position after a list mutation.
 */
export function createListTransition(
  options: ListTransitionOptions = {},
): ListTransitionHandle {
  const { moveClass = "move", ...cssOptions } = options;

  const cssTransition = createCSSTransition(cssOptions);

  function itemEnter(el: Element): Promise<void> {
    return cssTransition.enter(el);
  }

  function itemLeave(el: Element): Promise<void> {
    return cssTransition.leave(el);
  }

  /**
   * FLIP: for each element, compute the delta between its old rect
   * (from `snapshots`) and its current rect, invert it with a transform,
   * then animate to the identity transform.
   */
  function applyMoveTransitions(
    elements: Element[],
    snapshots: Map<Element, DOMRect>,
  ): void {
    // SSR guard.
    if (typeof window === "undefined") return;

    for (const el of elements) {
      const before = snapshots.get(el);
      if (!before) continue;

      const after = el.getBoundingClientRect();

      const dx = before.left - after.left;
      const dy = before.top - after.top;

      if (dx === 0 && dy === 0) continue;

      const htmlEl = el as HTMLElement;

      // Invert — place element back to where it was visually.
      htmlEl.style.transform = `translate(${dx}px, ${dy}px)`;
      htmlEl.style.transition = "none";

      // Force reflow so the browser registers the initial transform.
      void htmlEl.offsetHeight;

      // Play — animate to natural position.
      htmlEl.classList.add(moveClass);
      htmlEl.style.transform = "";
      htmlEl.style.transition = "";

      const onMoveEnd = (): void => {
        htmlEl.classList.remove(moveClass);
        htmlEl.removeEventListener("transitionend", onMoveEnd);
        htmlEl.removeEventListener("animationend", onMoveEnd);
      };

      htmlEl.addEventListener("transitionend", onMoveEnd);
      htmlEl.addEventListener("animationend", onMoveEnd);
    }
  }

  function destroy(): void {
    cssTransition.destroy();
  }

  return { itemEnter, itemLeave, applyMoveTransitions, destroy };
}
