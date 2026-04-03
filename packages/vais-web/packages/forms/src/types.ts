/**
 * Core type definitions for @vaisx/forms.
 * API inspired by react-hook-form, adapted for VaisX reactivity.
 */

// ─── Primitive field value types ─────────────────────────────────────────────

/** Values that can be stored in a form field. */
export type FieldValue = string | number | boolean | null | undefined;

/** A record of field name → field value for a form schema. */
export type FieldValues = Record<string, unknown>;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * A single validation rule: a predicate plus the error message to show on failure.
 */
export interface ValidationRule {
  /** Returns true if the value is valid. */
  validate: (value: unknown) => boolean;
  /** Error message when validate() returns false. */
  message: string;
}

/**
 * Field-level validation — either a single rule or an array of rules.
 */
export type FieldValidation = ValidationRule | ValidationRule[];

/**
 * Schema-level validation map: field name → one or more rules.
 * Supports both the built-in rule format and Zod-like schema adapters.
 */
export type ValidationSchema<T extends FieldValues> = {
  [K in keyof T]?: FieldValidation;
} | ZodLikeSchema<T>;

// ─── Zod-compatible adapter types ────────────────────────────────────────────

/**
 * Minimal interface that Zod schemas (and compatible alternatives) must satisfy
 * for use with the built-in schema adapter.
 */
export interface ZodLikeSchema<T extends FieldValues = FieldValues> {
  /** Synchronously parse/validate a value; throws on failure. */
  safeParse(data: unknown): ZodSafeParseResult<T>;
  /** Marker so we can distinguish Zod schemas from plain ValidationSchema maps. */
  readonly _isZodSchema: true;
}

export interface ZodSafeParseSuccess<T> {
  success: true;
  data: T;
}

export interface ZodSafeParseError {
  success: false;
  error: ZodLikeError;
}

export type ZodSafeParseResult<T> = ZodSafeParseSuccess<T> | ZodSafeParseError;

export interface ZodLikeError {
  issues: ZodIssue[];
}

export interface ZodIssue {
  path: (string | number)[];
  message: string;
}

// ─── Field state ──────────────────────────────────────────────────────────────

/**
 * Per-field reactive state.
 */
export interface FieldState {
  /** Current field value. */
  value: unknown;
  /** Validation error message, or undefined if the field is valid. */
  error: string | undefined;
  /** Whether the user has interacted with this field (blurred). */
  touched: boolean;
  /** Whether the current value differs from the defaultValue. */
  dirty: boolean;
}

// ─── Form state ───────────────────────────────────────────────────────────────

/**
 * Top-level reactive form state.
 */
export interface FormState<T extends FieldValues> {
  /** Current form values. */
  values: T;
  /** Field error messages (only populated for fields with errors). */
  errors: Partial<Record<keyof T, string>>;
  /** Which fields have been touched (interacted with). */
  touched: Partial<Record<keyof T, boolean>>;
  /** Whether the form is currently being submitted. */
  isSubmitting: boolean;
  /** Whether all fields are currently valid (no errors). */
  isValid: boolean;
  /** Whether any field value differs from the default values. */
  isDirty: boolean;
}

// ─── Field binding ────────────────────────────────────────────────────────────

/**
 * Object spread onto a DOM input element to wire it into the form.
 */
export interface FieldBinding {
  /** The field name attribute. */
  name: string;
  /** The current value. */
  value: unknown;
  /** Native change handler — updates the field value. */
  onChange: (e: Event) => void;
  /** Native blur handler — marks the field as touched. */
  onBlur: () => void;
}

// ─── Form options ─────────────────────────────────────────────────────────────

/**
 * Options passed to createForm() or useForm().
 */
export interface FormOptions<T extends FieldValues> {
  /** Initial values for every field in the form. */
  defaultValues: T;
  /** Optional validation schema — either a rule map or a Zod-like schema. */
  validation?: ValidationSchema<T>;
  /** Called when the form is submitted and passes validation. */
  onSubmit?: (values: T) => Promise<void> | void;
}

// ─── useForm return ───────────────────────────────────────────────────────────

/**
 * Everything returned by useForm().
 */
export interface UseFormReturn<T extends FieldValues> {
  /** Reactive form state snapshot. */
  state: FormState<T>;
  /** Register a field — returns props to spread on the input element. */
  register(name: keyof T): FieldBinding;
  /** Submit handler — validates then calls onSubmit. */
  handleSubmit(e?: Event): Promise<void>;
  /** Reset all fields to their default values and clear errors/touched. */
  reset(): void;
  /** Manually set an error on a field (e.g. from server responses). */
  setError(name: keyof T, message: string): void;
  /** Clear all field errors. */
  clearErrors(): void;
  /** Programmatically set a field value. */
  setValue(name: keyof T, value: T[keyof T]): void;
  /** Subscribe to form state changes; returns an unsubscribe function. */
  subscribe(callback: (state: FormState<T>) => void): () => void;
}

// ─── Field array ──────────────────────────────────────────────────────────────

/**
 * Controls returned by useFieldArray() for managing a dynamic list of fields.
 */
export interface UseFieldArrayReturn<T> {
  /** The current list of items. */
  fields: T[];
  /** Append one or more items to the end of the list. */
  append(value: T | T[]): void;
  /** Remove the item at the given index. */
  remove(index: number): void;
  /** Swap the items at two indices. */
  swap(indexA: number, indexB: number): void;
  /** Move an item from one index to another. */
  move(from: number, to: number): void;
  /** Insert an item at the given index. */
  insert(index: number, value: T): void;
  /** Prepend one or more items to the beginning of the list. */
  prepend(value: T | T[]): void;
  /** Replace all items. */
  replace(items: T[]): void;
}

// ─── Server action integration ────────────────────────────────────────────────

/**
 * The result shape expected back from a #[server] form action.
 */
export interface ServerActionResult {
  success: boolean;
  /** Field-level errors from the server. */
  errors?: Record<string, string>;
  /** A global form-level error message (not tied to any field). */
  message?: string;
}

/**
 * Options for createServerAction().
 */
export interface ServerActionOptions<T extends FieldValues> {
  /** The server-side action function to call. */
  action: (values: T) => Promise<ServerActionResult>;
  /** Called when the server returns success: true. */
  onSuccess?: (result: ServerActionResult) => void;
  /** Called when the server returns success: false. */
  onError?: (result: ServerActionResult) => void;
}
