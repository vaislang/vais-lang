/**
 * useSession — reactive session hook backed by @vaisx/runtime signals.
 *
 * Usage:
 *   const auth = createAuth({ ... });
 *   const state = useSession(auth);
 *
 *   // Read reactive state
 *   state.session();       // Session | null
 *   state.status();        // "loading" | "authenticated" | "unauthenticated"
 *
 *   // Trigger sign-in / sign-out (re-syncs the signal)
 *   await state.signIn("credentials", { username, password });
 *   await state.signOut();
 *
 * SessionManager:
 *   const manager = new SessionManager({ secret: "my-secret" });
 *   const tokens = await manager.createSession(user);
 *   const session = await manager.validateSession(tokens.accessToken);
 *   const newTokens = await manager.refreshSession(tokens.refreshToken);
 *   manager.destroySession(tokens.sessionId);
 */

import { createSignal } from "@vaisx/runtime";
import type { Signal } from "@vaisx/runtime";
import type { AuthInstance, AuthState, Session, User } from "./types.js";
import { encodeJWT, verifyJWT, generateRefreshToken } from "./jwt.js";

// ─── ReactiveAuthState ────────────────────────────────────────────────────────

/**
 * Reactive wrapper around AuthState.
 * Each field is exposed as a Signal so consumers can read and track changes.
 */
export interface ReactiveAuthState {
  /** Reactive signal for the current session (null when not authenticated). */
  readonly session: Signal<Session | null>;
  /** Reactive signal for the current auth status. */
  readonly status: Signal<AuthState["status"]>;
  /**
   * Sign in via the specified provider.
   * Automatically updates the reactive signals on success or failure.
   */
  signIn(providerId: string, credentials?: Record<string, string>): Promise<Session | null>;
  /**
   * Sign out and clear the reactive session state.
   */
  signOut(): Promise<void>;
  /**
   * Manually refresh the session from the AuthInstance.
   * Useful after server-side session renewal.
   */
  refresh(): Promise<void>;
}

// ─── useSession ───────────────────────────────────────────────────────────────

/**
 * Create a reactive auth state object linked to an AuthInstance.
 *
 * @param auth - The AuthInstance returned by createAuth().
 * @returns A ReactiveAuthState with Signal-based session and status fields.
 */
export function useSession(auth: AuthInstance): ReactiveAuthState {
  // Initialise signals in "loading" state.
  const sessionSignal = createSignal<Session | null>(null);
  const statusSignal = createSignal<AuthState["status"]>("loading");

  // ── Bootstrap: read the current session once ─────────────────────────────

  // Schedule the initial session fetch asynchronously so callers get the
  // ReactiveAuthState object synchronously (and can register effects first).
  Promise.resolve().then(async () => {
    const existing = await auth.getSession();
    if (existing) {
      sessionSignal.set(existing);
      statusSignal.set("authenticated");
    } else {
      statusSignal.set("unauthenticated");
    }
  });

  // ── signIn ─────────────────────────────────────────────────────────────────

  async function signIn(
    providerId: string,
    credentials?: Record<string, string>,
  ): Promise<Session | null> {
    statusSignal.set("loading");
    try {
      const session = await auth.signIn(providerId, credentials);
      if (session) {
        sessionSignal.set(session);
        statusSignal.set("authenticated");
      } else {
        sessionSignal.set(null);
        statusSignal.set("unauthenticated");
      }
      return session;
    } catch (err) {
      sessionSignal.set(null);
      statusSignal.set("unauthenticated");
      throw err;
    }
  }

  // ── signOut ────────────────────────────────────────────────────────────────

  async function signOut(): Promise<void> {
    statusSignal.set("loading");
    await auth.signOut();
    sessionSignal.set(null);
    statusSignal.set("unauthenticated");
  }

  // ── refresh ────────────────────────────────────────────────────────────────

  async function refresh(): Promise<void> {
    statusSignal.set("loading");
    const session = await auth.getSession();
    if (session) {
      sessionSignal.set(session);
      statusSignal.set("authenticated");
    } else {
      sessionSignal.set(null);
      statusSignal.set("unauthenticated");
    }
  }

  return {
    session: sessionSignal,
    status: statusSignal,
    signIn,
    signOut,
    refresh,
  };
}

