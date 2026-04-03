import { describe, it, expect, vi, beforeEach } from "vitest";
import { info, success, warn, error, formatMs, dim, bold } from "../src/logger.js";

describe("logger", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("info logs to stdout", () => {
    info("test message");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("test message"));
  });

  it("success logs to stdout", () => {
    success("done");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("done"));
  });

  it("warn logs to stderr", () => {
    warn("caution");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("caution"));
  });

  it("error logs to stderr", () => {
    error("failed");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("failed"));
  });
});

describe("formatMs", () => {
  it("formats milliseconds below 1s", () => {
    expect(formatMs(42)).toBe("42ms");
    expect(formatMs(999)).toBe("999ms");
  });

  it("formats seconds above 1s", () => {
    expect(formatMs(1500)).toBe("1.50s");
    expect(formatMs(2345)).toBe("2.35s");
  });
});

describe("formatting helpers", () => {
  it("dim wraps text with dim codes", () => {
    const result = dim("test");
    expect(result).toContain("test");
  });

  it("bold wraps text with bold codes", () => {
    const result = bold("test");
    expect(result).toContain("test");
  });
});
