/**
 * layout — FLIP animation technique and shared layout transitions.
 *
 * Provides:
 *   - flipAnimate()          — FLIP (First, Last, Invert, Play) animation
 *   - createLayoutGroup()    — group of elements that animate together
 *   - createSharedTransition() — cross-fade transition between two elements
 *   - captureLayout()        — snapshot multiple element positions
 *   - applyInverse()         — helper to apply inverse transform
 *
 * SSR-safe: all DOM access is guarded by typeof window checks.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Options for the FLIP animation.
 */
export interface FLIPOptions {
  /** Duration of the animation in milliseconds. Defaults to 300. */
  duration?: number;
  /** CSS easing string. Defaults to "ease". */
  easing?: string;
  /** Callback invoked when the animation completes. */
  onComplete?: () => void;
}

/**
 * Controls returned by flipAnimate() to manage the animation.
 */
export interface FLIPControls {
  /** Cancel the running animation. */
  cancel(): void;
  /** Promise that resolves when the animation completes. */
  finished: Promise<void>;
}

/**
 * A snapshot of an element's layout position and size.
 */
export interface LayoutSnapshot {
  rect: DOMRect;
  element: Element;
}

/**
 * Handle returned by createLayoutGroup().
 */
export interface LayoutGroupHandle {
  /** Register an element with a layout ID. */
  register(element: Element, layoutId: string): void;
  /** Unregister an element by layout ID. */
  unregister(layoutId: string): void;
  /** Animate all registered elements using FLIP. */
  animate(options?: FLIPOptions): Promise<void>;
}

/**
 * Options for createSharedTransition().
 */
export interface SharedTransitionOptions extends FLIPOptions {
  /** Duration of the crossfade. Defaults to 300. */
  crossfadeDuration?: number;
}

// ─── captureLayout ────────────────────────────────────────────────────────────

/**
 * Snapshot the current bounding rects of multiple elements.
 *
 * Returns a Map from element to its DOMRect at the time of the call.
 * In SSR environments (no window) returns an empty Map.
 *
 * @param elements Array of elements to snapshot.
 */
export function captureLayout(elements: Element[]): Map<Element, DOMRect> {
  const map = new Map<Element, DOMRect>();
  if (typeof window === "undefined") return map;

  for (const el of elements) {
    map.set(el, el.getBoundingClientRect());
  }
  return map;
}

// ─── applyInverse ─────────────────────────────────────────────────────────────

/**
 * Apply an inverse transform to an element so that it appears to be at the
 * `first` position, even though it is currently at the `last` position.
 *
 * This is the "Invert" step of the FLIP technique.
 *
 * @param element The element to transform.
 * @param first   The DOMRect captured before the DOM mutation (First step).
 * @param last    The DOMRect captured after the DOM mutation (Last step).
 */
export function applyInverse(
  element: Element,
  first: DOMRect,
  last: DOMRect,
): void {
  if (typeof window === "undefined") return;

  const htmlEl = element as HTMLElement;

  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const scaleX = first.width / (last.width || 1);
  const scaleY = first.height / (last.height || 1);

  htmlEl.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
  htmlEl.style.transformOrigin = "top left";
}

// ─── flipAnimate ──────────────────────────────────────────────────────────────

/**
 * Perform a FLIP animation on an element.
 *
 * The caller is responsible for:
 *   1. Capturing the "First" rect (before any DOM mutation) using
 *      `element.getBoundingClientRect()` or `captureLayout()`.
 *   2. Performing the DOM mutation.
 *   3. Calling `flipAnimate(element, firstRect, options)`.
 *
 * `flipAnimate` will:
 *   - Measure the "Last" position.
 *   - Apply the inverse transform (Invert).
 *   - Animate to the identity transform (Play).
 *
 * @param element   The element to animate.
 * @param firstRect The DOMRect captured BEFORE the DOM mutation.
 * @param options   Optional FLIP options.
 * @returns         FLIPControls with a `finished` promise and `cancel()`.
 */
