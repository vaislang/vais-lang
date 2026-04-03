/**
 * gesture.ts — Drag, Swipe, and Pinch gesture primitives.
 *
 * SSR-safe: all event-listener registration is guarded by `typeof window`.
 * Works in jsdom (PointerEvent / MouseEvent / TouchEvent).
 */

// ─── Public types ────────────────────────────────────────────────────────────

/** Snapshot of the current gesture state. */
export interface GestureState {
  /** Current x position (relative to the viewport). */
  x: number;
  /** Current y position (relative to the viewport). */
  y: number;
  /** Cumulative delta x since gesture start. */
  dx: number;
  /** Cumulative delta y since gesture start. */
  dy: number;
  /** Current velocity in pixels/ms (magnitude). */
  velocity: number;
  /** Swipe / drag direction. */
  direction: "up" | "down" | "left" | "right" | null;
  /** Current scale factor (pinch only; 1 for drag/swipe). */
  scale: number;
  /** Whether the gesture is currently active. */
  active: boolean;
}

/** Bounding box used to constrain drag movement. */
export interface DragBounds {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Options accepted by {@link createDragGesture}. */
export interface DragOptions {
  /** Constrain movement to a single axis or allow both. Default: "both". */
  axis?: "x" | "y" | "both";
  /** Optional bounding box (in pixels, viewport-relative) to clamp the drag. */
  bounds?: DragBounds;
  /** Called when the drag starts. */
  onDragStart?: (state: GestureState) => void;
  /** Called continuously while dragging. */
  onDrag?: (state: GestureState) => void;
  /** Called when the drag ends (includes inertia/velocity info). */
  onDragEnd?: (state: GestureState) => void;
}

/** Options accepted by {@link createSwipeGesture}. */
export interface SwipeOptions {
  /** Minimum displacement in px to count as a swipe. Default: 50. */
  threshold?: number;
  /** Minimum velocity (px/ms) to count as a swipe. Default: 0.5. */
  velocity?: number;
  /** Called when a swipe is detected. */
  onSwipe?: (state: GestureState) => void;
}

/** Options accepted by {@link createPinchGesture}. */
export interface PinchOptions {
  /** Minimum scale factor. Default: 0.5. */
  minScale?: number;
  /** Maximum scale factor. Default: 3. */
  maxScale?: number;
  /** Called on every pinch update. */
  onPinch?: (state: GestureState) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the primary {x, y} from either a PointerEvent, MouseEvent or the
 *  first touch in a TouchEvent. */
function getPointer(
  e: PointerEvent | MouseEvent | TouchEvent,
): { x: number; y: number } {
  if ("touches" in e) {
    const t = e.touches[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: 0, y: 0 };
  }
  return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
}

/** Distance between two touch points. */
function touchDistance(touches: TouchList): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Determine the primary direction of a displacement vector. */
function primaryDirection(
  dx: number,
  dy: number,
): "up" | "down" | "left" | "right" {
  return Math.abs(dx) >= Math.abs(dy)
    ? dx > 0
      ? "right"
      : "left"
    : dy > 0
      ? "down"
      : "up";
}

/** Clamp a number inside [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── createDragGesture ────────────────────────────────────────────────────────

/**
 * Attach drag gesture recognition (pointer + mouse + touch) to `element`.
 *
 * @returns A cleanup function that removes all event listeners.
 */
export function createDragGesture(
  element: Element,
  options: DragOptions = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  const { axis = "both", bounds, onDragStart, onDrag, onDragEnd } = options;

  let active = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocityX = 0;
  let velocityY = 0;

  function buildState(x: number, y: number): GestureState {
    const rawDx = x - startX;
    const rawDy = y - startY;
    const dx = axis === "y" ? 0 : rawDx;
    const dy = axis === "x" ? 0 : rawDy;
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
    return {
      x,
      y,
      dx,
      dy,
      velocity: speed,
      direction: primaryDirection(rawDx, rawDy),
      scale: 1,
      active,
    };
  }

  function applyBounds(x: number, y: number): { x: number; y: number } {
    if (!bounds) return { x, y };
    return {
      x: clamp(
        x,
        bounds.left ?? -Infinity,
        bounds.right ?? Infinity,
      ),
      y: clamp(
        y,
        bounds.top ?? -Infinity,
        bounds.bottom ?? Infinity,
      ),
    };
  }

  function onStart(e: PointerEvent | MouseEvent | TouchEvent): void {
    const pt = getPointer(e);
    active = true;
    startX = pt.x;
    startY = pt.y;
    lastX = pt.x;
    lastY = pt.y;
    lastTime = Date.now();
    velocityX = 0;
    velocityY = 0;
    onDragStart?.(buildState(pt.x, pt.y));
  }

  function onMove(e: PointerEvent | MouseEvent | TouchEvent): void {
    if (!active) return;
    const pt = getPointer(e);
    const now = Date.now();
    const dt = now - lastTime || 1;
    velocityX = (pt.x - lastX) / dt;
    velocityY = (pt.y - lastY) / dt;
    lastX = pt.x;
    lastY = pt.y;
    lastTime = now;

    // Apply axis constraint and bounds.
    const cx = axis === "y" ? startX : pt.x;
    const cy = axis === "x" ? startY : pt.y;
    const { x: bx, y: by } = applyBounds(cx, cy);

    onDrag?.(buildState(bx, by));
  }

  function onEnd(e: PointerEvent | MouseEvent | TouchEvent): void {
    if (!active) return;
    active = false;
    const pt = getPointer(e);
    const state: GestureState = {
      ...buildState(pt.x, pt.y),
      active: false,
    };
    onDragEnd?.(state);
  }

  // Use pointer events when available, fall back to mouse + touch.
  const el = element as HTMLElement;

  if (typeof PointerEvent !== "undefined") {
    el.addEventListener("pointerdown", onStart as EventListener);
    window.addEventListener("pointermove", onMove as EventListener);
    window.addEventListener("pointerup", onEnd as EventListener);
    window.addEventListener("pointercancel", onEnd as EventListener);

    return () => {
      el.removeEventListener("pointerdown", onStart as EventListener);
      window.removeEventListener("pointermove", onMove as EventListener);
      window.removeEventListener("pointerup", onEnd as EventListener);
      window.removeEventListener("pointercancel", onEnd as EventListener);
    };
  }

  // Touch fallback.
  el.addEventListener("touchstart", onStart as EventListener, { passive: true });
  window.addEventListener("touchmove", onMove as EventListener, { passive: true });
  window.addEventListener("touchend", onEnd as EventListener);
  window.addEventListener("touchcancel", onEnd as EventListener);

  // Mouse fallback.
  el.addEventListener("mousedown", onStart as EventListener);
  window.addEventListener("mousemove", onMove as EventListener);
  window.addEventListener("mouseup", onEnd as EventListener);

  return () => {
    el.removeEventListener("touchstart", onStart as EventListener);
    window.removeEventListener("touchmove", onMove as EventListener);
    window.removeEventListener("touchend", onEnd as EventListener);
    window.removeEventListener("touchcancel", onEnd as EventListener);
    el.removeEventListener("mousedown", onStart as EventListener);
    window.removeEventListener("mousemove", onMove as EventListener);
    window.removeEventListener("mouseup", onEnd as EventListener);
  };
}

// ─── createSwipeGesture ───────────────────────────────────────────────────────

/**
 * Attach swipe gesture recognition to `element`.
 *
 * A swipe is triggered at the end of a drag when both the displacement and the
 * release velocity meet the configured thresholds.
 *
 * @returns A cleanup function that removes all event listeners.
 */
export function createSwipeGesture(
  element: Element,
  options: SwipeOptions = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  const {
    threshold = 50,
    velocity: velocityThreshold = 0.5,
    onSwipe,
  } = options;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let lastX = 0;
  let lastY = 0;
  let active = false;

  function onStart(e: PointerEvent | MouseEvent | TouchEvent): void {
    const pt = getPointer(e);
    startX = pt.x;
    startY = pt.y;
    lastX = pt.x;
    lastY = pt.y;
    startTime = Date.now();
    active = true;
  }

  function onMove(e: PointerEvent | MouseEvent | TouchEvent): void {
    if (!active) return;
    const pt = getPointer(e);
    lastX = pt.x;
    lastY = pt.y;
  }

  function onEnd(_e: PointerEvent | MouseEvent | TouchEvent): void {
    if (!active) return;
    active = false;
    const dx = lastX - startX;
    const dy = lastY - startY;
    const elapsed = Date.now() - startTime || 1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const vel = dist / elapsed; // px/ms

    if (dist >= threshold && vel >= velocityThreshold) {
      const direction = primaryDirection(dx, dy);
      const state: GestureState = {
        x: lastX,
        y: lastY,
        dx,
        dy,
        velocity: vel,
        direction,
        scale: 1,
        active: false,
      };
      onSwipe?.(state);
    }
  }

  const el = element as HTMLElement;

  if (typeof PointerEvent !== "undefined") {
    el.addEventListener("pointerdown", onStart as EventListener);
    window.addEventListener("pointermove", onMove as EventListener);
    window.addEventListener("pointerup", onEnd as EventListener);
    window.addEventListener("pointercancel", onEnd as EventListener);

    return () => {
      el.removeEventListener("pointerdown", onStart as EventListener);
      window.removeEventListener("pointermove", onMove as EventListener);
      window.removeEventListener("pointerup", onEnd as EventListener);
      window.removeEventListener("pointercancel", onEnd as EventListener);
    };
  }

  // Touch fallback.
  el.addEventListener("touchstart", onStart as EventListener, { passive: true });
  window.addEventListener("touchmove", onMove as EventListener, { passive: true });
  window.addEventListener("touchend", onEnd as EventListener);

  // Mouse fallback.
  el.addEventListener("mousedown", onStart as EventListener);
  window.addEventListener("mousemove", onMove as EventListener);
  window.addEventListener("mouseup", onEnd as EventListener);

  return () => {
    el.removeEventListener("touchstart", onStart as EventListener);
    window.removeEventListener("touchmove", onMove as EventListener);
    window.removeEventListener("touchend", onEnd as EventListener);
    el.removeEventListener("mousedown", onStart as EventListener);
    window.removeEventListener("mousemove", onMove as EventListener);
    window.removeEventListener("mouseup", onEnd as EventListener);
  };
}

// ─── createPinchGesture ───────────────────────────────────────────────────────

/**
 * Attach pinch-zoom gesture recognition to `element` using touch events.
 *
 * @returns A cleanup function that removes all event listeners.
 */
export function createPinchGesture(
  element: Element,
  options: PinchOptions = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  const { minScale = 0.5, maxScale = 3, onPinch } = options;

  let initialDistance = 0;
  let currentScale = 1;
  let baseScale = 1;
  let active = false;

  function onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      active = true;
      initialDistance = touchDistance(e.touches);
      baseScale = currentScale;
    }
  }

