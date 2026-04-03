# API Reference

Complete API documentation for all VaisX packages.

## Packages

| Package | Description |
|---|---|
| [`@vaisx/runtime`](./runtime) | DOM helpers, signals, scheduler, and lifecycle hooks for compiled component output |
| [`@vaisx/kit`](./kit) | Router types, SSR/SSG utilities, middleware, and adapter interfaces |
| [`@vaisx/components`](./components) | Tree-shakeable UI primitives — Button, Input, Link, Modal, and more |
| [`@vaisx/cli`](./cli) | Command-line tooling for scaffolding, developing, and building VaisX apps |

---

### @vaisx/runtime

The minimal runtime (< 3 KB gzipped) consumed by `vaisx-compiler` codegen output.
Provides reactive signals, a microtask batch scheduler, DOM mutation helpers, and
component lifecycle hooks.

```typescript
import { createSignal, createEffect, $$mount } from "@vaisx/runtime";

const count = createSignal(0);

createEffect(() => {
  console.log("count:", count());
});

count.set(1); // logs: count: 1
```

---

### @vaisx/kit

Type definitions and utilities for the file-system router, server-side rendering,
static site generation, middleware, and deployment adapters.

```typescript
import type { LoadFunction, ActionFunction, MiddlewareFunction } from "@vaisx/kit";

export const load: LoadFunction = async ({ params, request }) => {
  const data = await fetchPost(params.slug as string);
  return { post: data };
};
```

---

### @vaisx/components

A set of accessible, tree-shakeable UI components. Each component ships as a
`.vaisx` single-file component and accepts a typed `Props` interface.

```typescript
import type { ButtonProps } from "@vaisx/components";
// Use <Button variant="primary" size="md">Click me</Button> in .vaisx files
```

---

### @vaisx/cli

Command-line interface and programmatic API for building and scaffolding VaisX
projects.

```bash
vaisx new my-app
vaisx dev --port 3000
vaisx build --out dist
```
