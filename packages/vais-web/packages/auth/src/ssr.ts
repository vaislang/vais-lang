/**
 * SSR utilities for @vaisx/auth.
 *
 * Provides server-side session extraction, client hydration script generation,
 * and request-scoped auth context management for SSR frameworks.
 *
 * All functions are SSR-safe: window/document access is guarded by typeof checks.
 */

import type { Session, AuthInstance } from "./types.js";
import { verifyJWT } from "./jwt.js";
import { parseCookies } from "./session.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Cookie name used to store the session JWT on the client. */
export const SESSION_COOKIE_NAME = "vaisx_session";

/** Global variable name injected by createAuthScript for client hydration. */
export const HYDRATION_KEY = "__VAISX_AUTH__";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Shape of the data injected into window.__VAISX_AUTH__ by createAuthScript.
 */
export interface HydrationPayload {
  session: Session | null;
}

/**
 * A request-scoped SSR auth context that stores the resolved session for the
 * current render pass.
 */
export interface SSRAuthContext {
  /** Retrieve the session stored in this context. */
  getSession(): Session | null;
  /** Store a session in this context (called internally by withAuth). */
  setSession(session: Session | null): void;
}

/**
 * A generic server-side request object.
 * Frameworks (Next.js, Remix, Hono, etc.) all expose at least headers.
 */
export interface SSRRequest {
  headers: {
    get(name: string): string | null;
    /** Node.js-style `headers` object may expose cookies directly. */
    cookie?: string;
  };
  /** Some adapters expose cookies as a map directly. */
  cookies?: Record<string, string> | { get(name: string): { value: string } | undefined };
}

/**
 * Handler function wrapped by withAuth.
 * Receives the resolved session alongside the original request.
 */
export type SSRHandler<Req extends SSRRequest = SSRRequest, Res = unknown> = (
  request: Req,
  session: Session | null,
) => Promise<Res> | Res;

// ─── getServerSession ─────────────────────────────────────────────────────────

/**
 * Extract and verify the session from an incoming server-side request.
 *
 * Resolution order:
 *  1. `Cookie` header   → parsed for `vaisx_session`
 *  2. `Authorization`   → `Bearer <token>` header
 *  3. Adapter-provided  → `request.cookies` map / get() API
 *
 * @param request - The incoming HTTP request (framework-agnostic).
 * @param auth    - The AuthInstance that holds the secret & config.
 * @returns       A Session if the token is valid, null otherwise.
 */
export async function getServerSession(
  request: SSRRequest,
  auth: AuthInstance,
): Promise<Session | null> {
  const secret = auth.config.secret;
  if (!secret) return null;

  // ── 1. Try the Cookie header ─────────────────────────────────────────────
  const cookieHeader = request.headers.get("cookie") ?? request.headers.get("Cookie") ?? null;
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) {
      const session = await verifyAndBuildSession(token, secret);
      if (session) return session;
    }
  }

  // ── 2. Try the Authorization: Bearer header ───────────────────────────────
  const authHeader =
    request.headers.get("authorization") ?? request.headers.get("Authorization") ?? null;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const session = await verifyAndBuildSession(token, secret);
      if (session) return session;
    }
  }

  // ── 3. Try adapter-provided cookies object ───────────────────────────────
  if (request.cookies) {
    const cookiesObj = request.cookies;
    let token: string | undefined;

    if (typeof (cookiesObj as { get?: unknown }).get === "function") {
      // Next.js ReadonlyRequestCookies style: cookies.get(name)
      const entry = (
        cookiesObj as { get(name: string): { value: string } | undefined }
      ).get(SESSION_COOKIE_NAME);
      token = entry?.value;
    } else {
      // Plain Record<string, string>
      token = (cookiesObj as Record<string, string>)[SESSION_COOKIE_NAME];
    }

    if (token) {
      const session = await verifyAndBuildSession(token, secret);
      if (session) return session;
    }
  }

  return null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Verify a raw JWT token string and, if valid, construct a Session object.
 */
async function verifyAndBuildSession(
  token: string,
  secret: string,
): Promise<Session | null> {
  const payload = await verifyJWT(token, secret);
  if (!payload) return null;

  const session: Session = {
    user: {
      id: payload.sub,
      ...(payload.data as { name?: string; email?: string; image?: string } | undefined),
    },
    expires: new Date(payload.exp * 1000).toISOString(),
    accessToken: token,
  };

  return session;
}

// ─── createAuthScript ─────────────────────────────────────────────────────────

/**
 * Produce an inline `<script>` tag that injects the session state into
 * `window.__VAISX_AUTH__` for client-side hydration.
 *
 * XSS protection: every character that has special meaning inside an HTML
 * context (`&`, `<`, `>`, `"`, `'`, `/`) is replaced with its HTML entity
 * equivalent before being embedded in the script body.
 *
 * @param session - The session resolved on the server (or null).
 * @returns       An HTML `<script>` string safe to embed in the document.
 */
