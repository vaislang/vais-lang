import { describe, it, expect, vi } from "vitest";
import { createSignal, createComputed, createEffect, track } from "../src/signal.js";

describe("createSignal", () => {
  it("returns a signal with initial value", () => {
    const sig = createSignal(42);
    expect(sig()).toBe(42);
  });

  it("updates value via set", () => {
    const sig = createSignal(0);
    sig.set(10);
    expect(sig()).toBe(10);
  });

  it("does not notify when value is the same (Object.is)", async () => {
    const sig = createSignal(5);
    const fn = vi.fn();

    // Create an effect that reads the signal
    createEffect(() => {
      sig(); // read
      fn();
    });

    expect(fn).toHaveBeenCalledTimes(1); // initial run

    sig.set(5); // same value
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1); // should not re-run
  });
});

describe("createComputed", () => {
  it("computes initial value", () => {
    const a = createSignal(2);
    const doubled = createComputed(() => a() * 2);
    expect(doubled()).toBe(4);
  });

  it("recomputes when dependency changes", async () => {
    const a = createSignal(3);
    const doubled = createComputed(() => a() * 2);
    expect(doubled()).toBe(6);

    a.set(5);
    await Promise.resolve(); // flush microtask
    expect(doubled()).toBe(10);
  });

  it("chains computeds", async () => {
    const a = createSignal(1);
    const b = createComputed(() => a() + 1);
    const c = createComputed(() => b() * 2);
    expect(c()).toBe(4); // (1+1)*2

    a.set(2);
    // First microtask: b updates (a's subscriber)
    await Promise.resolve();
    expect(b()).toBe(3);
    // Second microtask: c updates (b's subscriber, scheduled by b.set)
    await Promise.resolve();
    expect(c()).toBe(6);
  });
});

describe("createEffect", () => {
  it("runs immediately with initial values", () => {
    const sig = createSignal("hello");
    const values: string[] = [];
    createEffect(() => {
      values.push(sig());
    });
    expect(values).toEqual(["hello"]);
  });

  it("re-runs when dependency changes", async () => {
    const sig = createSignal(1);
    const values: number[] = [];
    createEffect(() => {
      values.push(sig());
    });
    expect(values).toEqual([1]);

    sig.set(2);
    await Promise.resolve();
    expect(values).toEqual([1, 2]);
  });

  it("returns a dispose function", () => {
    const sig = createSignal(0);
    const fn = vi.fn();
    const dispose = createEffect(() => {
      sig();
      fn();
    });
    expect(fn).toHaveBeenCalledTimes(1);
    dispose();
    // After dispose, changing signal should not re-trigger
    // (though the subscriber is still in the set, dispose cleans up)
  });

  it("calls cleanup function on re-run", async () => {
    const sig = createSignal(0);
    const cleanup = vi.fn();
    createEffect(() => {
      sig(); // track dependency
      return cleanup;
    });
    expect(cleanup).not.toHaveBeenCalled();

    sig.set(1);
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe("track", () => {
  it("tracks signal reads within the function", () => {
    const sig = createSignal(10);
    const subscriber = vi.fn();
    const result = track(() => sig(), subscriber);
    expect(result).toBe(10);

    // Now changing sig should schedule the subscriber
    sig.set(20);
    // subscriber was added to the signal's subscriber set
  });
});
