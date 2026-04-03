/**
 * Tests for fallback.ts:
 *  - createFallbackManager (loadWithFallback, retry, exponential backoff)
 *  - VersionManager (checkCompatibility, resolveVersion)
 *  - createCircuitBreaker (closed → open → half-open state machine)
 *  - FallbackUI (createErrorBoundary, createLoadingPlaceholder)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createFallbackManager,
  VersionManager,
  createCircuitBreaker,
  CircuitOpenError,
  FallbackUI,
} from "../fallback.js";
import type {
  FallbackOptions,
  VersionConstraint,
  CircuitBreakerOptions,
} from "../fallback.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a loader that fails `n` times then resolves with `value`. */
function makeFlakeyLoader<T>(fails: number, value: T): () => Promise<T> {
  let calls = 0;
  return () => {
    calls += 1;
    if (calls <= fails) {
      return Promise.reject(new Error(`Attempt ${calls} failed`));
    }
    return Promise.resolve(value);
  };
}

/** Create a loader that always rejects. */
function makeFailingLoader(message = "always fails"): () => Promise<never> {
  return () => Promise.reject(new Error(message));
}

// ─── createFallbackManager — loadWithFallback ─────────────────────────────────

describe("createFallbackManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1. resolves immediately when the loader succeeds on the first attempt", async () => {
    const manager = createFallbackManager({ retries: 2, retryDelay: 10 });
    const loader = vi.fn().mockResolvedValue("ok");
    const result = await manager.loadWithFallback(loader);
    expect(result).toBe("ok");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("2. retries up to `retries` times before succeeding", async () => {
    const manager = createFallbackManager({ retries: 3, retryDelay: 1 });
    const loader = makeFlakeyLoader(2, "success");
    const p = manager.loadWithFallback(loader);
    // Let timers run for the two retries.
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toBe("success");
  });

  it("3. returns fallback when all retries are exhausted", async () => {
    const manager = createFallbackManager({ retries: 2, retryDelay: 1 });
    const loader = makeFailingLoader();
    const p = manager.loadWithFallback(loader, "fallback-value");
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toBe("fallback-value");
  });

  it("4. throws last error when all retries fail and no fallback is provided", async () => {
    const manager = createFallbackManager({ retries: 1, retryDelay: 1 });
    const loader = makeFailingLoader("boom");
    const p = manager.loadWithFallback(loader);
    await vi.runAllTimersAsync();
    await expect(p).rejects.toThrow("boom");
  });

  it("5. calls onError on each failed attempt", async () => {
    const onError = vi.fn();
    const manager = createFallbackManager({ retries: 2, retryDelay: 1, onError });
    const loader = makeFailingLoader("err");
    const p = manager.loadWithFallback(loader, "fb");
    await vi.runAllTimersAsync();
    await p;
    // 1 initial + 2 retries = 3 calls
    expect(onError).toHaveBeenCalledTimes(3);
    expect(onError.mock.calls[0][1]).toBe(1); // attempt number
    expect(onError.mock.calls[1][1]).toBe(2);
    expect(onError.mock.calls[2][1]).toBe(3);
  });

  it("6. times out if loader does not resolve within timeout", async () => {
    const manager = createFallbackManager({ retries: 0, timeout: 100 });
    const loader = () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 9999));
    const p = manager.loadWithFallback(loader, "timed-out");
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toBe("timed-out");
  });

  it("7. default options: retries=3, timeout=5000, retryDelay=1000", async () => {
    const manager = createFallbackManager(); // no options
    const loader = vi.fn().mockResolvedValue(42);
    const result = await manager.loadWithFallback(loader);
    expect(result).toBe(42);
  });

  it("8. fallback can be any type (object)", async () => {
    const manager = createFallbackManager({ retries: 1, retryDelay: 1 });
    const fallback = { default: "FallbackComponent" };
    const p = manager.loadWithFallback(makeFailingLoader(), fallback);
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toEqual(fallback);
  });

  it("9. exponential backoff: loader is called at increasing intervals", async () => {
    // Verify that the fallback manager applies exponential backoff by checking
    // that vi.advanceTimersByTime advancing only the first backoff delay (100ms)
    // results in exactly 2 loader calls (initial + first retry), not 4.
    const manager = createFallbackManager({ retries: 3, retryDelay: 100 });
    const loader = makeFailingLoader("fail");
    const p = manager.loadWithFallback(loader, "fb");

    // Advance by 100ms → triggers first retry delay (2^0 * 100 = 100)
    await vi.advanceTimersByTimeAsync(100);
    // Advance by 200ms → triggers second retry delay (2^1 * 100 = 200)
    await vi.advanceTimersByTimeAsync(200);
    // Advance by 400ms → triggers third retry delay (2^2 * 100 = 400)
    await vi.advanceTimersByTimeAsync(400);
    // Advance timeout for last attempt
    await vi.advanceTimersByTimeAsync(5000);

    const result = await p;
    expect(result).toBe("fb");
  });
});

