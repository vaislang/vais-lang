# vais-web Roadmap

> Last Updated: 2026-05-03
> Canonical workspace roadmap: `/Users/sswoo/study/projects/vais/ROADMAP.md`

## Reactivation Status

`vais-web` is re-entering after the certified Core compiler freeze. Do not use
old aggregate counts from `REGRESSION_BASELINE.md` as current completion
evidence unless the root roadmap promotes them again.

Current promoted surface:

- `WEB RUNTIME smoke=20/20` in
  `/Users/sswoo/study/projects/vais/compiler/scripts/check-integrity.sh`.
- The promoted tests are
  `packages/kit/__tests__/e2e/vais-server-bridge.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-route-hydration.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-adapter-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-node-live.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-cloud-adapter-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-browser-bundle-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-real-browser-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-platform-output-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-production-bundle-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-file-routing-production-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-cross-browser-hydration-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-ssr-data-production-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-server-action-production-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-server-action-auth-rate-production-runtime.test.ts` and
  `packages/kit/__tests__/e2e/vais-web-server-action-file-upload-production-runtime.test.ts`.
- The runtime bridge implementation is
  `packages/kit/src/ssr/server-bridge.ts`.

## Certified Surface

The current gate verifies the Node SSR service protocol used by `vais-server`:

- real loopback HTTP `POST /ssr/render`;
- request `props` delivery into the SSR renderer;
- rendered HTML document with head/style/script injection;
- protocol-level `404` response for unresolved routes;
- HTTP `404` for non-render endpoints.

The current gate also verifies a bounded route/hydration runtime path:

- SSR output contains a client hydration marker;
- client router resolves a dynamic route and loading boundary;
- serialized hydration state reaches the mount function;
- a queued pre-hydration click event replays after mount;
- hydration marker attributes are removed after mount.

The current gate also verifies bounded adapter runtime contracts:

- static adapter generated output includes page HTML, fallback 404, and client
  bundle placeholder entries;
- static adapter rejects server-only API routes as SSG-incompatible;
- node adapter generated server entry includes nested route tree entries;
- node request handler returns HTML with `text/html; charset=utf-8`.

The current gate also verifies a bounded live Node adapter path:

- node adapter generated server entry is written to a temporary filesystem;
- a child Node process listens on an ephemeral local port;
- static `/about/` index serving works over real fetch;
- dynamic `/products/[sku]` route fallback HTML works over real fetch;
- unknown routes serve `404.html` with HTTP 404 status.

The current gate also verifies bounded cloud/static browser runtime paths:

- generated Vercel serverless handler runtime for nested dynamic routes;
- generated Cloudflare Worker static asset, dynamic route, and 404 responses;
- static adapter generated `client.js` hydration bootstrap in jsdom;
- generated static adapter output loaded over local HTTP in Playwright Chromium;
- generated Vercel Build Output API files and Cloudflare Worker output loaded
  from a temporary filesystem with native dynamic import.
- generated tsup production ESM entry and dynamic import chunk loaded from
  static adapter output in Playwright Chromium.
- a temporary real `app/` directory scanned into `/`, `/about`, and
  `/docs/guide`, with `(marketing)` group URL elision and nested route manifest
  entries preserved.
- static production output for `/`, `/about`, `/docs/guide`, `404.html`, and
  production assets served over local HTTP in Playwright Chromium.
- production code-split hydration chunk loading, route metadata, marker/state
  cleanup, click handling, and missing-route 404 fallback.
- generated static adapter `client.js` hydration in Playwright Chromium,
  Firefox, and WebKit.
- cross-browser state restoration, hydration event detail, mount metadata,
  marker cleanup, click handling, and no browser console/page errors.

The current gate also verifies a bounded SSR/data-loading production app path:

- a temporary real `app/products/[sku]/page.vaisx` route with `load()` is
  discovered by `buildRouteTree()` and preserved in the route manifest;
- prerender skips the SSR data route instead of emitting stale static HTML;
- local SSR rendering executes `load()` with route params, query data, and
  cookie context, then serializes the resulting state into the HTML shell;
- `/__data.json` refreshes the same route through the data endpoint and
  observes the cookie written by the SSR response;
- a minified code-split production bundle hydrates the SSR marker in
  Playwright Chromium, loads its dynamic chunk, handles clicks, and produces no
  browser console/page errors.

The current gate also verifies a bounded server action production runtime path:

- a temporary real `app/contact/page.vaisx` route with `action()` is
  discovered by `buildRouteTree()` and preserved in the route manifest;
- prerender skips the server-action route instead of emitting stale static
  HTML;
- local HTTP rendering injects CSRF hidden fields into enhanced and plain
  forms;
- `handleServerAction()` validates same-origin POSTs, CSRF tokens,
  form-urlencoded bodies, and schema errors;
- enhanced browser submit receives JSON validation errors and JSON success
  payloads;
- plain browser form submit follows a `303` redirect and renders the submitted
  state after navigation;
- a minified code-split production bundle hydrates the action form in
  Playwright Chromium, loads its dynamic chunk, and produces no unexpected
  browser console/page errors.

The current gate also verifies a bounded server action auth/rate-limit
production runtime path:

- a temporary real `app/secure/page.vaisx` route with `action()` is discovered
  by `buildRouteTree()` and preserved in the route manifest;
- prerender skips the authenticated server-action route instead of emitting
  stale static HTML;
- `handleServerAction()` enforces `authRequired` through non-empty Bearer
  tokens or a non-empty `vx_session` cookie;
- unauthenticated action POSTs return `401` with `WWW-Authenticate: Bearer`;
- `rateLimit: "2/min"` allows two same-client action POSTs and returns `429`
  on the third request with `Retry-After` and `X-RateLimit-*` headers;
- a minified code-split production bundle hydrates the secure action form in
  Playwright Chromium, loads its dynamic chunk, and produces no unexpected
  browser console/page errors.

The current gate also verifies a bounded server action file upload production
runtime path:

- a temporary real `app/upload/page.vaisx` route with `action()` is discovered
  by `buildRouteTree()` and preserved in the route manifest;
- prerender skips the upload server-action route instead of emitting stale
  static HTML;
- `handleServerAction()` parses multipart form data with a required `file`
  schema field;
- enhanced browser submit receives JSON success with uploaded `File`
  name/type/size/text preserved;
- plain browser multipart form submit follows a `303` redirect and renders the
  uploaded file state after navigation;
- a minified code-split production bundle hydrates the upload action form in
  Playwright Chromium, loads its dynamic chunk, and produces no unexpected
  browser console/page errors.

## Not Certified Yet

These are not product-complete claims:

- production browser/device hydration runtime beyond the promoted local
  Chromium/Firefox/WebKit smoke;
- live deployed action behavior;
- full dynamic production application runtime;
- live deployed platform runtime;
- JS/WASM compiler integration beyond the existing package tests.

## Next Candidates

Promote exactly one bounded runtime gate at a time:

1. A live deployed adapter smoke for the next selected target platform.
2. Another bounded product surface selected from the root roadmap.

Keep downstream failures classified as product/API drift, compiler regression,
or unsupported non-Core feature before changing the frozen Core compiler.
