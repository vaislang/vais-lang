/**
 * @vaisx/auth — OAuth provider tests
 *
 * Covers:
 *   - oauth.ts  : createAuthorizationUrl, exchangeCode, fetchUserInfo
 *   - google.ts : GoogleProvider (URL generation, profile normalization, callback)
 *   - github.ts : GitHubProvider (URL generation, profile normalization, callback)
 *   - discord.ts: DiscordProvider (URL generation, profile normalization, callback)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createAuthorizationUrl,
  exchangeCode,
  fetchUserInfo,
  type OAuthFlowConfig,
} from "../providers/oauth.js";
import { GoogleProvider } from "../providers/google.js";
import { GitHubProvider } from "../providers/github.js";
import { DiscordProvider } from "../providers/discord.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const REDIRECT_URI = "https://example.com/auth/callback";
const STATE = "random-csrf-state";

const baseFlowConfig: OAuthFlowConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  authorizationUrl: "https://provider.example/oauth/authorize",
  tokenUrl: "https://provider.example/oauth/token",
  userinfoUrl: "https://provider.example/oauth/userinfo",
  scopes: ["openid", "email"],
};

// ─── Helper: build a mock fetch response ──────────────────────────────────────

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── 1. createAuthorizationUrl ────────────────────────────────────────────────

describe("createAuthorizationUrl", () => {
  it("returns a URL string", () => {
    const url = createAuthorizationUrl(baseFlowConfig, STATE, REDIRECT_URI);
    expect(typeof url).toBe("string");
  });

  it("includes the correct base authorization URL", () => {
    const url = createAuthorizationUrl(baseFlowConfig, STATE, REDIRECT_URI);
    expect(url).toContain("https://provider.example/oauth/authorize");
  });

  it("includes client_id as a query parameter", () => {
    const url = createAuthorizationUrl(baseFlowConfig, STATE, REDIRECT_URI);
    expect(new URL(url).searchParams.get("client_id")).toBe("test-client-id");
  });

  it("includes redirect_uri as a query parameter", () => {
    const url = createAuthorizationUrl(baseFlowConfig, STATE, REDIRECT_URI);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
  });

  it("includes response_type=code", () => {
    const url = createAuthorizationUrl(baseFlowConfig, STATE, REDIRECT_URI);
    expect(new URL(url).searchParams.get("response_type")).toBe("code");
  });

  it("includes scopes as space-joined string", () => {
    const url = createAuthorizationUrl(baseFlowConfig, STATE, REDIRECT_URI);
    expect(new URL(url).searchParams.get("scope")).toBe("openid email");
  });

  it("includes the provided state value", () => {
    const url = createAuthorizationUrl(baseFlowConfig, STATE, REDIRECT_URI);
    expect(new URL(url).searchParams.get("state")).toBe(STATE);
  });
});

// ─── 2. exchangeCode ──────────────────────────────────────────────────────────

describe("exchangeCode", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({
          access_token: "gat_test",
          refresh_token: "grt_test",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an access_token from the token endpoint", async () => {
    const result = await exchangeCode(baseFlowConfig, "auth-code-123", REDIRECT_URI);
    expect(result.access_token).toBe("gat_test");
  });

  it("returns a refresh_token when the provider includes one", async () => {
    const result = await exchangeCode(baseFlowConfig, "auth-code-123", REDIRECT_URI);
    expect(result.refresh_token).toBe("grt_test");
  });

  it("calls the token URL via POST", async () => {
    await exchangeCode(baseFlowConfig, "auth-code-123", REDIRECT_URI);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(baseFlowConfig.tokenUrl);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
      ),
    );
    await expect(
      exchangeCode(baseFlowConfig, "bad-code", REDIRECT_URI),
    ).rejects.toThrow("[OAuth] Token exchange failed");
  });
});

// ─── 3. fetchUserInfo ─────────────────────────────────────────────────────────

describe("fetchUserInfo", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockFetchResponse({ sub: "u42", name: "Test User", email: "test@example.com" }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the raw profile object", async () => {
    const profile = await fetchUserInfo(baseFlowConfig.userinfoUrl, "access-token-xyz");
    expect(profile.sub).toBe("u42");
    expect(profile.email).toBe("test@example.com");
  });

  it("sends the Authorization: Bearer header", async () => {
    await fetchUserInfo(baseFlowConfig.userinfoUrl, "access-token-xyz");
    const fetchMock = vi.mocked(fetch);
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer access-token-xyz");
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    await expect(
      fetchUserInfo(baseFlowConfig.userinfoUrl, "bad-token"),
    ).rejects.toThrow("[OAuth] Userinfo request failed");
  });
});

// ─── 4. GoogleProvider ────────────────────────────────────────────────────────

describe("GoogleProvider", () => {
  const google = GoogleProvider({ clientId: "g-client-id", clientSecret: "g-secret" });

  it("has id='google' and type='oauth'", () => {
    expect(google.id).toBe("google");
    expect(google.type).toBe("oauth");
  });

  it("exposes the clientId", () => {
    expect(google.clientId).toBe("g-client-id");
  });

  it("authorization.url points to Google's authorization endpoint", () => {
    const auth = google.authorization as { url: string };
    expect(auth.url).toContain("accounts.google.com");
  });

  it("token.url points to Google's token endpoint", () => {
    const token = google.token as { url: string };
    expect(token.url).toContain("oauth2.googleapis.com");
  });

  it("userinfo.url points to Google's OpenID Connect userinfo endpoint", () => {
    const userinfo = google.userinfo as { url: string };
    expect(userinfo.url).toContain("openidconnect.googleapis.com");
  });

  describe("handleCallback — profile normalization", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce(
            // token exchange
            mockFetchResponse({
              access_token: "google-access-token",
              refresh_token: "google-refresh-token",
              expires_in: 3600,
            }),
          )
          .mockResolvedValueOnce(
            // userinfo
            mockFetchResponse({
              sub: "1234567890",
              name: "Alice Wonderland",
              email: "alice@gmail.com",
              picture: "https://lh3.googleusercontent.com/photo.jpg",
            }),
          ),
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    it("returns an OAuthCallbackResult with accessToken", async () => {
      const result = await google.handleCallback("code-abc", REDIRECT_URI);
      expect(result.accessToken).toBe("google-access-token");
    });

    it("normalizes Google sub → user.id", async () => {
      const result = await google.handleCallback("code-abc", REDIRECT_URI);
      expect(result.user.id).toBe("1234567890");
    });

    it("normalizes Google name → user.name", async () => {
      const result = await google.handleCallback("code-abc", REDIRECT_URI);
      expect(result.user.name).toBe("Alice Wonderland");
    });

    it("normalizes Google email → user.email", async () => {
      const result = await google.handleCallback("code-abc", REDIRECT_URI);
      expect(result.user.email).toBe("alice@gmail.com");
    });

    it("normalizes Google picture → user.image", async () => {
      const result = await google.handleCallback("code-abc", REDIRECT_URI);
      expect(result.user.image).toBe("https://lh3.googleusercontent.com/photo.jpg");
    });
  });
});

// ─── 5. GitHubProvider ────────────────────────────────────────────────────────

describe("GitHubProvider", () => {
  const github = GitHubProvider({ clientId: "gh-client-id", clientSecret: "gh-secret" });

  it("has id='github' and type='oauth'", () => {
    expect(github.id).toBe("github");
    expect(github.type).toBe("oauth");
  });

  it("authorization.url points to GitHub's authorization endpoint", () => {
    const auth = github.authorization as { url: string };
    expect(auth.url).toContain("github.com/login/oauth/authorize");
  });

  it("token.url points to GitHub's token endpoint", () => {
    const token = github.token as { url: string };
    expect(token.url).toContain("github.com/login/oauth/access_token");
  });

  it("userinfo.url points to the GitHub user API", () => {
    const userinfo = github.userinfo as { url: string };
    expect(userinfo.url).toContain("api.github.com/user");
  });

  describe("handleCallback — profile normalization", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce(
            mockFetchResponse({
              access_token: "github-access-token",
              token_type: "bearer",
            }),
          )
          .mockResolvedValueOnce(
            mockFetchResponse({
              id: 9876543,
              login: "alice-gh",
              email: "alice@github.com",
              avatar_url: "https://avatars.githubusercontent.com/u/9876543",
            }),
          ),
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    it("normalizes GitHub id → user.id (as string)", async () => {
      const result = await github.handleCallback("code-gh", REDIRECT_URI);
      expect(result.user.id).toBe("9876543");
    });

    it("normalizes GitHub login → user.name", async () => {
      const result = await github.handleCallback("code-gh", REDIRECT_URI);
      expect(result.user.name).toBe("alice-gh");
    });

    it("normalizes GitHub email → user.email", async () => {
      const result = await github.handleCallback("code-gh", REDIRECT_URI);
      expect(result.user.email).toBe("alice@github.com");
    });

    it("normalizes GitHub avatar_url → user.image", async () => {
      const result = await github.handleCallback("code-gh", REDIRECT_URI);
      expect(result.user.image).toContain("avatars.githubusercontent.com");
    });
  });
});

// ─── 6. DiscordProvider ───────────────────────────────────────────────────────

describe("DiscordProvider", () => {
  const discord = DiscordProvider({ clientId: "dc-client-id", clientSecret: "dc-secret" });

  it("has id='discord' and type='oauth'", () => {
    expect(discord.id).toBe("discord");
    expect(discord.type).toBe("oauth");
  });

  it("authorization.url points to Discord's authorization endpoint", () => {
    const auth = discord.authorization as { url: string };
    expect(auth.url).toContain("discord.com/api/oauth2/authorize");
  });

  it("token.url points to Discord's token endpoint", () => {
    const token = discord.token as { url: string };
    expect(token.url).toContain("discord.com/api/oauth2/token");
  });

  it("userinfo.url points to Discord's @me endpoint", () => {
    const userinfo = discord.userinfo as { url: string };
    expect(userinfo.url).toContain("discord.com/api/users/@me");
  });

  describe("handleCallback — profile normalization (with avatar)", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce(
            mockFetchResponse({
              access_token: "discord-access-token",
              refresh_token: "discord-refresh-token",
              expires_in: 604800,
            }),
          )
          .mockResolvedValueOnce(
            mockFetchResponse({
              id: "123456789012345678",
              username: "alice_discord",
              discriminator: "0",
              email: "alice@discord.com",
              avatar: "abc123avatarhash",
            }),
          ),
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    it("normalizes Discord id → user.id", async () => {
      const result = await discord.handleCallback("code-dc", REDIRECT_URI);
      expect(result.user.id).toBe("123456789012345678");
    });

    it("normalizes Discord username → user.name", async () => {
      const result = await discord.handleCallback("code-dc", REDIRECT_URI);
      expect(result.user.name).toBe("alice_discord");
    });

    it("normalizes Discord email → user.email", async () => {
      const result = await discord.handleCallback("code-dc", REDIRECT_URI);
      expect(result.user.email).toBe("alice@discord.com");
    });

    it("builds avatar CDN URL → user.image", async () => {
      const result = await discord.handleCallback("code-dc", REDIRECT_URI);
      expect(result.user.image).toBe(
        "https://cdn.discordapp.com/avatars/123456789012345678/abc123avatarhash.png",
      );
    });

    it("includes accessToken and refreshToken in result", async () => {
      const result = await discord.handleCallback("code-dc", REDIRECT_URI);
      expect(result.accessToken).toBe("discord-access-token");
      expect(result.refreshToken).toBe("discord-refresh-token");
    });
  });

  describe("handleCallback — profile normalization (no avatar, default CDN)", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce(
            mockFetchResponse({ access_token: "dc-tok", token_type: "Bearer" }),
          )
          .mockResolvedValueOnce(
            mockFetchResponse({
              id: "123456789012345678",
              username: "no_avatar_user",
              discriminator: "0",
              email: null,
              avatar: null,
            }),
          ),
      );
    });

    afterEach(() => vi.unstubAllGlobals());

    it("falls back to default avatar CDN URL when avatar is null", async () => {
      const result = await discord.handleCallback("code-dc", REDIRECT_URI);
      expect(result.user.image).toContain("cdn.discordapp.com/embed/avatars/");
    });

    it("sets user.email to undefined when Discord returns null email", async () => {
      const result = await discord.handleCallback("code-dc", REDIRECT_URI);
      expect(result.user.email).toBeUndefined();
    });
  });
});
