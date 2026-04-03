# Static Site Generation

VaisX supports static site generation (SSG) through `@vaisx/kit`. SSG
pre-renders pages to plain HTML at build time, eliminating server compute at
request time and enabling deployment to any CDN or object storage bucket.

## How SSG works

```
vaisx build --static
      │
      ├─► resolve all routes (static + dynamic)
      │
      ├─► for each route:
      │     ├─► run #[server] load (at build time)
      │     ├─► render component tree → HTML string
      │     └─► write dist/<path>/index.html
      │
      └─► copy public/ assets + emit client bundles
```

The output is a fully self-contained `dist/` directory. Every page is an
`index.html` file so any static host can serve it with clean URLs.

## Enabling prerendering

### Global prerender

Set `prerender: true` in `vaisx.config.ts` to prerender all routes:

```typescript
// vaisx.config.ts
import { defineConfig } from "@vaisx/kit";

export default defineConfig({
  prerender: true,
});
```

### Per-page prerender

You can opt individual pages into prerendering from the page file itself by
exporting a `prerender` constant:

```typescript
// src/pages/about.vx.ts
export const prerender = true;

export default function About() {
  return <h1>About Us</h1>;
}
```

Setting `export const prerender = false` on a page overrides a global
`prerender: true` for that specific route, keeping it as a server-rendered page.

### Fallback page

When a visitor hits a URL that does not match any prerendered file, the static
host normally returns 404. Configure a fallback to serve `200.html` (or `index.html`)
instead, enabling client-side routing to take over:

```typescript
export default defineConfig({
  prerender: true,
  fallback: "200.html", // generated alongside index.html
});
```

## Dynamic route SSG

Static generation of dynamic routes (e.g. `/posts/[slug]`) requires you to tell
VaisX which parameter values to generate. Export an `entries` function from the
page file:

```typescript
// src/pages/posts/[slug].vx.ts
import { db } from "$lib/db";

// Called at build time to enumerate all values of [slug]
export async function entries() {
  const posts = await db.posts.findAll({ fields: ["slug"] });
  return posts.map((p) => ({ slug: p.slug }));
}

// #[server]
export async function load({ params }) {
  const post = await db.posts.findBySlug(params.slug);
  if (!post) throw new Response("Not Found", { status: 404 });
  return { post };
}

export default function PostPage({ data }) {
  return (
    <article>
      <h1>{data.post.title}</h1>
      <div innerHTML={data.post.body} />
    </article>
  );
}
```

VaisX calls `entries()` once, then renders the page for each returned parameter
set:

```
dist/
  posts/
    hello-world/index.html
    getting-started/index.html
    advanced-patterns/index.html
```

### Nested dynamic segments

For routes with multiple parameters (e.g. `/docs/[version]/[slug]`), return
objects with all segment values:

```typescript
export async function entries() {
  return [
    { version: "v1", slug: "introduction" },
    { version: "v1", slug: "quickstart" },
    { version: "v2", slug: "introduction" },
  ];
}
```

## Incremental Static Regeneration

For large sites where building every page is slow, configure ISR to rebuild only
stale pages on demand:

```typescript
// src/pages/posts/[slug].vx.ts
// Revalidate this page at most once every 60 seconds
export const revalidate = 60;
```

ISR requires a Node.js or edge runtime — it is not available for fully static
(no-server) deployments.

## Build configuration reference

```typescript
// vaisx.config.ts
import { defineConfig } from "@vaisx/kit";

export default defineConfig({
  // Prerender all routes (can be overridden per page)
  prerender: true,

  // Page served when no prerendered file matches
  fallback: "200.html",

  // Output directory (default: "dist")
  outDir: "dist",

  // Base path when hosting under a subdirectory
  base: "/my-app/",

  // Inline critical CSS into each HTML file
  inlineCriticalCss: true,
});
```

## Best practices

- Export `entries()` for every dynamic route that needs prerendering — missing
  entries generate a build warning.
- Use `prerender = false` on pages with user-specific content (dashboards, admin)
  to avoid accidentally caching private data.
- Keep `load` functions deterministic at build time; avoid reading request cookies
  or headers inside a prerendered `load`.
- Combine SSG with `<Island>` hydration for interactive widgets while keeping the
  static payload small.
- Set `base` in `vaisx.config.ts` if deploying to a subdirectory; this rewrites
  all asset URLs automatically.
