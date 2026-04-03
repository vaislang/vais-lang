// === Route Types ===

/** Special file types recognized in app/ directory */
export type SpecialFile = "page.vaisx" | "layout.vaisx" | "loading.vaisx" | "error.vaisx" | "route.vais" | "middleware.vais";

/** A single route segment */
export interface RouteSegment {
  type: "static" | "dynamic" | "catch-all" | "group";
  value: string;  // e.g., "blog", "slug" (without brackets), "rest"
}

/** A route definition in the route tree */
export interface RouteDefinition {
  /** URL pattern, e.g., "/blog/[slug]" */
  pattern: string;
  /** Parsed segments */
  segments: RouteSegment[];
  /** Path to page.vaisx file */
  page?: string;
  /** Path to layout.vaisx file (closest) */
  layout?: string;
  /** Path to error.vaisx file (closest) */
  error?: string;
  /** Path to loading.vaisx file (closest) */
  loading?: string;
  /** Path to route.vais file (API route) */
  apiRoute?: string;
  /** Path to middleware.vais file(s), ordered parent→child */
  middleware: string[];
  /** Nested child routes */
  children: RouteDefinition[];
}

/** Extracted route params from URL matching */
export interface RouteParams {
  [key: string]: string | string[];
}

/** Route match result */
export interface RouteMatch {
  route: RouteDefinition;
  params: RouteParams;
  /** Layout chain from root to current route */
  layoutChain: string[];
}

/** Route manifest (generated at build time) */
export interface RouteManifest {
  routes: RouteDefinition[];
  /** Map of route pattern → JS module path */
  modules: Record<string, string>;
}

// === Data Loading Types ===

/** Context passed to load functions */
export interface LoadContext {
  params: RouteParams;
  request: Request;
  url: URL;
  cookies: CookieStore;
}

/** Return type for load functions */
export interface PageData {
  [key: string]: unknown;
}

/** Layout data from parent layouts */
export interface LayoutData {
  [key: string]: unknown;
}

/** Load function signature */
export type LoadFunction = (context: LoadContext) => Promise<PageData> | PageData;

// === Server Action Types ===

/** Result from a server action */
export interface ActionResult {
  status: "success" | "error" | "redirect";
  data?: unknown;
  errors?: Record<string, string>;
  redirectTo?: string;
}

/** Server action function signature */
export type ActionFunction = (formData: FormData) => Promise<ActionResult> | ActionResult;

/** Server action options from #[server(...)] attributes */
export interface ActionOptions {
  rateLimit?: string;  // e.g., "10/min"
  authRequired?: boolean;
}

// === SSR/SSG Types ===

/** Render mode for a route */
export type RenderMode = "ssr" | "ssg" | "csr";

/** SSR render result */
export interface RenderResult {
  html: string;
  head: string;
  status: number;
  headers: Record<string, string>;
}

/** SSR stream render result */
export interface StreamRenderResult {
  stream: ReadableStream<Uint8Array>;
  status: number;
  headers: Record<string, string>;
}

/** Hydration marker on SSR output */
export interface HydrationMarker {
  componentId: string;
  events: string[];  // e.g., ["click", "input"]
  state: string;     // base64-encoded initial state
}

// === Middleware Types ===

/** Middleware next token */
export const Next = Symbol("next");
export type NextToken = typeof Next;

/** Middleware function signature */
export type MiddlewareFunction = (request: Request) => Promise<Response | NextToken> | Response | NextToken;

// === Adapter Types ===

/** Adapter configuration */
export interface AdapterConfig {
  type: "node" | "static" | "vercel" | "cloudflare";
  /** Node adapter options */
  port?: number;
  host?: string;
  /** Static adapter options */
  fallback?: string;  // e.g., "404.html" or "index.html"
}

/** Adapter build output */
export interface AdapterBuildResult {
  outputDir: string;
  files: string[];
}

/** Adapter interface that all adapters must implement */
export interface Adapter {
  name: string;
  build(manifest: RouteManifest, config: AdapterConfig): Promise<AdapterBuildResult>;
}

// === Cookie Store (simplified) ===

export interface CookieStore {
  get(name: string): string | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string): void;
}

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
}

// === VaisKit Config ===

export interface VaisKitConfig {
  adapter: AdapterConfig;
  /** App directory path (default: "app") */
  appDir?: string;
  /** Output directory (default: "dist") */
  outDir?: string;
  /** Enable/disable SSR (default: true) */
  ssr?: boolean;
}
