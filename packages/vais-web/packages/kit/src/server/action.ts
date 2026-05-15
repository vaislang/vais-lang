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

interface RateBucket {
  count: number;
  resetAt: number;
  limit: number;
  windowMs: number;
}

const actionRateBuckets = new Map<string, RateBucket>();

/**
 * Handle a server action request with security checks and optional validation.
 *
 * Security order (per ARCHITECTURE.md 6.7):
 *  1. Method check  — only POST allowed → 405
 *  2. Origin check  — validateOrigin()  → 403
 *  3. Auth check    — authRequired session/token → 401
 *  4. Rate limit    — rateLimit budget → 429
 *  5. CSRF check    — validateCsrfToken() → 403
 *  6. Schema validation (if provided)  → 400
 *
 * Progressive enhancement:
 *  - If Accept header does not include "application/json" (i.e. plain HTML form
 *    submit), the response after a successful action is a 303 redirect.
 *  - JSON clients receive { status, data } or { status, errors }.
 */
export async function handleServerAction(
  opts: ActionHandlerOptions
): Promise<Response> {
  const { request, actionFn, csrfToken, schema, options, allowedOrigins } = opts;

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

  // 3. Auth requirement
  if (options?.authRequired && !hasAuthenticatedSession(request)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }

  // 4. Rate limit requirement
  if (options?.rateLimit) {
    const rateLimitResponse = checkRateLimit(request, options.rateLimit);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
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

  // 5. CSRF token validation
  if (!validateCsrfToken(formData, csrfToken)) {
    return new Response("Forbidden: invalid CSRF token", { status: 403 });
  }

  // 6. Schema validation
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

function hasAuthenticatedSession(request: Request): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  if (/^Bearer\s+\S+$/i.test(authorization)) {
    return true;
  }

  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => /^vx_session=.+/.test(part));
}

function checkRateLimit(request: Request, rateLimit: string): Response | null {
  const parsed = parseRateLimit(rateLimit);
  if (!parsed) {
    return new Response("Internal Server Error: invalid rate limit", { status: 500 });
  }

  const now = Date.now();
  const key = buildRateLimitKey(request);
  const current = actionRateBuckets.get(key);
  const bucket =
    current && current.resetAt > now && current.limit === parsed.limit && current.windowMs === parsed.windowMs
      ? current
      : {
          count: 0,
          resetAt: now + parsed.windowMs,
          limit: parsed.limit,
          windowMs: parsed.windowMs,
        };

  bucket.count += 1;
  actionRateBuckets.set(key, bucket);
  cleanupExpiredRateBuckets(now);

  if (bucket.count <= bucket.limit) {
    return null;
  }

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return new Response("Too Many Requests", {
    status: 429,
    headers: {
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(bucket.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
    },
  });
}

function parseRateLimit(rateLimit: string): { limit: number; windowMs: number } | null {
  const match = /^(\d+)\/(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours)$/i.exec(
    rateLimit.trim()
  );
  if (!match) {
    return null;
  }

  const limit = Number(match[1]);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return null;
  }

  const unit = match[2].toLowerCase();
  const windowMs =
    unit === "s" || unit === "sec" || unit === "second" || unit === "seconds"
      ? 1000
      : unit === "m" || unit === "min" || unit === "minute" || unit === "minutes"
        ? 60_000
        : 60 * 60_000;

  return { limit, windowMs };
}

function buildRateLimitKey(request: Request): string {
  const url = new URL(request.url);
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client =
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "local";
  return `${url.pathname}:${client}`;
}

function cleanupExpiredRateBuckets(now: number): void {
  for (const [key, bucket] of actionRateBuckets) {
    if (bucket.resetAt <= now) {
      actionRateBuckets.delete(key);
    }
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
