/**
 * OAuth provider implementations for @vaisx/auth.
 *
 * Re-exports all built-in providers and the shared OAuth flow utilities.
 */

// ─── OAuth utilities ──────────────────────────────────────────────────────────
export {
  createAuthorizationUrl,
  exchangeCode,
  fetchUserInfo,
} from "./oauth.js";
export type { OAuthFlowConfig, OAuthCallbackResult } from "./oauth.js";

// ─── Built-in providers ───────────────────────────────────────────────────────
export { GoogleProvider } from "./google.js";
export type { GoogleProviderOptions } from "./google.js";

export { GitHubProvider } from "./github.js";
export type { GitHubProviderOptions } from "./github.js";

export { DiscordProvider } from "./discord.js";
export type { DiscordProviderOptions } from "./discord.js";
