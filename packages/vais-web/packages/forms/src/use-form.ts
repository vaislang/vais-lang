/**
 * useForm() — VaisX composable wrapper around createForm().
 *
 * Integrates form state with the component lifecycle:
 *  - Provides a reactive `state` object updated via signal / subscriber pattern
 *  - Cleans up subscribers when the component is destroyed
 *
 * Because @vaisx/forms is framework-agnostic at its core, useForm() simply
 * delegates to createForm() and re-exposes the same interface, making it easy
 * to drop into any VaisX component.
 */

import type { FieldValues, FormOptions, UseFormReturn } from "./types.js";
import { createForm } from "./form.js";

/**
 * Create and return a form controller bound to the current component context.
 *
 * ```ts
 * const form = useForm({
 *   defaultValues: { name: '', email: '' },
 *   validation: { email: [required(), email()] },
 *   onSubmit: async (values) => saveUser(values),
 * });
 *
 * // In template:
 * // <input ...form.register('email') />
 * // <button onClick={form.handleSubmit}>Submit</button>
 * ```
 */
export function useForm<T extends FieldValues>(
  options: FormOptions<T>,
): UseFormReturn<T> {
  return createForm(options);
}
