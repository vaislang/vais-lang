import type { ActionFunction, ActionOptions } from "../types.js";
import { validateOrigin, validateCsrfToken } from "./csrf.js";
import { validateFormData } from "./validation.js";
import type { FormSchema } from "./validation.js";

export type { FormSchema };

export interface ActionHandlerOptions {
  request: Request;
  actionFn: ActionFunction;
  csrfToken: string;
  schema?: FormSchema;
  options?: ActionOptions;
  allowedOrigins?: string[];
}

/**
 * Handle a server action request with security checks and optional validation.
 *
 * Security order (per ARCHITECTURE.md 6.7):
 *  1. Method check  — only POST allowed → 405
 *  2. Origin check  — validateOrigin()  → 403
 *  3. CSRF check    — validateCsrfToken() → 403
 *  4. Schema validation (if provided)  → 400
 *
 * Progressive enhancement:
 *  - If Accept header does not include "application/json" (i.e. plain HTML form
 *    submit), the response after a successful action is a 303 redirect.
 *  - JSON clients receive { status, data } or { status, errors }.
 */
export async function handleServerAction(
  opts: ActionHandlerOptions
): Promise<Response> {
  const { request, actionFn, csrfToken, schema, allowedOrigins } = opts;

  // 1. Method check
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  // 2. Origin validation
  if (!validateOrigin(request, allowedOrigins)) {
    return new Response("Forbidden: invalid origin", { status: 403 });
  }

  // Parse FormData before CSRF check (needed to read __vx_csrf)
  // Support both multipart/form-data and application/x-www-form-urlencoded.
  let formData: FormData;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      formData = new FormData();
      for (const [key, value] of params.entries()) {
        formData.append(key, value);
      }
    } else {
      formData = await request.formData();
    }
  } catch {
    return new Response("Bad Request: could not parse form data", { status: 400 });
  }

  // 3. CSRF token validation
  if (!validateCsrfToken(formData, csrfToken)) {
    return new Response("Forbidden: invalid CSRF token", { status: 403 });
  }

  // 4. Schema validation
  if (schema) {
    const result = validateFormData(formData, schema);
    if (!result.valid) {
      const isJson = acceptsJson(request);
      if (isJson) {
        return jsonResponse({ status: "error", errors: result.errors }, 400);
      }
      return new Response("Bad Request: validation failed", { status: 400 });
    }
  }

  // Execute the action function
  let actionResult;
  try {
    actionResult = await actionFn(formData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (acceptsJson(request)) {
      return jsonResponse({ status: "error", errors: { _: message } }, 500);
    }
    return new Response("Internal Server Error", { status: 500 });
  }

  // Build response based on result
  if (actionResult.status === "redirect") {
    const location = actionResult.redirectTo ?? "/";
    return new Response(null, {
      status: 303,
      headers: { Location: location },
    });
  }

  if (actionResult.status === "error") {
    if (acceptsJson(request)) {
      return jsonResponse(
        { status: "error", errors: actionResult.errors ?? {} },
        422
      );
    }
    return new Response("Action failed", { status: 422 });
  }

  // success
  if (acceptsJson(request)) {
    return jsonResponse({ status: "success", data: actionResult.data ?? {} }, 200);
  }

  // Progressive enhancement: non-JSON clients get a 303 redirect back
  const referer = request.headers.get("referer") ?? "/";
  return new Response(null, {
    status: 303,
    headers: { Location: referer },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function acceptsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/json");
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
