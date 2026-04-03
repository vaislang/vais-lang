import type { LoadFunction, RouteParams } from "../types.js";
import type { ResolvedRoute } from "../router/resolver.js";
import { createLoadContext, getSetCookieHeaders } from "./context.js";
import { executeLoad } from "./load.js";

/**
 * Handle a SPA data request (e.g., GET /__data.json?route=/blog/hello).
 *
 * Executes the load function for the matched route and returns a JSON
 * response containing the page data, or an error object with an appropriate
 * HTTP status code.
 */
export async function handleDataRequest(
  request: Request,
  route: ResolvedRoute,
  loadFn: LoadFunction
): Promise<Response> {
  const url = new URL(request.url);
  const params: RouteParams = route.params;

  const context = createLoadContext(request, params, url);
  const result = await executeLoad({ loadFn, context });

  const setCookieHeaders = getSetCookieHeaders(context.cookies);

  const responseHeaders = new Headers({
    "content-type": "application/json",
  });

  for (const cookie of setCookieHeaders) {
    responseHeaders.append("set-cookie", cookie);
  }

  if (result.status === "redirect") {
    const body = JSON.stringify({ redirect: result.redirectTo });
    responseHeaders.set("location", result.redirectTo ?? "/");
    return new Response(body, {
      status: 302,
      headers: responseHeaders,
    });
  }

  if (result.status === "error") {
    const body = JSON.stringify({
      error: result.error?.message ?? "Internal Server Error",
      status: result.error?.status ?? 500,
    });
    return new Response(body, {
      status: result.error?.status ?? 500,
      headers: responseHeaders,
    });
  }

  // Success
  const body = JSON.stringify({ data: result.data ?? {} });
  return new Response(body, {
    status: 200,
    headers: responseHeaders,
  });
}
