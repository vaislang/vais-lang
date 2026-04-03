/**
 * Core SSR rendering logic.
 */

import type { RenderResult } from "../types.js";
import type { ResolvedRoute } from "../router/resolver.js";
import { renderHtmlShell } from "./html.js";

export interface RenderOptions {
  /** The resolved route to render */
  route: ResolvedRoute;
  /** Function to get compiled component HTML */
  renderComponent: (
    filePath: string,
    props?: Record<string, unknown>
  ) => Promise<string>;
  /** Head content */
  head?: string;
  /** Scripts to include */
  scripts?: string[];
  /** Styles to include */
  styles?: string[];
}

/**
 * Render the page and layout chain to a full HTML string.
 *
 * Layout wrapping strategy:
 *   1. Render the page component first.
 *   2. Wrap in layouts from innermost (last in layoutChain) to outermost (first).
 *      Each layout receives the child content via the `{slot}` placeholder.
 */
export async function renderToString(
  options: RenderOptions
): Promise<RenderResult> {
  const { route, renderComponent, head, scripts, styles } = options;

  // 1. Render the page component
  const pagePath = route.route.page;
  let pageHtml = pagePath ? await renderComponent(pagePath) : "";

  // 2. Wrap in layout chain (innermost → outermost)
  // layoutChain is ordered root → nearest, so we reverse to start from innermost
  const layouts = [...route.layoutChain].reverse();
  let bodyHtml = pageHtml;
  for (const layoutPath of layouts) {
    const layoutHtml = await renderComponent(layoutPath);
    bodyHtml = layoutHtml.replace("{slot}", bodyHtml);
  }

  // 3. Build full HTML document
  const html = renderHtmlShell({
    head,
    body: bodyHtml,
    scripts,
    styles,
  });

  return {
    html,
    head: head ?? "",
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  };
}
