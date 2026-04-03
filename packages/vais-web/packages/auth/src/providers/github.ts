/**
 * GitHub OAuth 2.0 provider for @vaisx/auth.
 *
 * Authorization code flow endpoints:
 *   authorize : https://github.com/login/oauth/authorize
 *   token     : https://github.com/login/oauth/access_token
 *   userinfo  : https://api.github.com/user
 *
 * Scopes requested by default: read:user, user:email
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

const GITHUB_AUTHORIZATION_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USERINFO_URL = "https://api.github.com/user";
const GITHUB_DEFAULT_SCOPES = ["read:user", "user:email"];

// ─── Raw profile shape ────────────────────────────────────────────────────────

interface GitHubProfile {
  id: number | string;
  login: string;
  email?: string | null;
  avatar_url?: string;
  [key: string]: unknown;
}

// ─── Profile normalizer ───────────────────────────────────────────────────────

/**
 * Normalize a raw GitHub user API response into a common User object.
 *
 * GitHub uses `login` for the display name and `avatar_url` for the image.
 */
function normalizeGitHubProfile(raw: Record<string, unknown>): User {
  const profile = raw as GitHubProfile;
  return {
    id: String(profile.id),
    name: profile.login,
    email: profile.email ?? undefined,
    image: profile.avatar_url,
  };
}

// ─── Provider options ─────────────────────────────────────────────────────────

export interface GitHubProviderOptions {
  /** GitHub OAuth application client ID. */
  clientId: string;
  /** GitHub OAuth application client secret. */
  clientSecret: string;
  /** Override the default scopes. */
  scopes?: string[];
}

// ─── GitHubProvider ───────────────────────────────────────────────────────────

/**
 * Create a GitHub OAuth provider.
 *
 * @example
 * ```ts
 * import { GitHubProvider } from "@vaisx/auth/providers";
 *
 * const github = GitHubProvider({
 *   clientId: process.env.GITHUB_CLIENT_ID!,
 *   clientSecret: process.env.GITHUB_CLIENT_SECRET!,
 * });
 * ```
 */
export function GitHubProvider(options: GitHubProviderOptions): OAuthProvider & {
  handleCallback(code: string, redirectUri: string): Promise<OAuthCallbackResult>;
} {
  const flowConfig: OAuthFlowConfig = {
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorizationUrl: GITHUB_AUTHORIZATION_URL,
    tokenUrl: GITHUB_TOKEN_URL,
    userinfoUrl: GITHUB_USERINFO_URL,
    scopes: options.scopes ?? GITHUB_DEFAULT_SCOPES,
  };

  return {
    // ── OAuthProvider identity ──────────────────────────────────────────────
    id: "github",
    name: "GitHub",
    type: "oauth",

    clientId: options.clientId,
    clientSecret: options.clientSecret,

    authorization: {
      url: GITHUB_AUTHORIZATION_URL,
      params: { scope: flowConfig.scopes.join(" ") },
    },
    token: { url: GITHUB_TOKEN_URL },
    userinfo: { url: GITHUB_USERINFO_URL },

    // ── OAuth helpers ───────────────────────────────────────────────────────

    /**
     * Build the GitHub authorization URL for the initial redirect.
     */
    getAuthorizationUrl(state: string, redirectUri: string): string {
      return createAuthorizationUrl(flowConfig, state, redirectUri);
    },

    /**
     * Complete the OAuth callback: exchange the code for a token and fetch
     * the normalized user profile.
     */
    async handleCallback(
      code: string,
      redirectUri: string,
    ): Promise<OAuthCallbackResult> {
      const tokens = await exchangeCode(flowConfig, code, redirectUri);
      const raw = await fetchUserInfo(flowConfig.userinfoUrl, tokens.access_token);
      const user = normalizeGitHubProfile(raw);

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
