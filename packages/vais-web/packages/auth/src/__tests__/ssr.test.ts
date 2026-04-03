/**
 * @vaisx/auth — SSR utility tests
 *
 * Covers:
 *  - getServerSession (cookie header, Authorization header, cookies object)
 *  - createAuthScript (serialisation, XSS escaping)
 *  - hydrateSession (client-side hydration)
 *  - createSSRAuthContext (request-scoped store)
 *  - withAuth (handler wrapper)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuth } from "../auth.js";
import { encodeJWT } from "../jwt.js";
import { serializeCookie } from "../session.js";
import {
  getServerSession,
  createAuthScript,
  hydrateSession,
  createSSRAuthContext,
  withAuth,
  SESSION_COOKIE_NAME,
  HYDRATION_KEY,
} from "../ssr.js";
import type { AuthConfig, User, Session } from "../types.js";
import type { SSRRequest } from "../ssr.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-secret-for-ssr-tests";

const testUser: User = { id: "ssr-u1", name: "Alice SSR", email: "alice@ssr.test" };

function makeAuthConfig(overrides?: Partial<AuthConfig>): AuthConfig {
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
    secret: TEST_SECRET,
    ...overrides,
  };
}

function makeAuth(overrides?: Partial<AuthConfig>) {
  return createAuth(makeAuthConfig(overrides));
}

/**
 * Build a minimal SSRRequest from raw header pairs.
 */
function makeRequest(headers: Record<string, string>, extra?: Partial<SSRRequest>): SSRRequest {
  return {
    headers: {
      get(name: string): string | null {
        const lc = name.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === lc) return v;
        }
        return null;
      },
    },
    ...extra,
  };
}

/**
 * Encode a JWT using the test secret and return it.
 */
async function makeToken(user: User, expiresIn = 3600): Promise<string> {
  return encodeJWT(
    { sub: user.id, data: { name: user.name, email: user.email, image: user.image } },
    TEST_SECRET,
    { expiresIn },
  );
}

// ─── getServerSession — Cookie header ────────────────────────────────────────

describe("getServerSession — Cookie header", () => {
  it("returns a Session when the cookie carries a valid JWT", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const cookieHeader = `${SESSION_COOKIE_NAME}=${token}`;
    const req = makeRequest({ cookie: cookieHeader });
    const session = await getServerSession(req, auth);
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(testUser.id);
  });

  it("returns null for an expired JWT in the cookie", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser, -1); // already expired
    const cookieHeader = `${SESSION_COOKIE_NAME}=${token}`;
    const req = makeRequest({ cookie: cookieHeader });
    const session = await getServerSession(req, auth);
    expect(session).toBeNull();
  });

  it("returns null when the cookie value is a malformed string", async () => {
    const auth = makeAuth();
    const req = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=not.a.jwt` });
    const session = await getServerSession(req, auth);
    expect(session).toBeNull();
  });

  it("ignores unrelated cookies and returns null when session cookie is absent", async () => {
    const auth = makeAuth();
    const req = makeRequest({ cookie: "other_cookie=some_value" });
    const session = await getServerSession(req, auth);
    expect(session).toBeNull();
  });

  it("parses the Cookie header case-insensitively", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req = makeRequest({ Cookie: `${SESSION_COOKIE_NAME}=${token}` });
    const session = await getServerSession(req, auth);
    expect(session).not.toBeNull();
  });
});

// ─── getServerSession — Authorization header ──────────────────────────────────

describe("getServerSession — Authorization header", () => {
  it("returns a Session from a valid Bearer token", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req = makeRequest({ authorization: `Bearer ${token}` });
    const session = await getServerSession(req, auth);
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(testUser.id);
  });

  it("returns null for an expired Bearer token", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser, -1);
    const req = makeRequest({ authorization: `Bearer ${token}` });
    const session = await getServerSession(req, auth);
    expect(session).toBeNull();
  });

  it("returns null when Authorization header has no Bearer prefix", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req = makeRequest({ authorization: `Basic ${token}` });
    const session = await getServerSession(req, auth);
    expect(session).toBeNull();
  });
});

// ─── getServerSession — adapter cookies object ────────────────────────────────

describe("getServerSession — request.cookies adapter", () => {
  it("reads from a plain Record<string, string> cookies object", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req: SSRRequest = {
      headers: { get: () => null },
      cookies: { [SESSION_COOKIE_NAME]: token },
    };
    const session = await getServerSession(req, auth);
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(testUser.id);
  });

  it("reads from a Next.js-style cookies.get() API", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req: SSRRequest = {
      headers: { get: () => null },
      cookies: {
        get(name: string) {
          if (name === SESSION_COOKIE_NAME) return { value: token };
          return undefined;
        },
      },
    };
    const session = await getServerSession(req, auth);
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(testUser.id);
  });

  it("returns null when auth config has no secret", async () => {
    const auth = makeAuth({ secret: undefined });
    const token = await makeToken(testUser);
    const req = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` });
    const session = await getServerSession(req, auth);
    expect(session).toBeNull();
  });
});

