# Getting Started

Welcome to VaisX — the token-efficient frontend framework that combines the best of Next.js and Svelte with the Vais language.

## Installation

Install VaisX using your preferred package manager:

```bash
npm install -g vaisx
# or
pnpm add -g vaisx
# or
yarn global add vaisx
```

## Create Your First Project

Use the `create-vaisx` CLI to scaffold a new project:

```bash
npx create-vaisx my-app
cd my-app
```

You will be prompted to choose a template:

- **minimal** — Bare-bones starter with one page
- **docs** — Documentation site (like this one)
- **full-stack** — App with server actions and database

## Project Structure

A typical VaisX project looks like this:

```
my-app/
  app/
    layout.vaisx      # Root layout
    page.vaisx        # Home page (route: /)
    about/
      page.vaisx      # About page (route: /about)
  content/            # Markdown or data files
  vaisx.config.ts     # Framework configuration
  package.json
```

## Start the Dev Server

```bash
npm run dev
```

Your app is now running at `http://localhost:3000`. The dev server supports:

- Hot module replacement
- Instant SSR preview
- Error overlays with Vais source maps

## Build for Production

```bash
npm run build
npm run start
```

VaisX compiles your `.vaisx` files to minimal JavaScript and generates fully server-rendered HTML by default.

## Next Steps

- [Components](/docs/components) — Learn the component model, props, and slots
- [Routing](/docs/routing) — File-based routing, dynamic segments, and layouts
