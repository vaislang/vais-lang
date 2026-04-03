/**
 * Discord OAuth 2.0 provider for @vaisx/auth.
 *
 * Authorization code flow endpoints:
 *   authorize : https://discord.com/api/oauth2/authorize
 *   token     : https://discord.com/api/oauth2/token
 *   userinfo  : https://discord.com/api/users/@me
 *
 * Scopes requested by default: identify, email
 *
 * Avatar CDN URL format:
 *   https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png
 *   Falls back to the default avatar when no avatar hash is present.
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

const DISCORD_AUTHORIZATION_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USERINFO_URL = "https://discord.com/api/users/@me";
const DISCORD_CDN_BASE = "https://cdn.discordapp.com";
const DISCORD_DEFAULT_SCOPES = ["identify", "email"];

// ─── Raw profile shape ────────────────────────────────────────────────────────

interface DiscordProfile {
  id: string;
  username: string;
  discriminator?: string;
  email?: string | null;
  avatar?: string | null;
  [key: string]: unknown;
}

// ─── Avatar URL builder ───────────────────────────────────────────────────────

/**
 * Resolve the Discord avatar CDN URL for a user.
 *
 * If the user has no custom avatar, Discord assigns one of five default
 * avatars based on the discriminator (legacy) or user id (pomelo).
 */
function resolveDiscordAvatarUrl(profile: DiscordProfile): string | undefined {
  if (profile.avatar) {
    return `${DISCORD_CDN_BASE}/avatars/${profile.id}/${profile.avatar}.png`;
  }
  // Default avatar — index = (id >> 22) % 6 for pomelo users
  const index = (BigInt(profile.id) >> 22n) % 6n;
  return `${DISCORD_CDN_BASE}/embed/avatars/${index}.png`;
}

// ─── Profile normalizer ───────────────────────────────────────────────────────

/**
 * Normalize a raw Discord /users/@me response into a common User object.
 *
 * Discord uses `username` as the display name and a CDN URL for the image.
 */
function normalizeDiscordProfile(raw: Record<string, unknown>): User {
  const profile = raw as DiscordProfile;
  return {
    id: String(profile.id),
    name: profile.username,
    email: profile.email ?? undefined,
    image: resolveDiscordAvatarUrl(profile),
  };
}

// ─── Provider options ─────────────────────────────────────────────────────────

export interface DiscordProviderOptions {
  /** Discord OAuth application client ID. */
  clientId: string;
  /** Discord OAuth application client secret. */
  clientSecret: string;
  /** Override the default scopes. */
  scopes?: string[];
}

// ─── DiscordProvider ──────────────────────────────────────────────────────────

/**
 * Create a Discord OAuth provider.
 *
 * @example
 * ```ts
 * import { DiscordProvider } from "@vaisx/auth/providers";
 *
 * const discord = DiscordProvider({
 *   clientId: process.env.DISCORD_CLIENT_ID!,
 *   clientSecret: process.env.DISCORD_CLIENT_SECRET!,
 * });
 * ```
 */
export function DiscordProvider(options: DiscordProviderOptions): OAuthProvider & {
  handleCallback(code: string, redirectUri: string): Promise<OAuthCallbackResult>;
} {
  const flowConfig: OAuthFlowConfig = {
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorizationUrl: DISCORD_AUTHORIZATION_URL,
    tokenUrl: DISCORD_TOKEN_URL,
    userinfoUrl: DISCORD_USERINFO_URL,
    scopes: options.scopes ?? DISCORD_DEFAULT_SCOPES,
  };

  return {
    // ── OAuthProvider identity ──────────────────────────────────────────────
    id: "discord",
    name: "Discord",
    type: "oauth",

    clientId: options.clientId,
    clientSecret: options.clientSecret,

    authorization: {
      url: DISCORD_AUTHORIZATION_URL,
      params: { scope: flowConfig.scopes.join(" ") },
    },
    token: { url: DISCORD_TOKEN_URL },
    userinfo: { url: DISCORD_USERINFO_URL },

    // ── OAuth helpers ───────────────────────────────────────────────────────

    /**
     * Build the Discord authorization URL for the initial redirect.
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
      const user = normalizeDiscordProfile(raw);

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