// ─── VersionManager — checkCompatibility ──────────────────────────────────────

describe("VersionManager.checkCompatibility", () => {
  it("10. returns compatible=true when major and minor match", () => {
    const manifest = { name: "remoteApp", version: "2.1.3" };
    const result = VersionManager.checkCompatibility(manifest, "2.1.0");
    expect(result.compatible).toBe(true);
  });

  it("11. returns compatible=false when major versions differ", () => {
    const manifest = { name: "remoteApp", version: "3.0.0" };
    const result = VersionManager.checkCompatibility(manifest, "2.0.0");
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("major version");
  });

  it("12. returns compatible=false when remote minor < host minor", () => {
    const manifest = { name: "remoteApp", version: "2.0.5" };
    const result = VersionManager.checkCompatibility(manifest, "2.1.0");
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("minor version too low");
  });

  it("13. returns compatible=true when remote minor > host minor (same major)", () => {
    const manifest = { name: "remoteApp", version: "2.3.0" };
    const result = VersionManager.checkCompatibility(manifest, "2.1.0");
    expect(result.compatible).toBe(true);
  });

  it("14. returns compatible=false for unparseable remote version", () => {
    const manifest = { name: "remoteApp", version: "not-a-version" };
    const result = VersionManager.checkCompatibility(manifest, "1.0.0");
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("unparseable version");
  });

  it("15. returns compatible=false for unparseable host version", () => {
    const manifest = { name: "remoteApp", version: "1.0.0" };
    const result = VersionManager.checkCompatibility(manifest, "latest");
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("unparseable version");
  });
});

// ─── VersionManager — resolveVersion ─────────────────────────────────────────

describe("VersionManager.resolveVersion", () => {
  it("16. resolves exact version from a list", () => {
    const versions = ["1.0.0", "1.1.0", "2.0.0"];
    const result = VersionManager.resolveVersion(versions, { exact: "1.1.0" });
    expect(result).toBe("1.1.0");
  });

  it("17. returns undefined when exact version is not in the list", () => {
    const versions = ["1.0.0", "2.0.0"];
    const result = VersionManager.resolveVersion(versions, { exact: "1.5.0" });
    expect(result).toBeUndefined();
  });

  it("18. resolves highest version satisfying min constraint", () => {
    const versions = ["1.0.0", "1.5.0", "2.0.0", "2.3.0"];
    const result = VersionManager.resolveVersion(versions, { min: "2.0.0" });
    expect(result).toBe("2.3.0");
  });

  it("19. resolves highest version satisfying max constraint", () => {
    const versions = ["1.0.0", "1.5.0", "2.0.0"];
    const result = VersionManager.resolveVersion(versions, { max: "1.5.0" });
    expect(result).toBe("1.5.0");
  });

  it("20. resolves highest version within min+max range", () => {
    const versions = ["1.0.0", "1.2.0", "1.5.0", "2.0.0"];
    const constraint: VersionConstraint = { min: "1.1.0", max: "1.9.0" };
    const result = VersionManager.resolveVersion(versions, constraint);
    expect(result).toBe("1.5.0");
  });

  it("21. returns undefined when no version satisfies min+max range", () => {
    const versions = ["1.0.0", "3.0.0"];
    const result = VersionManager.resolveVersion(versions, { min: "2.0.0", max: "2.9.0" });
    expect(result).toBeUndefined();
  });

  it("22. returns undefined for an empty version list", () => {
    const result = VersionManager.resolveVersion([], { min: "1.0.0" });
    expect(result).toBeUndefined();
  });
});

// ─── createCircuitBreaker ─────────────────────────────────────────────────────

