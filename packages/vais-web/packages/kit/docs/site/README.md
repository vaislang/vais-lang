# VaisX Documentation Site

This is the official documentation site for VaisX and VaisKit, built with VaisX itself.

## Stack

- **Framework**: VaisX (file-based routing, SSR/SSG)
- **Language**: Vais (`.vaisx` components)
- **Content**: Markdown files in `content/`

## Project Structure

```
docs/site/
  app/
    layout.vaisx            # Root layout with sidebar navigation
    page.vaisx              # Landing page (/)
    docs/
      page.vaisx            # Redirects to /docs/getting-started
      [slug]/
        page.vaisx          # Dynamic doc page (/docs/:slug)
  content/
    getting-started.md      # Installation and first steps
    components.md           # Component model reference
    routing.md              # File-based routing reference
  vaisx.config.ts           # VaisX configuration
  package.json
  README.md
```

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start the dev server
pnpm --filter vaisx-docs dev
```

The site runs at `http://localhost:3000` by default.

## Building

```bash
# Production build
pnpm --filter vaisx-docs build

# Preview the production build
pnpm --filter vaisx-docs start
```

## Adding Documentation

1. Create a new Markdown file in `content/`, e.g. `content/api-reference.md`
2. Add a link to `app/layout.vaisx` in the sidebar `<ul>`
3. The dynamic route `app/docs/[slug]/page.vaisx` picks it up automatically

## Rendering Strategy

- `/docs/[slug]` pages are statically generated (`ssg`) at build time
- All other routes use server-side rendering (`ssr`) by default

See `vaisx.config.ts` for the full configuration.