// ─── SessionManager ───────────────────────────────────────────────────────────

/**
 * Configuration for SessionManager.
 */
export interface SessionManagerConfig {
  /** Secret used to sign JWTs. */
  secret: string;
  /** Access token lifetime in seconds (default: 900 — 15 minutes). */
  accessTokenTTL?: number;
  /** Refresh token lifetime in seconds (default: 2592000 — 30 days). */
  refreshTokenTTL?: number;
}

/**
 * A token pair produced by SessionManager.createSession.
 */
export interface TokenPair {
  /** Signed JWT access token. */
  accessToken: string;
  /** Opaque refresh token string. */
  refreshToken: string;
  /** Unique session identifier (also the JWT jti). */
  sessionId: string;
  /** ISO expiry of the access token. */
  accessTokenExpires: string;
  /** ISO expiry of the refresh token. */
  refreshTokenExpires: string;
}

/**
 * Internal refresh-token record stored by SessionManager.
 */
interface RefreshRecord {
  userId: string;
  sessionId: string;
  expiresAt: number; // Unix seconds
  revoked: boolean;
}

/**
 * Manages JWT + refresh-token lifecycle.
 *
 * This is an in-memory implementation suitable for demonstration and testing.
 * In production, the refresh-token store should be backed by a database or
 * a distributed cache such as Redis.
 */
export class SessionManager {
  private readonly secret: string;
  private readonly accessTokenTTL: number;
  private readonly refreshTokenTTL: number;

  /** In-memory refresh-token store keyed by refresh-token string. */
  private refreshTokenStore: Map<string, RefreshRecord> = new Map();

  constructor(config: SessionManagerConfig) {
    this.secret = config.secret;
    this.accessTokenTTL = config.accessTokenTTL ?? 900; // 15 minutes
    this.refreshTokenTTL = config.refreshTokenTTL ?? 2592000; // 30 days
  }

  // ── createSession ───────────────────────────────────────────────────────────

