/**
 * Core type definitions for @vaisx/auth.
 * API inspired by NextAuth.js / Auth.js, adapted for VaisX reactivity.
 */

// ─── User & Session ───────────────────────────────────────────────────────────

/**
 * Represents an authenticated user.
 */
export interface User {
  /** Unique user identifier. */
  id: string;
  /** Display name. */
  name?: string;
  /** Email address. */
  email?: string;
  /** Avatar image URL. */
  image?: string;
}

/**
 * An active session containing user info and expiry metadata.
 */
export interface Session {
  /** The authenticated user. */
  user: User;
  /** ISO timestamp of when the session expires. */
  expires: string;
  /** Optional access token (present for OAuth providers). */
  accessToken?: string;
}

// ─── Reactive auth state ──────────────────────────────────────────────────────

/**
 * Reactive authentication state returned by useSession().
 */
export interface AuthState {
  /** Current session, or null when unauthenticated / loading. */
  session: Session | null;
  /** Current status of the authentication state. */
  status: "loading" | "authenticated" | "unauthenticated";
}

// ─── Session configuration ────────────────────────────────────────────────────

/**
 * Session strategy and lifetime configuration.
 */
export interface SessionConfig {
  /** Token strategy: "jwt" (stateless) or "cookie" (server-side). */
  strategy: "jwt" | "cookie";
  /** Maximum session lifetime in seconds (default: 30 days). */
  maxAge?: number;
  /** How often the session is refreshed in seconds (default: 24 hours). */
  updateAge?: number;
}

// ─── Providers ────────────────────────────────────────────────────────────────

/**
 * Base provider definition shared by all provider types.
 */
export interface Provider {
  /** Unique provider identifier (e.g. "github", "credentials"). */
  id: string;
  /** Human-readable provider name (e.g. "GitHub", "Email & Password"). */
  name: string;
  /** Provider type — determines the authentication flow. */
  type: "oauth" | "credentials";
  /**
   * Custom authorize function for credentials providers.
   * Receives the submitted credentials and returns a User or null.
   */
  authorize?: (credentials: Record<string, string>) => Promise<User | null> | User | null;
}

/**
 * OAuth 2.0 provider — extends Provider with OAuth-specific endpoints.
 */
export interface OAuthProvider extends Provider {
  type: "oauth";
  /** OAuth application client ID. */
  clientId: string;
  /** OAuth application client secret. */
  clientSecret: string;
  /** Authorization endpoint URL or config object. */
  authorization: string | { url: string; params?: Record<string, string> };
  /** Token exchange endpoint URL or config object. */
  token: string | { url: string; params?: Record<string, string> };
  /** Userinfo endpoint URL or config object. */
  userinfo: string | { url: string; params?: Record<string, string> };
}

/**
 * Credentials provider — validates username/password or similar credentials.
 */
export interface CredentialsProvider extends Provider {
  type: "credentials";
  /** Must be provided for credentials providers. */
  authorize: (credentials: Record<string, string>) => Promise<User | null> | User | null;
}

// ─── Pages configuration ──────────────────────────────────────────────────────

/**
 * Custom page paths for auth-related views.
 */
export interface AuthPages {
  /** Custom sign-in page path (default: "/auth/signin"). */
  signIn?: string;
  /** Custom sign-out page path (default: "/auth/signout"). */
  signOut?: string;
  /** Custom error page path (default: "/auth/error"). */
  error?: string;
}

// ─── Auth configuration ───────────────────────────────────────────────────────

/**
 * Top-level configuration object passed to createAuth().
 */
export interface AuthConfig {
  /** List of authentication providers. */
  providers: Provider[];
  /** Session strategy and lifetime configuration. */
  session: SessionConfig;
  /** Optional custom page paths. */
  pages?: AuthPages;
  /** Secret used to sign/encrypt JWTs and session cookies. */
  secret?: string;
}

// ─── Auth instance ────────────────────────────────────────────────────────────

/**
 * Callbacks that fire at key points in the auth lifecycle.
 */
export interface AuthCallbacks {
  /**
   * Called after a user signs in successfully.
   * Return false to deny the sign-in.
   */
  signIn?: (params: { user: User; provider: Provider }) => Promise<boolean> | boolean;
  /**
   * Called when a session is read.
   * Use this to enrich the session object.
   */
  session?: (params: { session: Session; user: User }) => Promise<Session> | Session;
  /**
   * Called when a JWT is created or updated.
   */
  jwt?: (params: { token: JWTPayload; user?: User }) => Promise<JWTPayload> | JWTPayload;
}

/**
 * Internal JWT payload structure.
 */
export interface JWTPayload {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

/**
 * The auth instance returned by createAuth().
 * Provides methods to manage sessions and sign in/out.
 */
export interface AuthInstance {
  /** The configuration used to create this instance. */
  readonly config: AuthConfig;
  /**
   * Sign a user in via a specific provider.
   * Returns the resulting Session or null if sign-in failed.
   */
  signIn(providerId: string, credentials?: Record<string, string>): Promise<Session | null>;
  /**
   * Sign the current user out. Clears the active session.
   */
  signOut(): Promise<void>;
  /**
   * Get the current session, or null if not authenticated.
   */
  getSession(): Promise<Session | null>;
  /**
   * Register lifecycle callbacks.
   */
  callbacks(callbacks: AuthCallbacks): void;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Route protection utilities returned alongside the auth instance.
 */
export interface Middleware {
  /**
   * Protect a route — redirects to sign-in if not authenticated.
   * Returns true if the user is authenticated.
   */
  protect(session: Session | null, redirectTo?: string): boolean;
  /**
   * Require the authenticated user to have a specific role.
   * Expects the role to be present on the user object (extended via callbacks.session).
   */
  requireRole(session: Session | null, role: string, redirectTo?: string): boolean;
}
