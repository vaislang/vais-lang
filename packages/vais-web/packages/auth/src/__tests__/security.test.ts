/**
 * @vaisx/auth — Security utilities tests
 *
 * Covers:
 *  - generateCSRFToken()
 *  - validateCSRFToken()
 *  - timingSafeEqual()
 *  - createCSRFMiddleware()
 *  - createSecureCookieOptions()
 *  - sanitizeInput()
 *  - createSecurityHeaders()
 */

import { describe, it, expect } from "vitest";
import {
  generateCSRFToken,
  validateCSRFToken,
  createCSRFMiddleware,
  createSecureCookieOptions,
  sanitizeInput,
  createSecurityHeaders,
  timingSafeEqual,
} from "../security.js";
import type { CSRFRequest } from "../security.js";

// ─── generateCSRFToken ────────────────────────────────────────────────────────

describe("generateCSRFToken()", () => {
  it("returns a non-empty string", () => {
    const token = generateCSRFToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("returns a token of at least 32 characters", () => {
    const token = generateCSRFToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("generates unique tokens on each call", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateCSRFToken()));
    // All 20 should be unique — collision probability is astronomically low.
    expect(tokens.size).toBe(20);
  });

  it("returns only alphanumeric/hex characters (no special chars from UUID dashes)", () => {
    const token = generateCSRFToken();
    // UUID dashes are stripped; result should be hex digits only.
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });
});

// ─── timingSafeEqual ─────────────────────────────────────────────────────────

describe("timingSafeEqual()", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for strings that differ by one character", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(timingSafeEqual("short", "short-but-longer")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("returns false when one string is empty and the other is not", () => {
    expect(timingSafeEqual("", "nonempty")).toBe(false);
    expect(timingSafeEqual("nonempty", "")).toBe(false);
  });

  it("returns false for case-different strings", () => {
    expect(timingSafeEqual("Token", "token")).toBe(false);
  });

  it("handles strings with special characters", () => {
    const s = "token/with+special=chars&more";
    expect(timingSafeEqual(s, s)).toBe(true);
    expect(timingSafeEqual(s, s + "x")).toBe(false);
  });
});

// ─── validateCSRFToken ────────────────────────────────────────────────────────

describe("validateCSRFToken()", () => {
  it("returns true when token matches expected", () => {
    const token = generateCSRFToken();
    expect(validateCSRFToken(token, token)).toBe(true);
  });

  it("returns false when token does not match expected", () => {
    const tokenA = generateCSRFToken();
    const tokenB = generateCSRFToken();
    expect(validateCSRFToken(tokenA, tokenB)).toBe(false);
  });

  it("returns false when token is an empty string", () => {
    expect(validateCSRFToken("", "expected-token")).toBe(false);
  });

  it("returns false when expected is an empty string", () => {
    expect(validateCSRFToken("some-token", "")).toBe(false);
  });

  it("returns false when both are empty strings", () => {
    expect(validateCSRFToken("", "")).toBe(false);
  });

  it("is case-sensitive", () => {
    const token = "AbCdEf123456";
    expect(validateCSRFToken(token.toLowerCase(), token)).toBe(false);
  });
});

// ─── createCSRFMiddleware ─────────────────────────────────────────────────────

describe("createCSRFMiddleware() — safe methods", () => {
  const csrf = createCSRFMiddleware();

  it("allows GET requests without a token", () => {
    const req: CSRFRequest = { method: "GET", headers: {} };
    expect(csrf(req).valid).toBe(true);
  });

  it("allows HEAD requests without a token", () => {
    const req: CSRFRequest = { method: "HEAD", headers: {} };
    expect(csrf(req).valid).toBe(true);
  });

  it("allows OPTIONS requests without a token", () => {
    const req: CSRFRequest = { method: "OPTIONS", headers: {} };
    expect(csrf(req).valid).toBe(true);
  });

  it("is case-insensitive for HTTP method names", () => {
    const req: CSRFRequest = { method: "get", headers: {} };
    expect(csrf(req).valid).toBe(true);
  });
});

