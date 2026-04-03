/**
 * HTML shell/template generation for SSR output.
 */

export interface HtmlShellOptions {
  /** Additional <head> content (meta, title, styles) */
  head?: string;
  /** Page body HTML */
  body: string;
  /** JS module paths to include */
  scripts?: string[];
  /** CSS paths to include */
  styles?: string[];
  /** Serialized state for hydration */
  state?: Record<string, unknown>;
  /** html lang attribute (default: "en") */
  lang?: string;
}

/**
 * Escape a string for safe use in an HTML attribute value (double-quoted).
 */
export function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generates a complete HTML5 document shell.
 */
export function renderHtmlShell(options: HtmlShellOptions): string {
  const lang = escapeHtmlAttr(options.lang ?? "en");
  const headContent = options.head ?? "";

  const styleLinks = (options.styles ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtmlAttr(href)}">`)
    .join("");

  const stateScript =
    options.state !== undefined
      ? `<script id="__vaisx_state__" type="application/json">${JSON.stringify(options.state).replace(/</g, "\\u003c")}</script>`
      : "";

  const scriptTags = (options.scripts ?? [])
    .map((src) => `<script type="module" src="${escapeHtmlAttr(src)}"></script>`)
    .join("");

  return `<!DOCTYPE html><html lang="${lang}"><head>${styleLinks}${headContent}${stateScript}</head><body>${options.body}${scriptTags}</body></html>`;
}
