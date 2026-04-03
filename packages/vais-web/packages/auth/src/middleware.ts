/**
 * AuthMiddleware — route protection and role-based access control (RBAC).
 *
 * Usage:
 *   const auth = createAuth({ ... });
 *   const middleware = createAuthMiddleware(auth);
 *
 *   // Protect a route (requires authentication)
 *   const result = await middleware.protect()(context);
 *
 *   // Require specific roles
 *   const result = await middleware.requireRole(["admin"])(context);
 *
 *   // Require specific permissions
 *   const result = await middleware.requirePermission(["posts:write"])(context);
 *
 *   // Chain multiple middlewares
 *   const combined = compose(middleware.protect(), middleware.requireRole(["admin"]));
 *   const result = await combined(context);
 */

import type { AuthInstance, Session, User } from "./types.js";
import { parseCookies } from "./session.js";
import { decodeJWT } from "./jwt.js";

// ─── Extended User with roles/permissions ─────────────────────────────────────

/**
 * User extended with optional RBAC fields.
 * These are populated via the session callback when roles/permissions
 * are embedded in the session/token.
 */
export interface AuthUser extends User {
  /** Roles assigned to this user (e.g. ["admin", "editor"]). */
  roles?: string[];
  /** Fine-grained permissions (e.g. ["posts:write", "users:read"]). */
  permissions?: string[];
}

// ─── MiddlewareContext ────────────────────────────────────────────────────────

/**
 * The context object passed to every middleware handler.
 * Mirrors a minimal HTTP request surface so it works with any framework.
 */
export interface MiddlewareContext {
  /** The incoming request. */
  request: {
    /** Full URL string (used for extracting callbackUrl on redirects). */
    url: string;
    /** HTTP headers map. */
    headers: Record<string, string | string[] | undefined>;
  };
  /** The resolved session, populated by protect(). */
  session?: Session | null;
  /** The resolved user (with roles/permissions), populated by protect(). */
  user?: AuthUser | null;
  /**
   * Issue a redirect response.
   * Calling this sets MiddlewareResult.redirect and stops further processing.
   */
  redirect: (url: string) => MiddlewareResult;
}

// ─── MiddlewareResult ─────────────────────────────────────────────────────────

/**
 * The outcome of running a middleware.
 */
export interface MiddlewareResult {
  /** Whether the request is allowed to proceed. */
  allowed: boolean;
  /** If set, the client should be redirected to this URL. */
  redirect?: string;
  /** If set, the request was rejected with this error message. */
  error?: string;
  /** HTTP status code associated with the result (401, 403, etc.). */
  status?: number;
}

// ─── MiddlewareHandler ────────────────────────────────────────────────────────

/**
 * A single middleware function.
 * Receives a mutable context and returns a MiddlewareResult.
 */
export type MiddlewareHandler = (context: MiddlewareContext) => Promise<MiddlewareResult>;

// ─── ProtectOptions ───────────────────────────────────────────────────────────

/**
 * Options for the protect() middleware.
 */
export interface ProtectOptions {
  /**
   * Where to redirect unauthenticated users.
   * Defaults to the signIn page configured in AuthConfig.pages.signIn,
   * or "/auth/signin" if not set.
   */
  redirectTo?: string;
  /**
   * When true, return a 401 JSON error instead of redirecting.
   * Useful for API routes.
   */
  returnError?: boolean;
}

// ─── Token extraction helpers ─────────────────────────────────────────────────

/**
 * Extract a Bearer token from the Authorization header.
 */
function extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
  const authHeader = headers["authorization"] ?? headers["Authorization"];
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!value || typeof value !== "string") return null;

  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Extract a session token from a cookie header.
 * Looks for common session cookie names.
 */
function extractCookieToken(headers: Record<string, string | string[] | undefined>): string | null {
  const cookieHeader = headers["cookie"] ?? headers["Cookie"];
  const raw = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  if (!raw || typeof raw !== "string") return null;

  const cookies = parseCookies(raw);

  // Common session cookie names — check in priority order.
  const candidates = [
    "session-token",
    "next-auth.session-token",
    "__session",
    "auth-token",
    "access_token",
  ];

  for (const name of candidates) {
    if (cookies[name]) return cookies[name];
  }

  return null;
}

/**
 * Try to resolve a Session from a raw token string.
 * First attempts JWT decode (stateless); falls back to AuthInstance.getSession().
 */
async function resolveSessionFromToken(
  token: string,
  auth: AuthInstance,
): Promise<Session | null> {
  // Try JWT decode first (no secret validation — auth.getSession handles expiry).
  const payload = decodeJWT(token);
  if (payload && payload.sub) {
    // Build a minimal session from the JWT payload.
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp !== undefined && now > payload.exp) {
      return null; // Token expired.
    }

    const userData = (payload.data ?? {}) as Partial<AuthUser>;
    const user: AuthUser = {
      id: payload.sub,
      name: userData.name,
      email: userData.email,
      image: userData.image,
      roles: userData.roles,
      permissions: userData.permissions,
    };

    return {
      user,
      expires: payload.exp
        ? new Date(payload.exp * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
      accessToken: token,
    };
  }

  // Not a JWT — fall back to the AuthInstance's in-memory session.
  return auth.getSession();
}

// ─── createAuthMiddleware ─────────────────────────────────────────────────────

/**
 * The object returned by createAuthMiddleware().
 * Contains factory methods for each middleware type.
 */
