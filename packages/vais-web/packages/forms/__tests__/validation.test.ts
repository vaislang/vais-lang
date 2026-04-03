/**
 * @vaisx/forms — validation tests
 */

import { describe, it, expect } from "vitest";
import {
  required,
  minLength,
  maxLength,
  email,
  pattern,
  min,
  max,
  runFieldValidation,
  validateSchema,
  createSchema,
  validateWithZodSchema,
  isZodSchema,
} from "../src/validation.js";
import type { ZodLikeSchema, ZodSafeParseResult } from "../src/types.js";

// ─── required ─────────────────────────────────────────────────────────────────

describe("required", () => {
  it("returns undefined for a non-empty string", () => {
    const rule = required();
    expect(runFieldValidation(rule, "hello")).toBeUndefined();
  });

  it("returns error for an empty string", () => {
    const rule = required();
    expect(runFieldValidation(rule, "")).toBe("This field is required");
  });

  it("returns error for whitespace-only string", () => {
    const rule = required();
    expect(runFieldValidation(rule, "   ")).toBe("This field is required");
  });

  it("returns error for null", () => {
    const rule = required();
    expect(runFieldValidation(rule, null)).toBe("This field is required");
  });

  it("returns error for undefined", () => {
    const rule = required();
    expect(runFieldValidation(rule, undefined)).toBe("This field is required");
  });

  it("accepts a custom message", () => {
    const rule = required("Field is mandatory");
    expect(runFieldValidation(rule, "")).toBe("Field is mandatory");
  });

  it("returns undefined for a non-empty value (number)", () => {
    const rule = required();
    expect(runFieldValidation(rule, 0)).toBeUndefined();
  });
});

// ─── minLength ────────────────────────────────────────────────────────────────

describe("minLength", () => {
  it("returns undefined when length >= min", () => {
    const rule = minLength(3);
    expect(runFieldValidation(rule, "abc")).toBeUndefined();
    expect(runFieldValidation(rule, "abcd")).toBeUndefined();
  });

  it("returns error when length < min", () => {
    const rule = minLength(5);
    expect(runFieldValidation(rule, "ab")).toBe("Must be at least 5 characters");
  });

  it("returns error for non-string values", () => {
    const rule = minLength(1);
    expect(runFieldValidation(rule, 42)).not.toBeUndefined();
  });

  it("accepts custom message", () => {
    const rule = minLength(8, "Too short");
    expect(runFieldValidation(rule, "abc")).toBe("Too short");
  });
});

// ─── maxLength ────────────────────────────────────────────────────────────────

describe("maxLength", () => {
  it("returns undefined when length <= max", () => {
    const rule = maxLength(10);
    expect(runFieldValidation(rule, "hello")).toBeUndefined();
  });

  it("returns error when length > max", () => {
    const rule = maxLength(3);
    expect(runFieldValidation(rule, "toolong")).toBe("Must be at most 3 characters");
  });

  it("returns error for non-string values", () => {
    const rule = maxLength(5);
    expect(runFieldValidation(rule, 42)).not.toBeUndefined();
  });
});

// ─── email ────────────────────────────────────────────────────────────────────

describe("email", () => {
  it("returns undefined for a valid email", () => {
    const rule = email();
    expect(runFieldValidation(rule, "user@example.com")).toBeUndefined();
    expect(runFieldValidation(rule, "a.b+c@domain.co.uk")).toBeUndefined();
  });

  it("returns error for an invalid email", () => {
    const rule = email();
    expect(runFieldValidation(rule, "not-an-email")).toBe("Must be a valid email address");
    expect(runFieldValidation(rule, "missing@tld")).toBe("Must be a valid email address");
    expect(runFieldValidation(rule, "@nodomain.com")).toBe("Must be a valid email address");
  });

  it("returns error for non-string values", () => {
    const rule = email();
    expect(runFieldValidation(rule, 42)).not.toBeUndefined();
  });
});

// ─── pattern ──────────────────────────────────────────────────────────────────

