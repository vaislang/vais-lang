import { describe, it, expect } from "vitest";
import { createHmrModuleRecord } from "../src/protocol.js";
import type { HmrModuleRecord } from "../src/protocol.js";

describe("createHmrModuleRecord", () => {
  it("creates a record with the given id", () => {
    const record = createHmrModuleRecord("App.vaisx");
    expect(record.id).toBe("App.vaisx");
  });

  it("starts with empty callbacks", () => {
    const record = createHmrModuleRecord("App.vaisx");
    expect(record.acceptCallbacks).toHaveLength(0);
    expect(record.disposeCallbacks).toHaveLength(0);
  });

  it("starts with not accepted and not declined", () => {
    const record = createHmrModuleRecord("App.vaisx");
    expect(record.accepted).toBe(false);
    expect(record.declined).toBe(false);
  });

  it("starts with empty data object", () => {
    const record = createHmrModuleRecord("App.vaisx");
    expect(record.data).toEqual({});
  });
});
