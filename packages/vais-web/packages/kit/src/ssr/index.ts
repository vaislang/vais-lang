/**
 * SSR engine — public API re-exports.
 */

export type { HtmlShellOptions } from "./html.js";
export { renderHtmlShell } from "./html.js";

export {
  detectComponentType,
  renderServerComponent,
  renderClientComponent,
} from "./component.js";

export type { RenderOptions } from "./renderer.js";
export { renderToString } from "./renderer.js";

export { renderToStream } from "./stream.js";

export type {
  SsrRenderRequest,
  SsrRenderResponse,
  SsrServiceConfig,
} from "./server-bridge.js";
export { createSsrService } from "./server-bridge.js";