describe("createCSRFMiddleware() — protected methods (header token)", () => {
  it("allows POST when X-CSRF-Token header matches session token", () => {
    const token = generateCSRFToken();
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "POST",
      headers: { "x-csrf-token": token },
      session: { csrfToken: token },
    };
    const result = csrf(req);
    expect(result.valid).toBe(true);
  });

  it("rejects POST when X-CSRF-Token header does not match", () => {
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "POST",
      headers: { "x-csrf-token": "wrong-token" },
      session: { csrfToken: generateCSRFToken() },
    };
    const result = csrf(req);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it("allows PUT when X-CSRF-Token header matches", () => {
    const token = generateCSRFToken();
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "PUT",
      headers: { "x-csrf-token": token },
      session: { csrfToken: token },
    };
    expect(csrf(req).valid).toBe(true);
  });

  it("allows DELETE when X-CSRF-Token header matches", () => {
    const token = generateCSRFToken();
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "DELETE",
      headers: { "x-csrf-token": token },
      session: { csrfToken: token },
    };
    expect(csrf(req).valid).toBe(true);
  });

  it("allows PATCH when X-CSRF-Token header matches", () => {
    const token = generateCSRFToken();
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "PATCH",
      headers: { "x-csrf-token": token },
      session: { csrfToken: token },
    };
    expect(csrf(req).valid).toBe(true);
  });
});

describe("createCSRFMiddleware() — protected methods (body token)", () => {
  it("allows POST when _csrf body field matches session token", () => {
    const token = generateCSRFToken();
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "POST",
      headers: {},
      body: { _csrf: token },
      session: { csrfToken: token },
    };
    expect(csrf(req).valid).toBe(true);
  });

  it("rejects POST when _csrf body field does not match", () => {
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "POST",
      headers: {},
      body: { _csrf: "wrong" },
      session: { csrfToken: generateCSRFToken() },
    };
    const result = csrf(req);
    expect(result.valid).toBe(false);
  });

  it("header token takes precedence over body token", () => {
    const correct = generateCSRFToken();
    const wrong = generateCSRFToken();
    const csrf = createCSRFMiddleware();
    // Header has the correct token; body has the wrong one.
    const req: CSRFRequest = {
      method: "POST",
      headers: { "x-csrf-token": correct },
      body: { _csrf: wrong },
      session: { csrfToken: correct },
    };
    expect(csrf(req).valid).toBe(true);
  });
});

describe("createCSRFMiddleware() — missing token errors", () => {
  it("rejects POST when no token is provided", () => {
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "POST",
      headers: {},
      session: { csrfToken: generateCSRFToken() },
    };
    const result = csrf(req);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/missing/i);
  });

  it("rejects POST when session has no csrfToken", () => {
    const csrf = createCSRFMiddleware();
    const req: CSRFRequest = {
      method: "POST",
      headers: { "x-csrf-token": generateCSRFToken() },
      session: {},
    };
    const result = csrf(req);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found in session/i);
  });
});

describe("createCSRFMiddleware() — custom options", () => {
  it("uses custom getToken function when provided", () => {
    const token = generateCSRFToken();
    const csrf = createCSRFMiddleware({
      getToken: (req) => req.headers["x-custom-token"] as string | undefined,
      getExpected: () => token,
    });
    const req: CSRFRequest = {
      method: "POST",
      headers: { "x-custom-token": token },
    };
    expect(csrf(req).valid).toBe(true);
  });

  it("uses custom getExpected function when provided", () => {
    const token = generateCSRFToken();
    const csrf = createCSRFMiddleware({
      getExpected: () => token,
    });
    const req: CSRFRequest = {
      method: "POST",
      headers: { "x-csrf-token": token },
    };
    expect(csrf(req).valid).toBe(true);
  });
});

// ─── createSecureCookieOptions ────────────────────────────────────────────────

