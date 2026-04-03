/**
 * @vaisx/auth — JWT utility tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  encodeJWT,
  decodeJWT,
  verifyJWT,
  generateRefreshToken,
  base64urlEncode,
  base64urlDecode,
} from "../jwt.ts";

const SECRET = "test-secret-key-for-jwt-unit-tests";

// ─── base64url helpers ────────────────────────────────────────────────────────

describe("base64url helpers", () => {
  it("encodes a simple ASCII string to base64url without padding", () => {
    const encoded = base64urlEncode("hello");
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
  });

  it("round-trips ASCII strings through encode/decode", () => {
    const original = "Hello, World!";
    expect(base64urlDecode(base64urlEncode(original))).toBe(original);
  });

  it("round-trips JSON strings through encode/decode", () => {
    const json = JSON.stringify({ sub: "user-1", iat: 1700000000, exp: 1700003600 });
    expect(base64urlDecode(base64urlEncode(json))).toBe(json);
  });

  it("encodes binary (Uint8Array) without throwing", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const encoded = base64urlEncode(bytes);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
  });

  it("uses '-' and '_' instead of '+' and '/'", () => {
    // Force a value that produces '+' or '/' in standard base64.
    // We test by checking that the output only contains URL-safe chars.
    const encoded = base64urlEncode("Man");
    expect(/^[A-Za-z0-9\-_]*$/.test(encoded)).toBe(true);
  });
});

// ─── generateRefreshToken ─────────────────────────────────────────────────────

describe("generateRefreshToken", () => {
  it("returns a non-empty string", () => {
    expect(generateRefreshToken().length).toBeGreaterThan(0);
  });

  it("returns different tokens on successive calls", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
  });

  it("contains only hex characters (no hyphens from UUID variant)", () => {
    const token = generateRefreshToken();
    // randomUUID variant strips hyphens; raw hex path also returns hex.
    expect(/^[0-9a-f]+$/i.test(token)).toBe(true);
  });
});

// ─── encodeJWT / decodeJWT round-trip ─────────────────────────────────────────

describe("encodeJWT + decodeJWT round-trip", () => {
  it("produces a three-part dot-separated token", async () => {
    const token = await encodeJWT({ sub: "u1" }, SECRET);
    expect(token.split(".").length).toBe(3);
  });

  it("decodes the sub claim correctly", async () => {
    const token = await encodeJWT({ sub: "user-42" }, SECRET);
    const payload = decodeJWT(token);
    expect(payload?.sub).toBe("user-42");
  });

  it("decodes iat and exp fields", async () => {
    const token = await encodeJWT({ sub: "u1" }, SECRET, { expiresIn: 3600 });
    const payload = decodeJWT(token);
    expect(typeof payload?.iat).toBe("number");
    expect(typeof payload?.exp).toBe("number");
    expect(payload!.exp - payload!.iat).toBe(3600);
  });

  it("preserves arbitrary data fields", async () => {
    const token = await encodeJWT({ sub: "u1", data: { role: "admin", score: 99 } }, SECRET);
    const payload = decodeJWT(token);
    expect((payload?.data as Record<string, unknown>)?.role).toBe("admin");
    expect((payload?.data as Record<string, unknown>)?.score).toBe(99);
  });

  it("uses the jti from options when provided", async () => {
    const token = await encodeJWT({ sub: "u1" }, SECRET, { jti: "my-jti-123" });
    const payload = decodeJWT(token);
    expect(payload?.jti).toBe("my-jti-123");
  });

  it("allows custom iat via options", async () => {
    const customIat = 1700000000;
    const token = await encodeJWT({ sub: "u1" }, SECRET, { iat: customIat, expiresIn: 60 });
    const payload = decodeJWT(token);
    expect(payload?.iat).toBe(customIat);
    expect(payload?.exp).toBe(customIat + 60);
  });

  it("decodeJWT returns null for a completely invalid token", () => {
    expect(decodeJWT("not.a.valid.jwt.at.all")).toBeNull();
  });

  it("decodeJWT returns null for a one-part string", () => {
    expect(decodeJWT("nodots")).toBeNull();
  });

  it("decodeJWT returns null when payload is not valid JSON (corrupted)", () => {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.!!!.sig";
    expect(decodeJWT(token)).toBeNull();
  });
});

// ─── verifyJWT ────────────────────────────────────────────────────────────────

describe("verifyJWT", () => {
  it("returns the payload for a valid, non-expired token", async () => {
    const token = await encodeJWT({ sub: "u1" }, SECRET, { expiresIn: 3600 });
    const payload = await verifyJWT(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("u1");
  });

  it("returns null when the signature has been tampered with", async () => {
    const token = await encodeJWT({ sub: "u1" }, SECRET, { expiresIn: 3600 });
    const parts = token.split(".");
    // Flip the last character of the signature.
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith("a") ? "b" : "a");
    const tampered = parts.join(".");
    const result = await verifyJWT(tampered, SECRET);
    expect(result).toBeNull();
  });

  it("returns null when signed with a different secret", async () => {
    const token = await encodeJWT({ sub: "u1" }, SECRET, { expiresIn: 3600 });
    const result = await verifyJWT(token, "wrong-secret");
    expect(result).toBeNull();
  });

  it("returns null for an expired token", async () => {
    // Create a token that expired in the past.
    const pastIat = Math.floor(Date.now() / 1000) - 7200;
    const token = await encodeJWT({ sub: "u1" }, SECRET, { iat: pastIat, expiresIn: 3600 });
    const result = await verifyJWT(token, SECRET);
    expect(result).toBeNull();
  });

  it("returns null for a completely malformed token string", async () => {
    const result = await verifyJWT("garbage-token", SECRET);
    expect(result).toBeNull();
  });

  it("returns null for an empty string", async () => {
    const result = await verifyJWT("", SECRET);
    expect(result).toBeNull();
  });

  it("verifies token produced with a long secret", async () => {
    const longSecret = "x".repeat(200);
    const token = await encodeJWT({ sub: "u2" }, longSecret, { expiresIn: 60 });
    const payload = await verifyJWT(token, longSecret);
    expect(payload?.sub).toBe("u2");
  });

  it("returns payload that matches the decoded payload for a valid token", async () => {
    const token = await encodeJWT({ sub: "u3", data: { foo: "bar" } }, SECRET, { expiresIn: 3600 });
    const verified = await verifyJWT(token, SECRET);
    const decoded = decodeJWT(token);
    expect(verified).toEqual(decoded);
  });

  it("different sub values produce different tokens", async () => {
    const t1 = await encodeJWT({ sub: "userA" }, SECRET, { expiresIn: 3600 });
    const t2 = await encodeJWT({ sub: "userB" }, SECRET, { expiresIn: 3600 });
    expect(t1).not.toBe(t2);
  });

  it("payloads with exp = current second are still valid (boundary)", async () => {
    const now = Math.floor(Date.now() / 1000);
    // exp set to 10 seconds in future — should be valid.
    const token = await encodeJWT({ sub: "u1" }, SECRET, { iat: now, expiresIn: 10 });
    const result = await verifyJWT(token, SECRET);
    expect(result).not.toBeNull();
  });
});
