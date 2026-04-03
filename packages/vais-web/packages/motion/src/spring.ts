/**
 * spring — Physics-based spring animation engine.
 * SSR-safe: all requestAnimationFrame calls are guarded by typeof window checks.
 *
 * Damped oscillation equation:
 *   x'' = -(k/m) * (x - target) - (c/m) * x'
 *
 * where:
 *   k = stiffness
 *   m = mass
 *   c = damping
 *   x = current position
 *   x' = velocity
 */

import type { SpringOptions, AnimationControls } from "./types.js";

// ─── Extended SpringOptions with precision ────────────────────────────────────

export interface SpringAnimationOptions extends SpringOptions {
  /** Convergence threshold — animation stops when |displacement| and |velocity| are both below this value (default: 0.01). */
  precision?: number;
}

// ─── SpringAnimation interface ────────────────────────────────────────────────

export interface SpringAnimation {
  /** Start the spring animation from `from` toward `to`. */
  start(
    from: number,
    to: number,
    onUpdate: (value: number) => void,
    onComplete?: () => void,
  ): void;
  /** Stop the animation immediately. */
  stop(): void;
  /** Whether the animation is currently running. */
  readonly isActive: boolean;
}

// ─── Spring presets ───────────────────────────────────────────────────────────

export interface SpringPreset {
  stiffness: number;
  damping: number;
  mass: number;
}

export const presets = {
  /** Slow, smooth spring — good for subtle transitions. */
  gentle: { stiffness: 120, damping: 14, mass: 1 } satisfies SpringPreset,
  /** Springy, bouncy feel — great for playful UIs. */
  wobbly: { stiffness: 180, damping: 12, mass: 1 } satisfies SpringPreset,
  /** Fast, snappy spring — good for menus and dropdowns. */
  stiff: { stiffness: 210, damping: 20, mass: 1 } satisfies SpringPreset,
  /** Very slow and soft — good for large elements. */
  slow: { stiffness: 280, damping: 60, mass: 1 } satisfies SpringPreset,
  /** Extremely slow, heavy feel. */
  molasses: { stiffness: 280, damping: 120, mass: 1 } satisfies SpringPreset,
} as const;

// ─── Core spring() factory ────────────────────────────────────────────────────

/**
 * Create a spring animation controller.
 *
 * @param options Spring parameters (stiffness, damping, mass, velocity, precision).
 * @returns       A {@link SpringAnimation} instance.
 */
