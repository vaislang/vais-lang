# @vaisx/kit

Type definitions and utilities for the VaisX file-system router, SSR/SSG
pipeline, middleware, and deployment adapters.

## Installation

```bash
pnpm add @vaisx/kit
```

---

## Router

### `SpecialFile`

```typescript
type SpecialFile =
  | "page.vaisx"
  | "layout.vaisx"
  | "loading.vaisx"
  | "error.vaisx"
  | "route.vais"
  | "middleware.vais";
```

Union of file names that receive special treatment inside the `app/` directory.

---

### `RouteSegment`

```typescript
interface RouteSegment {
  type: "static" | "dynamic" | "catch-all" | "group";
  value: string; // e.g. "blog", "slug" (without brackets), "rest"
}
```

Represents one segment of a parsed URL pattern.

| Property | Type | Description |
|---|---|---|
| `type` | `"static" \| "dynamic" \| "catch-all" \| "group"` | Segment kind |
| `value` | `string` | Segment name (brackets stripped) |

---

### `RouteDefinition`

```typescript
interface RouteDefinition {
  pattern: string;
  segments: RouteSegment[];
  page?: string;
  layout?: string;
  error?: string;
  loading?: string;
  apiRoute?: string;
  middleware: string[];
  children: RouteDefinition[];
}
```

A single node in the route tree, built from the `app/` directory structure.

| Property | Type | Description |
|---|---|---|
| `pattern` | `string` | URL pattern, e.g. `"/blog/[slug]"` |
| `segments` | `RouteSegment[]` | Parsed URL segments |
| `page` | `string` (optional) | Path to `page.vaisx` |
| `layout` | `string` (optional) | Path to the closest `layout.vaisx` |
| `error` | `string` (optional) | Path to the closest `error.vaisx` |
| `loading` | `string` (optional) | Path to the closest `loading.vaisx` |
| `apiRoute` | `string` (optional) | Path to `route.vais` (API route handler) |
| `middleware` | `string[]` | Ordered list of `middleware.vais` paths, parent → child |
| `children` | `RouteDefinition[]` | Nested child routes |

**Example**

```typescript
import type { RouteDefinition } from "@vaisx/kit";

const route: RouteDefinition = {
  pattern: "/blog/[slug]",
  segments: [
    { type: "static", value: "blog" },
    { type: "dynamic", value: "slug" },
  ],
  page: "app/blog/[slug]/page.vaisx",
  middleware: [],
  children: [],
};
```

---

### `RouteParams`

```typescript
interface RouteParams {
  [key: string]: string | string[];
}
```

Dynamic parameters extracted from a matched URL. Catch-all segments produce
`string[]`; all others produce `string`.

**Example**

```typescript
import type { RouteParams } from "@vaisx/kit";

// URL: /blog/hello-world
const params: RouteParams = { slug: "hello-world" };

// URL: /docs/a/b/c  (catch-all [...rest])
const catchAll: RouteParams = { rest: ["a", "b", "c"] };
```

---

### `RouteMatch`

```typescript
interface RouteMatch {
  route: RouteDefinition;
  params: RouteParams;
  layoutChain: string[];
}
```

Result of matching a URL against the route tree.

| Property | Type | Description |
|---|---|---|
| `route` | `RouteDefinition` | The matched route node |
| `params` | `RouteParams` | Extracted dynamic parameters |
| `layoutChain` | `string[]` | Layout file paths from root to the matched route |

---

### `RouteManifest`

```typescript
interface RouteManifest {
  routes: RouteDefinition[];
  modules: Record<string, string>;
}
```

Build-time manifest that maps route patterns to bundled JS module paths.

| Property | Type | Description |
|---|---|---|
| `routes` | `RouteDefinition[]` | Full route tree |
| `modules` | `Record<string, string>` | `{ "/blog/[slug]": "/assets/blog-slug.js" }` |

---

## Data Loading

### `LoadContext`

```typescript
interface LoadContext {
  params: RouteParams;
  request: Request;
  url: URL;
  cookies: CookieStore;
}
```

Context object passed to every `load` function.

| Property | Type | Description |
|---|---|---|
| `params` | `RouteParams` | URL dynamic parameters |
| `request` | `Request` | Incoming HTTP request |
| `url` | `URL` | Parsed request URL |
| `cookies` | `CookieStore` | Cookie read/write interface |

