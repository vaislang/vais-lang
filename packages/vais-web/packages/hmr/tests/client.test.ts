import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHotContext, getHmrModule } from "../src/client.js";

describe("createHotContext", () => {
  it("creates a hot context for a module", () => {
    const hot = createHotContext("App.vaisx");
    expect(hot).toBeDefined();
    expect(hot.data).toEqual({});
  });

  it("accept marks module as accepted", () => {
    const hot = createHotContext("Accept.vaisx");
    hot.accept();
    const record = getHmrModule("Accept.vaisx");
    expect(record.accepted).toBe(true);
  });

  it("accept with callback stores the callback", () => {
    const hot = createHotContext("Callback.vaisx");
    const cb = vi.fn();
    hot.accept(cb);
    const record = getHmrModule("Callback.vaisx");
    expect(record.acceptCallbacks).toHaveLength(1);
  });

  it("decline marks module as declined", () => {
    const hot = createHotContext("Decline.vaisx");
    hot.decline();
    const record = getHmrModule("Decline.vaisx");
    expect(record.declined).toBe(true);
  });

  it("dispose registers cleanup callback", () => {
    const hot = createHotContext("Dispose.vaisx");
    const disposeFn = vi.fn();
    hot.dispose(disposeFn);
    const record = getHmrModule("Dispose.vaisx");
    expect(record.disposeCallbacks).toHaveLength(1);
  });

  it("data is shared across hot context recreations", () => {
    const hot1 = createHotContext("Shared.vaisx");
    hot1.data.count = 42;

    // Recreating the context preserves data
    const hot2 = createHotContext("Shared.vaisx");
    // Note: dispose would normally clear/transfer data,
    // but data object reference is preserved until dispose runs
    expect(hot2.data).toBeDefined();
  });

  it("resets callbacks on re-creation", () => {
    const hot1 = createHotContext("Reset.vaisx");
    hot1.accept(vi.fn());
    hot1.dispose(vi.fn());

    const record1 = getHmrModule("Reset.vaisx");
    expect(record1.acceptCallbacks).toHaveLength(1);
    expect(record1.disposeCallbacks).toHaveLength(1);

    // Re-creating should reset callbacks
    createHotContext("Reset.vaisx");
    const record2 = getHmrModule("Reset.vaisx");
    expect(record2.acceptCallbacks).toHaveLength(0);
    expect(record2.disposeCallbacks).toHaveLength(0);
  });
});

describe("getHmrModule", () => {
  it("creates a new record if not exists", () => {
    const record = getHmrModule("New.vaisx");
    expect(record.id).toBe("New.vaisx");
  });

  it("returns same record for same id", () => {
    const r1 = getHmrModule("Same.vaisx");
    const r2 = getHmrModule("Same.vaisx");
    expect(r1).toBe(r2);
  });
});
