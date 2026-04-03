/**
 * @vaisx/auth — Public API
 *
 * Re-exports all public APIs from the auth package.
 */

// Core auth factory
export { createAuth } from "./auth.js";

// Reactive session hook
export { useSession } from "./session.js";
export type { ReactiveAuthState } from "./session.js";

// SessionManager and cookie helpers
export { SessionManager, serializeCookie, parseCookies } from "./session.js";
export type {
  SessionManagerConfig,
  TokenPair,
  CookieOptions,
} from "./session.js";

// JWT utilities
export { encodeJWT, decodeJWT, verifyJWT, generateRefreshToken, base64urlEncode, base64urlDecode } from "./jwt.js";
export type { JWTEncodeOptions } from "./jwt.js";

// Middleware — route protection and RBAC
export { createAuthMiddleware, compose, createMiddlewareContext } from "./middleware.js";
export type {
  AuthUser,
  MiddlewareContext,
  MiddlewareResult,
  MiddlewareHandler,
  ProtectOptions,
  AuthMiddleware,
} from "./middleware.js";

// OAuth providers
export {
  GoogleProvider,
  GitHubProvider,
  DiscordProvider,
  createAuthorizationUrl,
  exchangeCode,
  fetchUserInfo,
} from "./providers/index.js";
export type {
  GoogleProviderOptions,
  GitHubProviderOptions,
  DiscordProviderOptions,
  OAuthFlowConfig,
  OAuthCallbackResult,
} from "./providers/index.js";

// Security utilities — CSRF, XSS, HttpOnly cookies, security headers
export {
  generateCSRFToken,
  validateCSRFToken,
  createCSRFMiddleware,
  createSecureCookieOptions,
  sanitizeInput,
  createSecurityHeaders,
  timingSafeEqual,
} from "./security.js";
export type {
  CSRFMiddlewareOptions,
  CSRFRequest,
  CSRFResult,
  SecureCookieOptions,
  CookieConfig,
  SecurityHeaders,
} from "./security.js";

// SSR utilities — server session extraction & client hydration
export {
  getServerSession,
  createAuthScript,
  hydrateSession,
  createSSRAuthContext,
  withAuth,
  SESSION_COOKIE_NAME,
  HYDRATION_KEY,
} from "./ssr.js";
export type {
  HydrationPayload,
  SSRAuthContext,
  SSRRequest,
  SSRHandler,
} from "./ssr.js";

// Type definitions
export type {
  // User & Session
  User,
  Session,
  AuthState,
  // Session config
  SessionConfig,
  // Providers
  Provider,
  OAuthProvider,
  CredentialsProvider,
  // Pages
  AuthPages,
  // Config & instance
  AuthConfig,
  AuthInstance,
  AuthCallbacks,
  JWTPayload,
  // Middleware
  Middleware,
} from "./types.js";
