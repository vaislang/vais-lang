# Server-Side Rendering

VaisX provides first-class SSR through `@vaisx/kit`. Pages are rendered to HTML
on the server, streamed to the client, and then selectively hydrated so only
interactive parts attach event listeners.

## How SSR works

```
Browser request
      │
      ▼
@vaisx/kit server middleware
      │
      ├─► match route → resolve component + load functions
      │
      ├─► run #[server] load on server
      │
      ├─► render component tree → HTML string / ReadableStream
      │
      └─► send HTML + inline serialized state
            │
            ▼
      Browser receives HTML (visible immediately)
            │
            ▼
      Hydration script runs → attaches signals to existing DOM nodes
```

The key invariant: **the server produces the same virtual DOM as the client
would produce** given the same data. VaisX serializes signal values into a
`<script id="__vx_data">` tag so the client can rehydrate without re-fetching.

## The `#[server]` load function

Each page can export a `load` function annotated with `#[server]` to fetch data
before rendering. This function runs **only on the server** and is tree-shaken
from the client bundle.

```typescript
// src/pages/posts/[id].vx.ts
import { db } from "$lib/db";

// #[server]
export async function load({ params }: LoadEvent) {
  const post = await db.posts.findById(params.id);
  if (!post) throw new Response("Not Found", { status: 404 });
  return { post };
}

export default function PostPage({ data }: PageProps<typeof load>) {
  return (
    <article>
      <h1>{data.post.title}</h1>
      <div innerHTML={data.post.body} />
    </article>
  );
}
```

### Load function API

| Property | Type | Description |
|---|---|---|
| `params` | `Record<string, string>` | URL path parameters |
| `url` | `URL` | Full request URL |
| `request` | `Request` | Raw Fetch API request |
| `cookies` | `Cookies` | Cookie helpers (get / set / delete) |
| `locals` | `App.Locals` | Data set by server hooks |

The returned object is merged into the page's `data` prop and serialized into
`__vx_data` for client-side rehydration.

### Error handling in load

Throwing a `Response` short-circuits rendering and sends that response directly:

```typescript
// #[server]
export async function load({ params, locals }) {
  if (!locals.user) {
    // Redirect to login
    throw new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
  }
  return { user: locals.user };
}
```

## HTML streaming

VaisX streams HTML using the Web Streams API. The server sends the shell (head,
navigation, above-the-fold content) immediately, and deferred content arrives as
chunks while async `load` functions resolve.

### Enabling streaming

Streaming is on by default in `@vaisx/kit`. Configure it in `vaisx.config.ts`:

```typescript
// vaisx.config.ts
import { defineConfig } from "@vaisx/kit";

export default defineConfig({
  ssr: {
    streaming: true,
    // Timeout before falling back to full response (ms)
    streamTimeout: 5000,
  },
});
```

### Deferred data with `defer`

Wrap slow data fetches in `defer` so the shell renders without them:

```typescript
import { defer } from "@vaisx/kit";

// #[server]
export async function load({ params }) {
  // Fast — included in the initial shell
  const summary = await db.posts.getSummary(params.id);

  // Slow — arrives as a streaming chunk after shell
  const comments = defer(db.comments.findByPost(params.id));

  return { summary, comments };
}
```

In the component, use the `<Suspense>` boundary to render a fallback while the
deferred promise resolves:

```typescript
import { Suspense } from "@vaisx/runtime";

export default function PostPage({ data }) {
  return (
    <div>
      <h1>{data.summary.title}</h1>

      <Suspense fallback={<p>Loading comments…</p>}>
        <CommentList comments={data.comments} />
      </Suspense>
    </div>
  );
}
```

## Selective hydration

Full hydration replays the entire component tree in JavaScript. VaisX's selective
hydration only attaches JavaScript to components that are actually interactive.

### How it works

During SSR, VaisX emits `data-vx-id` markers on DOM nodes that require
hydration. The client-side hydration script scans the document for these markers
and instantiates only the matching components.

Static subtrees (no signals, no event listeners) are left as plain HTML and are
never touched by JavaScript.

### Opting components out of hydration

Mark a component as server-only with the `static` directive:

```typescript
// This component renders on the server and is never hydrated
export default function StaticCard({ title, body }) {
  "use static";
  return (
    <div class="card">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
```

### Islands architecture

For pages that are mostly static with a few interactive widgets, use the
`<Island>` wrapper to hydrate only those widgets:

```typescript
import { Island } from "@vaisx/kit";
import Counter from "./Counter.vx";

export default function Page() {
  return (
    <main>
      {/* Static — no JS */}
      <h1>Hello, world</h1>
      <p>This paragraph is never hydrated.</p>

      {/* Interactive island — hydrated on demand */}
      <Island component={Counter} props={{ initial: 0 }} />
    </main>
  );
}
```

`<Island>` supports a `when` prop for lazy hydration:

```typescript
// Hydrate when the island enters the viewport
<Island component={Chart} props={{ data }} when="visible" />

// Hydrate on user interaction
<Island component={CommentEditor} when="interaction" />

// Hydrate immediately (default)
<Island component={LivePrice} when="load" />
```

## Best practices

- Use `#[server]` load functions for all data fetching — keeps secrets out of the
  client bundle.
- Avoid reading `document` or `window` at module scope; guard with
  `if (typeof window !== "undefined")`.
- Keep serialized `__vx_data` payloads small — large payloads slow down
  time-to-interactive.
- Prefer `defer` for non-critical data so the shell is never blocked.
- Combine streaming with `<Suspense>` for the best perceived performance.