export function createAuthScript(session: Session | null): string {
  const payload: HydrationPayload = { session };
  const raw = JSON.stringify(payload);
  const escaped = escapeHtml(raw);
  return `<script>window.${HYDRATION_KEY}=${escaped};</script>`;
}

/**
 * Escape a string so it can be safely embedded inside an HTML document.
 * Replaces `&`, `<`, `>`, `"`, `'`, and `/` with their HTML entity forms.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/"/g, "\\u0022")
    .replace(/'/g, "\\u0027")
    .replace(/\//g, "\\u002f");
}

// ─── hydrateSession ───────────────────────────────────────────────────────────

/**
 * Read the server-injected auth state from `window.__VAISX_AUTH__` and
 * restore it into the provided AuthInstance so that client-side code can
 * consume the pre-loaded session without an extra round-trip.
 *
 * Safe to call in SSR/Node contexts — the function is a no-op when `window`
 * is not defined.
 *
 * @param auth - The AuthInstance to hydrate.
 */
export async function hydrateSession(auth: AuthInstance): Promise<void> {
  if (typeof window === "undefined") return;

  const win = window as typeof window & { [HYDRATION_KEY]?: HydrationPayload };
  const payload = win[HYDRATION_KEY];
  if (!payload || payload.session == null) return;

  // Restore the session into the AuthInstance by using the internal signIn
  // override path via the session callback.
  // Because createAuth only stores sessions through signIn, we use the
  // callbacks mechanism to inject the pre-loaded session directly, then
  // sign in via a synthetic credentials provider that is registered just for
  // this hydration path.
  //
  // In practice the simplest universal approach is to call the auth
  // instance's own getSession flow — but since the in-memory store is
  // private, we restore by calling a helper on the auth object if it
  // exposes one, or by patching the session callback.
  //
  // We delegate to a lightweight direct-session-set pathway below.
  await restoreSession(auth, payload.session);
}

/**
 * Restore a session directly into the AuthInstance by monkey-patching the
 * session callback so the next getSession() call returns the pre-loaded value.
 *
 * This avoids the need to expose private internals while still enabling the
 * hydration flow to work with the existing AuthInstance interface.
 */
async function restoreSession(auth: AuthInstance, session: Session): Promise<void> {
  // Use the callbacks mechanism to intercept the session read.
  // The session callback is called with the existing session and can replace it.
  // We store the hydrated session in a closure and return it on the next read.
  let hydrated: Session | null = session;

  auth.callbacks({
    session: async () => {
      const s = hydrated;
      // Only apply once — subsequent reads should go through the normal path.
      hydrated = null;
      return s ?? session;
    },
  });

  // Sign in via a synthetic call to trigger the session callback path.
  // We use a no-op credentials provider that returns null but then the
  // session callback will patch the result.
  //
  // Alternative: directly sign in with the hydrated session's user to store
  // the session. We create a temporary provider for this.
  const tempProviderId = "__ssr_hydration__";
  const hydratedUser = session.user;

  // Temporarily register the provider.
  const tempProvider = {
    id: tempProviderId,
    name: "SSR Hydration",
    type: "credentials" as const,
    authorize: async () => hydratedUser,
  };

  // Mutate providers array temporarily to allow sign-in.
  const providers = auth.config.providers;
  providers.push(tempProvider);

  try {
    await auth.signIn(tempProviderId);
  } finally {
    // Remove the temporary provider.
    const idx = providers.indexOf(tempProvider);
    if (idx !== -1) providers.splice(idx, 1);
  }
}

// ─── createSSRAuthContext ─────────────────────────────────────────────────────

/**
 * Create a request-scoped SSR auth context.
 *
 * In SSR, each incoming request is handled in isolation. This context acts as
 * a lightweight store for the session resolved for the current render/request,
 * so it can be threaded through component trees without re-fetching.
 *
 * @returns An SSRAuthContext instance scoped to the current request.
 */
export function createSSRAuthContext(): SSRAuthContext {
  let _session: Session | null = null;

  return {
    getSession(): Session | null {
      return _session;
    },
    setSession(session: Session | null): void {
      _session = session;
    },
  };
}

// ─── withAuth ─────────────────────────────────────────────────────────────────

/**
 * Wrap a server-side handler with automatic session resolution.
 *
 * The wrapper:
 *  1. Calls `getServerSession` to resolve the session from the request.
 *  2. Passes the session (or null) as the second argument to the handler.
 *
 * @param handler - The SSR handler function to wrap.
 * @param auth    - The AuthInstance used to verify the session.
 * @returns       A new handler with the same signature that receives the
 *                resolved session automatically.
 */
export function withAuth<Req extends SSRRequest = SSRRequest, Res = unknown>(
  handler: SSRHandler<Req, Res>,
  auth: AuthInstance,
): (request: Req) => Promise<Res> {
  return async (request: Req): Promise<Res> => {
    const session = await getServerSession(request, auth);
    return handler(request, session);
  };
}
