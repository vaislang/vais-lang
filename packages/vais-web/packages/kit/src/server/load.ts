import type { LoadFunction, LoadContext, PageData } from "../types.js";

export interface ExecuteLoadOptions {
  /** The load function to execute */
  loadFn: LoadFunction;
  /** Request context */
  context: LoadContext;
}

export interface LoadResult {
  status: "success" | "error" | "redirect";
  data?: PageData;
  error?: { message: string; status: number };
  redirectTo?: string;
}

/**
 * Sentinel class used to signal a redirect from within a load function.
 */
export class LoadRedirect {
  constructor(public readonly to: string) {}
}

/**
 * Throw this from a load function to perform a redirect.
 */
export function redirect(to: string): never {
  throw new LoadRedirect(to);
}

/**
 * Execute a load function with the given context and normalize the result.
 * Handles:
 * - Successful data return
 * - Redirect via thrown LoadRedirect
 * - Errors → returns error result with status 500
 */
export async function executeLoad(options: ExecuteLoadOptions): Promise<LoadResult> {
  const { loadFn, context } = options;

  try {
    const data = await loadFn(context);
    return {
      status: "success",
      data,
    };
  } catch (err) {
    if (err instanceof LoadRedirect) {
      return {
        status: "redirect",
        redirectTo: err.to,
      };
    }

    // Unwrap error message
    const message =
      err instanceof Error ? err.message : String(err);

    return {
      status: "error",
      error: {
        message,
        status: 500,
      },
    };
  }
}
