/**
 * Google OAuth 2.0 provider for @vaisx/auth.
 *
 * Authorization code flow endpoints:
 *   authorize : https://accounts.google.com/o/oauth2/v2/auth
 *   token     : https://oauth2.googleapis.com/token
 *   userinfo  : https://openidconnect.googleapis.com/v1/userinfo
 *
 * Scopes requested by default: openid, email, profile
 */

import type { OAuthProvider, User } from "../types.js";
import {
  createAuthorizationUrl,
  exchangeCode,
  fetchUserInfo,
  type OAuthFlowConfig,
  type OAuthCallbackResult,
} from "./oauth.js";

// ─── Endpoints ────────────────────────────────────────────────────────────────

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_DEFAULT_SCOPES = ["openid", "email", "profile"];

// ─── Raw profile shape ────────────────────────────────────────────────────────

interface GoogleProfile {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  [key: string]: unknown;
}

// ─── Profile normalizer ───────────────────────────────────────────────────────

/**
 * Normalize a raw Google userinfo response into a common User object.
 */
function normalizeGoogleProfile(raw: Record<string, unknown>): User {
  const profile = raw as GoogleProfile;
  return {
    id: String(profile.sub),
    name: profile.name,
    email: profile.email,
    image: profile.picture,
  };
}

// ─── Provider options ─────────────────────────────────────────────────────────

export interface GoogleProviderOptions {
  /** Google OAuth application client ID. */
  clientId: string;
  /** Google OAuth application client secret. */
  clientSecret: string;
  /** Override the default scopes. */
  scopes?: string[];
}

// ─── GoogleProvider ───────────────────────────────────────────────────────────

/**
 * Create a Google OAuth provider.
 *
 * @example
 * ```ts
 * import { GoogleProvider } from "@vaisx/auth/providers";
 *
 * const google = GoogleProvider({
 *   clientId: process.env.GOOGLE_CLIENT_ID!,
 *   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
 * });
 * ```
 */
export function GoogleProvider(options: GoogleProviderOptions): OAuthProvider & {
  handleCallback(code: string, redirectUri: string): Promise<OAuthCallbackResult>;
} {
  const flowConfig: OAuthFlowConfig = {
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorizationUrl: GOOGLE_AUTHORIZATION_URL,
    tokenUrl: GOOGLE_TOKEN_URL,
    userinfoUrl: GOOGLE_USERINFO_URL,
    scopes: options.scopes ?? GOOGLE_DEFAULT_SCOPES,
  };

  return {
    // ── OAuthProvider identity ──────────────────────────────────────────────
    id: "google",
    name: "Google",
    type: "oauth",

    clientId: options.clientId,
    clientSecret: options.clientSecret,

    authorization: {
      url: GOOGLE_AUTHORIZATION_URL,
      params: { scope: flowConfig.scopes.join(" ") },
    },
    token: { url: GOOGLE_TOKEN_URL },
    userinfo: { url: GOOGLE_USERINFO_URL },

    // ── OAuth helpers ───────────────────────────────────────────────────────

    /**
     * Build the Google authorization URL for the initial redirect.
     */
    getAuthorizationUrl(state: string, redirectUri: string): string {
      return createAuthorizationUrl(flowConfig, state, redirectUri);
    },

    /**
     * Complete the OAuth callback: exchange the code for tokens and fetch
     * the normalized user profile.
     */
    async handleCallback(
      code: string,
      redirectUri: string,
    ): Promise<OAuthCallbackResult> {
      const tokens = await exchangeCode(flowConfig, code, redirectUri);
      const raw = await fetchUserInfo(flowConfig.userinfoUrl, tokens.access_token);
      const user = normalizeGoogleProfile(raw);

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        user,
      };
    },
  } as OAuthProvider & {
    handleCallback(code: string, redirectUri: string): Promise<OAuthCallbackResult>;
  };
}
