# Routing

VaisX uses file-based routing. Every `page.vaisx` file inside the `app/` directory becomes a route.

## File-Based Routes

| File path                        | Route             |
|----------------------------------|-------------------|
| `app/page.vaisx`                 | `/`               |
| `app/about/page.vaisx`           | `/about`          |
| `app/blog/page.vaisx`            | `/blog`           |
| `app/blog/[slug]/page.vaisx`     | `/blog/:slug`     |
| `app/shop/[...path]/page.vaisx`  | `/shop/*`         |

## Dynamic Routes

Wrap a directory name in square brackets to create a dynamic segment:

```
app/
  docs/
    [slug]/
      page.vaisx    # matches /docs/getting-started, /docs/api, etc.
```

Access the dynamic segment via the `params` object in a `#[server]` load function:

```vaisx
<script>
  #[server]
  A F load(params: RouteParams) -> PageData {
    slug := params.slug
    post := await fetchPost(slug)
    R PageData { post: post }
  }
</script>

<template>
  <article>
    <h1>{post.title}</h1>
    <div>{post.body}</div>
  </article>
</template>
```

## Layouts

A `layout.vaisx` file wraps all pages in its directory and any subdirectories. Use `{slot}` to render the child page:

```
app/
  layout.vaisx      # wraps all routes
  page.vaisx        # /
  dashboard/
    layout.vaisx    # wraps only /dashboard routes
    page.vaisx      # /dashboard
    settings/
      page.vaisx    # /dashboard/settings
```

Example layout:

```vaisx
<template>
  <div class="shell">
    <header>My App</header>
    <main>{slot}</main>
    <footer>© 2026</footer>
  </div>
</template>
```

## SSR (Server-Side Rendering)

SSR is enabled by default. Every page is rendered on the server before being sent to the browser. Use a `#[server]` load function to fetch data at request time:

```vaisx
<script>
  #[server]
  A F load(params: RouteParams, request: Request) -> PageData {
    data := await db.query("SELECT * FROM products")
    R PageData { products: data }
  }
</script>
```

## SSG (Static Site Generation)

Opt a page into static generation by exporting a `generateStaticParams` function:

```vaisx
<script context="server">
  #[server]
  A F generateStaticParams() -> StaticParams[] {
    slugs := await getAllSlugs()
    R slugs.map(s => StaticParams { slug: s })
  }

  #[server]
  A F load(params: RouteParams) -> PageData {
    content := await readContent(params.slug)
    R PageData { content: content }
  }
</script>
```

VaisX pre-renders these pages at build time and serves them as static HTML.

## Redirects

Return a `redirect()` call from a load function to send the user to a different route:

```vaisx
<script>
  #[server]
  A F load() {
    R redirect("/docs/getting-started")
  }
</script>
```

## Error Pages

Create a `not-found.vaisx` or `error.vaisx` file alongside your layout to handle 404 and error states:

```
app/
  layout.vaisx
  not-found.vaisx   # shown for 404
  error.vaisx       # shown for unexpected errors
  page.vaisx
```
