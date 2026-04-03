# Styling

VaisX provides a flexible styling system that supports scoped component CSS,
global stylesheets, CSS custom properties, and dark mode — all without any
runtime overhead.

## Scoped CSS with `<style>` blocks

Add a `<style>` block to any `.vx` component file. VaisX automatically scopes
the styles to that component by injecting a unique attribute selector at build
time.

```typescript
// src/components/Button.vx.ts
export default function Button({ label, onClick }) {
  return <button class="btn" onClick={onClick}>{label}</button>;
}
```

```css
/* In the same Button.vx.ts file, or in Button.vx.css */
/* <style> */
.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 0.375rem;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 150ms;
}

.btn:hover {
  background: var(--color-primary-hover);
}
/* </style> */
```

At build time VaisX transforms `.btn` into `.btn[data-vx-s-abc123]` and adds
`data-vx-s-abc123` to the element, so `.btn` styles never leak into other
components.

### Single-file component syntax

Write CSS directly in a `<style>` tag inside a `.vx` single-file component:

```vx
<script>
export default function Card({ title, body }) {
  return (
    <div class="card">
      <h2 class="title">{title}</h2>
      <p>{body}</p>
    </div>
  );
}
</script>

<style>
.card {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
  background: var(--color-surface);
}

.title {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
</style>
```

### `:global()` escape hatch

Sometimes you need to target elements outside the component (e.g., slotted
children or third-party library nodes). Wrap the selector in `:global()`:

```css
/* Targets any .prose element anywhere in the DOM */
:global(.prose) p {
  line-height: 1.75;
}

/* Scoped parent, global child */
.wrapper :global(pre) {
  overflow-x: auto;
}
```

## Global styles

Styles that should apply across the entire application live in
`src/app.css` (or any file imported in `src/app.ts`).

```css
/* src/app.css */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  font-family: "Inter", system-ui, sans-serif;
  line-height: 1.5;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
}
```

Import the file in the app entry point:

```typescript
// src/app.ts
import "./app.css";
```

### Global stylesheet via config

You can also declare global stylesheets in `vaisx.config.ts` so they are
injected into every page without an explicit import:

```typescript
// vaisx.config.ts
import { defineConfig } from "@vaisx/kit";

export default defineConfig({
  css: {
    global: ["src/app.css", "src/fonts.css"],
  },
});
```

## CSS custom properties (variables)

Define design tokens as CSS custom properties on `:root` and reference them
throughout your components. This approach is zero-cost at runtime and works
seamlessly with VaisX's scoped CSS.

```css
/* src/app.css */
:root {
  /* Color palette */
  --color-primary:       #6366f1;
  --color-primary-hover: #4f46e5;
  --color-bg:            #ffffff;
  --color-surface:       #f9fafb;
  --color-text:          #111827;
  --color-border:        #e5e7eb;
  --color-muted:         #6b7280;

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;

  /* Spacing scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-8: 2rem;

  /* Radii */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-full: 9999px;
}
```

### Updating variables reactively

Because CSS custom properties are live, you can update a token with
`element.style.setProperty` and every consumer re-paints instantly:

```typescript
import { signal, effect } from "@vaisx/runtime";

const hue = signal(240);

effect(() => {
  document.documentElement.style.setProperty(
    "--color-primary",
    `hsl(${hue.value} 80% 60%)`
  );
});

// Later — changing hue re-paints the whole page instantly
hue.value = 120;
```

## Dark mode

VaisX supports two common dark-mode strategies out of the box: a `prefers-color-scheme`
media query and a class-based toggle.

### Strategy 1 — media query (automatic)

```css
/* src/app.css */
:root {
  --color-bg:   #ffffff;
  --color-text: #111827;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:   #0f172a;
    --color-text: #f1f5f9;
  }
}
```

No JavaScript required — the browser switches automatically.

### Strategy 2 — class-based toggle (manual control)

Apply a `.dark` class to `<html>` to switch themes. This lets users override the
system preference.

```css
/* src/app.css */
:root {
  --color-bg:   #ffffff;
  --color-text: #111827;
}

:root.dark {
  --color-bg:   #0f172a;
  --color-text: #f1f5f9;
}
```

Manage the class with a signal and persist the preference to `localStorage`:

```typescript
// src/lib/theme.ts
import { signal, effect } from "@vaisx/runtime";

type Theme = "light" | "dark" | "system";

const stored = (localStorage.getItem("theme") ?? "system") as Theme;
export const theme = signal<Theme>(stored);

effect(() => {
  const t = theme.value;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = t === "dark" || (t === "system" && prefersDark);

  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem("theme", t);
});
```

Use the signal in a toggle component:

```typescript
// src/components/ThemeToggle.vx.ts
import { theme } from "$lib/theme";

export default function ThemeToggle() {
  function cycle() {
    const order: Theme[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(theme.value) + 1) % order.length];
    theme.value = next;
  }

  return (
    <button onClick={cycle} aria-label="Toggle theme">
      {theme.value === "dark" ? "🌙" : theme.value === "light" ? "☀️" : "💻"}
    </button>
  );
}
```

### Preventing flash of unstyled content (FOUC)

For class-based dark mode, inject a blocking script in `<head>` so the correct
class is applied before the browser paints:

```html
<!-- src/app.html -->
<head>
  <script>
    (function () {
      var t = localStorage.getItem("theme");
      var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (t === "dark" || (!t || t === "system") && prefersDark) {
        document.documentElement.classList.add("dark");
      }
    })();
  </script>
</head>
```

This script is tiny, synchronous, and runs before any CSS is parsed, eliminating
the white flash on page load.

## Best practices

- Define all design tokens as CSS custom properties in `src/app.css`. Components
  should reference tokens, not hard-coded values.
- Avoid inline `style` attributes for presentational values — they bypass scoping
  and cannot be overridden with normal CSS specificity.
- Use `:global()` sparingly; prefer passing class names via props when you need
  to style children from a parent.
- Co-locate component styles in the same `.vx` file or a sibling `.vx.css` file
  so styles and markup stay in sync during refactors.
- For dark mode, test with `prefers-color-scheme: dark` in browser DevTools and
  with `localStorage.setItem("theme", "dark")` to cover both paths.
