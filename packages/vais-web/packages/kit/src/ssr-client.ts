/**
 * SSR Client — vais-web side of the vais-web ↔ vais-server SSR bridge.
 *
 * Sends render and hydration requests to vais-server over HTTP and returns
 * the results to the framework runtime.
 *
 * Wire contract is defined in:
 *   vais-server/docs/ssr-api.yaml
 *   vais-server/src/api/ssr.vais
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Options for configuring the SSR client. */
export interface SsrClientConfig {
  /** Base URL of vais-server, e.g. "http://localhost:8080" */
  serverUrl: string;
  /** Timeout in milliseconds for each request (default: 10_000) */
  timeoutMs?: number;
}

/** Result returned by {@link renderPage}. */
export interface PageRenderResult {
  /** Rendered HTML body content */
  html: string;
  /** HTML <head> fragment */
  head: string;
  /** HTTP status code the page should be served with */
  status: number;
}

/** Result returned by {@link fetchHydrationData}. */
export interface HydrationResult {
  /** JSON-encoded page data for hydration */
  data: string;
  /** Resolved route path */
  route: string;
}

// ---------------------------------------------------------------------------
// Internal wire types (match vais-server JSON shapes exactly)
// ---------------------------------------------------------------------------

interface RenderRequestBody {
  route: string;
  props: string;
}

interface RenderResponseBody {
  html: string;
  head: string;
  status: number;
}

interface HydrateRequestBody {
  route: string;
  props: string;
}

interface HydrateResponseBody {
  data: string;
  route: string;
}

interface HealthResponseBody {
  status: "ok";
  version: string;
}

// ---------------------------------------------------------------------------
// SsrClient class
// ---------------------------------------------------------------------------

/**
 * HTTP client for the vais-server SSR bridge API.
 *
 * @example
 * ```ts
 * const client = new SsrClient({ serverUrl: "http://localhost:8080" });
 * const { html, head, status } = await client.renderPage("/blog/hello", { slug: "hello" });
 * ```
 */
export class SsrClient {
  private readonly serverUrl: string;
  private readonly timeoutMs: number;

  constructor(config: SsrClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /**
   * Render a page server-side.
   *
   * @param route - URL path to render, e.g. `"/blog/hello"`
   * @param props - Props to pass to the page component (will be JSON-serialised)
   * @returns Rendered HTML, head fragment, and status code
   */
  async renderPage(
    route: string,
    props: Record<string, unknown> = {}
  ): Promise<PageRenderResult> {
    const body: RenderRequestBody = {
      route,
      props: JSON.stringify(props),
    };

    const raw = await this.post<RenderResponseBody>("/api/render", body);

    return {
      html: raw.html,
      head: raw.head,
      status: raw.status,
    };
  }

  /**
   * Fetch hydration data for a previously rendered page.
   *
   * @param route - URL path that was rendered server-side
   * @param props - Props used during SSR
   */
  async fetchHydrationData(
    route: string,
    props: Record<string, unknown> = {}
  ): Promise<HydrationResult> {
    const body: HydrateRequestBody = {
      route,
      props: JSON.stringify(props),
    };

    const raw = await this.post<HydrateResponseBody>("/api/hydrate", body);

    return {
      data: raw.data,
      route: raw.route,
    };
  }

  /**
   * Check that vais-server is healthy and ready to serve requests.
   *
   * @returns Server version string when healthy
   * @throws When the server is not reachable or returns a non-OK status
   */
  async checkHealth(): Promise<string> {
    const url = `${this.serverUrl}/api/health`;
    const signal = AbortSignal.timeout(this.timeoutMs);

    const res = await fetch(url, { method: "GET", signal });

    if (!res.ok) {
      throw new Error(`Health check failed: HTTP ${res.status}`);
    }

    const json = (await res.json()) as HealthResponseBody;

    if (json.status !== "ok") {
      throw new Error(`Health check returned unexpected status: ${json.status}`);
    }

    return json.version;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const signal = AbortSignal.timeout(this.timeoutMs);

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      throw new Error(`SSR request to ${path} failed: HTTP ${res.status} — ${text}`);
    }

    return res.json() as Promise<T>;
  }
}

// ---------------------------------------------------------------------------
// Module-level convenience API
// ---------------------------------------------------------------------------

let _defaultClient: SsrClient | null = null;

/**
 * Configure the module-level default SSR client.
 * Call this once during application bootstrap.
 */
export function configureSsrClient(config: SsrClientConfig): void {
  _defaultClient = new SsrClient(config);
}

function getDefaultClient(): SsrClient {
  if (!_defaultClient) {
    throw new Error(
      "SSR client is not configured. Call configureSsrClient() before renderPage()."
    );
  }
  return _defaultClient;
}

/**
 * Render a page via the configured vais-server SSR bridge.
 *
 * This is the primary entry point for framework-level SSR integration.
 *
 * @param route - URL path to render, e.g. `"/blog/hello"`
 * @param props - Props to pass to the page component
 * @returns Rendered HTML string (body content only)
 *
 * @example
 * ```ts
 * configureSsrClient({ serverUrl: "http://localhost:8080" });
 * const html = await renderPage("/blog/hello", { slug: "hello" });
 * ```
 */
export async function renderPage(
  route: string,
  props: Record<string, unknown> = {}
): Promise<string> {
  const result = await getDefaultClient().renderPage(route, props);
  return result.html;
}
