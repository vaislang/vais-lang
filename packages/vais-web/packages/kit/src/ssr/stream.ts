/**
 * Streaming HTML support for SSR.
 *
 * Stream order:
 *   HTML shell start → head → body start → layout chain → page → body end → scripts
 */

import type { StreamRenderResult } from "../types.js";
import type { RenderOptions } from "./renderer.js";
import { escapeHtmlAttr } from "./html.js";

/**
 * Render the page and layout chain as a streamed ReadableStream of HTML chunks.
 */
export function renderToStream(options: RenderOptions): StreamRenderResult {
  const { route, renderComponent, head, scripts, styles } = options;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const enqueue = (chunk: string) =>
          controller.enqueue(encoder.encode(chunk));

        // 1. HTML shell start
        enqueue("<!DOCTYPE html><html lang=\"en\"><head>");

        // 2. Styles
        for (const href of styles ?? []) {
          enqueue(`<link rel="stylesheet" href="${escapeHtmlAttr(href)}">`);
        }

        // 3. Head content
        if (head) {
          enqueue(head);
        }

        enqueue("</head>");

        // 4. Body start
        enqueue("<body>");

        // 5. Render page component
        const pagePath = route.route.page;
        let pageHtml = pagePath ? await renderComponent(pagePath) : "";

        // 6. Wrap in layout chain (innermost → outermost) and stream
        // layoutChain is root → nearest; reverse for innermost-first wrapping
        const layouts = [...route.layoutChain].reverse();
        let bodyHtml = pageHtml;
        for (const layoutPath of layouts) {
          const layoutHtml = await renderComponent(layoutPath);
          bodyHtml = layoutHtml.replace("{slot}", bodyHtml);
        }

        enqueue(bodyHtml);

        // 7. Body end
        enqueue("</body>");

        // 8. Scripts
        for (const src of scripts ?? []) {
          enqueue(`<script type="module" src="${escapeHtmlAttr(src)}"></script>`);
        }

        enqueue("</html>");

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return {
    stream,
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "transfer-encoding": "chunked",
    },
  };
}