export function flipAnimate(
  element: Element,
  firstRect: DOMRect,
  options: FLIPOptions = {},
): FLIPControls {
  const { duration = 300, easing = "ease", onComplete } = options;

  // SSR guard — return a no-op stub.
  if (typeof window === "undefined") {
    return {
      cancel() {},
      finished: Promise.resolve(),
    };
  }

  const htmlEl = element as HTMLElement;

  // Last: measure new position after DOM mutation.
  const lastRect = htmlEl.getBoundingClientRect();

  const dx = firstRect.left - lastRect.left;
  const dy = firstRect.top - lastRect.top;
  const scaleX = firstRect.width / (lastRect.width || 1);
  const scaleY = firstRect.height / (lastRect.height || 1);

  // If there is no delta, nothing to animate.
  if (dx === 0 && dy === 0 && scaleX === 1 && scaleY === 1) {
    onComplete?.();
    return {
      cancel() {},
      finished: Promise.resolve(),
    };
  }

  // Invert: place element visually back to where it was.
  htmlEl.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
  htmlEl.style.transformOrigin = "top left";
  htmlEl.style.transition = "none";

  // Force reflow so the browser registers the inverted transform.
  void htmlEl.offsetHeight;

  // Play: animate to the natural (new) position using Web Animations API.
  let animation: Animation | null = null;
  let cancelled = false;

  const finished = new Promise<void>((resolve) => {
    // Use Web Animations API if available, otherwise fall back to style-based.
    if (typeof htmlEl.animate === "function") {
      animation = htmlEl.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
            transformOrigin: "top left",
          },
          {
            transform: "translate(0px, 0px) scale(1, 1)",
            transformOrigin: "top left",
          },
        ],
        { duration, easing, fill: "none" },
      );

      animation.finished
        .then(() => {
          if (cancelled) return;
          // Clean up inline styles applied during the Invert step.
          htmlEl.style.transform = "";
          htmlEl.style.transformOrigin = "";
          htmlEl.style.transition = "";
          onComplete?.();
          resolve();
        })
        .catch(() => {
          // Animation was cancelled — resolve silently.
          resolve();
        });
    } else {
      // Fallback for environments without Element.prototype.animate.
      htmlEl.style.transition = `transform ${duration}ms ${easing}`;
      htmlEl.style.transform = "translate(0px, 0px) scale(1, 1)";

      const cleanup = () => {
        if (cancelled) return;
        htmlEl.style.transform = "";
        htmlEl.style.transformOrigin = "";
        htmlEl.style.transition = "";
        htmlEl.removeEventListener("transitionend", cleanup);
        onComplete?.();
        resolve();
      };

      htmlEl.addEventListener("transitionend", cleanup, { once: true });

      // Fallback timer in case transitionend doesn't fire.
      setTimeout(() => {
        if (!cancelled) cleanup();
      }, duration + 50);
    }
  });

  return {
    cancel() {
      cancelled = true;
      if (animation) {
        animation.cancel();
        animation = null;
      }
      htmlEl.style.transform = "";
      htmlEl.style.transformOrigin = "";
      htmlEl.style.transition = "";
    },
    finished,
  };
}

// ─── createLayoutGroup ────────────────────────────────────────────────────────

/**
 * Create a layout group that tracks multiple elements by a stable `layoutId`
 * and can FLIP-animate them all at once when their positions change.
 *
 * @param id A debug label for the group (not used at runtime).
 */
export function createLayoutGroup(id: string): LayoutGroupHandle {
  // Suppress unused-variable lint for the id parameter — it is kept for
  // debug/labelling purposes only.
  void id;

  /** Map from layoutId → { element, lastSnapshot } */
  const registry = new Map<
    string,
    { element: Element; snapshot: DOMRect | null }
  >();

  function register(element: Element, layoutId: string): void {
    // Capture the current position when registering.
    const snapshot =
      typeof window !== "undefined"
        ? element.getBoundingClientRect()
        : null;
    registry.set(layoutId, { element, snapshot });
  }

  function unregister(layoutId: string): void {
    registry.delete(layoutId);
  }

  async function animate(options: FLIPOptions = {}): Promise<void> {
    if (typeof window === "undefined") return;

    const animations: Promise<void>[] = [];

    for (const [, entry] of registry) {
      const { element, snapshot: firstRect } = entry;
      if (!firstRect) continue;

      const controls = flipAnimate(element, firstRect, options);
      animations.push(controls.finished);

      // Update the stored snapshot to the new position for the next call.
      entry.snapshot = element.getBoundingClientRect();
    }

    await Promise.all(animations);
  }

  return { register, unregister, animate };
}

// ─── createSharedTransition ───────────────────────────────────────────────────

