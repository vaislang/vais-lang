# vais-web Roadmap

> Last Updated: 2026-05-02
> Canonical workspace roadmap: `/Users/sswoo/study/projects/vais/ROADMAP.md`

## Reactivation Status

`vais-web` is re-entering after the certified Core compiler freeze. Do not use
old aggregate counts from `REGRESSION_BASELINE.md` as current completion
evidence unless the root roadmap promotes them again.

Current promoted surface:

- `WEB RUNTIME smoke=13/13` in
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
  `packages/kit/__tests__/e2e/vais-web-file-routing-production-runtime.test.ts`.
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

## Not Certified Yet

These are not product-complete claims:

- a compiled `vais-server` binary forwarding requests into the SSR bridge;
- production browser/device hydration runtime beyond the promoted local smoke;
- SSR/data-loading production application runtime;
- full dynamic production application runtime;
- live deployed platform runtime;
- cross-browser runtime matrix;
- JS/WASM compiler integration beyond the existing package tests.

## Next Candidates

Promote exactly one bounded runtime gate at a time:

1. A live deployed adapter smoke for the next selected target platform.
2. A cross-browser hydration matrix smoke.
3. A production SSR/data-loading app smoke.

Keep downstream failures classified as product/API drift, compiler regression,
or unsupported non-Core feature before changing the frozen Core compiler.
