/**
 * @vaisx/federation — EventBus tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEventBus } from "../src/event-bus.js";

// ─── createEventBus ───────────────────────────────────────────────────────────

describe("createEventBus — factory", () => {
  it("returns an object with emit, on, off, once", () => {
    const bus = createEventBus();
    expect(typeof bus.emit).toBe("function");
    expect(typeof bus.on).toBe("function");
    expect(typeof bus.off).toBe("function");
    expect(typeof bus.once).toBe("function");
  });

  it("creates isolated instances — events on one bus do not affect another", () => {
    const busA = createEventBus();
    const busB = createEventBus();
    const handlerB = vi.fn();
    busB.on("ping", handlerB);
    busA.emit("ping", null);
    expect(handlerB).not.toHaveBeenCalled();
  });
});

// ─── on / emit ────────────────────────────────────────────────────────────────

describe("EventBus — on / emit", () => {
  let bus: ReturnType<typeof createEventBus>;
  beforeEach(() => {
    bus = createEventBus();
  });

  it("registered handler is called when the event is emitted", () => {
    const handler = vi.fn();
    bus.on("test", handler);
    bus.emit("test", { value: 42 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it("handler is called with the exact payload", () => {
    const captured: unknown[] = [];
    bus.on("data", (d) => captured.push(d));
    bus.emit("data", "hello");
    bus.emit("data", 99);
    expect(captured).toEqual(["hello", 99]);
  });

  it("multiple handlers on the same event are all invoked", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const h3 = vi.fn();
    bus.on("multi", h1);
    bus.on("multi", h2);
    bus.on("multi", h3);
    bus.emit("multi", true);
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
    expect(h3).toHaveBeenCalledOnce();
  });

  it("handlers are called in registration order", () => {
    const order: number[] = [];
    bus.on("order", () => order.push(1));
    bus.on("order", () => order.push(2));
    bus.on("order", () => order.push(3));
    bus.emit("order", null);
    expect(order).toEqual([1, 2, 3]);
  });

  it("emitting an event with no handlers is a no-op (does not throw)", () => {
    expect(() => bus.emit("unknown-event", {})).not.toThrow();
  });

  it("handler on event A is not triggered by event B", () => {
    const handlerA = vi.fn();
    bus.on("eventA", handlerA);
    bus.emit("eventB", null);
    expect(handlerA).not.toHaveBeenCalled();
  });

  it("the same handler can be registered for multiple events", () => {
    const handler = vi.fn();
    bus.on("alpha", handler);
    bus.on("beta", handler);
    bus.emit("alpha", 1);
    bus.emit("beta", 2);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("emitting multiple times calls the handler each time", () => {
    const handler = vi.fn();
    bus.on("ping", handler);
    bus.emit("ping", null);
    bus.emit("ping", null);
    bus.emit("ping", null);
    expect(handler).toHaveBeenCalledTimes(3);
  });
});

// ─── off ──────────────────────────────────────────────────────────────────────

describe("EventBus — off", () => {
  let bus: ReturnType<typeof createEventBus>;
  beforeEach(() => {
    bus = createEventBus();
  });

  it("off() prevents the handler from being called after removal", () => {
    const handler = vi.fn();
    bus.on("evt", handler);
    bus.off("evt", handler);
    bus.emit("evt", null);
    expect(handler).not.toHaveBeenCalled();
  });

  it("off() only removes the specified handler, not others", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("evt", h1);
    bus.on("evt", h2);
    bus.off("evt", h1);
    bus.emit("evt", null);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("off() on a non-existent handler is a no-op", () => {
    const handler = vi.fn();
    expect(() => bus.off("never-registered", handler)).not.toThrow();
  });

  it("off() on a non-existent event is a no-op", () => {
    const handler = vi.fn();
    expect(() => bus.off("ghost-event", handler)).not.toThrow();
  });

  it("calling off() twice for the same handler is safe", () => {
    const handler = vi.fn();
    bus.on("evt", handler);
    bus.off("evt", handler);
    expect(() => bus.off("evt", handler)).not.toThrow();
    bus.emit("evt", null);
    expect(handler).not.toHaveBeenCalled();
  });

  it("a handler can remove itself inside its own callback", () => {
    const calls: number[] = [];
    const handler = vi.fn(() => {
      calls.push(1);
      bus.off("self-remove", handler);
    });
    bus.on("self-remove", handler);
    bus.emit("self-remove", null);
    bus.emit("self-remove", null);
    expect(calls).toHaveLength(1);
  });
});

// ─── once ─────────────────────────────────────────────────────────────────────

describe("EventBus — once", () => {
  let bus: ReturnType<typeof createEventBus>;
  beforeEach(() => {
    bus = createEventBus();
  });

  it("once() handler is called on the first emission", () => {
    const handler = vi.fn();
    bus.once("tick", handler);
    bus.emit("tick", "first");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith("first");
  });

  it("once() handler is NOT called on subsequent emissions", () => {
    const handler = vi.fn();
    bus.once("tick", handler);
    bus.emit("tick", 1);
    bus.emit("tick", 2);
    bus.emit("tick", 3);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("once() and on() handlers for the same event coexist correctly", () => {
    const persistent = vi.fn();
    const oneShot = vi.fn();
    bus.on("combo", persistent);
    bus.once("combo", oneShot);
    bus.emit("combo", null);
    bus.emit("combo", null);
    expect(persistent).toHaveBeenCalledTimes(2);
    expect(oneShot).toHaveBeenCalledOnce();
  });

  it("multiple once() handlers each fire exactly once", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.once("tick", h1);
    bus.once("tick", h2);
    bus.emit("tick", null);
    bus.emit("tick", null);
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("once() handler can be removed via off() before it fires", () => {
    const handler = vi.fn();
    bus.once("evt", handler);
    bus.off("evt", handler);
    bus.emit("evt", null);
    expect(handler).not.toHaveBeenCalled();
  });
});
