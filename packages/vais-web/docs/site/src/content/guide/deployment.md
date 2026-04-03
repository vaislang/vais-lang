# Deployment

VaisX applications can be deployed as a Node.js server, on serverless/edge
platforms such as Vercel and Cloudflare Pages, or as a fully static site to any
CDN.

## Node.js server deployment

### Build

```bash
pnpm build
# or
npx @vaisx/cli build
```

The default output is a `dist/` directory with:

```
dist/
  server/       ← SSR entry point (ESM)
  client/       ← static assets served by the server
  prerendered/  ← any pages with `export const prerender = true`
```

### Run

```bash
node dist/server/index.js
```

The built-in server respects the following environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port to listen on |
| `HOST` | `0.0.0.0` | Bind address |
| `ORIGIN` | — | Required for CSRF protection when behind a proxy |

### Docker

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
```

### Reverse proxy (nginx)

```nginx
server {
  listen 80;
  server_name example.com;

  # Serve prerendered static files directly
  location /prerendered/ {
    alias /app/dist/prerendered/;
    try_files $uri $uri/ =404;
  }

  # Serve client assets with long-lived cache headers
  location /assets/ {
    alias /app/dist/client/assets/;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Proxy everything else to the Node.js server
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Vercel deployment

VaisX ships an official Vercel adapter.

### Setup

```bash
pnpm add -D @vaisx/adapter-vercel
```

```typescript
// vaisx.config.ts
import { defineConfig } from "@vaisx/kit";
import vercel from "@vaisx/adapter-vercel";

export default defineConfig({
  adapter: vercel(),
});
```

### Deploy

```bash
# Install Vercel CLI if needed
pnpm add -D vercel

# Deploy to preview
pnpm vercel

# Deploy to production
pnpm vercel --prod
```

The adapter automatically:

- Packages SSR routes as Vercel Serverless Functions.
- Packages edge routes (annotated `export const runtime = "edge"`) as Edge
  Functions.
- Configures `vercel.json` routes so static assets are served from the CDN and
  dynamic requests hit the functions.

### Edge runtime

Mark individual routes as edge for lower latency:

```typescript
// src/pages/api/hello.vx.ts
export const runtime = "edge";

export function GET() {
  return new Response("Hello from the edge!");
}
```

### Environment variables

Set environment variables in the Vercel dashboard or via the CLI:

```bash
vercel env add DATABASE_URL production
```

Access them in `#[server]` load functions through `process.env` or the
`$env/static/private` module:

```typescript
import { DATABASE_URL } from "$env/static/private";
```

## Cloudflare Pages deployment

VaisX provides an official Cloudflare Pages adapter.

### Setup

```bash
pnpm add -D @vaisx/adapter-cloudflare
```

```typescript
// vaisx.config.ts
import { defineConfig } from "@vaisx/kit";
import cloudflare from "@vaisx/adapter-cloudflare";

export default defineConfig({
  adapter: cloudflare(),
});
```

### Deploy with Wrangler

```bash
pnpm add -D wrangler

# Build the app
pnpm build

# Publish to Cloudflare Pages
pnpm wrangler pages deploy dist
```

### Accessing Cloudflare bindings

Cloudflare-specific bindings (KV, D1, R2, Durable Objects) are available via
`platform.env` in load functions:

```typescript
// #[server]
export async function load({ platform }) {
  // platform.env is typed from your wrangler.toml bindings
  const value = await platform.env.MY_KV.get("key");
  return { value };
}
```

Add type declarations in `src/app.d.ts`:

```typescript
declare global {
  namespace App {
    interface Platform {
      env: {
        MY_KV: KVNamespace;
        MY_DB: D1Database;
      };
    }
  }
}
```

### Workers vs. Pages Functions

| | Cloudflare Workers | Cloudflare Pages |
|---|---|---|
| Adapter | `@vaisx/adapter-cloudflare-workers` | `@vaisx/adapter-cloudflare` |
| Static assets | Manual (R2 / CDN) | Automatic |
| Recommended for | API-heavy apps | Full-stack apps |

## Static site deployment

For sites built with `prerender: true`, the `dist/` output is pure HTML, CSS,
and JS — no server required.

### Build

```typescript
// vaisx.config.ts
import { defineConfig } from "@vaisx/kit";

export default defineConfig({
  prerender: true,
  fallback: "200.html", // enables client-side routing
});
```

```bash
pnpm build
```

### Netlify

```toml
# netlify.toml
[build]
  command   = "pnpm build"
  publish   = "dist"

[[redirects]]
  from   = "/*"
  to     = "/200.html"
  status = 200
```

Deploy by connecting your Git repository in the Netlify dashboard, or with the
CLI:

```bash
pnpm add -D netlify-cli
pnpm netlify deploy --prod --dir dist
```

### GitHub Pages

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - uses: actions/deploy-pages@v4
```

Set `base` in `vaisx.config.ts` if deploying to `https://<user>.github.io/<repo>/`:

```typescript
export default defineConfig({
  prerender: true,
  base: "/my-repo/",
});
```

## Environment variable handling

| Module | Available | Usage |
|---|---|---|
| `$env/static/private` | Server only, build-time | `DATABASE_URL`, `SECRET_KEY` |
| `$env/static/public` | Client + server, build-time | `PUBLIC_API_URL` |
| `$env/dynamic/private` | Server only, runtime | Values from `process.env` at runtime |
| `$env/dynamic/public` | Client + server, runtime | Values prefixed `PUBLIC_` |

Never import `$env/static/private` or `$env/dynamic/private` from client code —
VaisX's bundler will throw a build error if you do.
