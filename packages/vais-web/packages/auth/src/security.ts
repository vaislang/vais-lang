/**
 * @vaisx/auth — Security utilities
 *
 * Provides CSRF token generation/validation, HttpOnly cookie helpers,
 * XSS input sanitization, security headers, and timing-safe comparison.
 *
 * Usage:
 *   import {
 *     generateCSRFToken,
 *     validateCSRFToken,
 *     createCSRFMiddleware,
 *     createSecureCookieOptions,
 *     sanitizeInput,
 *     createSecurityHeaders,
 *     timingSafeEqual,
 *   } from "@vaisx/auth";
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Options for createCSRFMiddleware().
 */
export interface CSRFMiddlewareOptions {
  /**
   * Custom function to extract the CSRF token from a request.
   * Defaults to checking X-CSRF-Token header then body._csrf.
   */
  getToken?: (request: CSRFRequest) => string | undefined;
  /**
   * Custom function to extract the expected token (e.g. from session).
   * Defaults to reading request.session?.csrfToken.
   */
  getExpected?: (request: CSRFRequest) => string | undefined;
}

/**
 * Minimal request interface for CSRF middleware.
 */
export interface CSRFRequest {
  /** HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS). */
  method: string;
  /** HTTP headers map. */
  headers: Record<string, string | string[] | undefined>;
  /** Parsed request body (optional). */
  body?: Record<string, unknown>;
  /** Session data (optional). */
  session?: Record<string, unknown>;
}

/**
 * Result of CSRF middleware validation.
 */
export interface CSRFResult {
  /** Whether the request passed CSRF validation. */
  valid: boolean;
  /** Reason for failure, if any. */
  error?: string;
}

/**
 * Options for createSecureCookieOptions().
 */
export interface SecureCookieOptions {
  /** Whether to set the Secure flag. Defaults to true. */
  secure?: boolean;
  /** SameSite policy. Defaults to "lax". */
  sameSite?: "strict" | "lax" | "none";
  /** Cookie path. Defaults to "/". */
  path?: string;
  /** Max age in seconds. */
  maxAge?: number;
  /** Cookie domain. */
  domain?: string;
}

/**
 * Serializable cookie options object.
 */
export interface CookieConfig {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge?: number;
  domain?: string;
}

/**
 * Security HTTP headers map.
 */
export type SecurityHeaders = Record<string, string>;

// ─── generateCSRFToken ────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random CSRF token.
 *
 * Uses crypto.randomUUID() when available, otherwise falls back to
 * generating 32 random bytes encoded as a hex string.
 *
 * @returns A random token string.
 */
export function generateCSRFToken(): string {
  // Prefer randomUUID for a well-formatted unique token.
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }

  // Fallback: 32 random bytes as hex.
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── timingSafeEqual ─────────────────────────────────────────────────────────

/**
 * Compare two strings in constant time to prevent timing attacks.
 *
 * Both strings are encoded to UTF-8 bytes and compared using
 * a fixed-time XOR loop so the execution time does not depend
 * on where the first difference occurs.
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns  true if the strings are equal, false otherwise.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  // Always iterate over the longer length to avoid early-exit leaks.
  const len = Math.max(bufA.length, bufB.length);

  // Pad both buffers to the same length.
  const paddedA = new Uint8Array(len);
  const paddedB = new Uint8Array(len);
  paddedA.set(bufA);
  paddedB.set(bufB);

  // Accumulate differences with bitwise OR (never short-circuits).
  let diff = bufA.length ^ bufB.length; // length mismatch sets diff ≠ 0
  for (let i = 0; i < len; i++) {
    diff |= paddedA[i] ^ paddedB[i];
  }

  return diff === 0;
}

// ─── validateCSRFToken ────────────────────────────────────────────────────────

/**
 * Validate a CSRF token against the expected value using timing-safe comparison.
 *
 * @param token    - The token submitted by the client.
 * @param expected - The expected token (e.g. stored in the session).
 * @returns         true if both tokens are non-empty and equal.
 */
export function validateCSRFToken(token: string, expected: string): boolean {
  if (!token || !expected) return false;
  return timingSafeEqual(token, expected);
}

// ─── createCSRFMiddleware ─────────────────────────────────────────────────────