---

### `PageData`

```typescript
interface PageData {
  [key: string]: unknown;
}
```

Return type for `load` functions. Serialized and passed as props to the page component.

---

### `LayoutData`

```typescript
interface LayoutData {
  [key: string]: unknown;
}
```

Data returned by parent layout `load` functions, available to child pages.

---

### `LoadFunction`

```typescript
type LoadFunction = (context: LoadContext) => Promise<PageData> | PageData;
```

Signature for the exported `load` function in a `page.vaisx` or `layout.vaisx` file.

**Example**

```typescript
import type { LoadFunction } from "@vaisx/kit";

export const load: LoadFunction = async ({ params, request }) => {
  const post = await fetchPost(params.slug as string);
  return { post };
};
```

---

## Server Actions

### `ActionResult`

```typescript
interface ActionResult {
  status: "success" | "error" | "redirect";
  data?: unknown;
  errors?: Record<string, string>;
  redirectTo?: string;
}
```

Return value from a server action function.

| Property | Type | Description |
|---|---|---|
| `status` | `"success" \| "error" \| "redirect"` | Outcome of the action |
| `data` | `unknown` (optional) | Arbitrary response payload on success |
| `errors` | `Record<string, string>` (optional) | Field-level validation errors |
| `redirectTo` | `string` (optional) | Redirect destination when `status` is `"redirect"` |

---

### `ActionFunction`

```typescript
type ActionFunction = (formData: FormData) => Promise<ActionResult> | ActionResult;
```

Signature for server action handlers annotated with `#[server(...)]`.

**Example**

```typescript
import type { ActionFunction } from "@vaisx/kit";

export const action: ActionFunction = async (formData) => {
  const email = formData.get("email") as string;
  if (!email.includes("@")) {
    return { status: "error", errors: { email: "Invalid email" } };
  }
  await subscribeUser(email);
  return { status: "success" };
};
```

---

### `ActionOptions`

```typescript
interface ActionOptions {
  rateLimit?: string;  // e.g. "10/min"
  authRequired?: boolean;
}
```

Options parsed from the `#[server(...)]` attribute on an action.

| Property | Type | Description |
|---|---|---|
| `rateLimit` | `string` (optional) | Rate limit string, e.g. `"10/min"` |
| `authRequired` | `boolean` (optional) | Whether an authenticated session is required |

---

## SSR / SSG

### `RenderMode`

```typescript
type RenderMode = "ssr" | "ssg" | "csr";
```

Render strategy for a route.

| Value | Description |
|---|---|
| `"ssr"` | Server-side rendering on every request |
| `"ssg"` | Static site generation at build time |
| `"csr"` | Client-side rendering only |

---

### `RenderResult`

```typescript
interface RenderResult {
  html: string;
  head: string;
  status: number;
  headers: Record<string, string>;
}
```

Output from a synchronous SSR render pass.

| Property | Type | Description |
|---|---|---|
| `html` | `string` | Rendered body HTML |
| `head` | `string` | `<head>` fragment (title, meta, etc.) |
| `status` | `number` | HTTP status code |
| `headers` | `Record<string, string>` | Response headers |

---

### `StreamRenderResult`

```typescript
interface StreamRenderResult {
  stream: ReadableStream<Uint8Array>;
  status: number;
  headers: Record<string, string>;
}
```

Output from a streaming SSR render pass.

| Property | Type | Description |
|---|---|---|
| `stream` | `ReadableStream<Uint8Array>` | Byte stream of the HTML response |
| `status` | `number` | HTTP status code |
| `headers` | `Record<string, string>` | Response headers |

---

### `HydrationMarker`

```typescript
interface HydrationMarker {
  componentId: string;
  events: string[];   // e.g. ["click", "input"]
  state: string;      // base64-encoded initial state
}
```

Embedded annotation in SSR output that enables client-side hydration of
interactive islands.

| Property | Type | Description |
|---|---|---|
| `componentId` | `string` | Unique component identifier |
| `events` | `string[]` | Event names that trigger hydration |
| `state` | `string` | Base64-encoded serialized initial state |

---

## Middleware

### `Next`

```typescript
const Next: unique symbol;
type NextToken = typeof Next;
```

Symbol returned by a middleware function to signal that the next handler in
the chain should be invoked.

---

### `MiddlewareFunction`