// ─── getServerSession — session shape ────────────────────────────────────────

describe("getServerSession — returned session shape", () => {
  it("session.user contains id from JWT sub", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` });
    const session = await getServerSession(req, auth);
    expect(session?.user.id).toBe(testUser.id);
  });

  it("session.expires is a valid ISO date string in the future", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` });
    const session = await getServerSession(req, auth);
    const exp = new Date(session!.expires).getTime();
    expect(exp).toBeGreaterThan(Date.now());
  });

  it("session.accessToken is set to the original token string", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` });
    const session = await getServerSession(req, auth);
    expect(session?.accessToken).toBe(token);
  });
});

// ─── createAuthScript ────────────────────────────────────────────────────────

describe("createAuthScript", () => {
  it("returns a <script> tag string", () => {
    const script = createAuthScript(null);
    expect(script).toMatch(/^<script>/);
    expect(script).toMatch(/<\/script>$/);
  });

  it("injects window.__VAISX_AUTH__ into the script", () => {
    const script = createAuthScript(null);
    expect(script).toContain(`window.${HYDRATION_KEY}`);
  });

  it("serialises a null session as null in the payload", () => {
    const script = createAuthScript(null);
    // Quotes are unicode-escaped; check for the escaped form of "session":null
    expect(script).toContain("\\u0022session\\u0022:null");
  });

  it("serialises a session object into the payload", async () => {
    const session: Session = {
      user: testUser,
      expires: new Date(Date.now() + 3600_000).toISOString(),
      accessToken: "tok_abc",
    };
    const script = createAuthScript(session);
    expect(script).toContain(testUser.id);
    expect(script).toContain(testUser.email!);
  });

  it("escapes '<' to prevent script injection via JSON content", () => {
    const session: Session = {
      user: { id: "x", name: "<script>evil()</script>" },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    };
    const script = createAuthScript(session);
    // The raw '<' and '>' characters must not appear unescaped.
    // We allow the outer <script> tags themselves, so we check the inner JSON.
    const innerContent = script.slice("<script>".length, script.length - "</script>".length);
    expect(innerContent).not.toContain("<script>");
    expect(innerContent).not.toContain("</script>");
  });

  it("escapes '&' characters to prevent HTML entity injection", () => {
    const session: Session = {
      user: { id: "1", name: "a & b" },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    };
    const script = createAuthScript(session);
    const innerContent = script.slice("<script>".length, script.length - "</script>".length);
    expect(innerContent).not.toContain("&");
  });

  it("the injected payload can be parsed back after unescaping", () => {
    const session: Session = {
      user: testUser,
      expires: new Date(Date.now() + 3600_000).toISOString(),
    };
    const script = createAuthScript(session);
    // Extract the JSON literal from the assignment expression.
    const match = script.match(/window\.__VAISX_AUTH__=(.*);/);
    expect(match).not.toBeNull();
    // Unescape unicode escapes so we can JSON.parse it.
    const unescaped = match![1].replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    const payload = JSON.parse(unescaped);
    expect(payload.session.user.id).toBe(testUser.id);
  });
});

// ─── hydrateSession ──────────────────────────────────────────────────────────

describe("hydrateSession", () => {
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    // Save original window (may be undefined in Node)
    originalWindow = typeof window !== "undefined" ? window : undefined;
  });

  afterEach(() => {
    // Clean up the global mock
    if (typeof globalThis !== "undefined") {
      delete (globalThis as Record<string, unknown>)[HYDRATION_KEY];
    }
  });

  it("is a no-op when window is not defined (SSR environment)", async () => {
    // In Vitest (Node), window may or may not exist. We simulate SSR by
    // temporarily hiding it.
    const origWindow = (globalThis as Record<string, unknown>).window;
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const auth = makeAuth();
    await expect(hydrateSession(auth)).resolves.toBeUndefined();

    Object.defineProperty(globalThis, "window", {
      value: origWindow,
      configurable: true,
      writable: true,
    });
  });

  it("hydrates the AuthInstance with the session from window.__VAISX_AUTH__", async () => {
    const hydrationSession: Session = {
      user: testUser,
      expires: new Date(Date.now() + 3600_000).toISOString(),
    };

    // Simulate the browser environment.
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>)[HYDRATION_KEY] = {
      session: hydrationSession,
    };

    const auth = makeAuth();
    await hydrateSession(auth);

    const session = await auth.getSession();
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(testUser.id);

    // Cleanup
    delete (globalThis as Record<string, unknown>)[HYDRATION_KEY];
    delete (globalThis as Record<string, unknown>).window;
  });

  it("is a no-op when window.__VAISX_AUTH__ is absent", async () => {
    (globalThis as Record<string, unknown>).window = globalThis;
    // Ensure the key is not set
    delete (globalThis as Record<string, unknown>)[HYDRATION_KEY];

    const auth = makeAuth();
    await hydrateSession(auth);

    const session = await auth.getSession();
    expect(session).toBeNull();

    delete (globalThis as Record<string, unknown>).window;
  });

  it("is a no-op when session inside payload is null", async () => {
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>)[HYDRATION_KEY] = { session: null };

    const auth = makeAuth();
    await hydrateSession(auth);

    const session = await auth.getSession();
    expect(session).toBeNull();

    delete (globalThis as Record<string, unknown>)[HYDRATION_KEY];
    delete (globalThis as Record<string, unknown>).window;
  });
});

// ─── createSSRAuthContext ─────────────────────────────────────────────────────

describe("createSSRAuthContext", () => {
  it("getSession returns null initially", () => {
    const ctx = createSSRAuthContext();
    expect(ctx.getSession()).toBeNull();
  });

  it("setSession stores the session and getSession retrieves it", () => {
    const ctx = createSSRAuthContext();
    const session: Session = {
      user: testUser,
      expires: new Date(Date.now() + 3600_000).toISOString(),
    };
    ctx.setSession(session);
    expect(ctx.getSession()).toBe(session);
  });

  it("setSession(null) clears a previously stored session", () => {
    const ctx = createSSRAuthContext();
    const session: Session = {
      user: testUser,
      expires: new Date(Date.now() + 3600_000).toISOString(),
    };
    ctx.setSession(session);
    ctx.setSession(null);
    expect(ctx.getSession()).toBeNull();
  });

  it("each call to createSSRAuthContext returns an independent context", () => {
    const ctx1 = createSSRAuthContext();
    const ctx2 = createSSRAuthContext();

    const session: Session = {
      user: testUser,
      expires: new Date(Date.now() + 3600_000).toISOString(),
    };
    ctx1.setSession(session);

    expect(ctx1.getSession()).not.toBeNull();
    expect(ctx2.getSession()).toBeNull();
  });
});

// ─── withAuth ────────────────────────────────────────────────────────────────

describe("withAuth", () => {
  it("passes null session to the handler when no auth cookie is present", async () => {
    const auth = makeAuth();
    const handler = vi.fn(async (_req: SSRRequest, session: Session | null) => session);
    const wrapped = withAuth(handler, auth);

    const req = makeRequest({});
    const result = await wrapped(req);

    expect(handler).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  it("passes the resolved session to the handler when a valid cookie is present", async () => {
    const auth = makeAuth();
    const token = await makeToken(testUser);
    const req = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=${token}` });

    let capturedSession: Session | null = null;
    const handler = vi.fn(async (_req: SSRRequest, session: Session | null) => {
      capturedSession = session;
      return session;
    });

    const wrapped = withAuth(handler, auth);
    await wrapped(req);

    expect(capturedSession).not.toBeNull();
    expect(capturedSession?.user.id).toBe(testUser.id);
  });

  it("calls the underlying handler exactly once per request", async () => {
    const auth = makeAuth();
    const handler = vi.fn(async () => "response");
    const wrapped = withAuth(handler, auth);

    await wrapped(makeRequest({}));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns the handler's return value", async () => {
    const auth = makeAuth();
    const wrapped = withAuth(async () => 42, auth);
    const result = await wrapped(makeRequest({}));
    expect(result).toBe(42);
  });

  it("forwards the original request to the handler unchanged", async () => {
    const auth = makeAuth();
    let capturedReq: SSRRequest | null = null;

    const handler = vi.fn(async (req: SSRRequest) => {
      capturedReq = req;
    });

    const wrapped = withAuth(handler, auth);
    const req = makeRequest({});
    await wrapped(req);

    expect(capturedReq).toBe(req);
  });
});
