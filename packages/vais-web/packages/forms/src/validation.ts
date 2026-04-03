/**
 * Validation utilities for @vaisx/forms.
 *
 * Includes:
 *  - Built-in validation rules (required, minLength, maxLength, email, pattern, min, max)
 *  - Schema-based validation via Zod-compatible adapter
 *  - A runValidation() helper that resolves errors for all fields
 */

import type {
  FieldValues,
  FieldValidation,
  ValidationRule,
  ValidationSchema,
  ZodLikeSchema,
  ZodIssue,
} from "./types.js";

// ─── Type guard ───────────────────────────────────────────────────────────────

/**
 * Returns true when the given schema is a Zod-like schema (has _isZodSchema marker).
 */
export function isZodSchema<T extends FieldValues>(
  schema: ValidationSchema<T>,
): schema is ZodLikeSchema<T> {
  return (
    typeof schema === "object" &&
    schema !== null &&
    "_isZodSchema" in schema &&
    (schema as ZodLikeSchema<T>)._isZodSchema === true
  );
}

// ─── Built-in rules ───────────────────────────────────────────────────────────

/**
 * The field must have a non-empty value.
 */
export function required(message = "This field is required"): ValidationRule {
  return {
    message,
    validate(value: unknown): boolean {
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      return true;
    },
  };
}

/**
 * The string value must have at least `min` characters.
 */
export function minLength(
  min: number,
  message = `Must be at least ${min} characters`,
): ValidationRule {
  return {
    message,
    validate(value: unknown): boolean {
      if (typeof value !== "string") return false;
      return value.length >= min;
    },
  };
}

/**
 * The string value must have at most `max` characters.
 */
export function maxLength(
  max: number,
  message = `Must be at most ${max} characters`,
): ValidationRule {
  return {
    message,
    validate(value: unknown): boolean {
      if (typeof value !== "string") return false;
      return value.length <= max;
    },
  };
}

/**
 * The value must be a valid e-mail address (RFC 5322 simplified).
 */
export function email(
  message = "Must be a valid email address",
): ValidationRule {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return {
    message,
    validate(value: unknown): boolean {
      if (typeof value !== "string") return false;
      return EMAIL_RE.test(value);
    },
  };
}

/**
 * The value must match the given regular expression.
 */
export function pattern(
  regex: RegExp,
  message = "Invalid format",
): ValidationRule {
  return {
    message,
    validate(value: unknown): boolean {
      if (typeof value !== "string") return false;
      return regex.test(value);
    },
  };
}

/**
 * The numeric value must be >= `min`.
 */
export function min(
  minimum: number,
  message = `Must be at least ${minimum}`,
): ValidationRule {
  return {
    message,
    validate(value: unknown): boolean {
      const num = Number(value);
      return !Number.isNaN(num) && num >= minimum;
    },
  };
}

/**
 * The numeric value must be <= `max`.
 */
export function max(
  maximum: number,
  message = `Must be at most ${maximum}`,
): ValidationRule {
  return {
    message,
    validate(value: unknown): boolean {
      const num = Number(value);
      return !Number.isNaN(num) && num <= maximum;
    },
  };
}

// ─── Rule runner ──────────────────────────────────────────────────────────────

/**
 * Run a single FieldValidation (rule or array of rules) against a value.
 * Returns the first error message found, or undefined if all rules pass.
 */
export function runFieldValidation(
  fieldValidation: FieldValidation,
  value: unknown,
): string | undefined {
  const rules: ValidationRule[] = Array.isArray(fieldValidation)
    ? fieldValidation
    : [fieldValidation];

  for (const rule of rules) {
    if (!rule.validate(value)) {
      return rule.message;
    }
  }
  return undefined;
}

// ─── Zod adapter ─────────────────────────────────────────────────────────────

/**
 * Validate the full form values against a Zod-like schema.
 * Returns a map of field name → error message.
 */
export function validateWithZodSchema<T extends FieldValues>(
  schema: ZodLikeSchema<T>,
  values: T,
): Partial<Record<keyof T, string>> {
  const result = schema.safeParse(values);
  if (result.success) {
    return {};
  }

  const errors: Partial<Record<keyof T, string>> = {};
  for (const issue of result.error.issues as ZodIssue[]) {
    if (issue.path.length > 0) {
      const key = issue.path[0] as keyof T;
      // Only keep the first error per field
      if (!errors[key]) {
        errors[key] = issue.message;
      }
    }
  }
  return errors;
}

// ─── Schema validation ────────────────────────────────────────────────────────

/**
 * Validate all form values against the provided schema.
 * Handles both Zod-like schemas and plain ValidationSchema maps.
 *
 * Returns a partial record of field name → first error message.
 */
export function validateSchema<T extends FieldValues>(
  schema: ValidationSchema<T>,
  values: T,
): Partial<Record<keyof T, string>> {
  if (isZodSchema(schema)) {
    return validateWithZodSchema(schema, values);
  }

  const errors: Partial<Record<keyof T, string>> = {};
  const ruleMap = schema as Partial<Record<keyof T, FieldValidation>>;

  for (const key of Object.keys(ruleMap) as (keyof T)[]) {
    const fieldValidation = ruleMap[key];
    if (!fieldValidation) continue;

    const error = runFieldValidation(fieldValidation, values[key]);
    if (error !== undefined) {
      errors[key] = error;
    }
  }

  return errors;
}

// ─── Single-field validation ──────────────────────────────────────────────────

/**
 * Validate a single field against its rules in the provided schema.
 *
 * For Zod-like schemas the full schema is parsed and the error for `fieldName`
 * is extracted, which avoids running unrelated per-field rule arrays.
 * For plain ValidationSchema maps only the target field's rules are executed.
 *
 * Returns the first error message for the field, or undefined if it is valid.
 */
export function validateField<T extends FieldValues>(
  schema: ValidationSchema<T>,
  fieldName: keyof T,
  value: unknown,
): string | undefined {
  if (isZodSchema(schema)) {
    // For Zod schemas we must parse the full object; extract only our field's error.
    const partial = { [fieldName]: value } as unknown as T;
    const result = schema.safeParse(partial);
    if (result.success) return undefined;
    for (const issue of result.error.issues as ZodIssue[]) {
      if (issue.path[0] === fieldName) {
        return issue.message;
      }
    }
    return undefined;
  }

  const ruleMap = schema as Partial<Record<keyof T, FieldValidation>>;
  const fieldValidation = ruleMap[fieldName];
  if (!fieldValidation) return undefined;
  return runFieldValidation(fieldValidation, value);
}

// ─── Convenience schema builder ───────────────────────────────────────────────

/**
 * Wrap a plain object validation schema map so it can be passed to createForm().
 * Useful when you want to compose built-in rules:
 *
 * ```ts
 * const schema = createSchema<MyForm>({
 *   email: [required(), email()],
 *   password: [required(), minLength(8)],
 * });
 * ```
 */
export function createSchema<T extends FieldValues>(
  rules: Partial<Record<keyof T, FieldValidation>>,
): Partial<Record<keyof T, FieldValidation>> {
  return rules;
}
