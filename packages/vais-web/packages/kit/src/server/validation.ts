/**
 * Form data type validation for server actions.
 */

export interface FormField {
  name: string;
  type: "string" | "number" | "boolean" | "file";
  required?: boolean;
}

export type FormSchema = FormField[];

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  data: Record<string, unknown>;
}

/**
 * Validate and coerce FormData values according to the provided schema.
 *
 * - Checks that required fields are present and non-empty.
 * - Coerces types:
 *   - "number"  → parseFloat (error if NaN)
 *   - "boolean" → true when value is "true" or "1", false otherwise
 *   - "file"    → expects a File instance
 *   - "string"  → kept as-is
 * - Collects per-field errors without short-circuiting.
 */
export function validateFormData(formData: FormData, schema: FormSchema): ValidationResult {
  const errors: Record<string, string> = {};
  const data: Record<string, unknown> = {};

  for (const field of schema) {
    const raw = formData.get(field.name);

    // Required check
    if (field.required) {
      if (raw === null || raw === undefined || raw === "") {
        errors[field.name] = `${field.name} is required`;
        continue;
      }
    }

    // If field is not present and not required, skip coercion
    if (raw === null || raw === undefined) {
      continue;
    }

    // Type coercion
    switch (field.type) {
      case "string": {
        data[field.name] = raw instanceof File ? raw.name : String(raw);
        break;
      }
      case "number": {
        const strVal = raw instanceof File ? NaN : parseFloat(String(raw));
        if (isNaN(strVal)) {
          errors[field.name] = `${field.name} must be a valid number`;
        } else {
          data[field.name] = strVal;
        }
        break;
      }
      case "boolean": {
        const strVal = raw instanceof File ? "" : String(raw);
        data[field.name] = strVal === "true" || strVal === "1";
        break;
      }
      case "file": {
        if (!(raw instanceof File)) {
          errors[field.name] = `${field.name} must be a file`;
        } else {
          data[field.name] = raw;
        }
        break;
      }
      default: {
        data[field.name] = raw;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data,
  };
}