  function onTouchMove(e: TouchEvent): void {
    if (!active || e.touches.length < 2) return;
    const dist = touchDistance(e.touches);
    if (initialDistance === 0) return;
    const rawScale = baseScale * (dist / initialDistance);
    currentScale = clamp(rawScale, minScale, maxScale);

    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

    const state: GestureState = {
      x: midX,
      y: midY,
      dx: 0,
      dy: 0,
      velocity: 0,
      direction: null,
      scale: currentScale,
      active: true,
    };
    onPinch?.(state);
  }

  function onTouchEnd(e: TouchEvent): void {
    if (e.touches.length < 2) {
      active = false;
    }
  }

  const el = element as HTMLElement;
  el.addEventListener("touchstart", onTouchStart as EventListener, { passive: true });
  el.addEventListener("touchmove", onTouchMove as EventListener, { passive: true });
  el.addEventListener("touchend", onTouchEnd as EventListener);
  el.addEventListener("touchcancel", onTouchEnd as EventListener);

  return () => {
    el.removeEventListener("touchstart", onTouchStart as EventListener);
    el.removeEventListener("touchmove", onTouchMove as EventListener);
    el.removeEventListener("touchend", onTouchEnd as EventListener);
    el.removeEventListener("touchcancel", onTouchEnd as EventListener);
  };
}