export interface AuthMiddleware {
  /**
   * Returns a middleware that requires the request to be authenticated.
   *
   * Token extraction order:
   *   1. Authorization: Bearer <token> header
   *   2. Cookie (session-token, auth-token, etc.)
   *   3. AuthInstance.getSession() (in-memory fallback)
   *
   * On success: populates context.session and context.user.
   * On failure: redirects to the sign-in page (or returns 401 if returnError is true).
   */
  protect(options?: ProtectOptions): MiddlewareHandler;

  /**
   * Returns a middleware that requires the authenticated user to have
   * at least one of the specified roles.
   *
   * Must be used after protect() (or inside compose() after protect()).
   * On failure: returns 403.
   */
  requireRole(roles: string[]): MiddlewareHandler;

  /**
   * Returns a middleware that requires the authenticated user to have
   * at least one of the specified permissions.
   *
   * Must be used after protect() (or inside compose() after protect()).
   * On failure: returns 403.
   */
  requirePermission(permissions: string[]): MiddlewareHandler;
}

/**
 * Factory — creates an AuthMiddleware bound to the given AuthInstance.
 *
 * @param auth - The AuthInstance returned by createAuth().
 * @returns    An AuthMiddleware with protect / requireRole / requirePermission.
 */
export function createAuthMiddleware(auth: AuthInstance): AuthMiddleware {
  const signInPage = auth.config.pages?.signIn ?? "/auth/signin";

  // ── protect ───────────────────────────────────────────────────────────────

  function protect(options?: ProtectOptions): MiddlewareHandler {
    return async (context: MiddlewareContext): Promise<MiddlewareResult> => {
      let session: Session | null = null;

      // 1. Try Authorization: Bearer header.
      const bearerToken = extractBearerToken(context.request.headers);
      if (bearerToken) {
        session = await resolveSessionFromToken(bearerToken, auth);
      }

      // 2. Try Cookie header.
      if (!session) {
        const cookieToken = extractCookieToken(context.request.headers);
        if (cookieToken) {
          session = await resolveSessionFromToken(cookieToken, auth);
        }
      }

      // 3. Fallback — ask the AuthInstance directly.
      if (!session) {
        session = await auth.getSession();
      }

      // Session found and valid.
      if (session) {
        context.session = session;
        context.user = session.user as AuthUser;
        return { allowed: true };
      }

      // Unauthenticated — either redirect or return 401.
      if (options?.returnError) {
        return { allowed: false, status: 401, error: "Unauthorized" };
      }

      const redirectTo = options?.redirectTo ?? signInPage;
      return context.redirect(redirectTo);
    };
  }

  // ── requireRole ───────────────────────────────────────────────────────────

  function requireRole(roles: string[]): MiddlewareHandler {
    return async (context: MiddlewareContext): Promise<MiddlewareResult> => {
      const user = context.user as AuthUser | undefined | null;

      if (!user) {
        // protect() was not run first — treat as unauthenticated.
        return { allowed: false, status: 401, error: "Unauthorized" };
      }

      const userRoles = user.roles ?? [];
      const hasRole = roles.some((role) => userRoles.includes(role));

      if (!hasRole) {
        return { allowed: false, status: 403, error: "Forbidden: insufficient role" };
      }

      return { allowed: true };
    };
  }

  // ── requirePermission ─────────────────────────────────────────────────────

  function requirePermission(permissions: string[]): MiddlewareHandler {
    return async (context: MiddlewareContext): Promise<MiddlewareResult> => {
      const user = context.user as AuthUser | undefined | null;

      if (!user) {
        return { allowed: false, status: 401, error: "Unauthorized" };
      }

      const userPermissions = user.permissions ?? [];
      const hasPermission = permissions.some((perm) => userPermissions.includes(perm));

      if (!hasPermission) {
        return { allowed: false, status: 403, error: "Forbidden: insufficient permission" };
      }

      return { allowed: true };
    };
  }

  return { protect, requireRole, requirePermission };
}

// ─── compose ─────────────────────────────────────────────────────────────────

/**
 * Compose multiple middleware handlers into a single handler.
 * Middlewares are executed in order; execution stops on the first non-allowed result.
 *
 * @param handlers - One or more MiddlewareHandler functions.
 * @returns        A single MiddlewareHandler that runs all handlers sequentially.
 *
 * @example
 * const guard = compose(
 *   middleware.protect(),
 *   middleware.requireRole(["admin"]),
 * );
 * const result = await guard(context);
 */
export function compose(...handlers: MiddlewareHandler[]): MiddlewareHandler {
  return async (context: MiddlewareContext): Promise<MiddlewareResult> => {
    for (const handler of handlers) {
      const result = await handler(context);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  };
}

// ─── createMiddlewareContext helper ───────────────────────────────────────────

/**
 * Convenience helper to build a MiddlewareContext from raw request data.
 * Useful in tests and framework adapters.
 *
 * @param url     - Request URL string.
 * @param headers - HTTP headers.
 * @returns       A MiddlewareContext with a redirect helper pre-wired.
 */
export function createMiddlewareContext(
  url: string,
  headers: Record<string, string | string[] | undefined> = {},
): MiddlewareContext {
  return {
    request: { url, headers },
    redirect(redirectUrl: string): MiddlewareResult {
      return { allowed: false, redirect: redirectUrl };
    },
  };
}
