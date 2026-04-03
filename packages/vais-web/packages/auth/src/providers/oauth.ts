/**
 * OAuth 2.0 utility functions for provider implementations.
 *
 * Provides building blocks for the authorization code flow:
 *   1. createAuthorizationUrl  — build the /authorize redirect URL
 *   2. exchangeCode            — POST /token to get an access token
 *   3. fetchUserInfo           — GET /userinfo with the access token
 */

import type { User } from "../types.js";

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Configuration required to drive an OAuth 2.0 authorization-code flow.
 */
export interface OAuthFlowConfig {
  /** OAuth application client ID. */
  clientId: string;
  /** OAuth application client secret. */
  clientSecret: string;
  /** Provider authorization endpoint (e.g. https://accounts.google.com/o/oauth2/v2/auth). */
  authorizationUrl: string;
  /** Provider token endpoint (e.g. https://oauth2.googleapis.com/token). */
  tokenUrl: string;
  /** Provider userinfo endpoint (e.g. https://openidconnect.googleapis.com/v1/userinfo). */
  userinfoUrl: string;
  /** OAuth scopes to request (e.g. ["openid", "email", "profile"]). */
  scopes: string[];
}

// ─── Result types ─────────────────────────────────────────────────────────────

/**
 * Data returned after a successful OAuth callback (code exchange + userinfo).
 */
export interface OAuthCallbackResult {
  /** OAuth access token. */
  accessToken: string;
  /** Optional refresh token (only if the provider returns one). */
  refreshToken?: string;
  /** Seconds until the access token expires (if provided by the provider). */
  expiresIn?: number;
  /** Normalized user profile. */
  user: User;
}

// ─── Authorization URL ────────────────────────────────────────────────────────

/**
 * Build the provider authorization URL that the user should be redirected to.
 *
 * @param config      OAuth flow configuration.
 * @param state       CSRF-prevention state token (opaque string, verified on callback).
 * @param redirectUri Absolute URI the provider should redirect back to after authorization.
 * @returns           The fully-qualified authorization URL.
 */
export function createAuthorizationUrl(
  config: OAuthFlowConfig,
  state: string,
  redirectUri: string,
): string {
  const url = new URL(config.authorizationUrl);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);

  return url.toString();
}

// ─── Token exchange ───────────────────────────────────────────────────────────

/**
 * Raw token response from the provider's /token endpoint.
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Exchange an authorization code for an access token.
 *
 * Sends a POST request to the provider's token endpoint with the standard
 * OAuth 2.0 parameters.
 *
 * @param config      OAuth flow configuration.
 * @param code        The authorization code received in the callback query-string.
 * @param redirectUri The same redirect URI used in createAuthorizationUrl.
 * @returns           Token response containing at minimum an access_token.
 */
export async function exchangeCode(
  config: OAuthFlowConfig,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `[OAuth] Token exchange failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<TokenResponse>;
}

// ─── Userinfo fetch ───────────────────────────────────────────────────────────

/**
 * Fetch the authenticated user's profile from the provider's userinfo endpoint.
 *
 * @param userinfoUrl  The provider's userinfo URL.
 * @param accessToken  The access token obtained from exchangeCode.
 * @returns            Raw profile object (provider-specific shape).
 */
export async function fetchUserInfo(
  userinfoUrl: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(userinfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `[OAuth] Userinfo request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<Record<string, unknown>>;
}
