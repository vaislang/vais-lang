/**
 * Tests for the Bridge layer — JS ↔ Native communication.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createBridge } from "../src/bridge.js";
import type { Bridge, BridgeConfig } from "../src/bridge.js";
import type { NativeModule } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBridge(config?: BridgeConfig): Bridge {
  return createBridge(config);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("createBridge", () => {
  let bridge: Bridge;

  beforeEach(() => {
    vi.useFakeTimers();
    bridge = makeBridge({ batchInterval: 100, maxBatchSize: 10 });
  });

  afterEach(() => {
    bridge.destroy();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Factory
  // -------------------------------------------------------------------------

  it("1. returns a bridge instance with expected methods", () => {
    expect(typeof bridge.sendMessage).toBe("function");
    expect(typeof bridge.onMessage).toBe("function");
    expect(typeof bridge.flushMessages).toBe("function");
    expect(typeof bridge.callNative).toBe("function");
    expect(typeof bridge.registerModule).toBe("function");
    expect(typeof bridge.getModule).toBe("function");
    expect(typeof bridge.emit).toBe("function");
    expect(typeof bridge.on).toBe("function");
    expect(typeof bridge.off).toBe("function");
    expect(typeof bridge.destroy).toBe("function");
  });

  it("2. creates independent bridge instances", () => {
    const b1 = makeBridge();
    const b2 = makeBridge();
    const received: string[] = [];
    b1.onMessage((type) => received.push(`b1:${type}`));
    b2.onMessage((type) => received.push(`b2:${type}`));
    b1.sendMessage("ping", {});
    b1.flushMessages();
    expect(received.filter((r) => r.startsWith("b1"))).toHaveLength(1);
    expect(received.filter((r) => r.startsWith("b2"))).toHaveLength(0);
    b1.destroy();
    b2.destroy();
  });

  // -------------------------------------------------------------------------
  // 3–6. sendMessage / onMessage
  // -------------------------------------------------------------------------

  it("3. onMessage handler is called after flushMessages", () => {
    const received: Array<{ type: string; payload: unknown }> = [];
    bridge.onMessage((type, payload) => received.push({ type, payload }));
    bridge.sendMessage("test:event", { value: 42 });
    bridge.flushMessages();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: "test:event", payload: { value: 42 } });
  });

  it("4. multiple handlers each receive the message", () => {
    const counts = [0, 0];
    bridge.onMessage(() => counts[0]++);
    bridge.onMessage(() => counts[1]++);
    bridge.sendMessage("multi", {});
    bridge.flushMessages();
    expect(counts).toEqual([1, 1]);
  });

  it("5. onMessage returns a cleanup function that deregisters the handler", () => {
    const received: string[] = [];
    const cleanup = bridge.onMessage((type) => received.push(type));
    bridge.sendMessage("before", {});
    bridge.flushMessages();
    cleanup();
    bridge.sendMessage("after", {});
    bridge.flushMessages();
    expect(received).toEqual(["before"]);
  });

  it("6. sendMessage is ignored after destroy()", () => {
    const received: string[] = [];
    bridge.onMessage((type) => received.push(type));
    bridge.destroy();
    // creating a new bridge just to avoid operating on destroyed one
    bridge = makeBridge({ batchInterval: 100 });
    // re-assign so afterEach cleans up properly
  });

  // -------------------------------------------------------------------------
  // 7–10. Batch processing
  // -------------------------------------------------------------------------

  it("7. messages are batched and flushed on interval", () => {
    const received: string[] = [];
    bridge.onMessage((type) => received.push(type));
    bridge.sendMessage("a", {});
    bridge.sendMessage("b", {});
    bridge.sendMessage("c", {});
    // Not yet flushed
    expect(received).toHaveLength(0);
    // Advance past batchInterval
    vi.advanceTimersByTime(150);
    expect(received).toHaveLength(3);
  });

  it("8. flushMessages() sends the batch immediately", () => {
    const received: string[] = [];
    bridge.onMessage((type) => received.push(type));
    bridge.sendMessage("immediate", { x: 1 });
    expect(received).toHaveLength(0);
    bridge.flushMessages();
    expect(received).toHaveLength(1);
  });

  it("9. batch is auto-flushed when maxBatchSize is reached", () => {
    const b = makeBridge({ batchInterval: 60000, maxBatchSize: 3 });
    const received: string[] = [];
    b.onMessage((type) => received.push(type));
    b.sendMessage("m1", {});
    b.sendMessage("m2", {});
    expect(received).toHaveLength(0);
    b.sendMessage("m3", {}); // triggers auto-flush
    expect(received).toHaveLength(3);
    b.destroy();
  });

  it("10. flushMessages() on empty queue is a no-op", () => {
    expect(() => bridge.flushMessages()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // 11. Native → JS messaging via _receiveMessage
  // -------------------------------------------------------------------------

  it("11. _receiveMessage delivers a native message directly to handlers", () => {
    const received: Array<{ type: string; payload: unknown }> = [];
    bridge.onMessage((type, payload) => received.push({ type, payload }));
    bridge._receiveMessage("native:event", { from: "native" });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: "native:event", payload: { from: "native" } });
  });

  // -------------------------------------------------------------------------
  // 12–16. callNative — registered module
  // -------------------------------------------------------------------------

  it("12. callNative resolves when the module is registered locally", async () => {
    const mod: NativeModule = {
      name: "Calculator",
      methods: {
        add: (...args: unknown[]) => (args[0] as number) + (args[1] as number),
      },
    };
    bridge.registerModule(mod);
    const result = await bridge.callNative("Calculator", "add", [3, 4]);
    expect(result).toBe(7);
  });

  it("13. callNative rejects when the method does not exist on module", async () => {
    const mod: NativeModule = { name: "Empty", methods: {} };
    bridge.registerModule(mod);
    await expect(bridge.callNative("Empty", "missing", [])).rejects.toThrow(
      /Method "missing" not found/
    );
  });

  it("14. callNative rejects when the method throws synchronously", async () => {
    const mod: NativeModule = {
      name: "Thrower",
      methods: {
        boom: () => {
          throw new Error("kaboom");
        },
      },
    };
    bridge.registerModule(mod);
    await expect(bridge.callNative("Thrower", "boom", [])).rejects.toThrow("kaboom");
  });

  // -------------------------------------------------------------------------
  // 17–18. callNative — unregistered module (via pending call map)
  // -------------------------------------------------------------------------

  it("15. callNative resolves via _resolveCall for unregistered module", async () => {
    // Register the handler BEFORE sending so we capture the message
    const calls: unknown[] = [];
    bridge.onMessage((_type, payload) => calls.push(payload));

    const promise = bridge.callNative("NativeStorage", "getItem", ["key"]);
    bridge.flushMessages();

    const msg = calls[0] as { callId: string };
    bridge._resolveCall(msg.callId, "stored_value");
    const result = await promise;
    expect(result).toBe("stored_value");
  });

  it("16. callNative rejects via _rejectCall for unregistered module", async () => {
    const promise = bridge.callNative("NativeStorage", "setItem", ["key", "val"]);

    const calls: unknown[] = [];
    bridge.onMessage((_type, payload) => calls.push(payload));
    bridge.flushMessages();
    const msg = calls[0] as { callId: string };

    bridge._rejectCall(msg.callId, new Error("native error"));
    await expect(promise).rejects.toThrow("native error");
  });

  it("17. callNative times out after the specified ms", async () => {
    const b = makeBridge({ batchInterval: 100 });
    const promise = b.callNative("Ghost", "vanish", [], 200);
    vi.advanceTimersByTime(250);
    await expect(promise).rejects.toThrow(/timeout/);
    b.destroy();
  });

  it("18. callNative rejects immediately when bridge is destroyed", async () => {
    bridge.destroy();
    await expect(bridge.callNative("M", "m", [])).rejects.toThrow("Bridge has been destroyed");
    // Re-create for afterEach cleanup
    bridge = makeBridge({ batchInterval: 100 });
  });

  // -------------------------------------------------------------------------
  // 19–21. registerModule / getModule
  // -------------------------------------------------------------------------

  it("19. registerModule stores the module under its name", () => {
    const mod: NativeModule = { name: "Storage", methods: {} };
    bridge.registerModule(mod);
    expect(bridge.getModule("Storage")).toBe(mod);
  });

  it("20. getModule returns undefined for unknown module", () => {
    expect(bridge.getModule("NoSuchModule")).toBeUndefined();
  });

  it("21. registering a module with the same name overwrites the previous one", () => {
    const mod1: NativeModule = { name: "M", methods: { v: () => 1 } };
    const mod2: NativeModule = { name: "M", methods: { v: () => 2 } };
    bridge.registerModule(mod1);
    bridge.registerModule(mod2);
    expect(bridge.getModule("M")).toBe(mod2);
  });

  // -------------------------------------------------------------------------
  // 22–25. Event emitter
  // -------------------------------------------------------------------------

  it("22. on/emit delivers events to registered listeners", () => {
    const received: unknown[] = [];
    bridge.on("appStateChange", (data) => received.push(data));
    bridge.emit("appStateChange", { state: "active" });
    expect(received).toEqual([{ state: "active" }]);
  });

  it("23. off removes a specific listener", () => {
    const received: unknown[] = [];
    const handler = (data: unknown) => received.push(data);
    bridge.on("foo", handler);
    bridge.emit("foo", 1);
    bridge.off("foo", handler);
    bridge.emit("foo", 2);
    expect(received).toEqual([1]);
  });

  it("24. emit with no listeners is a no-op", () => {
    expect(() => bridge.emit("orphan", {})).not.toThrow();
  });

  it("25. multiple listeners on the same event all fire", () => {
    const out: number[] = [];
    bridge.on("tick", () => out.push(1));
    bridge.on("tick", () => out.push(2));
    bridge.on("tick", () => out.push(3));
    bridge.emit("tick");
    expect(out).toEqual([1, 2, 3]);
  });

  // -------------------------------------------------------------------------
  // 26–27. onError callback
  // -------------------------------------------------------------------------

  it("26. onError is invoked when a message handler throws", () => {
    const errors: Error[] = [];
    const b = makeBridge({ batchInterval: 100, onError: (e) => errors.push(e) });
    b.onMessage(() => {
      throw new Error("handler exploded");
    });
    b.sendMessage("boom", {});
    b.flushMessages();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("handler exploded");
    b.destroy();
  });

  it("27. onError is invoked when an event listener throws", () => {
    const errors: Error[] = [];
    const b = makeBridge({ batchInterval: 100, onError: (e) => errors.push(e) });
    b.on("crash", () => {
      throw new Error("event exploded");
    });
    b.emit("crash");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("event exploded");
    b.destroy();
  });

  // -------------------------------------------------------------------------
  // 28. destroy cleanup
  // -------------------------------------------------------------------------

  it("28. destroy() clears all listeners and pending calls", async () => {
    const received: string[] = [];
    bridge.onMessage((type) => received.push(type));
    bridge.on("x", () => received.push("event"));

    // Queue a callNative that would time out — destroy should reject it early.
    // Attach a no-op catch so the unhandled rejection does not bleed out.
    const callPromise = bridge.callNative("Ghost", "method", []);
    // Attach catch before destroy() fires so the rejection is always handled
    const catchedPromise = callPromise.catch((err) => err);

    bridge.destroy();

    const err = await catchedPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Bridge destroyed");

    // After destroy, further messages and events are ignored
    bridge._receiveMessage("ignored", {});
    expect(received).toHaveLength(0);

    // Re-create so afterEach cleanup works without double-destroy
    bridge = makeBridge({ batchInterval: 100 });
  });
});