```typescript
type MiddlewareFunction = (
  request: Request,
) => Promise<Response | NextToken> | Response | NextToken;
```

Signature for `middleware.vais` handler exports. Return `Next` to continue to
the next middleware, or return a `Response` to short-circuit the chain.

**Example**

```typescript
import type { MiddlewareFunction } from "@vaisx/kit";
import { Next } from "@vaisx/kit";

export const middleware: MiddlewareFunction = (request) => {
  const token = request.headers.get("Authorization");
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Next;
};
```

---

## Adapters

### `AdapterConfig`

```typescript
interface AdapterConfig {
  type: "node" | "static" | "vercel" | "cloudflare";
  port?: number;       // node adapter
  host?: string;       // node adapter
  fallback?: string;   // static adapter, e.g. "404.html" or "index.html"
}
```

Configuration for the chosen deployment adapter.

| Property | Type | Description |
|---|---|---|
| `type` | `"node" \| "static" \| "vercel" \| "cloudflare"` | Adapter identifier |
| `port` | `number` (optional) | Port for the Node.js HTTP server |
| `host` | `string` (optional) | Host for the Node.js HTTP server |
| `fallback` | `string` (optional) | Fallback HTML file for SPA routing in the static adapter |

---

### `AdapterBuildResult`

```typescript
interface AdapterBuildResult {
  outputDir: string;
  files: string[];
}
```

Result returned after an adapter completes its build step.

| Property | Type | Description |
|---|---|---|
| `outputDir` | `string` | Absolute path to the output directory |
| `files` | `string[]` | List of all emitted file paths |

---

### `Adapter`

```typescript
interface Adapter {
  name: string;
  build(manifest: RouteManifest, config: AdapterConfig): Promise<AdapterBuildResult>;
}
```

Interface that every deployment adapter must implement.

| Member | Type | Description |
|---|---|---|
| `name` | `string` | Human-readable adapter name |
| `build` | `(manifest, config) => Promise<AdapterBuildResult>` | Produces the deployment artifact |

**Example — custom adapter**

```typescript
import type { Adapter, RouteManifest, AdapterConfig, AdapterBuildResult } from "@vaisx/kit";

export const myAdapter: Adapter = {
  name: "my-platform",
  async build(manifest: RouteManifest, config: AdapterConfig): Promise<AdapterBuildResult> {
    // Transform manifest into platform-specific output
    return { outputDir: "dist", files: [] };
  },
};
```

---

## Cookies

### `CookieStore`

```typescript
interface CookieStore {
  get(name: string): string | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string): void;
}
```

Simplified cookie interface available in `LoadContext`.

| Method | Description |
|---|---|
| `get(name)` | Returns the cookie value, or `undefined` if not set |
| `set(name, value, options?)` | Sets a cookie with optional attributes |
| `delete(name)` | Removes a cookie |

---

### `CookieOptions`

```typescript
interface CookieOptions {
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
}
```

| Property | Type | Description |
|---|---|---|
| `maxAge` | `number` (optional) | Lifetime in seconds |
| `path` | `string` (optional) | Cookie path scope |
| `domain` | `string` (optional) | Cookie domain scope |
| `secure` | `boolean` (optional) | HTTPS only |
| `httpOnly` | `boolean` (optional) | Not accessible via JavaScript |
| `sameSite` | `"strict" \| "lax" \| "none"` (optional) | Cross-site policy |

---

## Configuration

### `VaisKitConfig`

```typescript
interface VaisKitConfig {
  adapter: AdapterConfig;
  appDir?: string;   // default: "app"
  outDir?: string;   // default: "dist"
  ssr?: boolean;     // default: true
}
```

Top-level VaisKit project configuration (typically in `vaisx.config.ts`).

| Property | Type | Default | Description |
|---|---|---|---|
| `adapter` | `AdapterConfig` | — | Deployment adapter settings |
| `appDir` | `string` | `"app"` | Directory containing the route tree |
| `outDir` | `string` | `"dist"` | Build output directory |
| `ssr` | `boolean` | `true` | Enable server-side rendering |

**Example**

```typescript
import type { VaisKitConfig } from "@vaisx/kit";

const config: VaisKitConfig = {
  adapter: { type: "node", port: 3000 },
  appDir: "app",
  outDir: "dist",
  ssr: true,
};

export default config;
```
