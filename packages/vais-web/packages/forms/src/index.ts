/**
 * @vaisx/forms — Public API
 *
 * A form state management library for VaisX, inspired by react-hook-form.
 * Provides reactive form state, built-in validation rules, Zod adapter,
 * dynamic field arrays and server action integration.
 */

// ── Core form factory ────────────────────────────────────────────────────────
export { createForm } from "./form.js";

// ── Component composable ─────────────────────────────────────────────────────
export { useForm } from "./use-form.js";

// ── Validation ───────────────────────────────────────────────────────────────
export {
  // Built-in rules
  required,
  minLength,
  maxLength,
  email,
  pattern,
  min,
  max,
  // Schema helpers
  createSchema,
  validateSchema,
  runFieldValidation,
  validateWithZodSchema,
  isZodSchema,
} from "./validation.js";

// ── Field arrays ─────────────────────────────────────────────────────────────
export { useFieldArray } from "./field-array.js";
export type { FieldArrayOptions } from "./field-array.js";

// ── Server action integration ─────────────────────────────────────────────────
export {
  createServerAction,
  withServerAction,
  applyServerErrors,
} from "./server-action.js";
export type { ServerActionController } from "./server-action.js";

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  // Value types
  FieldValue,
  FieldValues,
  // Form config
  FormOptions,
  // State
  FormState,
  FieldState,
  // Field binding
  FieldBinding,
  // Validation
  ValidationRule,
  FieldValidation,
  ValidationSchema,
  // Zod adapter
  ZodLikeSchema,
  ZodSafeParseResult,
  ZodSafeParseSuccess,
  ZodSafeParseError,
  ZodLikeError,
  ZodIssue,
  // Return types
  UseFormReturn,
  UseFieldArrayReturn,
  // Server action
  ServerActionResult,
  ServerActionOptions,
} from "./types.js";
