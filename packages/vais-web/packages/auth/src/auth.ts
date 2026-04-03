/**
 * createAuth — creates an AuthInstance from an AuthConfig.
 *
 * Usage:
 *   const auth = createAuth({
 *     providers: [githubProvider({ clientId, clientSecret })],
 *     session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
 *     pages: { signIn: "/login" },
 *   });
 *
 *   const session = await auth.signIn("github");
 *   await auth.signOut();
 */

import type {
  AuthConfig,
  AuthInstance,
  AuthCallbacks,
  Session,
  User,
  Provider,
  JWTPayload,
} from "./types.js";

// ─── Default constants ────────────────────────────────────────────────────────

const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute an ISO expiry timestamp from now + maxAge seconds.
 */
function computeExpiry(maxAge: number): string {
  return new Date(Date.now() + maxAge * 1000).toISOString();
}

/**
 * Build a minimal JWT payload from a User object.
 */
function userToJWT(user: User): JWTPayload {
  return {
    sub: user.id,
    name: user.name,
    email: user.email,
    picture: user.image,
    iat: Math.floor(Date.now() / 1000),
  };
}

/**
 * Resolve a Provider by id from the config's providers list.
 */
function findProvider(providers: Provider[], id: string): Provider | undefined {
  return providers.find((p) => p.id === id);
}

// ─── createAuth ───────────────────────────────────────────────────────────────

/**
 * Create an AuthInstance configured with the provided options.
 * Follows the NextAuth.js / Auth.js API surface.
 */
export function createAuth(config: AuthConfig): AuthInstance {
  // Validate that at least one provider is supplied.
  if (!config.providers || config.providers.length === 0) {
    throw new Error("[createAuth] At least one provider must be specified.");
  }

  const maxAge = config.session.maxAge ?? DEFAULT_MAX_AGE;

  /** In-memory session store (single-user, client-side model). */
  let currentSession: Session | null = null;

  /** Registered lifecycle callbacks. */
  let registeredCallbacks: AuthCallbacks = {};

  // ── signIn ─────────────────────────────────────────────────────────────────

  async function signIn(
    providerId: string,
    credentials?: Record<string, string>,
  ): Promise<Session | null> {
    const provider = findProvider(config.providers, providerId);

    if (!provider) {
      throw new Error(`[createAuth] Unknown provider: "${providerId}"`);
    }

    let user: User | null = null;

    if (provider.type === "credentials") {
      if (!provider.authorize) {
        throw new Error(
          `[createAuth] Credentials provider "${providerId}" must implement authorize().`,
        );
      }
      user = await provider.authorize(credentials ?? {});
    } else if (provider.type === "oauth") {
      // OAuth flow stub — in a real implementation this would initiate the
      // OAuth redirect dance.  Here we surface a meaningful error so callers
      // know the integration point.
      throw new Error(
        `[createAuth] OAuth sign-in for "${providerId}" requires a server-side handler. ` +
          `Implement the OAuth redirect flow in your server integration.`,
      );
    }

    if (!user) {
      return null;
    }

    // Fire the signIn callback (if registered); allow it to deny the sign-in.
    if (registeredCallbacks.signIn) {
      const allowed = await registeredCallbacks.signIn({ user, provider });
      if (!allowed) {
        return null;
      }
    }

    // Build JWT payload (optionally enriched via callbacks.jwt).
    let jwtPayload = userToJWT(user);
    if (registeredCallbacks.jwt) {
      jwtPayload = await registeredCallbacks.jwt({ token: jwtPayload, user });
    }

    // Construct the session object.
    let session: Session = {
      user,
      expires: computeExpiry(maxAge),
    };

    // Optionally enrich session via callbacks.session.
    if (registeredCallbacks.session) {
      session = await registeredCallbacks.session({ session, user });
    }

    currentSession = session;
    return session;
  }

  // ── signOut ────────────────────────────────────────────────────────────────

  async function signOut(): Promise<void> {
    currentSession = null;
  }

  // ── getSession ─────────────────────────────────────────────────────────────

  async function getSession(): Promise<Session | null> {
    if (!currentSession) {
      return null;
    }

    // Check for expiry.
    const expiresAt = new Date(currentSession.expires).getTime();
    if (Date.now() > expiresAt) {
      currentSession = null;
      return null;
    }

    return currentSession;
  }

  // ── callbacks ──────────────────────────────────────────────────────────────

  function callbacks(cbs: AuthCallbacks): void {
    registeredCallbacks = { ...registeredCallbacks, ...cbs };
  }

  // ── Return the AuthInstance ────────────────────────────────────────────────

  return {
    config,
    signIn,
    signOut,
    getSession,
    callbacks,
  };
}
