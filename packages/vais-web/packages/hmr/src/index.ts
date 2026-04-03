/**
 * @vaisx/hmr — Public API
 *
 * Server-side exports for integration with the dev server.
 * Client-side exports available via "@vaisx/hmr/client".
 */

// Server
export { HmrServer } from "./server.js";
export type { HmrWebSocket, HmrServerOptions } from "./server.js";

// Protocol types
export {
  createHmrModuleRecord,
} from "./protocol.js";

export type {
  HmrServerMessage,
  HmrClientMessage,
  HmrConnectedMessage,
  HmrUpdateMessage,
  HmrCssUpdateMessage,
  HmrFullReloadMessage,
  HmrErrorMessage,
  HmrAcceptMessage,
  HmrDeclineMessage,
  HmrModuleRecord,
} from "./protocol.js";

// Client API types (for compiler codegen)
export type { HotContext, HmrClientOptions } from "./client.js";
