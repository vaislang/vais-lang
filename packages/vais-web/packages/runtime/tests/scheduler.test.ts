import { describe, it, expect, vi, beforeEach } from "vitest";
import { $$schedule, $$flush } from "../src/scheduler.js";

describe("$$schedule / $$flush", () => {
  it("schedules a function to run asynchronously", async () => {
    const fn = vi.fn();
    $$schedule(fn);
    expect(fn).not.toHaveBeenCalled(); // Not yet
    await Promise.resolve(); // Allow microtask to run
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("batches multiple schedules into one flush", async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    $$schedule(fn1);
    $$schedule(fn2);
    await Promise.resolve();
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("deduplicates the same function reference", async () => {
    const fn = vi.fn();
    $$schedule(fn);
    $$schedule(fn);
    $$schedule(fn);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not deduplicate different functions", async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    $$schedule(fn1);
    $$schedule(fn2);
    await Promise.resolve();
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("$$flush can be called manually", () => {
    const fn = vi.fn();
    $$schedule(fn);
    $$flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("executes functions in order", async () => {
    const order: number[] = [];
    $$schedule(() => order.push(1));
    $$schedule(() => order.push(2));
    $$schedule(() => order.push(3));
    await Promise.resolve();
    expect(order).toEqual([1, 2, 3]);
  });

  it("allows re-scheduling after flush", async () => {
    const fn = vi.fn();
    $$schedule(fn);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    $$schedule(fn);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
