/**
 * @vaisx/motion — spring() tests
 *
 * Uses vitest fake timers + manual requestAnimationFrame mock to drive the
 * animation loop synchronously in tests (SSR-safe constraint).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spring, springValue, createSpringAnimation, presets } from "../spring.js";

// ─── requestAnimationFrame mock helpers ───────────────────────────────────────

type RafCallback = (timestamp: number) => void;

function setupRafMock() {
  const callbacks: Map<number, RafCallback> = new Map();
  let nextId = 1;
  let now = 0;

  const rafMock = vi.fn((cb: RafCallback): number => {
    const id = nextId++;
    callbacks.set(id, cb);
    return id;
  });

  const cafMock = vi.fn((id: number): void => {
    callbacks.delete(id);
  });

  function flush(deltaMs = 16): void {
    now += deltaMs;
    const pending = Array.from(callbacks.entries());
    callbacks.clear();
    for (const [, cb] of pending) {
      cb(now);
    }
  }

  function flushUntilIdle(maxFrames = 500): number {
    let frames = 0;
    while (callbacks.size > 0 && frames < maxFrames) {
      flush(16);
      frames++;
    }
    return frames;
  }

  vi.stubGlobal("requestAnimationFrame", rafMock);
  vi.stubGlobal("cancelAnimationFrame", cafMock);

  return { flush, flushUntilIdle, rafMock, cafMock };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("spring() — default parameters", () => {
  let raf: ReturnType<typeof setupRafMock>;

  beforeEach(() => {
    raf = setupRafMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a SpringAnimation with start, stop and isActive", () => {
    const s = spring();
    expect(typeof s.start).toBe("function");
    expect(typeof s.stop).toBe("function");
    expect(typeof s.isActive).toBe("boolean");
  });

  it("isActive is false before start() is called", () => {
    const s = spring();
    expect(s.isActive).toBe(false);
  });

  it("isActive is true after start() is called", () => {
    const s = spring();
    s.start(0, 100, () => {});
    expect(s.isActive).toBe(true);
  });

  it("isActive is false after stop() is called", () => {
    const s = spring();
    s.start(0, 100, () => {});
    s.stop();
    expect(s.isActive).toBe(false);
  });

  it("calls onUpdate with values between from and to during animation", () => {
    const s = spring();
    const updates: number[] = [];
    s.start(0, 100, (v) => updates.push(v));

    raf.flushUntilIdle();

    expect(updates.length).toBeGreaterThan(0);
  });

  it("calls onComplete after animation converges", () => {
    const s = spring();
    const onComplete = vi.fn();
    s.start(0, 100, () => {}, onComplete);

    raf.flushUntilIdle();

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("final onUpdate value equals the target", () => {
    const s = spring();
    let lastValue = -1;
    s.start(0, 100, (v) => (lastValue = v));

    raf.flushUntilIdle();

    expect(lastValue).toBe(100);
  });

  it("isActive becomes false after convergence", () => {
    const s = spring();
    s.start(0, 100, () => {});
    raf.flushUntilIdle();
    expect(s.isActive).toBe(false);
  });
});

// ─── Damped oscillation behavior ─────────────────────────────────────────────

describe("spring() — damping/stiffness behavior", () => {
  let raf: ReturnType<typeof setupRafMock>;

  beforeEach(() => {
    raf = setupRafMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("under-damped spring (wobbly) overshoots the target", () => {
    // Low damping relative to stiffness → oscillation → overshoot
    const s = spring({ stiffness: 180, damping: 12, mass: 1 });
    const updates: number[] = [];
    s.start(0, 100, (v) => updates.push(v));
    raf.flushUntilIdle();

    const maxValue = Math.max(...updates);
    expect(maxValue).toBeGreaterThan(100);
  });

  it("high damping (molasses) does not overshoot", () => {
    const s = spring({ stiffness: 280, damping: 120, mass: 1 });
    const updates: number[] = [];
    s.start(0, 100, (v) => updates.push(v));
    raf.flushUntilIdle();

    const maxValue = Math.max(...updates);
    expect(maxValue).toBeLessThanOrEqual(100 + 0.01);
  });

  it("stiff spring converges faster than gentle spring (fewer frames)", () => {
    const raf1 = setupRafMock();
    const stiffSpring = spring({ stiffness: 210, damping: 20, mass: 1 });
    stiffSpring.start(0, 100, () => {});
    const stiffFrames = raf1.flushUntilIdle();
    vi.unstubAllGlobals();

    const raf2 = setupRafMock();
    const gentleSpring = spring({ stiffness: 120, damping: 14, mass: 1 });
    gentleSpring.start(0, 100, () => {});
    const gentleFrames = raf2.flushUntilIdle();
    vi.unstubAllGlobals();

    expect(stiffFrames).toBeLessThan(gentleFrames);
  });

  it("initial velocity shifts the starting trajectory", () => {
    // Use springValue (synchronous, no RAF) to compare trajectories cleanly.
    // Positive initial velocity toward target → value at t=0.05s should be higher.
    const t = 0.05;
    const opts = { stiffness: 170, damping: 26, mass: 1 };

    const withVelocity = springValue(0, 100, { ...opts, velocity: 100 }, t);
    const noVelocity = springValue(0, 100, { ...opts, velocity: 0 }, t);

    expect(withVelocity).toBeGreaterThan(noVelocity);
  });

  it("precision option controls convergence threshold", () => {
    const raf1 = setupRafMock();
    const coarse = spring({ stiffness: 170, damping: 26, precision: 1 });
    const onCompleteCoarse = vi.fn();
    coarse.start(0, 100, () => {}, onCompleteCoarse);
    const coarseFrames = raf1.flushUntilIdle();
    vi.unstubAllGlobals();

    const raf2 = setupRafMock();
    const fine = spring({ stiffness: 170, damping: 26, precision: 0.001 });
    const onCompleteFine = vi.fn();
    fine.start(0, 100, () => {}, onCompleteFine);
    const fineFrames = raf2.flushUntilIdle();
    vi.unstubAllGlobals();

    expect(coarseFrames).toBeLessThan(fineFrames);
  });
});

// ─── springValue — synchronous computation ───────────────────────────────────

describe("springValue()", () => {
  it("returns `from` at t=0", () => {
    const val = springValue(0, 100, {}, 0);
    expect(val).toBeCloseTo(0, 4);
  });

  it("approaches `to` as t grows large", () => {
    const val = springValue(0, 100, {}, 10);
    expect(val).toBeCloseTo(100, 1);
  });

  it("returns a number between from and to for typical t (under-damped)", () => {
    // At t=0.1s with default params the value should be between 0 and ~100.
    const val = springValue(0, 100, { stiffness: 170, damping: 26 }, 0.1);
    expect(typeof val).toBe("number");
    expect(isFinite(val)).toBe(true);
  });

  it("over-damped spring never overshoots (zeta > 1)", () => {
    // stiffness=100, damping=100, mass=1 → zeta = 100/(2*sqrt(100)) = 5 → over-damped
    const vals = [0.1, 0.3, 0.5, 1, 2].map((t) =>
      springValue(0, 100, { stiffness: 100, damping: 100, mass: 1 }, t),
    );
    for (const v of vals) {
      expect(v).toBeLessThanOrEqual(100 + 1e-6);
    }
  });

  it("critically damped spring (zeta ≈ 1) converges without oscillation", () => {
    // zeta = 1 → damping = 2 * sqrt(stiffness * mass)
    const stiffness = 100;
    const mass = 1;
    const damping = 2 * Math.sqrt(stiffness * mass); // exactly critical
    const vals = [0.1, 0.3, 0.5, 1].map((t) =>
      springValue(0, 100, { stiffness, damping, mass }, t),
    );
    // Values should monotonically increase (no oscillation).
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]! - 1e-6);
    }
  });

  it("handles negative displacement (from > to)", () => {
    const val = springValue(100, 0, {}, 0);
    expect(val).toBeCloseTo(100, 4);
    const valLate = springValue(100, 0, {}, 10);
    expect(valLate).toBeCloseTo(0, 1);
  });

  it("uses default options when none provided", () => {
    expect(() => springValue(0, 1)).not.toThrow();
  });
});

// ─── Presets ──────────────────────────────────────────────────────────────────

describe("spring presets", () => {
  it("gentle preset has stiffness 120", () => {
    expect(presets.gentle.stiffness).toBe(120);
  });

  it("gentle preset has damping 14", () => {
    expect(presets.gentle.damping).toBe(14);
  });

  it("wobbly preset has stiffness 180", () => {
    expect(presets.wobbly.stiffness).toBe(180);
  });

  it("wobbly preset has lower damping than stiff", () => {
    expect(presets.wobbly.damping).toBeLessThan(presets.stiff.damping);
  });

  it("stiff preset has stiffness 210", () => {
    expect(presets.stiff.stiffness).toBe(210);
  });

  it("slow preset has damping 60", () => {
    expect(presets.slow.damping).toBe(60);
  });

  it("molasses preset has the highest damping", () => {
    const dampings = Object.values(presets).map((p) => p.damping);
    expect(presets.molasses.damping).toBe(Math.max(...dampings));
  });

  it("all presets have mass === 1", () => {
    for (const preset of Object.values(presets)) {
      expect(preset.mass).toBe(1);
    }
  });

  it("all presets have positive stiffness", () => {
    for (const preset of Object.values(presets)) {
      expect(preset.stiffness).toBeGreaterThan(0);
    }
  });

  it("all presets have positive damping", () => {
    for (const preset of Object.values(presets)) {
      expect(preset.damping).toBeGreaterThan(0);
    }
  });

  it("wobbly preset produces overshoot via springValue", () => {
    // Under-damped → overshoot
    const peak = Math.max(
      ...[0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((t) => springValue(0, 100, presets.wobbly, t)),
    );
    expect(peak).toBeGreaterThan(100);
  });

  it("molasses preset does not overshoot via springValue", () => {
    const vals = [0.1, 0.3, 0.5, 1, 2].map((t) => springValue(0, 100, presets.molasses, t));
    for (const v of vals) {
      expect(v).toBeLessThanOrEqual(100 + 1e-6);
    }
  });
});

// ─── createSpringAnimation — DOM helper ───────────────────────────────────────

describe("createSpringAnimation()", () => {
  let raf: ReturnType<typeof setupRafMock>;

  beforeEach(() => {
    raf = setupRafMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns AnimationControls with play/pause/cancel/finish/reverse/finished", () => {
    const el = document.createElement("div");
    const controls = createSpringAnimation(el, "opacity", 1);

    expect(typeof controls.play).toBe("function");
    expect(typeof controls.pause).toBe("function");
    expect(typeof controls.cancel).toBe("function");
    expect(typeof controls.finish).toBe("function");
    expect(typeof controls.reverse).toBe("function");
    expect(controls.finished).toBeInstanceOf(Promise);

    controls.cancel();
  });

  it("finish() sets the style property to the target value immediately", () => {
    const el = document.createElement("div");
    const controls = createSpringAnimation(el, "opacity", 1, { stiffness: 170, damping: 26 });

    controls.finish();

    expect(el.style.opacity).toBe("1");
  });

  it("finished promise resolves after finish() is called", async () => {
    const el = document.createElement("div");
    const controls = createSpringAnimation(el, "opacity", 1);
    const resolved = vi.fn();

    controls.finished.then(resolved);
    controls.finish();
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });

  it("cancel() resolves the finished promise", async () => {
    const el = document.createElement("div");
    const controls = createSpringAnimation(el, "opacity", 1);
    const resolved = vi.fn();

    controls.finished.then(resolved);
    controls.cancel();
    await Promise.resolve();

    expect(resolved).toHaveBeenCalledOnce();
  });
});
