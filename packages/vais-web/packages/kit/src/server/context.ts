import type { LoadContext, CookieStore, CookieOptions, RouteParams } from "../types.js";

/**
 * Internal representation of a cookie entry with its options.
 */
interface CookieEntry {
  value: string;
  options?: CookieOptions;
  deleted?: boolean;
}

/**
 * Parse the Cookie request header string into a map.
 * Format: "name1=value1; name2=value2"
 */
function parseCookieHeader(header: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;

  for (const pair of header.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      // Cookie without value — treat as empty string
      map.set(trimmed, "");
      continue;
    }

    const name = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (name) {
      map.set(name, value);
    }
  }

  return map;
}

/**
 * Build a Set-Cookie header value from a name, value, and options.
 */
function buildSetCookieHeader(name: string, value: string, options?: CookieOptions): string {
  let header = `${name}=${value}`;

  if (options?.maxAge !== undefined) {
    header += `; Max-Age=${options.maxAge}`;
  }
  if (options?.path !== undefined) {
    header += `; Path=${options.path}`;
  }
  if (options?.domain !== undefined) {
    header += `; Domain=${options.domain}`;
  }
  if (options?.secure) {
    header += "; Secure";
  }
  if (options?.httpOnly) {
    header += "; HttpOnly";
  }
  if (options?.sameSite !== undefined) {
    const sameSite = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1);
    header += `; SameSite=${sameSite}`;
  }

  return header;
}

/**
 * Create a CookieStore from a Request object.
 * Parses incoming Cookie header and tracks set/delete operations.
 */
export function createCookieStore(request: Request): CookieStore {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const parsed = parseCookieHeader(cookieHeader);

  // Mutable map tracks current values (including set/deleted)
  const current = new Map<string, string>(parsed);
  // Track modifications for Set-Cookie response headers
  const modifications = new Map<string, CookieEntry>();

  const store: CookieStore = {
    get(name: string): string | undefined {
      if (modifications.has(name)) {
        const entry = modifications.get(name)!;
        if (entry.deleted) return undefined;
        return entry.value;
      }
      return current.get(name);
    },

    set(name: string, value: string, options?: CookieOptions): void {
      current.set(name, value);
      modifications.set(name, { value, options, deleted: false });
    },

    delete(name: string): void {
      current.delete(name);
      modifications.set(name, {
        value: "",
        options: { maxAge: 0, path: "/" },
        deleted: true,
      });
    },
  };

  // Attach modifications map for use by getSetCookieHeaders
  (store as CookieStore & { __modifications: Map<string, CookieEntry> }).__modifications =
    modifications;

  return store;
}

/**
 * Generate Set-Cookie response headers from a CookieStore's modifications.
 */
export function getSetCookieHeaders(store: CookieStore): string[] {
  const modifications = (
    store as CookieStore & { __modifications?: Map<string, CookieEntry> }
  ).__modifications;

  if (!modifications) return [];

  const headers: string[] = [];
  for (const [name, entry] of modifications) {
    headers.push(buildSetCookieHeader(name, entry.value, entry.options));
  }

  return headers;
}

/**
 * Create a LoadContext from a Request, route params, and URL.
 */
export function createLoadContext(
  request: Request,
  params: RouteParams,
  url: URL
): LoadContext {
  const cookies = createCookieStore(request);

  return {
    params,
    request,
    url,
    cookies,
  };
}