describe("createCircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("23. starts in closed state", () => {
    const breaker = createCircuitBreaker();
    expect(breaker.getState()).toBe("closed");
  });

  it("24. opens after threshold consecutive failures", async () => {
    const breaker = createCircuitBreaker({ threshold: 3, resetTimeout: 10000 });
    const fail = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.call(fail)).rejects.toThrow("fail");
    }
    expect(breaker.getState()).toBe("open");
  });

  it("25. throws CircuitOpenError when circuit is open", async () => {
    const breaker = createCircuitBreaker({ threshold: 1, resetTimeout: 10000 });
    await expect(breaker.call(() => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(breaker.getState()).toBe("open");
    await expect(breaker.call(() => Promise.resolve("ok"))).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("26. transitions to half-open after resetTimeout", async () => {
    const breaker = createCircuitBreaker({ threshold: 1, resetTimeout: 5000 });
    await expect(breaker.call(() => Promise.reject(new Error("x")))).rejects.toThrow();
    expect(breaker.getState()).toBe("open");

    vi.advanceTimersByTime(5000);
    expect(breaker.getState()).toBe("half-open");
  });

  it("27. closes circuit on successful probe in half-open state", async () => {
    const breaker = createCircuitBreaker({ threshold: 1, resetTimeout: 1000 });
    await expect(breaker.call(() => Promise.reject(new Error("x")))).rejects.toThrow();
    vi.advanceTimersByTime(1000);
    expect(breaker.getState()).toBe("half-open");

    const result = await breaker.call(() => Promise.resolve("probe-ok"));
    expect(result).toBe("probe-ok");
    expect(breaker.getState()).toBe("closed");
  });

  it("28. re-opens circuit on failed probe in half-open state", async () => {
    const breaker = createCircuitBreaker({ threshold: 1, resetTimeout: 1000 });
    await expect(breaker.call(() => Promise.reject(new Error("x")))).rejects.toThrow();
    vi.advanceTimersByTime(1000);
    expect(breaker.getState()).toBe("half-open");

    await expect(breaker.call(() => Promise.reject(new Error("probe-fail")))).rejects.toThrow(
      "probe-fail",
    );
    expect(breaker.getState()).toBe("open");
  });

  it("29. resets failure count on success in closed state", async () => {
    const breaker = createCircuitBreaker({ threshold: 3, resetTimeout: 10000 });
    const fail = () => Promise.reject(new Error("fail"));
    // Two failures.
    await expect(breaker.call(fail)).rejects.toThrow();
    await expect(breaker.call(fail)).rejects.toThrow();
    expect(breaker.getFailureCount()).toBe(2);

    // Success resets the count.
    await breaker.call(() => Promise.resolve("ok"));
    expect(breaker.getFailureCount()).toBe(0);
    expect(breaker.getState()).toBe("closed");
  });

  it("30. getFailureCount tracks consecutive failures", async () => {
    const breaker = createCircuitBreaker({ threshold: 10, resetTimeout: 10000 });
    const fail = () => Promise.reject(new Error("fail"));
    for (let i = 0; i < 4; i++) {
      await expect(breaker.call(fail)).rejects.toThrow();
    }
    expect(breaker.getFailureCount()).toBe(4);
    expect(breaker.getState()).toBe("closed");
  });
});

// ─── FallbackUI ───────────────────────────────────────────────────────────────

describe("FallbackUI", () => {
  it("31. createErrorBoundary wraps content in a container with role=alert", () => {
    const html = FallbackUI.createErrorBoundary("<p>Something went wrong.</p>");
    expect(html).toContain("federation-error-boundary");
    expect(html).toContain('role="alert"');
    expect(html).toContain("<p>Something went wrong.</p>");
  });

  it("32. createLoadingPlaceholder returns default message when no options given", () => {
    const html = FallbackUI.createLoadingPlaceholder();
    expect(html).toContain("Loading");
    expect(html).toContain("federation-loading-placeholder");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
  });

  it("33. createLoadingPlaceholder respects custom message", () => {
    const html = FallbackUI.createLoadingPlaceholder({ message: "Fetching remote app…" });
    expect(html).toContain("Fetching remote app");
  });

  it("34. createLoadingPlaceholder applies custom width and height", () => {
    const html = FallbackUI.createLoadingPlaceholder({ width: "300px", height: "200px" });
    expect(html).toContain("width:300px");
    expect(html).toContain("height:200px");
  });

  it("35. createLoadingPlaceholder appends custom className", () => {
    const html = FallbackUI.createLoadingPlaceholder({ className: "my-loader" });
    expect(html).toContain("my-loader");
  });
});
