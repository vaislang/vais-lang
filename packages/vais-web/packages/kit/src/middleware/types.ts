import type { NextToken } from "../types.js";

export interface MiddlewareContext {
  request: Request;
  url: URL;
  params: Record<string, string | string[]>;
  /** Locals — data passed between middleware and route handlers */
  locals: Record<string, unknown>;
}

export type MiddlewareFn = (context: MiddlewareContext) => Promise<Response | NextToken> | Response | NextToken;

export interface MiddlewareDefinition {
  /** Path to middleware.vais file */
  path: string;
  /** The middleware function */
  handler: MiddlewareFn;
}