/** HTTP methods that mutate state and require CSRF validation. */
const CSRF_PROTECTED_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/** HTTP methods that are safe and skip CSRF validation. */
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Create a CSRF validation middleware function.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed without a token.
 * Mutating methods (POST, PUT, DELETE, PATCH) require a valid CSRF token.
 *
 * Token lookup order:
 *   1. `X-CSRF-Token` request header
 *   2. `_csrf` field in the request body
 *
 * Expected token lookup order:
 *   1. `request.session.csrfToken`
 *   2. Custom `options.getExpected` callback
 *
 * @param options - Optional configuration.
 * @returns         A function that accepts a CSRFRequest and returns a CSRFResult.
 */
export function createCSRFMiddleware(
  options?: CSRFMiddlewareOptions,
): (request: CSRFRequest) => CSRFResult {
  return function csrfMiddleware(request: CSRFRequest): CSRFResult {
    const method = (request.method ?? "").toUpperCase();

    // Safe methods — skip CSRF check.
    if (CSRF_SAFE_METHODS.has(method)) {
      return { valid: true };
    }

    // Unknown methods that are not in the protected set are also allowed through.
    if (!CSRF_PROTECTED_METHODS.has(method)) {
      return { valid: true };
    }

    // Extract the submitted token.
    let submittedToken: string | undefined;

    if (options?.getToken) {
      submittedToken = options.getToken(request);
    } else {
      // 1. Check X-CSRF-Token header.
      const headerValue =
        request.headers["x-csrf-token"] ?? request.headers["X-CSRF-Token"];
      const headerToken = Array.isArray(headerValue)
        ? headerValue[0]
        : headerValue;

      // 2. Check body._csrf field.
      const bodyToken =
        request.body && typeof request.body["_csrf"] === "string"
          ? (request.body["_csrf"] as string)
          : undefined;

      submittedToken = headerToken ?? bodyToken;
    }

    // Extract the expected token.
    let expectedToken: string | undefined;

    if (options?.getExpected) {
      expectedToken = options.getExpected(request);
    } else {
      const csrfToken = request.session?.["csrfToken"];
      expectedToken =
        typeof csrfToken === "string" ? csrfToken : undefined;
    }

    if (!submittedToken) {
      return { valid: false, error: "CSRF token missing" };
    }

    if (!expectedToken) {
      return { valid: false, error: "CSRF token not found in session" };
    }

    if (!validateCSRFToken(submittedToken, expectedToken)) {
      return { valid: false, error: "CSRF token invalid" };
    }

    return { valid: true };
  };
}

// ─── createSecureCookieOptions ────────────────────────────────────────────────

/**
 * Build a secure cookie options object with safe defaults.
 *
 * Defaults:
 *   - httpOnly: true   — prevents JavaScript access (XSS mitigation)
 *   - secure:   true   — only sent over HTTPS
 *   - sameSite: "lax"  — balanced CSRF protection and usability
 *   - path:     "/"    — cookie available site-wide
 *
 * @param options - Partial overrides for the defaults.
 * @returns         A fully-populated CookieConfig object.
 */
export function createSecureCookieOptions(
  options?: SecureCookieOptions,
): CookieConfig {
  const config: CookieConfig = {
    httpOnly: true,
    secure: options?.secure !== undefined ? options.secure : true,
    sameSite: options?.sameSite ?? "lax",
    path: options?.path ?? "/",
  };

  if (options?.maxAge !== undefined) {
    config.maxAge = options.maxAge;
  }

  if (options?.domain !== undefined) {
    config.domain = options.domain;
  }

  return config;
}

// ─── sanitizeInput ────────────────────────────────────────────────────────────

/** HTML entity map for characters that need escaping. */
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

/**
 * Escape HTML special characters to prevent XSS injection.
 *
 * Escapes: & < > " '
 *
 * @param input - Raw user input string.
 * @returns       HTML-escaped string safe for insertion into HTML content.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return "";
  return input.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

// ─── createSecurityHeaders ────────────────────────────────────────────────────

/**
 * Create a set of recommended security HTTP response headers.
 *
 * Headers included:
 *   - X-Content-Type-Options: nosniff
 *       Prevents MIME-type sniffing attacks.
 *   - X-Frame-Options: DENY
 *       Prevents the page from being embedded in an iframe (clickjacking).
 *   - X-XSS-Protection: 1; mode=block
 *       Enables the browser's XSS auditor (legacy browsers).
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *       Limits referrer information sent to other origins.
 *
 * @returns A plain object mapping header names to their values.
 */
export function createSecurityHeaders(): SecurityHeaders {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}
