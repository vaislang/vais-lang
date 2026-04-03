/**
 * Server action integration for @vaisx/forms.
 *
 * Bridges the gap between a VaisX #[server] action and the form controller:
 *  - Calls the server action with the current form values
 *  - Maps server-returned field errors back to the form
 *  - Handles the global error message
 *
 * Usage:
 * ```ts
 * const { submit, globalError } = createServerAction({
 *   form,
 *   action: async (values) => {
 *     const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify(values) });
 *     return res.json() as ServerActionResult;
 *   },
 *   onSuccess: (result) => router.push('/dashboard'),
 * });
 * ```
 */

import type {
  FieldValues,
  UseFormReturn,
  ServerActionResult,
  ServerActionOptions,
} from "./types.js";

// ─── Return type ──────────────────────────────────────────────────────────────

export interface ServerActionController {
  /**
   * Trigger the server action after client-side validation.
   * Pass this as the form's onSubmit or call it from handleSubmit.
   */
  submit: (values: FieldValues) => Promise<void>;
  /** The last global (non-field) error message from the server, if any. */
  readonly globalError: string | undefined;
}

// ─── createServerAction ───────────────────────────────────────────────────────

/**
 * Create a server action controller bound to a form.
 *
 * @param form  - The form controller from useForm() / createForm()
 * @param options - Action function, success and error callbacks
 */
export function createServerAction<T extends FieldValues>(
  form: UseFormReturn<T>,
  options: ServerActionOptions<T>,
): ServerActionController {
  const { action, onSuccess, onError } = options;

  let globalError: string | undefined = undefined;

  async function submit(values: FieldValues): Promise<void> {
    // Clear previous server errors before sending
    globalError = undefined;
    form.clearErrors();

    let result: ServerActionResult;
    try {
      result = await action(values as T);
    } catch (err) {
      globalError = err instanceof Error ? err.message : "An unexpected error occurred";
      return;
    }

    if (result.success) {
      onSuccess?.(result);
    } else {
      // Map field errors back to the form
      if (result.errors) {
        for (const [field, message] of Object.entries(result.errors)) {
          form.setError(field as keyof T, message);
        }
      }

      // Capture global error
      if (result.message) {
        globalError = result.message;
      }

      onError?.(result);
    }
  }

  return {
    submit,
    get globalError() {
      return globalError;
    },
  };
}

// ─── Convenience: withServerAction ────────────────────────────────────────────

/**
 * Higher-order helper that wraps a server action and wires it directly into
 * the form's onSubmit option. Returns a new FormOptions-compatible onSubmit
 * function that handles server error mapping automatically.
 *
 * ```ts
 * const form = useForm({
 *   defaultValues: { email: '', password: '' },
 *   onSubmit: withServerAction(loginAction, {
 *     onSuccess: () => router.push('/home'),
 *     onError: (result) => console.error(result.message),
 *   }),
 * });
 * ```
 */
export function withServerAction<T extends FieldValues>(
  action: (values: T) => Promise<ServerActionResult>,
  callbacks?: {
    onSuccess?: (result: ServerActionResult) => void;
    onError?: (result: ServerActionResult) => void;
    onFieldError?: (field: string, message: string) => void;
  },
): (values: T, form: UseFormReturn<T>) => Promise<void> {
  return async (values: T, form: UseFormReturn<T>): Promise<void> => {
    let result: ServerActionResult;
    try {
      result = await action(values);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      // Surface as a global error by setting a synthetic form-level error
      // (requires a dedicated global error field or the caller must handle it)
      callbacks?.onError?.({ success: false, message });
      return;
    }

    if (result.success) {
      callbacks?.onSuccess?.(result);
    } else {
      // Field-level errors
      if (result.errors) {
        for (const [field, message] of Object.entries(result.errors)) {
          form.setError(field as keyof T, message);
          callbacks?.onFieldError?.(field, message);
        }
      }
      callbacks?.onError?.(result);
    }
  };
}

/**
 * Map a raw server error response to form field errors.
 * Useful when you want to apply server errors manually without the full
 * createServerAction() workflow.
 *
 * ```ts
 * const serverErrors = { email: 'Email already in use' };
 * applyServerErrors(form, serverErrors);
 * ```
 */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  errors: Record<string, string>,
): void {
  for (const [field, message] of Object.entries(errors)) {
    form.setError(field as keyof T, message);
  }
}
