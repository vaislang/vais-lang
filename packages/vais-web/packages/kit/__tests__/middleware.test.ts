import { describe, it, expect } from "vitest";
import { Next } from "../src/types.js";
import { runMiddlewareChain } from "../src/middleware/runner.js";
import type { MiddlewareDefinition, MiddlewareContext } from "../src/middleware/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path = "/test"): Request {
  return new Request(`http://localhost${path}`);
}

function makeUrl(path = "/test"): URL {
  return new URL(`http://localhost${path}`);
}

function makePassthrough(path = "/mw"): MiddlewareDefinition {
  return {
    path,
    handler: async (_ctx: MiddlewareContext) => Next,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runMiddlewareChain", () => {
  it("returns completed=true with empty locals when no middleware provided", async () => {
    const result = await runMiddlewareChain({
      middleware: [],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(result.completed).toBe(true);
    expect(result.locals).toEqual({});
    expect(result.response).toBeUndefined();
  });

  it("executes a single passthrough middleware and returns completed=true", async () => {
    const result = await runMiddlewareChain({
      middleware: [makePassthrough("/app/middleware.vais")],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(result.completed).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it("executes multiple passthrough middleware in order and returns completed=true", async () => {
    const order: number[] = [];
    const mw1: MiddlewareDefinition = {
      path: "/mw1",
      handler: async (_ctx) => { order.push(1); return Next; },
    };
    const mw2: MiddlewareDefinition = {
      path: "/mw2",
      handler: async (_ctx) => { order.push(2); return Next; },
    };
    const mw3: MiddlewareDefinition = {
      path: "/mw3",
      handler: async (_ctx) => { order.push(3); return Next; },
    };

    const result = await runMiddlewareChain({
      middleware: [mw1, mw2, mw3],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(result.completed).toBe(true);
    expect(order).toEqual([1, 2, 3]);
  });

  it("interrupts chain when a middleware returns a Response", async () => {
    const order: number[] = [];
    const redirectResponse = Response.redirect("http://localhost/login", 302);
    const mw1: MiddlewareDefinition = {
      path: "/mw1",
      handler: async (_ctx) => { order.push(1); return Next; },
    };
    const mwAuth: MiddlewareDefinition = {
      path: "/mwAuth",
      handler: async (_ctx) => { order.push(2); return redirectResponse; },
    };
    const mw3: MiddlewareDefinition = {
      path: "/mw3",
      handler: async (_ctx) => { order.push(3); return Next; },
    };

    const result = await runMiddlewareChain({
      middleware: [mw1, mwAuth, mw3],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(result.completed).toBe(false);
    expect(result.response).toBe(redirectResponse);
    expect(order).toEqual([1, 2]); // mw3 should NOT be executed
  });

  it("shares locals object across middleware chain", async () => {
    const mw1: MiddlewareDefinition = {
      path: "/mw1",
      handler: async (ctx) => {
        ctx.locals.userId = "user-123";
        ctx.locals.role = "admin";
        return Next;
      },
    };
    const mw2: MiddlewareDefinition = {
      path: "/mw2",
      handler: async (ctx) => {
        ctx.locals.timestamp = Date.now();
        return Next;
      },
    };

    const result = await runMiddlewareChain({
      middleware: [mw1, mw2],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(result.completed).toBe(true);
    expect(result.locals.userId).toBe("user-123");
    expect(result.locals.role).toBe("admin");
    expect(typeof result.locals.timestamp).toBe("number");
  });

  it("returns 500 Response when middleware throws an error", async () => {
    const mwError: MiddlewareDefinition = {
      path: "/mwError",
      handler: async (_ctx) => {
        throw new Error("Something went wrong");
      },
    };

    const result = await runMiddlewareChain({
      middleware: [mwError],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(result.completed).toBe(false);
    expect(result.response).toBeDefined();
    expect(result.response?.status).toBe(500);
  });

  it("does not execute subsequent middleware after an error", async () => {
    const order: number[] = [];
    const mwError: MiddlewareDefinition = {
      path: "/mwError",
      handler: async (_ctx) => {
        order.push(1);
        throw new Error("Boom");
      },
    };
    const mwAfter: MiddlewareDefinition = {
      path: "/mwAfter",
      handler: async (_ctx) => { order.push(2); return Next; },
    };

    await runMiddlewareChain({
      middleware: [mwError, mwAfter],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(order).toEqual([1]);
  });

  it("passes request, url, and params to each middleware context", async () => {
    const capturedContexts: MiddlewareContext[] = [];
    const request = makeRequest("/blog/hello");
    const url = makeUrl("/blog/hello");
    const params = { slug: "hello" };

    const mw: MiddlewareDefinition = {
      path: "/mw",
      handler: async (ctx) => {
        capturedContexts.push({ ...ctx, locals: { ...ctx.locals } });
        return Next;
      },
    };

    await runMiddlewareChain({
      middleware: [mw],
      request,
      url,
      params,
    });

    expect(capturedContexts).toHaveLength(1);
    expect(capturedContexts[0].request).toBe(request);
    expect(capturedContexts[0].url).toBe(url);
    expect(capturedContexts[0].params).toEqual({ slug: "hello" });
  });

  it("supports synchronous middleware returning Next directly", async () => {
    const syncMw: MiddlewareDefinition = {
      path: "/syncMw",
      handler: (_ctx: MiddlewareContext) => Next,
    };

    const result = await runMiddlewareChain({
      middleware: [syncMw],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(result.completed).toBe(true);
  });

  it("supports synchronous middleware returning a Response directly", async () => {
    const forbiddenResponse = new Response("Forbidden", { status: 403 });
    const syncMw: MiddlewareDefinition = {
      path: "/syncMw",
      handler: (_ctx: MiddlewareContext) => forbiddenResponse,
    };

    const result = await runMiddlewareChain({
      middleware: [syncMw],
      request: makeRequest(),
      url: makeUrl(),
      params: {},
    });

    expect(result.completed).toBe(false);
    expect(result.response).toBe(forbiddenResponse);
    expect(result.response?.status).toBe(403);
  });
});