export function spring(options: SpringAnimationOptions = {}): SpringAnimation {
  const stiffness = options.stiffness ?? 170;
  const damping = options.damping ?? 26;
  const mass = options.mass ?? 1;
  const initialVelocity = options.velocity ?? 0;
  const precision = options.precision ?? 0.01;

  let rafId: number | null = null;
  let active = false;

  function stop(): void {
    if (rafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    active = false;
  }

  function start(
    from: number,
    to: number,
    onUpdate: (value: number) => void,
    onComplete?: () => void,
  ): void {
    // Stop any currently running animation.
    stop();

    // SSR guard — no animation loop without requestAnimationFrame.
    if (typeof requestAnimationFrame === "undefined") {
      onUpdate(to);
      onComplete?.();
      return;
    }

    active = true;

    let position = from;
    let velocity = initialVelocity;
    let lastTime: number | null = null;

    function tick(timestamp: number): void {
      if (!active) return;

      if (lastTime === null) {
        lastTime = timestamp;
        rafId = requestAnimationFrame(tick);
        return;
      }

      // Cap delta time to avoid large jumps after tab visibility changes.
      const deltaMs = Math.min(timestamp - lastTime, 64);
      lastTime = timestamp;

      // Use a fixed sub-step size for numerical stability (4ms steps).
      const stepMs = 4;
      let remaining = deltaMs;

      while (remaining > 0) {
        const dt = Math.min(remaining, stepMs) / 1000; // convert to seconds
        remaining -= stepMs;

        const displacement = position - to;
        const springForce = -(stiffness / mass) * displacement;
        const dampingForce = -(damping / mass) * velocity;
        const acceleration = springForce + dampingForce;

        velocity += acceleration * dt;
        position += velocity * dt;
      }

      onUpdate(position);

      // Convergence check: both displacement and velocity must be below precision.
      const displacement = Math.abs(position - to);
      const speed = Math.abs(velocity);

      if (displacement < precision && speed < precision) {
        position = to;
        velocity = 0;
        onUpdate(to);
        active = false;
        rafId = null;
        onComplete?.();
        return;
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }

  return {
    start,
    stop,
    get isActive() {
      return active;
    },
  };
}

// ─── springValue — synchronous spring interpolation (for testing) ─────────────

/**
 * Calculate the spring-interpolated value at a given time `t` (in seconds).
 *
 * Uses the analytical solution for a damped harmonic oscillator.
 * This is a pure synchronous computation suitable for tests and server-side use.
 *
 * @param from    Start value.
 * @param to      Target value.
 * @param options Spring parameters.
 * @param t       Time elapsed in seconds (default: 0.3).
 * @returns       The interpolated value at time `t`.
 */
export function springValue(
  from: number,
  to: number,
  options: SpringAnimationOptions = {},
  t: number = 0.3,
): number {
  const stiffness = options.stiffness ?? 170;
  const damping = options.damping ?? 26;
  const mass = options.mass ?? 1;
  const v0 = options.velocity ?? 0;

  const omega0 = Math.sqrt(stiffness / mass); // natural frequency
  const zeta = damping / (2 * Math.sqrt(stiffness * mass)); // damping ratio

  const x0 = from - to; // initial displacement

  let x: number;

  if (zeta < 1) {
    // Under-damped: oscillates around target.
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const A = x0;
    const B = (v0 + zeta * omega0 * x0) / omegaD;
    x =
      Math.exp(-zeta * omega0 * t) * (A * Math.cos(omegaD * t) + B * Math.sin(omegaD * t));
  } else if (zeta === 1) {
    // Critically damped: fastest non-oscillating approach.
    const A = x0;
    const B = v0 + omega0 * x0;
    x = Math.exp(-omega0 * t) * (A + B * t);
  } else {
    // Over-damped: slow exponential decay.
    const r1 = -omega0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -omega0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const A = (v0 - r2 * x0) / (r1 - r2);
    const B = (v0 - r1 * x0) / (r2 - r1);
    x = A * Math.exp(r1 * t) + B * Math.exp(r2 * t);
  }

  return to + x;
}

// ─── createSpringAnimation — DOM helper ───────────────────────────────────────

/**
 * Apply a spring animation to a DOM element's style property.
 *
 * @param element   The HTML element to animate.
 * @param property  The CSS property name (e.g. `"opacity"`, `"transform"`).
 * @param to        Target numeric value.
 * @param options   Spring parameters.
 * @returns         An {@link AnimationControls} instance.
 */
export function createSpringAnimation(
  element: HTMLElement,
  property: string,
  to: number,
  options: SpringAnimationOptions = {},
): AnimationControls {
  // SSR guard.
  if (typeof window === "undefined") {
    return createNoopControls();
  }

  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  // Read the current numeric value from the element's computed style.
  const computedStyle = window.getComputedStyle(element);
  const rawValue = computedStyle.getPropertyValue(property) || "0";
  const from = parseFloat(rawValue) || 0;

  const animation = spring(options);

  function play(): void {
    animation.start(
      from,
      to,
      (value) => {
        (element.style as unknown as Record<string, string>)[property] = String(value);
      },
      () => {
        resolveFinished();
      },
    );
  }

  function pause(): void {
    animation.stop();
  }

  function cancel(): void {
    animation.stop();
    resolveFinished();
  }

  function finish(): void {
    animation.stop();
    (element.style as unknown as Record<string, string>)[property] = String(to);
    resolveFinished();
  }

  function reverse(): void {
    animation.stop();
    const currentRaw = (element.style as unknown as Record<string, string>)[property];
    const current = parseFloat(currentRaw) || from;
    animation.start(
      current,
      from,
      (value) => {
        (element.style as unknown as Record<string, string>)[property] = String(value);
      },
      () => {
        resolveFinished();
      },
    );
  }

  // Auto-start.
  play();

  return { play, pause, cancel, finish, reverse, finished };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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
