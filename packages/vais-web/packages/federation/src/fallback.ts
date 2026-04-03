/**
 * Fallback & Version Management — remote failure fallback, circuit breaker,
 * version compatibility checking, and fallback UI helpers.
 *
 * Provides:
 *  - createFallbackManager: retry logic with exponential backoff and fallback
 *  - VersionManager: semver-based compatibility checking and version resolution
 *  - createCircuitBreaker: circuit breaker pattern (closed → open → half-open)
 *  - FallbackUI: fallback UI rendering helpers (error boundary, loading placeholder)
 */

import type { FederationManifest } from "./types.js";

// ─── FallbackManager ──────────────────────────────────────────────────────────

/**
 * Options for the fallback manager.
 */
export interface FallbackOptions {
  /** Maximum time (ms) to wait for a single load attempt. Default: 5000. */
  timeout?: number;
  /** Number of retry attempts before giving up. Default: 3. */
  retries?: number;
  /** Base delay (ms) between retries (exponential backoff). Default: 1000. */
  retryDelay?: number;
  /** Called whenever an attempt fails. */
  onError?: (error: Error, attempt: number) => void;
}

/**
 * A fallback manager that wraps a remote loader with retry logic and
 * an optional fallback value when all retries are exhausted.
 */
export interface FallbackManager {
  /**
   * Attempt to load via `loader`. On failure, retries with exponential backoff.
   * If all retries fail and `fallback` is provided, returns the fallback value.
   * Otherwise re-throws the last error.
   *
   * @param loader   - Async function that performs the remote load.
   * @param fallback - Optional fallback value returned when loading fails.
   * @returns The loaded value or the fallback.
   */
  loadWithFallback<T>(loader: () => Promise<T>, fallback?: T): Promise<T>;
}

/**
 * Create a FallbackManager with the given options.
 *
 * @param options - Timeout, retry count, retry delay, and error callback.
 * @returns A FallbackManager instance.
 *
 * @example
 * const manager = createFallbackManager({ retries: 2, retryDelay: 500 });
 * const module = await manager.loadWithFallback(
 *   () => loadRemoteModule(config, "./Button"),
 *   { default: FallbackButton },
 * );
 */