describe("pattern", () => {
  it("returns undefined when the string matches the regex", () => {
    const rule = pattern(/^\d{4}$/);
    expect(runFieldValidation(rule, "1234")).toBeUndefined();
  });

  it("returns error when the string does not match", () => {
    const rule = pattern(/^\d{4}$/, "Must be 4 digits");
    expect(runFieldValidation(rule, "abc")).toBe("Must be 4 digits");
  });
});

// ─── min / max ────────────────────────────────────────────────────────────────

describe("min / max", () => {
  it("min: returns undefined when value >= minimum", () => {
    const rule = min(5);
    expect(runFieldValidation(rule, 5)).toBeUndefined();
    expect(runFieldValidation(rule, 10)).toBeUndefined();
  });

  it("min: returns error when value < minimum", () => {
    const rule = min(5);
    expect(runFieldValidation(rule, 4)).toBe("Must be at least 5");
  });

  it("max: returns undefined when value <= maximum", () => {
    const rule = max(100);
    expect(runFieldValidation(rule, 99)).toBeUndefined();
    expect(runFieldValidation(rule, 100)).toBeUndefined();
  });

  it("max: returns error when value > maximum", () => {
    const rule = max(10);
    expect(runFieldValidation(rule, 11)).toBe("Must be at most 10");
  });
});

// ─── runFieldValidation ───────────────────────────────────────────────────────

describe("runFieldValidation", () => {
  it("runs an array of rules and returns the first error", () => {
    const rules = [required(), minLength(5)];
    expect(runFieldValidation(rules, "")).toBe("This field is required");
    expect(runFieldValidation(rules, "ab")).toBe("Must be at least 5 characters");
    expect(runFieldValidation(rules, "hello")).toBeUndefined();
  });

  it("returns undefined when all rules pass", () => {
    expect(runFieldValidation([required(), email()], "user@example.com")).toBeUndefined();
  });
});

// ─── validateSchema ───────────────────────────────────────────────────────────

describe("validateSchema (plain rule map)", () => {
  it("returns empty errors when all fields are valid", () => {
    const schema = createSchema<{ name: string; email: string }>({
      name: required(),
      email: [required(), email()],
    });
    const errors = validateSchema(schema, { name: "Alice", email: "alice@example.com" });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("returns errors only for invalid fields", () => {
    const schema = createSchema<{ name: string; email: string }>({
      name: required(),
      email: [required(), email()],
    });
    const errors = validateSchema(schema, { name: "", email: "not-valid" });
    expect(errors.name).toBeDefined();
    expect(errors.email).toBeDefined();
  });
});

// ─── Zod adapter ─────────────────────────────────────────────────────────────

describe("Zod-like schema adapter", () => {
  // Minimal mock Zod schema
  function makeMockZodSchema(
    shouldFail: boolean,
    fieldErrors: Record<string, string> = {},
  ): ZodLikeSchema<Record<string, unknown>> {
    return {
      _isZodSchema: true as const,
      safeParse(data: unknown): ZodSafeParseResult<Record<string, unknown>> {
        if (shouldFail) {
          return {
            success: false,
            error: {
              issues: Object.entries(fieldErrors).map(([field, message]) => ({
                path: [field],
                message,
              })),
            },
          };
        }
        return { success: true, data: data as Record<string, unknown> };
      },
    };
  }

  it("isZodSchema returns true for a Zod-like schema", () => {
    const schema = makeMockZodSchema(false);
    expect(isZodSchema(schema)).toBe(true);
  });

  it("isZodSchema returns false for a plain rule map", () => {
    const schema = createSchema<{ name: string }>({ name: required() });
    expect(isZodSchema(schema)).toBe(false);
  });

  it("returns no errors when schema validates successfully", () => {
    const schema = makeMockZodSchema(false);
    const errors = validateWithZodSchema(schema, { name: "Alice" });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("maps Zod issues to field errors", () => {
    const schema = makeMockZodSchema(true, { email: "Invalid email" });
    const errors = validateWithZodSchema(schema, { email: "bad" });
    expect(errors.email).toBe("Invalid email");
  });

  it("validateSchema dispatches to Zod path when _isZodSchema is true", () => {
    const schema = makeMockZodSchema(true, { password: "Too short" });
    const errors = validateSchema(schema, { password: "ab" });
    expect(errors.password).toBe("Too short");
  });
});
