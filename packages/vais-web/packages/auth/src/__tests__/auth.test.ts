/**
 * @vaisx/auth — createAuth tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuth } from "../auth.js";
import type { AuthConfig, User, Provider } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const testUser: User = { id: "u1", name: "Alice", email: "alice@example.com" };

function credentialsProvider(authorize?: Provider["authorize"]): Provider {
  return {
    id: "credentials",
    name: "Credentials",
    type: "credentials",
    authorize: authorize ?? (async () => testUser),
  };
}

function makeConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return {
    providers: [credentialsProvider()],
    session: { strategy: "jwt", maxAge: 3600 },
    ...overrides,
  };
}

// ─── createAuth — basic construction ─────────────────────────────────────────

describe("createAuth — basic construction", () => {
  it("returns an AuthInstance with the expected API surface", () => {
    const auth = createAuth(makeConfig());
    expect(typeof auth.signIn).toBe("function");
    expect(typeof auth.signOut).toBe("function");
    expect(typeof auth.getSession).toBe("function");
    expect(typeof auth.callbacks).toBe("function");
  });

  it("exposes the config on the instance", () => {
    const config = makeConfig();
    const auth = createAuth(config);
    expect(auth.config).toBe(config);
  });

  it("throws when no providers are supplied", () => {
    expect(() =>
      createAuth({ providers: [], session: { strategy: "jwt" } }),
    ).toThrow("[createAuth] At least one provider must be specified.");
  });
});

// ─── signIn — credentials provider ───────────────────────────────────────────

describe("createAuth — signIn (credentials)", () => {
  it("returns a Session on successful credentials sign-in", async () => {
    const auth = createAuth(makeConfig());
    const session = await auth.signIn("credentials", { username: "alice", password: "secret" });
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe("u1");
    expect(session?.user.name).toBe("Alice");
  });

  it("session has an expires timestamp in the future", async () => {
    const auth = createAuth(makeConfig());
    const session = await auth.signIn("credentials");
    expect(session).not.toBeNull();
    const expires = new Date(session!.expires).getTime();
    expect(expires).toBeGreaterThan(Date.now());
  });

  it("returns null when authorize() returns null", async () => {
    const auth = createAuth(
      makeConfig({
        providers: [credentialsProvider(async () => null)],
      }),
    );
    const session = await auth.signIn("credentials");
    expect(session).toBeNull();
  });

  it("throws for an unknown provider id", async () => {
    const auth = createAuth(makeConfig());
    await expect(auth.signIn("github")).rejects.toThrow(
      '[createAuth] Unknown provider: "github"',
    );
  });

  it("credentials provider without authorize() throws", async () => {
    const auth = createAuth(
      makeConfig({
        providers: [{ id: "credentials", name: "Credentials", type: "credentials" }],
      }),
    );
    await expect(auth.signIn("credentials")).rejects.toThrow(
      "must implement authorize()",
    );
  });
});

// ─── getSession ───────────────────────────────────────────────────────────────

describe("createAuth — getSession", () => {
  it("returns null before sign-in", async () => {
    const auth = createAuth(makeConfig());
    expect(await auth.getSession()).toBeNull();
  });

  it("returns the session after sign-in", async () => {
    const auth = createAuth(makeConfig());
    await auth.signIn("credentials");
    const session = await auth.getSession();
    expect(session?.user.id).toBe("u1");
  });

  it("returns null after sign-out", async () => {
    const auth = createAuth(makeConfig());
    await auth.signIn("credentials");
    await auth.signOut();
    expect(await auth.getSession()).toBeNull();
  });

  it("returns null when the session is expired", async () => {
    // Create auth with -1s maxAge so the session is immediately expired.
    const auth = createAuth(
      makeConfig({ session: { strategy: "jwt", maxAge: -1 } }),
    );
    await auth.signIn("credentials");
    expect(await auth.getSession()).toBeNull();
  });
});

// ─── signOut ──────────────────────────────────────────────────────────────────

describe("createAuth — signOut", () => {
  it("clears the session", async () => {
    const auth = createAuth(makeConfig());
    await auth.signIn("credentials");
    expect(await auth.getSession()).not.toBeNull();
    await auth.signOut();
    expect(await auth.getSession()).toBeNull();
  });
});

// ─── callbacks ────────────────────────────────────────────────────────────────

describe("createAuth — callbacks", () => {
  it("signIn callback can deny the sign-in by returning false", async () => {
    const auth = createAuth(makeConfig());
    auth.callbacks({ signIn: async () => false });
    const session = await auth.signIn("credentials");
    expect(session).toBeNull();
  });

  it("signIn callback fires with user and provider", async () => {
    const auth = createAuth(makeConfig());
    const spy = vi.fn(async () => true);
    auth.callbacks({ signIn: spy });
    await auth.signIn("credentials");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0].user.id).toBe("u1");
    expect(spy.mock.calls[0][0].provider.id).toBe("credentials");
  });

  it("session callback can enrich the session object", async () => {
    const auth = createAuth(makeConfig());
    auth.callbacks({
      session: async ({ session, user }) => ({
        ...session,
        accessToken: `tok_${user.id}`,
      }),
    });
    const session = await auth.signIn("credentials");
    expect(session?.accessToken).toBe("tok_u1");
  });

  it("jwt callback fires and its token is used in the flow", async () => {
    const auth = createAuth(makeConfig());
    const jwtSpy = vi.fn(async ({ token }) => ({ ...token, custom: "data" }));
    auth.callbacks({ jwt: jwtSpy });
    await auth.signIn("credentials");
    expect(jwtSpy).toHaveBeenCalledOnce();
  });

  it("multiple callbacks can be registered via repeated calls", async () => {
    const auth = createAuth(makeConfig());
    const signInSpy = vi.fn(async () => true);
    auth.callbacks({ signIn: signInSpy });
    auth.callbacks({ session: async ({ session }) => session });
    await auth.signIn("credentials");
    expect(signInSpy).toHaveBeenCalled();
  });
});