export function createFallbackManager(options?: FallbackOptions): FallbackManager {
  const {
    timeout = 5000,
    retries = 3,
    retryDelay = 1000,
    onError,
  } = options ?? {};

  /**
   * Race a promise against a timeout.
   */
  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Operation timed out after ${ms}ms`)),
        ms,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  /**
   * Delay execution for `ms` milliseconds.
   */
  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function loadWithFallback<T>(
    loader: () => Promise<T>,
    fallback?: T,
  ): Promise<T> {
    let lastError: Error = new Error("Unknown error");

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const result = await withTimeout(loader(), timeout);
        return result;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        onError?.(lastError, attempt);

        // If this was the last attempt, stop retrying.
        if (attempt > retries) break;

        // Exponential backoff: retryDelay * 2^(attempt-1)
        const backoff = retryDelay * Math.pow(2, attempt - 1);
        await delay(backoff);
      }
    }

    // All attempts exhausted — return fallback or rethrow.
    if (fallback !== undefined) {
      return fallback;
    }
    throw lastError;
  }

  return { loadWithFallback };
}

// ─── VersionManager ───────────────────────────────────────────────────────────

/**
 * Constraint used when selecting a compatible version from a list.
 */
export interface VersionConstraint {
  /** Minimum acceptable version (inclusive). */
  min?: string;
  /** Maximum acceptable version (inclusive). */
  max?: string;
  /** Require an exact version match. Takes precedence over min/max. */
  exact?: string;
}

/**
 * Result returned by VersionManager.checkCompatibility.
 */
export interface CompatibilityResult {
  /** Whether the remote is compatible with the host. */
  compatible: boolean;
  /** Human-readable reason when not compatible. */
  reason?: string;
}

/**
 * Manages version compatibility between remotes and the host.
 */
export interface VersionManager {
  /**
   * Check whether a remote manifest is compatible with the host version.
   *
   * Rules:
   *  - The manifest must have a parseable semver `version`.
   *  - The host version must be parseable.
   *  - The remote's major version must match the host major version.
   *  - The remote's minor version must be >= the host minor version (within same major).
   *
   * @param manifest    - Remote federation manifest.
   * @param hostVersion - Host application semver string (e.g. "2.1.0").
   * @returns A CompatibilityResult.
   */
  checkCompatibility(
    manifest: Pick<FederationManifest, "name" | "version">,
    hostVersion: string,
  ): CompatibilityResult;

  /**
   * Select the best version from `versions` that satisfies `constraint`.
   *
   * When multiple versions satisfy the constraint the highest one is returned.
   * Returns undefined when no version satisfies the constraint.
   *
   * @param versions   - Array of semver version strings.
   * @param constraint - Constraint object with min, max, and/or exact.
   * @returns The best matching version string, or undefined.
   */
  resolveVersion(versions: string[], constraint: VersionConstraint): string | undefined;
}

/** Parse a semver string into [major, minor, patch]. Returns null on failure. */
function parseSemver(version: string): [number, number, number] | null {
  const cleaned = version.replace(/^v/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/** Compare two parsed semver tuples. Returns 1, -1, or 0. */
function compareSemver(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

/**
 * Create a VersionManager instance.
 *
 * @returns A VersionManager.
 *
 * @example
 * const vm = VersionManager;
 * const result = vm.checkCompatibility(manifest, "2.0.0");
 */
export const VersionManager: VersionManager = {
  checkCompatibility(
    manifest: Pick<FederationManifest, "name" | "version">,
    hostVersion: string,
  ): CompatibilityResult {
    const remoteVer = parseSemver(manifest.version);
    if (!remoteVer) {
      return {
        compatible: false,
        reason: `Remote "${manifest.name}" has an unparseable version: "${manifest.version}"`,
      };
    }

    const hostVer = parseSemver(hostVersion);
    if (!hostVer) {
      return {
        compatible: false,
        reason: `Host has an unparseable version: "${hostVersion}"`,
      };
    }

    // Major version must match.
    if (remoteVer[0] !== hostVer[0]) {
      return {
        compatible: false,
        reason:
          `Remote "${manifest.name}" version ${manifest.version} has major version ` +
          `${remoteVer[0]}, but host requires major version ${hostVer[0]}.`,
      };
    }

    // Remote minor must be >= host minor (within the same major).
    if (remoteVer[1] < hostVer[1]) {
      return {
        compatible: false,
        reason:
          `Remote "${manifest.name}" version ${manifest.version} is older than ` +
          `host version ${hostVersion} (minor version too low).`,
      };
    }

    return { compatible: true };
  },

  resolveVersion(versions: string[], constraint: VersionConstraint): string | undefined {
    // Filter versions that satisfy the constraint.
    const satisfying = versions.filter((v) => {
      const parsed = parseSemver(v);
      if (!parsed) return false;

      if (constraint.exact !== undefined) {
        const exactParsed = parseSemver(constraint.exact);
        if (!exactParsed) return false;
        return compareSemver(parsed, exactParsed) === 0;
      }

      if (constraint.min !== undefined) {
        const minParsed = parseSemver(constraint.min);
        if (!minParsed) return false;
        if (compareSemver(parsed, minParsed) < 0) return false;
      }

      if (constraint.max !== undefined) {
        const maxParsed = parseSemver(constraint.max);
        if (!maxParsed) return false;
        if (compareSemver(parsed, maxParsed) > 0) return false;
      }

      return true;
    });

    if (satisfying.length === 0) return undefined;

    // Return the highest version among those that satisfy the constraint.
    return satisfying.reduce((best, v) => {
      const bestParsed = parseSemver(best)!;
      const vParsed = parseSemver(v)!;
      return compareSemver(vParsed, bestParsed) > 0 ? v : best;
    });
  },
};

// ─── CircuitBreaker ───────────────────────────────────────────────────────────

/**
 * Circuit breaker state machine states.
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Options for the circuit breaker.
 */
export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5. */
  threshold?: number;
  /** Time (ms) to wait in open state before transitioning to half-open. Default: 30000. */
  resetTimeout?: number;
}

/**
 * Circuit breaker instance.
 */
export interface CircuitBreaker {
  /**
   * Execute `fn` through the circuit breaker.
   *
   * - closed: calls fn normally; increments failure count on error.
   * - open: rejects immediately with a CircuitOpenError.
   * - half-open: allows a single probe call; closes on success, re-opens on failure.
   *
   * @param fn - Async function to call.
   * @returns The result of fn.
   */
  call<T>(fn: () => Promise<T>): Promise<T>;

  /** Return the current circuit state. */
  getState(): CircuitState;

  /** Return the current failure count. */
  getFailureCount(): number;
}

/**
 * Error thrown when a call is attempted while the circuit is open.
 */
export class CircuitOpenError extends Error {
  constructor() {
    super("Circuit is open — calls are blocked until the reset timeout elapses.");
    this.name = "CircuitOpenError";
  }
}

/**
 * Create a CircuitBreaker.
 *
 * @param options - Failure threshold and reset timeout.
 * @returns A CircuitBreaker instance.
 *
 * @example
 * const breaker = createCircuitBreaker({ threshold: 3, resetTimeout: 10000 });
 * try {
 *   const result = await breaker.call(() => fetchRemote());
 * } catch (e) {
 *   if (e instanceof CircuitOpenError) { // circuit is open }
 * }
 */
export function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
  const threshold = options?.threshold ?? 5;
  const resetTimeout = options?.resetTimeout ?? 30000;

  let state: CircuitState = "closed";
  let failureCount = 0;
  let openedAt: number | null = null;

  function getState(): CircuitState {
    // Transition from open → half-open when resetTimeout has elapsed.
    if (state === "open" && openedAt !== null) {
      if (Date.now() - openedAt >= resetTimeout) {
        state = "half-open";
        openedAt = null;
      }
    }
    return state;
  }

  function getFailureCount(): number {
    return failureCount;
  }

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = getState();

    if (currentState === "open") {
      throw new CircuitOpenError();
    }

    try {
      const result = await fn();
      // Success — reset on half-open or closed.
      if (state === "half-open") {
        state = "closed";
        failureCount = 0;
        openedAt = null;
      } else {
        // In closed state a success resets failure count.
        failureCount = 0;
      }
      return result;
    } catch (err: unknown) {
      failureCount += 1;

      if (state === "half-open") {
        // Probe failed — go back to open.
        state = "open";
        openedAt = Date.now();
      } else if (failureCount >= threshold) {
        state = "open";
        openedAt = Date.now();
      }

      throw err;
    }
  }

  return { call, getState, getFailureCount };
}

// ─── FallbackUI ───────────────────────────────────────────────────────────────

/**
 * Options for createLoadingPlaceholder.
 */
export interface LoadingPlaceholderOptions {
  /** Text shown inside the placeholder. Default: "Loading…". */
  message?: string;
  /** Width style value (e.g. "100%", "300px"). Default: "100%". */
  width?: string;
  /** Height style value (e.g. "200px", "auto"). Default: "100px". */
  height?: string;
  /** Additional CSS class names. */
  className?: string;
}

/**
 * A minimal HTML string rendered by FallbackUI helpers.
 */
export type HTMLString = string;

/**
 * Fallback UI rendering helpers for use when a remote fails to load.
 */
export interface FallbackUIHelper {
  /**
   * Wrap `fallbackContent` in an error boundary container.
   * When the component throws, this content is shown instead.
   *
   * @param fallbackContent - HTML string to display on error.
   * @returns An HTML string representing the error boundary wrapper.
   */
  createErrorBoundary(fallbackContent: HTMLString): HTMLString;

  /**
   * Generate a loading placeholder element.
   *
   * @param options - Message, dimensions, and class name.
   * @returns An HTML string representing the loading placeholder.
   */
  createLoadingPlaceholder(options?: LoadingPlaceholderOptions): HTMLString;
}

/**
 * Fallback UI rendering helpers.
 *
 * These produce plain HTML strings that can be injected into a DOM container
 * when a remote module is unavailable or still loading.
 *
 * @example
 * document.getElementById("shell")!.innerHTML =
 *   FallbackUI.createLoadingPlaceholder({ message: "Loading remote app…" });
 */
export const FallbackUI: FallbackUIHelper = {
  createErrorBoundary(fallbackContent: HTMLString): HTMLString {
    return (
      `<div class="federation-error-boundary" role="alert" aria-live="assertive">` +
      fallbackContent +
      `</div>`
    );
  },

  createLoadingPlaceholder(options?: LoadingPlaceholderOptions): HTMLString {
    const message = options?.message ?? "Loading\u2026";
    const width = options?.width ?? "100%";
    const height = options?.height ?? "100px";
    const className = options?.className ? ` ${options.className}` : "";

    return (
      `<div class="federation-loading-placeholder${className}" ` +
      `role="status" aria-busy="true" ` +
      `style="width:${width};height:${height};display:flex;align-items:center;justify-content:center;">` +
      `<span>${message}</span>` +
      `</div>`
    );
  },
};