  /**
   * Create a new JWT + refresh-token pair for the given user.
   *
   * @param user - The authenticated user.
   * @returns    A TokenPair containing both tokens and metadata.
   */
  async createSession(user: User): Promise<TokenPair> {
    const sessionId = generateRefreshToken().slice(0, 32);
    const now = Math.floor(Date.now() / 1000);
    const refreshToken = generateRefreshToken();

    const accessToken = await encodeJWT(
      { sub: user.id, data: { name: user.name, email: user.email, image: user.image } },
      this.secret,
      { expiresIn: this.accessTokenTTL, iat: now, jti: sessionId },
    );

    const refreshExpiresAt = now + this.refreshTokenTTL;

    this.refreshTokenStore.set(refreshToken, {
      userId: user.id,
      sessionId,
      expiresAt: refreshExpiresAt,
      revoked: false,
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      accessTokenExpires: new Date((now + this.accessTokenTTL) * 1000).toISOString(),
      refreshTokenExpires: new Date(refreshExpiresAt * 1000).toISOString(),
    };
  }

  // ── validateSession ─────────────────────────────────────────────────────────

  /**
   * Validate a JWT access token.
   *
   * @param token - The JWT string to validate.
   * @returns     A Session object on success, or null if invalid / expired.
   */
  async validateSession(token: string): Promise<Session | null> {
    const payload = await verifyJWT(token, this.secret);
    if (!payload) return null;

    const user: User = {
      id: payload.sub,
      ...(payload.data as Partial<User> | undefined),
    };

    const session: Session = {
      user,
      expires: new Date(payload.exp * 1000).toISOString(),
      accessToken: token,
    };

    return session;
  }

  // ── refreshSession ──────────────────────────────────────────────────────────

  /**
   * Exchange a refresh token for a new JWT access token.
   * The old refresh token remains valid until it expires or is revoked.
   *
   * @param refreshToken - The opaque refresh token string.
   * @returns            A new TokenPair, or null if the refresh token is invalid.
   */
  async refreshSession(refreshToken: string): Promise<TokenPair | null> {
    const record = this.refreshTokenStore.get(refreshToken);
    if (!record) return null;
    if (record.revoked) return null;

    const now = Math.floor(Date.now() / 1000);
    if (now > record.expiresAt) return null;

    // Produce a new access token.  Keep the same sessionId so downstream
    // systems can correlate new tokens with the original sign-in event.
    const newSessionId = generateRefreshToken().slice(0, 32);
    const newRefreshToken = generateRefreshToken();

    const accessToken = await encodeJWT(
      { sub: record.userId },
      this.secret,
      { expiresIn: this.accessTokenTTL, iat: now, jti: newSessionId },
    );

    // Revoke the old refresh token and store the new one.
    record.revoked = true;
    this.refreshTokenStore.set(newRefreshToken, {
      userId: record.userId,
      sessionId: newSessionId,
      expiresAt: record.expiresAt, // inherit original refresh expiry
      revoked: false,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      sessionId: newSessionId,
      accessTokenExpires: new Date((now + this.accessTokenTTL) * 1000).toISOString(),
      refreshTokenExpires: new Date(record.expiresAt * 1000).toISOString(),
    };
  }

  // ── destroySession ──────────────────────────────────────────────────────────

  /**
   * Invalidate all refresh tokens that belong to the given sessionId.
   * This effectively logs the user out of that particular session.
   *
   * @param sessionId - The session identifier (JWT jti / TokenPair.sessionId).
   */
  destroySession(sessionId: string): void {
    for (const [token, record] of this.refreshTokenStore.entries()) {
      if (record.sessionId === sessionId) {
        record.revoked = true;
        this.refreshTokenStore.delete(token);
      }
    }
  }

  /**
   * Revoke a specific refresh token directly.
   *
   * @param refreshToken - The refresh token string to revoke.
   * @returns true if the token existed and was revoked, false otherwise.
   */
  revokeRefreshToken(refreshToken: string): boolean {
    const record = this.refreshTokenStore.get(refreshToken);
    if (!record) return false;
    record.revoked = true;
    this.refreshTokenStore.delete(refreshToken);
    return true;
  }
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

/**
 * Options for cookie serialization.
 */
export interface CookieOptions {
  /** Max-Age in seconds. */
  maxAge?: number;
  /** Explicit expiry date. */
  expires?: Date;
  /** Cookie path (default: "/"). */
  path?: string;
  /** Domain scope. */
  domain?: string;
  /** Restrict to HTTPS connections. */
  secure?: boolean;
  /** Prevent client-side JS access. */
  httpOnly?: boolean;
  /** SameSite policy. */
  sameSite?: "Strict" | "Lax" | "None";
}

/**
 * Serialize a cookie name/value pair with the given options into a
 * Set-Cookie header string.
 *
 * @param name    - Cookie name.
 * @param value   - Cookie value (will be URI-encoded).
 * @param options - Optional cookie attributes.
 * @returns       A Set-Cookie header value string.
 */
export function serializeCookie(name: string, value: string, options?: CookieOptions): string {
  const encodedValue = encodeURIComponent(value);
  let cookie = `${name}=${encodedValue}`;

  const opts = options ?? {};

  if (opts.maxAge !== undefined) {
    cookie += `; Max-Age=${Math.floor(opts.maxAge)}`;
  }

  if (opts.expires instanceof Date) {
    cookie += `; Expires=${opts.expires.toUTCString()}`;
  }

  cookie += `; Path=${opts.path ?? "/"}`;

  if (opts.domain) {
    cookie += `; Domain=${opts.domain}`;
  }

  if (opts.secure) {
    cookie += "; Secure";
  }

  if (opts.httpOnly) {
    cookie += "; HttpOnly";
  }

  if (opts.sameSite) {
    cookie += `; SameSite=${opts.sameSite}`;
  }

  return cookie;
}

/**
 * Parse a Cookie header string into a name→value map.
 *
 * @param header - The value of the Cookie HTTP header.
 * @returns      An object mapping cookie names to their decoded values.
 */
export function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header || typeof header !== "string") return result;

  const pairs = header.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;

    const name = pair.slice(0, idx).trim();
    const raw = pair.slice(idx + 1).trim();

    if (!name) continue;

    try {
      result[name] = decodeURIComponent(raw);
    } catch {
      result[name] = raw;
    }
  }

  return result;
}
