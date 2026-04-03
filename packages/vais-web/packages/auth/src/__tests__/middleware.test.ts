/**
 * @vaisx/auth — AuthMiddleware tests
 *
 * Covers:
 *  - createAuthMiddleware factory
 *  - protect() — authenticated / unauthenticated paths
 *  - requireRole() — allowed / denied
 *  - requirePermission() — allowed / denied
 *  - compose() — chaining
 *  - Token extraction (Authorization header, cookie)
 *  - Redirect vs. 401 error mode
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createAuth } from "../auth.js";
import {
  createAuthMiddleware,
  createMiddlewareContext,
  compose,
} from "../middleware.js";
import type {
  AuthInstance,
  AuthConfig,
  User,
  Session,
} from "../types.js";
import type { AuthUser, MiddlewareContext } from "../middleware.js";
import { encodeJWT } from "../jwt.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseUser: User = { id: "u1", name: "Alice", email: "alice@example.com" };

const adminUser: AuthUser = {
  id: "u2",
  name: "Bob",
  email: "bob@example.com",
  roles: ["admin", "editor"],
  permissions: ["posts:write", "users:read"],
};

function makeConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return {
    providers: [
      {
        id: "credentials",
        name: "Credentials",
        type: "credentials",
        authorize: async () => baseUser,
      },
    ],
    session: { strategy: "jwt", maxAge: 3600 },
    pages: { signIn: "/auth/signin" },
    ...overrides,
  };
}

/** Create an authenticated AuthInstance (session already set). */
async function makeAuthWithSession(user: User = baseUser): Promise<AuthInstance> {
  const auth = createAuth({
    providers: [
      {
        id: "credentials",
        name: "Credentials",
        type: "credentials",
        authorize: async () => user,
      },
    ],
    session: { strategy: "jwt", maxAge: 3600 },
    pages: { signIn: "/auth/signin" },
  });
  await auth.signIn("credentials");
  return auth;
}

/** Build a MiddlewareContext with an Authorization Bearer header. */
function bearerContext(token: string, url = "https://example.com/dashboard"): MiddlewareContext {
  return createMiddlewareContext(url, {
    authorization: `Bearer ${token}`,
  });
}

/** Build a MiddlewareContext with a session-token cookie. */
function cookieContext(token: string, url = "https://example.com/dashboard"): MiddlewareContext {
  return createMiddlewareContext(url, {
    cookie: `session-token=${encodeURIComponent(token)}`,
  });
}

/** Build a MiddlewareContext with no auth headers. */
function anonContext(url = "https://example.com/dashboard"): MiddlewareContext {
  return createMiddlewareContext(url, {});
}

/** Create a valid JWT for the given user (signed with "test-secret"). */
async function makeJWT(user: AuthUser, secret = "test-secret"): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return encodeJWT(
    {
      sub: user.id,
      data: {
        name: user.name,
        email: user.email,
        image: user.image,
        roles: user.roles,
        permissions: user.permissions,
      },
    },
    secret,
    { expiresIn: 3600, iat: now },
  );
}

// ─── createAuthMiddleware — factory ───────────────────────────────────────────

describe("createAuthMiddleware — factory", () => {
  it("returns an object with protect, requireRole, requirePermission", () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);

    expect(typeof middleware.protect).toBe("function");
    expect(typeof middleware.requireRole).toBe("function");
    expect(typeof middleware.requirePermission).toBe("function");
  });

  it("protect() returns a MiddlewareHandler function", () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const handler = middleware.protect();
    expect(typeof handler).toBe("function");
  });
});

// ─── protect() — authenticated requests ──────────────────────────────────────

describe("protect() — authenticated requests", () => {
  it("allows a request with a valid Bearer JWT", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    const result = await middleware.protect()(ctx);

    expect(result.allowed).toBe(true);
    expect(result.redirect).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it("populates context.session after successful Bearer auth", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);

    expect(ctx.session).not.toBeNull();
    expect(ctx.session?.user.id).toBe("u2");
  });

  it("populates context.user after successful Bearer auth", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);

    expect(ctx.user).not.toBeNull();
    expect(ctx.user?.id).toBe("u2");
  });

  it("allows a request with a valid cookie token", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = cookieContext(token);

    const result = await middleware.protect()(ctx);

    expect(result.allowed).toBe(true);
  });

  it("populates context.user.roles from JWT data", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);

    expect((ctx.user as AuthUser)?.roles).toEqual(["admin", "editor"]);
  });

  it("populates context.user.permissions from JWT data", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);

    expect((ctx.user as AuthUser)?.permissions).toEqual(["posts:write", "users:read"]);
  });

  it("allows a request via in-memory AuthInstance session (no token)", async () => {
    const auth = await makeAuthWithSession();
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext();

    const result = await middleware.protect()(ctx);

    expect(result.allowed).toBe(true);
    expect(ctx.user?.id).toBe("u1");
  });
});

// ─── protect() — unauthenticated requests ────────────────────────────────────

