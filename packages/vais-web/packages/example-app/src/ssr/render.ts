/**
 * Server-Side Rendering simulation.
 * Produces HTML strings from page components — mirrors the VaisX SSR pipeline.
 */

import type { RenderResult, RouteContext } from "../types.js";

// ── HTML Utilities ─────────────────────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(name: string, value: string): string {
  return `${name}="${escapeHtml(value)}"`;
}

export function el(
  tag: string,
  attributes: Record<string, string>,
  ...children: string[]
): string {
  const attrStr = Object.entries(attributes)
    .map(([k, v]) => attr(k, v))
    .join(" ");
  const opening = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
  return `${opening}${children.join("")}</${tag}>`;
}

export function voidEl(tag: string, attributes: Record<string, string>): string {
  const attrStr = Object.entries(attributes)
    .map(([k, v]) => attr(k, v))
    .join(" ");
  return attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
}

// ── Document Shell ─────────────────────────────────────────────────────────────

export function renderDocument(options: {
  title: string;
  body: string;
  locale?: string;
  meta?: string;
  scripts?: string;
  styles?: string;
}): string {
  const { title, body, locale = "en", meta = "", scripts = "", styles = "" } = options;
  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${meta}
  ${styles}
</head>
<body>
  <div id="app">${body}</div>
  ${scripts}
</body>
</html>`.trim();
}

// ── SSR Renderer ──────────────────────────────────────────────────────────────

export type PageComponent = (context: RouteContext) => {
  title: string;
  body: string;
  meta?: string;
  statusCode?: number;
};

/**
 * Render a page component to a full HTML document string.
 * Simulates the VaisX SSR pipeline: component → render → HTML.
 */
export function renderPage(
  component: PageComponent,
  context: RouteContext,
): RenderResult {
  const startTime = Date.now();

  let pageResult: ReturnType<PageComponent>;
  let statusCode = 200;

  try {
    pageResult = component(context);
    statusCode = pageResult.statusCode ?? 200;
  } catch (err) {
    const message = err instanceof Error ? escapeHtml(err.message) : "Unknown error";
    pageResult = {
      title: "500 Internal Server Error",
      body: `<div class="error"><h1>500 Internal Server Error</h1><p>${message}</p></div>`,
      statusCode: 500,
    };
    statusCode = 500;
  }

  const html = renderDocument({
    title: pageResult.title,
    body: pageResult.body,
    locale: context.locale,
    meta: pageResult.meta,
    scripts: `<script>window.__VAISX_SSR__ = true; window.__VAISX_LOCALE__ = "${escapeHtml(context.locale)}";</script>`,
    styles: `<link rel="stylesheet" href="/styles/main.css">`,
  });

  const headParts: string[] = [
    `<title>${escapeHtml(pageResult.title)}</title>`,
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
  ];
  if (pageResult.meta) {
    headParts.push(pageResult.meta);
  }
  const head = headParts.join("\n  ");

  const renderTime = Date.now() - startTime;

  return {
    html,
    head,
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Render-Time": `${renderTime}ms`,
      "X-Frame-Options": "SAMEORIGIN",
      "X-Content-Type-Options": "nosniff",
    },
  };
}

/**
 * Render a 404 Not Found page.
 */
export function render404(context: RouteContext): RenderResult {
  const body = `
    <div class="not-found">
      <h1>404 Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <a href="/">Return to Home</a>
    </div>
  `.trim();

  const html = renderDocument({
    title: "404 Not Found",
    body,
    locale: context.locale,
  });

  return {
    html,
    head: `<title>404 Not Found</title>`,
    statusCode: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  };
}

/**
 * Batch render — simulate rendering multiple pages in parallel.
 * Used in load testing scenarios.
 */
export function batchRender(
  requests: Array<{ component: PageComponent; context: RouteContext }>,
): RenderResult[] {
  return requests.map(({ component, context }) => renderPage(component, context));
}
