/**
 * createForm() — core form state management factory for @vaisx/forms.
 *
 * Returns a self-contained form controller that holds reactive state and
 * exposes methods for interacting with the form (register, submit, reset, …).
 *
 * This module is framework-agnostic; useForm() in use-form.ts wraps it with
 * a VaisX-specific subscription layer.
 */

import type {
  FieldValues,
  FormOptions,
  FormState,
  FieldBinding,
  UseFormReturn,
} from "./types.js";
import { validateSchema, validateField } from "./validation.js";

// ─── Internal mutable form state ──────────────────────────────────────────────

interface InternalFormState<T extends FieldValues> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
}

// ─── createForm ───────────────────────────────────────────────────────────────

/**
 * Create a form controller.
 *
 * ```ts
 * const form = createForm({
 *   defaultValues: { email: '', password: '' },
 *   validation: { email: [required(), email()] },
 *   onSubmit: async (values) => { … },
 * });
 * ```
 */
export function createForm<T extends FieldValues>(
  options: FormOptions<T>,
): UseFormReturn<T> {
  const { defaultValues, validation, onSubmit } = options;

  // ── Internal mutable state (not using signals here — use-form.ts wraps with
  //    reactive subscriptions so that UI frameworks can observe changes) ──────
  const internal: InternalFormState<T> = {
    values: { ...defaultValues } as T,
    errors: {},
    touched: {},
    isSubmitting: false,
  };

  // Subscribers notified on every state change
  const subscribers = new Set<(state: FormState<T>) => void>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function snapshot(): FormState<T> {
    const hasErrors = Object.keys(internal.errors).length > 0;
    const isDirty = Object.keys(defaultValues as object).some(
      (k) => internal.values[k as keyof T] !== defaultValues[k as keyof T],
    );

    return {
      values: { ...internal.values },
      errors: { ...internal.errors },
      touched: { ...internal.touched },
      isSubmitting: internal.isSubmitting,
      isValid: !hasErrors,
      isDirty,
    };
  }

  function notify(): void {
    const state = snapshot();
    for (const cb of subscribers) {
      cb(state);
    }
  }

  function runValidation(): Partial<Record<keyof T, string>> {
    if (!validation) return {};
    return validateSchema(validation, internal.values);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function register(name: keyof T): FieldBinding {
    return {
      name: String(name),
      get value() {
        return internal.values[name];
      },
      onChange(e: Event) {
        const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (!target) return;

        let newValue: unknown;
        if (target instanceof HTMLInputElement) {
          if (target.type === "checkbox") {
            newValue = target.checked;
          } else if (target.type === "number") {
            newValue = target.value === "" ? "" : Number(target.value);
          } else {
            newValue = target.value;
          }
        } else {
          newValue = target.value;
        }

        internal.values = { ...internal.values, [name]: newValue } as T;

        // Re-validate only this field if it's already been touched
        if (internal.touched[name]) {
          const fieldError = validation
            ? validateField(validation, name, newValue)
            : undefined;
          if (fieldError !== undefined) {
            internal.errors = { ...internal.errors, [name]: fieldError };
          } else {
            const { [name]: _removed, ...rest } = internal.errors as Record<keyof T, string>;
            void _removed;
            internal.errors = rest as Partial<Record<keyof T, string>>;
          }
        }

        notify();
      },
      onBlur() {
        internal.touched = { ...internal.touched, [name]: true };

        // Validate only this field on blur
        const fieldError = validation
          ? validateField(validation, name, internal.values[name])
          : undefined;
        if (fieldError !== undefined) {
          internal.errors = { ...internal.errors, [name]: fieldError };
        } else {
          const { [name]: _removed, ...rest } = internal.errors as Record<keyof T, string>;
          void _removed;
          internal.errors = rest as Partial<Record<keyof T, string>>;
        }

        notify();
      },
    };
  }

  async function handleSubmit(e?: Event): Promise<void> {
    if (e) {
      e.preventDefault();
    }

    // Validate all fields
    const errors = runValidation();
    internal.errors = errors;

    // Mark all fields as touched
    const allTouched: Partial<Record<keyof T, boolean>> = {};
    for (const key of Object.keys(defaultValues as object) as (keyof T)[]) {
      allTouched[key] = true;
    }
    internal.touched = allTouched;

    notify();

    if (Object.keys(errors).length > 0) {
      return;
    }

    if (!onSubmit) return;

    internal.isSubmitting = true;
    notify();

    try {
      await onSubmit({ ...internal.values });
    } finally {
      internal.isSubmitting = false;
      notify();
    }
  }

  function reset(): void {
    internal.values = { ...defaultValues } as T;
    internal.errors = {};
    internal.touched = {};
    internal.isSubmitting = false;
    notify();
  }

  function setError(name: keyof T, message: string): void {
    internal.errors = { ...internal.errors, [name]: message };
    notify();
  }

  function clearErrors(): void {
    internal.errors = {};
    notify();
  }

  function setValue(name: keyof T, value: T[keyof T]): void {
    internal.values = { ...internal.values, [name]: value } as T;

    // Re-validate only this field if touched
    if (internal.touched[name]) {
      const fieldError = validation
        ? validateField(validation, name, value)
        : undefined;
      if (fieldError !== undefined) {
        internal.errors = { ...internal.errors, [name]: fieldError };
      } else {
        const { [name]: _removed, ...rest } = internal.errors as Record<keyof T, string>;
        void _removed;
        internal.errors = rest as Partial<Record<keyof T, string>>;
      }
    }

    notify();
  }

  function subscribe(callback: (state: FormState<T>) => void): () => void {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }

  // Expose state as a getter so callers always see the latest snapshot
  const api: UseFormReturn<T> = {
    get state() {
      return snapshot();
    },
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    setValue,
    subscribe,
  };

  return api;
}