describe("protect() — unauthenticated requests", () => {
  it("redirects to the default sign-in page when unauthenticated", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext();

    const result = await middleware.protect()(ctx);

    expect(result.allowed).toBe(false);
    expect(result.redirect).toBe("/auth/signin");
  });

  it("redirects to a custom sign-in page from AuthConfig", async () => {
    const auth = createAuth(makeConfig({ pages: { signIn: "/login" } }));
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext();

    const result = await middleware.protect()(ctx);

    expect(result.redirect).toBe("/login");
  });

  it("redirects to a custom page supplied via options.redirectTo", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext();

    const result = await middleware.protect({ redirectTo: "/custom-login" })(ctx);

    expect(result.redirect).toBe("/custom-login");
  });

  it("returns 401 error when returnError option is true", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext();

    const result = await middleware.protect({ returnError: true })(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("Unauthorized");
    expect(result.redirect).toBeUndefined();
  });

  it("rejects an expired JWT token", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);

    // Create a token that expired 1 hour ago.
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await encodeJWT(
      { sub: "u99", data: {} },
      "test-secret",
      { iat: now - 7200, expiresIn: 3600 }, // expired 1h ago
    );

    const ctx = bearerContext(expiredToken);
    const result = await middleware.protect({ returnError: true })(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });

  it("rejects a malformed token string", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const ctx = bearerContext("not.a.valid.jwt.at.all");

    const result = await middleware.protect({ returnError: true })(ctx);

    expect(result.allowed).toBe(false);
  });

  it("falls back to /auth/signin when no pages config is set", async () => {
    const auth = createAuth({
      providers: [
        {
          id: "credentials",
          name: "Credentials",
          type: "credentials",
          authorize: async () => null,
        },
      ],
      session: { strategy: "jwt" },
      // No pages config.
    });
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext();

    const result = await middleware.protect()(ctx);

    expect(result.redirect).toBe("/auth/signin");
  });
});

// ─── requireRole() ────────────────────────────────────────────────────────────

describe("requireRole()", () => {
  it("allows access when user has the required role", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    // First run protect() to populate context.user.
    await middleware.protect()(ctx);
    const result = await middleware.requireRole(["admin"])(ctx);

    expect(result.allowed).toBe(true);
  });

  it("allows access when user has one of several required roles", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser); // has ["admin", "editor"]
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);
    const result = await middleware.requireRole(["superuser", "editor"])(ctx);

    expect(result.allowed).toBe(true);
  });

  it("denies access when user lacks all required roles", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser); // has ["admin", "editor"]
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);
    const result = await middleware.requireRole(["superuser"])(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/forbidden/i);
  });

  it("denies access when user has no roles at all", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT({ ...baseUser }); // no roles
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);
    const result = await middleware.requireRole(["admin"])(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("returns 401 when protect() was not run first", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext(); // no protect(), context.user is undefined

    const result = await middleware.requireRole(["admin"])(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });
});

// ─── requirePermission() ─────────────────────────────────────────────────────

describe("requirePermission()", () => {
  it("allows access when user has the required permission", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser); // has ["posts:write", "users:read"]
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);
    const result = await middleware.requirePermission(["posts:write"])(ctx);

    expect(result.allowed).toBe(true);
  });

  it("allows access when user has one of several required permissions", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);
    const result = await middleware.requirePermission(["posts:delete", "users:read"])(ctx);

    expect(result.allowed).toBe(true);
  });

  it("denies access when user lacks all required permissions", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);
    const result = await middleware.requirePermission(["superpower:destroy"])(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/forbidden/i);
  });

  it("denies access when user has no permissions at all", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT({ ...baseUser }); // no permissions
    const ctx = bearerContext(token);

    await middleware.protect()(ctx);
    const result = await middleware.requirePermission(["posts:write"])(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("returns 401 when protect() was not run first", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext();

    const result = await middleware.requirePermission(["posts:write"])(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });
});

// ─── compose() ────────────────────────────────────────────────────────────────

describe("compose()", () => {
  it("runs all middlewares and allows when all pass", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    const guard = compose(
      middleware.protect(),
      middleware.requireRole(["admin"]),
      middleware.requirePermission(["posts:write"]),
    );

    const result = await guard(ctx);

    expect(result.allowed).toBe(true);
  });

  it("stops at protect() and redirects when unauthenticated", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const ctx = anonContext();

    const guard = compose(
      middleware.protect(),
      middleware.requireRole(["admin"]),
    );

    const result = await guard(ctx);

    expect(result.allowed).toBe(false);
    expect(result.redirect).toBe("/auth/signin");
  });

  it("stops at requireRole() when user lacks the required role", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT({ ...baseUser, roles: ["viewer"] });
    const ctx = bearerContext(token);

    const guard = compose(
      middleware.protect(),
      middleware.requireRole(["admin"]),
    );

    const result = await guard(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("stops at requirePermission() when user lacks the permission", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT({ ...adminUser, permissions: ["posts:read"] });
    const ctx = bearerContext(token);

    const guard = compose(
      middleware.protect(),
      middleware.requirePermission(["posts:write"]),
    );

    const result = await guard(ctx);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("composes a single middleware correctly", async () => {
    const auth = createAuth(makeConfig());
    const middleware = createAuthMiddleware(auth);
    const token = await makeJWT(adminUser);
    const ctx = bearerContext(token);

    const guard = compose(middleware.protect());
    const result = await guard(ctx);

    expect(result.allowed).toBe(true);
  });

  it("returns allowed true for an empty compose call", async () => {
    const ctx = anonContext();
    const guard = compose();
    const result = await guard(ctx);
    expect(result.allowed).toBe(true);
  });
});

// ─── createMiddlewareContext helper ───────────────────────────────────────────

describe("createMiddlewareContext()", () => {
  it("creates a context with the correct URL", () => {
    const ctx = createMiddlewareContext("https://example.com/page");
    expect(ctx.request.url).toBe("https://example.com/page");
  });

  it("creates a context with custom headers", () => {
    const ctx = createMiddlewareContext("https://example.com", {
      authorization: "Bearer abc123",
    });
    expect(ctx.request.headers["authorization"]).toBe("Bearer abc123");
  });

  it("redirect() returns a MiddlewareResult with redirect and allowed=false", () => {
    const ctx = createMiddlewareContext("https://example.com");
    const result = ctx.redirect("/login");
    expect(result.allowed).toBe(false);
    expect(result.redirect).toBe("/login");
  });
});