/**
 * Animate a shared-element transition between `fromEl` and `toEl`.
 *
 * The implementation:
 *   1. Captures `fromEl`'s rect as the starting geometry.
 *   2. Creates a fixed-position clone of `fromEl` and appends it to
 *      `document.body` for the duration of the transition.
 *   3. Hides `fromEl` (visibility: hidden) during the transition.
 *   4. Fades the clone out and `toEl` in simultaneously.
 *   5. Moves the clone from `fromEl`'s rect to `toEl`'s rect via FLIP.
 *   6. Cleans up when the transition is done.
 *
 * @param fromEl  The element transitioning FROM.
 * @param toEl    The element transitioning TO.
 * @param options Optional transition options.
 * @returns       A promise that resolves when the transition completes.
 */
export function createSharedTransition(
  fromEl: Element,
  toEl: Element,
  options: SharedTransitionOptions = {},
): Promise<void> {
  const { duration = 300, easing = "ease", onComplete, crossfadeDuration } = options;
  const fadeDuration = crossfadeDuration ?? duration;

  // SSR guard.
  if (typeof window === "undefined") {
    onComplete?.();
    return Promise.resolve();
  }

  const fromHtml = fromEl as HTMLElement;
  const toHtml = toEl as HTMLElement;

  // Capture First (fromEl position).
  const fromRect = fromHtml.getBoundingClientRect();
  const toRect = toHtml.getBoundingClientRect();

  // Clone fromEl for the visual transition.
  const clone = fromHtml.cloneNode(true) as HTMLElement;

  // Position clone exactly over fromEl using fixed positioning.
  clone.style.position = "fixed";
  clone.style.top = `${fromRect.top}px`;
  clone.style.left = `${fromRect.left}px`;
  clone.style.width = `${fromRect.width}px`;
  clone.style.height = `${fromRect.height}px`;
  clone.style.margin = "0";
  clone.style.transformOrigin = "top left";
  clone.style.pointerEvents = "none";
  clone.style.zIndex = "9999";

  document.body.appendChild(clone);

  // Hide both source and target during the transition.
  const fromOriginalVisibility = fromHtml.style.visibility;
  const toOriginalOpacity = toHtml.style.opacity;

  fromHtml.style.visibility = "hidden";
  toHtml.style.opacity = "0";

  // Compute the translation and scale needed to move clone → toRect.
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;
  const scaleX = toRect.width / (fromRect.width || 1);
  const scaleY = toRect.height / (fromRect.height || 1);

  return new Promise<void>((resolve) => {
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;

      // Clean up clone.
      if (clone.parentNode) {
        clone.parentNode.removeChild(clone);
      }

      // Restore source element.
      fromHtml.style.visibility = fromOriginalVisibility;

      // Reveal target element.
      toHtml.style.opacity = toOriginalOpacity;
      toHtml.style.transition = "";

      onComplete?.();
      resolve();
    };

    if (typeof clone.animate === "function") {
      // Animate clone moving from fromRect → toRect.
      const moveAnimation = clone.animate(
        [
          { transform: "translate(0, 0) scale(1, 1)", opacity: "1" },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
            opacity: "0",
          },
        ],
        { duration: fadeDuration, easing, fill: "forwards" },
      );

      // Fade in toEl simultaneously.
      const fadeIn = toHtml.animate(
        [{ opacity: "0" }, { opacity: "1" }],
        { duration: fadeDuration, easing, fill: "forwards" },
      );

      Promise.all([moveAnimation.finished, fadeIn.finished])
        .then(() => {
          // Remove fill="forwards" effect by clearing inline styles.
          toHtml.style.opacity = toOriginalOpacity;
          finish();
        })
        .catch(() => finish());
    } else {
      // Fallback: simple CSS transition.
      clone.style.transition = `transform ${fadeDuration}ms ${easing}, opacity ${fadeDuration}ms ${easing}`;
      toHtml.style.transition = `opacity ${fadeDuration}ms ${easing}`;

      // Force reflow.
      void clone.offsetHeight;

      clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
      clone.style.opacity = "0";
      toHtml.style.opacity = "1";

      const timer = setTimeout(finish, fadeDuration + 50);

      clone.addEventListener(
        "transitionend",
        () => {
          clearTimeout(timer);
          finish();
        },
        { once: true },
      );
    }
  });
}
