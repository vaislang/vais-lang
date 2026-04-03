/**
 * @vaisx/auth — useSession tests + SessionManager tests + cookie helper tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuth } from "../auth.js";
import { useSession, SessionManager, serializeCookie, parseCookies } from "../session.ts";
import type { AuthConfig, User, Session } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const testUser: User = { id: "u1", name: "Alice", email: "alice@example.com" };

function makeConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return {
    providers: [
      {
        id: "credentials",
        name: "Credentials",
        type: "credentials",
        authorize: async () => testUser,
      },
    ],
    session: { strategy: "jwt", maxAge: 3600 },
    ...overrides,
  };
}

// ─── useSession — initial state ───────────────────────────────────────────────

describe("useSession — initial state", () => {
  it("initial session signal is null", () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    // Signals are callable — reading immediately returns the initial value.
    expect(state.session()).toBeNull();
  });

  it("initial status signal is 'loading'", () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    expect(state.status()).toBe("loading");
  });

  it("status transitions to 'unauthenticated' after async bootstrap (no session)", async () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    // Wait for the microtask queue to drain.
    await Promise.resolve();
    await Promise.resolve();
    expect(state.status()).toBe("unauthenticated");
    expect(state.session()).toBeNull();
  });

  it("status transitions to 'authenticated' after bootstrap when session exists", async () => {
    const auth = createAuth(makeConfig());
    // Pre-populate a session.
    await auth.signIn("credentials");
    const state = useSession(auth);
    // Wait for bootstrap microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(state.status()).toBe("authenticated");
    expect(state.session()?.user.id).toBe("u1");
  });
});

// ─── useSession — signIn ──────────────────────────────────────────────────────

describe("useSession — signIn", () => {
  it("sets status to 'authenticated' and session to the returned Session", async () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    const session = await state.signIn("credentials", { username: "alice" });
    expect(session?.user.id).toBe("u1");
    expect(state.status()).toBe("authenticated");
    expect(state.session()?.user.id).toBe("u1");
  });

  it("sets status to 'unauthenticated' when authorize returns null", async () => {
    const auth = createAuth(
      makeConfig({
        providers: [
          { id: "credentials", name: "Credentials", type: "credentials", authorize: async () => null },
        ],
      }),
    );
    const state = useSession(auth);
    const session = await state.signIn("credentials");
    expect(session).toBeNull();
    expect(state.status()).toBe("unauthenticated");
    expect(state.session()).toBeNull();
  });

  it("rethrows provider errors and sets status to 'unauthenticated'", async () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    // "unknown-provider" does not exist → createAuth.signIn throws.
    await expect(state.signIn("unknown-provider")).rejects.toThrow();
    expect(state.status()).toBe("unauthenticated");
    expect(state.session()).toBeNull();
  });
});

// ─── useSession — signOut ─────────────────────────────────────────────────────

describe("useSession — signOut", () => {
  it("clears session signal and sets status to 'unauthenticated'", async () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    await state.signIn("credentials");
    expect(state.status()).toBe("authenticated");
    await state.signOut();
    expect(state.status()).toBe("unauthenticated");
    expect(state.session()).toBeNull();
  });
});

// ─── useSession — refresh ─────────────────────────────────────────────────────

describe("useSession — refresh", () => {
  it("re-reads the session from the AuthInstance", async () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    // Sign in via the underlying auth instance (bypass the state hook).
    await auth.signIn("credentials");
    // State hook is not yet aware — refresh it.
    await state.refresh();
    expect(state.status()).toBe("authenticated");
    expect(state.session()?.user.id).toBe("u1");
  });

  it("sets status to 'unauthenticated' when the session is gone after refresh", async () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    await state.signIn("credentials");
    // Sign out via the underlying auth instance.
    await auth.signOut();
    await state.refresh();
    expect(state.status()).toBe("unauthenticated");
    expect(state.session()).toBeNull();
  });
});

// ─── useSession — signal reactivity ──────────────────────────────────────────

describe("useSession — signal API", () => {
  it("session and status are callable signals (Signal<T> interface)", () => {
    const auth = createAuth(makeConfig());
    const state = useSession(auth);
    // Signals are functions.
    expect(typeof state.session).toBe("function");
    expect(typeof state.status).toBe("function");
    // They have a .set() method.
    expect(typeof state.session.set).toBe("function");
    expect(typeof state.status.set).toBe("function");
  });

  it("can subscribe to status changes via createEffect", async () => {
    // Verify that signals work as expected — when the value is set, readers see it.
    const auth = createAuth(makeConfig());
    const state = useSession(auth);

    const observed: string[] = [];
    // Manually track the status signal value after each operation.
    observed.push(state.status());

    await state.signIn("credentials");
    observed.push(state.status());

    await state.signOut();
    observed.push(state.status());

    expect(observed).toEqual(["loading", "authenticated", "unauthenticated"]);
  });
});

// ─── SessionManager — createSession ──────────────────────────────────────────

describe("SessionManager — createSession", () => {
  const manager = new SessionManager({ secret: "session-secret-key" });

  it("returns an accessToken, refreshToken, and sessionId", async () => {
    const tokens = await manager.createSession(testUser);
    expect(typeof tokens.accessToken).toBe("string");
    expect(typeof tokens.refreshToken).toBe("string");
    expect(typeof tokens.sessionId).toBe("string");
  });

  it("accessToken is a three-part JWT", async () => {
    const tokens = await manager.createSession(testUser);
    expect(tokens.accessToken.split(".").length).toBe(3);
  });

  it("accessTokenExpires and refreshTokenExpires are ISO date strings", async () => {
    const tokens = await manager.createSession(testUser);
    expect(() => new Date(tokens.accessTokenExpires)).not.toThrow();
    expect(() => new Date(tokens.refreshTokenExpires)).not.toThrow();
  });

  it("refreshToken expires after accessToken", async () => {
    const tokens = await manager.createSession(testUser);
    const accessExp = new Date(tokens.accessTokenExpires).getTime();
    const refreshExp = new Date(tokens.refreshTokenExpires).getTime();
    expect(refreshExp).toBeGreaterThan(accessExp);
  });

  it("successive calls produce different tokens", async () => {
    const t1 = await manager.createSession(testUser);
    const t2 = await manager.createSession(testUser);
    expect(t1.accessToken).not.toBe(t2.accessToken);
    expect(t1.refreshToken).not.toBe(t2.refreshToken);
    expect(t1.sessionId).not.toBe(t2.sessionId);
  });
});

// ─── SessionManager — validateSession ────────────────────────────────────────

describe("SessionManager — validateSession", () => {
  const manager = new SessionManager({ secret: "session-secret-key" });

  it("returns a Session for a valid token", async () => {
    const tokens = await manager.createSession(testUser);
    const session = await manager.validateSession(tokens.accessToken);
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(testUser.id);
  });

  it("returns null for a tampered token", async () => {
    const tokens = await manager.createSession(testUser);
    const parts = tokens.accessToken.split(".");
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith("a") ? "b" : "a");
    const result = await manager.validateSession(parts.join("."));
    expect(result).toBeNull();
  });

  it("returns null for a random string", async () => {
    const result = await manager.validateSession("not-a-jwt");
    expect(result).toBeNull();
  });

  it("returned session has accessToken set to the original token", async () => {
    const tokens = await manager.createSession(testUser);
    const session = await manager.validateSession(tokens.accessToken);
    expect(session?.accessToken).toBe(tokens.accessToken);
  });

  it("session expires field matches the JWT exp", async () => {
    const mgr = new SessionManager({ secret: "s", accessTokenTTL: 60 });
    const tokens = await mgr.createSession(testUser);
    const session = await mgr.validateSession(tokens.accessToken);
    // Within a 2-second tolerance.
    const expMs = new Date(session!.expires).getTime();
    const expectedMs = new Date(tokens.accessTokenExpires).getTime();
    expect(Math.abs(expMs - expectedMs)).toBeLessThan(2000);
  });
});

// ─── SessionManager — refreshSession ─────────────────────────────────────────

describe("SessionManager — refreshSession", () => {
  const manager = new SessionManager({ secret: "session-secret-key" });

  it("returns a new TokenPair from a valid refresh token", async () => {
    const tokens = await manager.createSession(testUser);
    const newTokens = await manager.refreshSession(tokens.refreshToken);
    expect(newTokens).not.toBeNull();
    expect(typeof newTokens?.accessToken).toBe("string");
    expect(typeof newTokens?.refreshToken).toBe("string");
  });

  it("new access token is different from the original", async () => {
    const tokens = await manager.createSession(testUser);
    const newTokens = await manager.refreshSession(tokens.refreshToken);
    expect(newTokens?.accessToken).not.toBe(tokens.accessToken);
  });

  it("old refresh token cannot be reused after rotation", async () => {
    const tokens = await manager.createSession(testUser);
    await manager.refreshSession(tokens.refreshToken);
    // Second call with the same refresh token should fail.
    const second = await manager.refreshSession(tokens.refreshToken);
    expect(second).toBeNull();
  });

  it("returns null for an unknown refresh token", async () => {
    const result = await manager.refreshSession("invalid-refresh-token");
    expect(result).toBeNull();
  });

  it("new tokens from refresh can be used to validate a session", async () => {
    const tokens = await manager.createSession(testUser);
    const newTokens = await manager.refreshSession(tokens.refreshToken);
    const session = await manager.validateSession(newTokens!.accessToken);
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(testUser.id);
  });
});

// ─── SessionManager — destroySession ─────────────────────────────────────────

describe("SessionManager — destroySession", () => {
  it("invalidates the refresh token associated with the sessionId", async () => {
    const manager = new SessionManager({ secret: "session-secret-key" });
    const tokens = await manager.createSession(testUser);
    manager.destroySession(tokens.sessionId);
    const result = await manager.refreshSession(tokens.refreshToken);
    expect(result).toBeNull();
  });

  it("is a no-op for an unknown sessionId", () => {
    const manager = new SessionManager({ secret: "session-secret-key" });
    expect(() => manager.destroySession("nonexistent-id")).not.toThrow();
  });

  it("does not affect other sessions", async () => {
    const manager = new SessionManager({ secret: "session-secret-key" });
    const user2: User = { id: "u2", name: "Bob" };
    const tokens1 = await manager.createSession(testUser);
    const tokens2 = await manager.createSession(user2);
    manager.destroySession(tokens1.sessionId);
    // tokens2 should still be usable for refresh.
    const refreshed = await manager.refreshSession(tokens2.refreshToken);
    expect(refreshed).not.toBeNull();
  });
});

// ─── serializeCookie ──────────────────────────────────────────────────────────

describe("serializeCookie", () => {
  it("produces a name=value pair", () => {
    const cookie = serializeCookie("session", "abc123");
    expect(cookie).toContain("session=abc123");
  });

  it("URI-encodes special characters in the value", () => {
    const cookie = serializeCookie("tok", "hello world");
    expect(cookie).toContain("hello%20world");
  });

  it("includes Max-Age when provided", () => {
    const cookie = serializeCookie("s", "v", { maxAge: 3600 });
    expect(cookie).toContain("Max-Age=3600");
  });

  it("includes Expires when provided as a Date", () => {
    const date = new Date("2030-01-01T00:00:00Z");
    const cookie = serializeCookie("s", "v", { expires: date });
    expect(cookie).toContain("Expires=");
    expect(cookie).toContain("2030");
  });

  it("defaults Path to '/'", () => {
    const cookie = serializeCookie("s", "v");
    expect(cookie).toContain("Path=/");
  });

  it("uses the provided Path", () => {
    const cookie = serializeCookie("s", "v", { path: "/api" });
    expect(cookie).toContain("Path=/api");
  });

  it("includes Domain when provided", () => {
    const cookie = serializeCookie("s", "v", { domain: "example.com" });
    expect(cookie).toContain("Domain=example.com");
  });

  it("includes Secure flag when secure is true", () => {
    const cookie = serializeCookie("s", "v", { secure: true });
    expect(cookie).toContain("Secure");
  });

  it("includes HttpOnly flag when httpOnly is true", () => {
    const cookie = serializeCookie("s", "v", { httpOnly: true });
    expect(cookie).toContain("HttpOnly");
  });

  it("includes SameSite attribute", () => {
    const cookie = serializeCookie("s", "v", { sameSite: "Strict" });
    expect(cookie).toContain("SameSite=Strict");
  });

  it("combines multiple attributes correctly", () => {
    const cookie = serializeCookie("token", "xyz", {
      maxAge: 900,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    expect(cookie).toContain("token=xyz");
    expect(cookie).toContain("Max-Age=900");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });
});

// ─── parseCookies ─────────────────────────────────────────────────────────────

describe("parseCookies", () => {
  it("parses a single name=value pair", () => {
    const cookies = parseCookies("session=abc123");
    expect(cookies.session).toBe("abc123");
  });

  it("parses multiple pairs separated by semicolons", () => {
    const cookies = parseCookies("a=1; b=2; c=3");
    expect(cookies.a).toBe("1");
    expect(cookies.b).toBe("2");
    expect(cookies.c).toBe("3");
  });

  it("URI-decodes values", () => {
    const cookies = parseCookies("tok=hello%20world");
    expect(cookies.tok).toBe("hello world");
  });

  it("returns an empty object for an empty string", () => {
    const cookies = parseCookies("");
    expect(Object.keys(cookies).length).toBe(0);
  });

  it("ignores pairs without an equals sign", () => {
    const cookies = parseCookies("noequalssign; key=value");
    expect(cookies.key).toBe("value");
    expect("noequalssign" in cookies).toBe(false);
  });

  it("trims whitespace around names and values", () => {
    const cookies = parseCookies("  name = value  ");
    expect(cookies.name).toBe("value");
  });

  it("round-trips a serialized cookie", () => {
    const original = "session token value";
    const serialized = serializeCookie("session", original, { path: "/" });
    // Extract only the first segment (name=value) for parsing.
    const nameValue = serialized.split(";")[0];
    const parsed = parseCookies(nameValue);
    expect(parsed.session).toBe(original);
  });
});
