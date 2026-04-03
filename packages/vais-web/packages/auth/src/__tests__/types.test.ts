/**
 * @vaisx/auth — type shape tests
 *
 * These tests verify that the exported types have the correct structural
 * shapes at runtime (where applicable) and that TypeScript is happy with
 * values constructed according to the interface contracts.
 */

import { describe, it, expect } from "vitest";
import type {
  User,
  Session,
  AuthState,
  SessionConfig,
  Provider,
  OAuthProvider,
  AuthConfig,
  AuthPages,
  Middleware,
} from "../types.js";

// ─── User ─────────────────────────────────────────────────────────────────────

describe("User type", () => {
  it("accepts a minimal User with only id", () => {
    const user: User = { id: "u1" };
    expect(user.id).toBe("u1");
    expect(user.name).toBeUndefined();
    expect(user.email).toBeUndefined();
    expect(user.image).toBeUndefined();
  });

  it("accepts a fully-populated User", () => {
    const user: User = {
      id: "u2",
      name: "Alice",
      email: "alice@example.com",
      image: "https://example.com/avatar.png",
    };
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
    expect(user.image).toBe("https://example.com/avatar.png");
  });
});

// ─── Session ──────────────────────────────────────────────────────────────────

describe("Session type", () => {
  it("accepts a Session without an accessToken", () => {
    const session: Session = {
      user: { id: "u3", name: "Bob" },
      expires: new Date(Date.now() + 86400 * 1000).toISOString(),
    };
    expect(session.user.id).toBe("u3");
    expect(session.accessToken).toBeUndefined();
  });

  it("accepts a Session with an accessToken", () => {
    const session: Session = {
      user: { id: "u4" },
      expires: new Date().toISOString(),
      accessToken: "tok_abc123",
    };
    expect(session.accessToken).toBe("tok_abc123");
  });
});

// ─── AuthState ────────────────────────────────────────────────────────────────

describe("AuthState type", () => {
  it("represents a loading state", () => {
    const state: AuthState = { session: null, status: "loading" };
    expect(state.status).toBe("loading");
    expect(state.session).toBeNull();
  });

  it("represents an authenticated state", () => {
    const state: AuthState = {
      session: { user: { id: "u5" }, expires: new Date().toISOString() },
      status: "authenticated",
    };
    expect(state.status).toBe("authenticated");
    expect(state.session?.user.id).toBe("u5");
  });

  it("represents an unauthenticated state", () => {
    const state: AuthState = { session: null, status: "unauthenticated" };
    expect(state.status).toBe("unauthenticated");
  });
});

// ─── SessionConfig ────────────────────────────────────────────────────────────

describe("SessionConfig type", () => {
  it("accepts a jwt strategy with defaults", () => {
    const cfg: SessionConfig = { strategy: "jwt" };
    expect(cfg.strategy).toBe("jwt");
    expect(cfg.maxAge).toBeUndefined();
    expect(cfg.updateAge).toBeUndefined();
  });

  it("accepts a cookie strategy with full config", () => {
    const cfg: SessionConfig = {
      strategy: "cookie",
      maxAge: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    };
    expect(cfg.strategy).toBe("cookie");
    expect(cfg.maxAge).toBe(604800);
  });
});

// ─── Provider ─────────────────────────────────────────────────────────────────

describe("Provider type", () => {
  it("accepts a minimal credentials provider", () => {
    const provider: Provider = {
      id: "credentials",
      name: "Credentials",
      type: "credentials",
      authorize: async () => null,
    };
    expect(provider.id).toBe("credentials");
    expect(provider.type).toBe("credentials");
    expect(typeof provider.authorize).toBe("function");
  });

  it("accepts an oauth provider", () => {
    const provider: OAuthProvider = {
      id: "github",
      name: "GitHub",
      type: "oauth",
      clientId: "my-client-id",
      clientSecret: "my-client-secret",
      authorization: "https://github.com/login/oauth/authorize",
      token: "https://github.com/login/oauth/access_token",
      userinfo: "https://api.github.com/user",
    };
    expect(provider.clientId).toBe("my-client-id");
    expect(provider.type).toBe("oauth");
  });
});

// ─── AuthConfig ───────────────────────────────────────────────────────────────

describe("AuthConfig type", () => {
  it("accepts a minimal config with providers and session", () => {
    const config: AuthConfig = {
      providers: [
        { id: "credentials", name: "Credentials", type: "credentials", authorize: async () => null },
      ],
      session: { strategy: "jwt" },
    };
    expect(config.providers).toHaveLength(1);
    expect(config.session.strategy).toBe("jwt");
    expect(config.pages).toBeUndefined();
  });

  it("accepts a config with custom pages", () => {
    const pages: AuthPages = {
      signIn: "/login",
      signOut: "/logout",
      error: "/auth-error",
    };
    const config: AuthConfig = {
      providers: [{ id: "credentials", name: "Credentials", type: "credentials" }],
      session: { strategy: "cookie" },
      pages,
      secret: "super-secret",
    };
    expect(config.pages?.signIn).toBe("/login");
    expect(config.secret).toBe("super-secret");
  });
});

// ─── Middleware ────────────────────────────────────────────────────────────────

describe("Middleware type", () => {
  it("protect returns false for null session", () => {
    const middleware: Middleware = {
      protect(session) {
        return session !== null;
      },
      requireRole(session, _role) {
        return session !== null;
      },
    };
    expect(middleware.protect(null)).toBe(false);
    expect(middleware.requireRole(null, "admin")).toBe(false);
  });

  it("protect returns true for a valid session", () => {
    const session: Session = {
      user: { id: "u1" },
      expires: new Date(Date.now() + 1000).toISOString(),
    };
    const middleware: Middleware = {
      protect(s) { return s !== null; },
      requireRole(s, _role) { return s !== null; },
    };
    expect(middleware.protect(session)).toBe(true);
  });
});