describe("createSecureCookieOptions()", () => {
  it("returns httpOnly: true by default", () => {
    const opts = createSecureCookieOptions();
    expect(opts.httpOnly).toBe(true);
  });

  it("returns secure: true by default", () => {
    const opts = createSecureCookieOptions();
    expect(opts.secure).toBe(true);
  });

  it("returns sameSite: 'lax' by default", () => {
    const opts = createSecureCookieOptions();
    expect(opts.sameSite).toBe("lax");
  });

  it("returns path: '/' by default", () => {
    const opts = createSecureCookieOptions();
    expect(opts.path).toBe("/");
  });

  it("does not include maxAge when not specified", () => {
    const opts = createSecureCookieOptions();
    expect(opts.maxAge).toBeUndefined();
  });

  it("sets maxAge when provided", () => {
    const opts = createSecureCookieOptions({ maxAge: 86400 });
    expect(opts.maxAge).toBe(86400);
  });

  it("allows overriding secure to false", () => {
    const opts = createSecureCookieOptions({ secure: false });
    expect(opts.secure).toBe(false);
  });

  it("allows overriding sameSite to 'strict'", () => {
    const opts = createSecureCookieOptions({ sameSite: "strict" });
    expect(opts.sameSite).toBe("strict");
  });

  it("allows overriding sameSite to 'none'", () => {
    const opts = createSecureCookieOptions({ sameSite: "none" });
    expect(opts.sameSite).toBe("none");
  });

  it("allows overriding path", () => {
    const opts = createSecureCookieOptions({ path: "/api" });
    expect(opts.path).toBe("/api");
  });

  it("sets domain when provided", () => {
    const opts = createSecureCookieOptions({ domain: "example.com" });
    expect(opts.domain).toBe("example.com");
  });

  it("does not include domain when not specified", () => {
    const opts = createSecureCookieOptions();
    expect(opts.domain).toBeUndefined();
  });
});

// ─── sanitizeInput ────────────────────────────────────────────────────────────

describe("sanitizeInput()", () => {
  it("escapes < characters", () => {
    expect(sanitizeInput("<script>")).toContain("&lt;");
    expect(sanitizeInput("<script>")).not.toContain("<");
  });

  it("escapes > characters", () => {
    expect(sanitizeInput("alert()>")).toContain("&gt;");
  });

  it("escapes & characters", () => {
    expect(sanitizeInput("a&b")).toBe("a&amp;b");
  });

  it('escapes " characters', () => {
    expect(sanitizeInput('"value"')).toBe("&quot;value&quot;");
  });

  it("escapes ' characters", () => {
    expect(sanitizeInput("it's")).toBe("it&#x27;s");
  });

  it("escapes all special characters in a combined XSS payload", () => {
    const payload = `<script>alert('xss"&test')</script>`;
    const sanitized = sanitizeInput(payload);
    expect(sanitized).not.toContain("<");
    expect(sanitized).not.toContain(">");
    expect(sanitized).not.toContain('"');
    expect(sanitized).not.toContain("'");
    expect(sanitized).not.toContain("&script"); // & itself should be escaped
    expect(sanitized).toContain("&lt;");
    expect(sanitized).toContain("&gt;");
    expect(sanitized).toContain("&amp;");
    expect(sanitized).toContain("&quot;");
    expect(sanitized).toContain("&#x27;");
  });

  it("returns a plain string unchanged when no special chars are present", () => {
    expect(sanitizeInput("hello world 123")).toBe("hello world 123");
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeInput("")).toBe("");
  });

  it("handles strings with only special characters", () => {
    expect(sanitizeInput("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#x27;");
  });
});

// ─── createSecurityHeaders ────────────────────────────────────────────────────

describe("createSecurityHeaders()", () => {
  it("includes X-Content-Type-Options: nosniff", () => {
    const headers = createSecurityHeaders();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("includes X-Frame-Options: DENY", () => {
    const headers = createSecurityHeaders();
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("includes X-XSS-Protection: 1; mode=block", () => {
    const headers = createSecurityHeaders();
    expect(headers["X-XSS-Protection"]).toBe("1; mode=block");
  });

  it("includes Referrer-Policy: strict-origin-when-cross-origin", () => {
    const headers = createSecurityHeaders();
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("returns exactly 4 security headers", () => {
    const headers = createSecurityHeaders();
    expect(Object.keys(headers).length).toBe(4);
  });

  it("returns a new object on each call (immutable — no shared reference)", () => {
    const h1 = createSecurityHeaders();
    const h2 = createSecurityHeaders();
    h1["X-Frame-Options"] = "SAMEORIGIN";
    expect(h2["X-Frame-Options"]).toBe("DENY");
  });
});
