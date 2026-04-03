import { Next } from "../types.js";
import type { MiddlewareDefinition } from "./types.js";

export interface MiddlewareRunnerOptions {
  /** Ordered middleware list (parent → child) */
  middleware: MiddlewareDefinition[];
  /** The incoming request */
  request: Request;
  /** URL object */
  url: URL;
  /** Route params */
  params: Record<string, string | string[]>;
}

export interface MiddlewareResult {
  /** If a middleware returned a Response (interrupt) */
  response?: Response;
  /** If all middleware passed (Next) — accumulated locals */
  locals: Record<string, unknown>;
  /** Whether the chain completed successfully (all returned Next) */
  completed: boolean;
}

export async function runMiddlewareChain(options: MiddlewareRunnerOptions): Promise<MiddlewareResult> {
  const { middleware, request, url, params } = options;
  const locals: Record<string, unknown> = {};

  if (middleware.length === 0) {
    return { locals, completed: true };
  }

  for (const mw of middleware) {
    let result: Response | typeof Next;
    try {
      result = await mw.handler({ request, url, params, locals });
    } catch {
      return {
        response: new Response("Internal Server Error", { status: 500 }),
        locals,
        completed: false,
      };
    }

    if (result !== Next) {
      // Middleware returned a Response — interrupt chain
      return {
        response: result as Response,
        locals,
        completed: false,
      };
    }
    // result === Next, continue to next middleware
  }

  return { locals, completed: true };
}
