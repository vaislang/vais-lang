import { describe, it, expect } from "vitest";
import {
  generateCsrfToken,
  validateCsrfToken,
  injectCsrfField,
  validateOrigin,
} from "../src/server/csrf.js";
import { validateFormData } from "../src/server/validation.js";
import type { FormSchema } from "../src/server/validation.js";
import { handleServerAction } from "../src/server/action.js";
import type { ActionResult, ActionFunction } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

/** Build a URLSearchParams body (application/x-www-form-urlencoded) from a plain object. */
function makeUrlEncoded(fields: Record<string, string>): URLSearchParams {
  return new URLSearchParams(fields);
}

// ---------------------------------------------------------------------------
// csrf.ts — generateCsrfToken
// ---------------------------------------------------------------------------

describe("generateCsrfToken", () => {
  it("returns a non-empty string", () => {
    const token = generateCsrfToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("generates unique tokens on each call", () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// csrf.ts — validateCsrfToken
// ---------------------------------------------------------------------------

describe("validateCsrfToken", () => {
  it("returns true when __vx_csrf matches expectedToken", () => {
    const token = "my-csrf-token";
    const fd = makeFormData({ __vx_csrf: token, name: "Alice" });
    expect(validateCsrfToken(fd, token)).toBe(true);
  });

  it("returns false when __vx_csrf does not match expectedToken", () => {
    const fd = makeFormData({ __vx_csrf: "wrong-token" });
    expect(validateCsrfToken(fd, "correct-token")).toBe(false);
  });

  it("returns false when __vx_csrf field is missing", () => {
    const fd = makeFormData({ name: "Alice" });
    expect(validateCsrfToken(fd, "some-token")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// csrf.ts — injectCsrfField
// ---------------------------------------------------------------------------

describe("injectCsrfField", () => {
  it("injects hidden input before </form>", () => {
    const html = '<form method="post"><input name="x"></form>';
    const result = injectCsrfField(html, "tok123");
    expect(result).toContain('<input type="hidden" name="__vx_csrf" value="tok123">');
    expect(result.indexOf("</form>")).toBeGreaterThan(result.indexOf("__vx_csrf"));
  });

  it("injects into multiple </form> tags", () => {
    const html = "<form></form><form></form>";
    const result = injectCsrfField(html, "abc");
    const count = (result.match(/__vx_csrf/g) ?? []).length;
    expect(count).toBe(2);
  });

  it("returns html unchanged if no </form> tag present", () => {
    const html = "<div>no form here</div>";
    expect(injectCsrfField(html, "tok")).toBe(html);
  });

  // Security tests
  it("escapes double quotes in token to prevent attribute injection", () => {
    const maliciousToken = 'tok"><script>alert(1)</script>';
    const html = "<form></form>";
    const result = injectCsrfField(html, maliciousToken);
    expect(result).not.toContain('"<script>');
    expect(result).toContain("&quot;");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
  });

  it("escapes ampersands in token", () => {
    const result = injectCsrfField("<form></form>", "a&b");
    expect(result).toContain("&amp;");
    expect(result).not.toContain('value="a&b"');
  });
});

// ---------------------------------------------------------------------------
// csrf.ts — validateCsrfToken security (timing-safe)
// ---------------------------------------------------------------------------

describe("validateCsrfToken security", () => {
  it("returns false when token length differs from expected (short-circuit before timingSafeEqual)", () => {
    const fd = makeFormData({ __vx_csrf: "short" });
    expect(validateCsrfToken(fd, "much-longer-token")).toBe(false);
  });

  it("returns false when token is empty string", () => {
    const fd = makeFormData({ __vx_csrf: "" });
    expect(validateCsrfToken(fd, "some-token")).toBe(false);
  });

  it("returns true for matching tokens of same length (timing-safe path)", () => {
    const token = "aaaa-bbbb-cccc-dddd";
    const fd = makeFormData({ __vx_csrf: token });
    expect(validateCsrfToken(fd, token)).toBe(true);
  });

  it("returns false for different tokens of the same length", () => {
    const fd = makeFormData({ __vx_csrf: "aaaa" });
    expect(validateCsrfToken(fd, "bbbb")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// csrf.ts — validateOrigin
// ---------------------------------------------------------------------------

describe("validateOrigin", () => {
  it("returns true when Origin header matches request URL origin", () => {
    const req = new Request("http://example.com/action", {
      method: "POST",
      headers: { origin: "http://example.com" },
    });
    expect(validateOrigin(req)).toBe(true);
  });

  it("returns false when Origin header is from a different origin", () => {
    const req = new Request("http://example.com/action", {
      method: "POST",
      headers: { origin: "http://evil.com" },
    });
    expect(validateOrigin(req)).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    const req = new Request("http://example.com/action", {
      method: "POST",
      headers: { referer: "http://example.com/form" },
    });
    expect(validateOrigin(req)).toBe(true);
  });

  it("returns false when neither Origin nor Referer is present", () => {
    const req = new Request("http://example.com/action", { method: "POST" });
    expect(validateOrigin(req)).toBe(false);
  });

  it("accepts allowedOrigins in addition to same-origin", () => {
    const req = new Request("http://example.com/action", {
      method: "POST",
      headers: { origin: "http://trusted.com" },
    });
    expect(validateOrigin(req, ["http://trusted.com"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validation.ts — validateFormData
// ---------------------------------------------------------------------------

describe("validateFormData", () => {
  it("passes when all required fields are present", () => {
    const schema: FormSchema = [
      { name: "email", type: "string", required: true },
      { name: "age", type: "number", required: true },
    ];
    const fd = makeFormData({ email: "a@b.com", age: "25" });
    const result = validateFormData(fd, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.data.email).toBe("a@b.com");
    expect(result.data.age).toBe(25);
  });

  it("fails when a required field is missing", () => {
    const schema: FormSchema = [{ name: "username", type: "string", required: true }];
    const fd = makeFormData({});
    const result = validateFormData(fd, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.username).toBeDefined();
  });

  it("coerces number fields via parseFloat", () => {
    const schema: FormSchema = [{ name: "price", type: "number" }];
    const fd = makeFormData({ price: "3.14" });
    const result = validateFormData(fd, schema);
    expect(result.valid).toBe(true);
    expect(result.data.price).toBe(3.14);
  });

  it("reports error for non-numeric value in number field", () => {
    const schema: FormSchema = [{ name: "count", type: "number", required: true }];
    const fd = makeFormData({ count: "abc" });
    const result = validateFormData(fd, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.count).toBeDefined();
  });

  it("coerces boolean: 'true' → true, 'false' → false, '1' → true", () => {
    const schema: FormSchema = [
      { name: "active", type: "boolean" },
      { name: "disabled", type: "boolean" },
      { name: "checked", type: "boolean" },
    ];
    const fd = makeFormData({ active: "true", disabled: "false", checked: "1" });
    const result = validateFormData(fd, schema);
    expect(result.data.active).toBe(true);
    expect(result.data.disabled).toBe(false);
    expect(result.data.checked).toBe(true);
  });

  it("collects errors for multiple invalid fields", () => {
    const schema: FormSchema = [
      { name: "a", type: "string", required: true },
      { name: "b", type: "number", required: true },
    ];
    const fd = makeFormData({});
    const result = validateFormData(fd, schema);
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// action.ts — handleServerAction
// ---------------------------------------------------------------------------

const successAction: ActionFunction = async () => ({ status: "success", data: { ok: true } });
const errorAction: ActionFunction = async () => ({
  status: "error",
  errors: { _: "something went wrong" },
});
const redirectAction: ActionFunction = async () => ({
  status: "redirect",
  redirectTo: "/dashboard",
});

const CSRF_TOKEN = "test-csrf-token";

/**
 * Build a POST Request with application/x-www-form-urlencoded body.
 * This is the most reliable form encoding in the Node/jsdom test environment.
 */
function makeActionRequest(
  method: string,
  fields: Record<string, string> = {},
  headers: Record<string, string> = {}
): Request {
  const body = method === "GET" ? undefined : new URLSearchParams(fields).toString();
  return new Request("http://example.com/action", {
    method,
    headers: {
      origin: "http://example.com",
      accept: "application/json",
      ...(body !== undefined
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {}),
      ...headers,
    },
    body,
  });
}

describe("handleServerAction", () => {
  it("returns 405 for non-POST requests", async () => {
    const req = makeActionRequest("GET");
    const res = await handleServerAction({
      request: req,
      actionFn: successAction,
      csrfToken: CSRF_TOKEN,
    });
    expect(res.status).toBe(405);
  });

  it("returns 403 when Origin does not match", async () => {
    const req = new Request("http://example.com/action", {
      method: "POST",
      headers: {
        origin: "http://evil.com",
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ __vx_csrf: CSRF_TOKEN }).toString(),
    });
    const res = await handleServerAction({
      request: req,
      actionFn: successAction,
      csrfToken: CSRF_TOKEN,
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when CSRF token is invalid", async () => {
    const req = makeActionRequest("POST", { __vx_csrf: "bad-token" });
    const res = await handleServerAction({
      request: req,
      actionFn: successAction,
      csrfToken: CSRF_TOKEN,
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when schema validation fails", async () => {
    const schema: FormSchema = [{ name: "email", type: "string", required: true }];
    // email missing from body
    const req = makeActionRequest("POST", { __vx_csrf: CSRF_TOKEN });
    const res = await handleServerAction({
      request: req,
      actionFn: successAction,
      csrfToken: CSRF_TOKEN,
      schema,
    });
    expect(res.status).toBe(400);
  });

  it("returns JSON { status: 'success', data: {...} } on success", async () => {
    const req = makeActionRequest("POST", { __vx_csrf: CSRF_TOKEN, name: "Alice" });
    const res = await handleServerAction({
      request: req,
      actionFn: successAction,
      csrfToken: CSRF_TOKEN,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data).toBeDefined();
  });

  it("returns 303 redirect when action returns redirect", async () => {
    const req = makeActionRequest("POST", { __vx_csrf: CSRF_TOKEN });
    const res = await handleServerAction({
      request: req,
      actionFn: redirectAction,
      csrfToken: CSRF_TOKEN,
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/dashboard");
  });

  it("returns error JSON when action returns error status", async () => {
    const req = makeActionRequest("POST", { __vx_csrf: CSRF_TOKEN });
    const res = await handleServerAction({
      request: req,
      actionFn: errorAction,
      csrfToken: CSRF_TOKEN,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.status).toBe("error");
  });

  it("progressive enhancement: non-JSON client gets 303 redirect on success", async () => {
    // No accept: application/json header, but has referer
    const req = new Request("http://example.com/action", {
      method: "POST",
      headers: {
        origin: "http://example.com",
        referer: "http://example.com/form",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ __vx_csrf: CSRF_TOKEN }).toString(),
    });
    const res = await handleServerAction({
      request: req,
      actionFn: successAction,
      csrfToken: CSRF_TOKEN,
    });
    expect(res.status).toBe(303);
  });
});
