/**
 * HMR protocol message types.
 *
 * Communication flow:
 *   Server -> Client: update, css-update, full-reload, error, connected
 *   Client -> Server: accept, decline
 */

// ---------------------------------------------------------------------------
// Server -> Client messages
// ---------------------------------------------------------------------------

export interface HmrConnectedMessage {
  type: "connected";
}

export interface HmrUpdateMessage {
  type: "update";
  /** Relative path of the changed .vaisx file. */
  file: string;
  /** Timestamp of the update. */
  timestamp: number;
  /** The compiled JS code (for component hot-swap). */
  code?: string;
}

export interface HmrCssUpdateMessage {
  type: "css-update";
  /** Relative path of the changed CSS/style. */
  file: string;
  /** The new CSS content. */
  css: string;
  /** Timestamp of the update. */
  timestamp: number;
}

export interface HmrFullReloadMessage {
  type: "full-reload";
  /** Optional path that triggered the reload. */
  file?: string;
}

export interface HmrErrorMessage {
  type: "error";
  /** The file that caused the error. */
  file: string;
  /** Error message. */
  message: string;
  /** Optional source location. */
  offset?: number;
}

export type HmrServerMessage =
  | HmrConnectedMessage
  | HmrUpdateMessage
  | HmrCssUpdateMessage
  | HmrFullReloadMessage
  | HmrErrorMessage;

// ---------------------------------------------------------------------------
// Client -> Server messages
// ---------------------------------------------------------------------------

export interface HmrAcceptMessage {
  type: "accept";
  /** The file that the client accepts updates for. */
  file: string;
}

export interface HmrDeclineMessage {
  type: "decline";
  /** The file that the client declines updates for. */
  file: string;
}

export type HmrClientMessage = HmrAcceptMessage | HmrDeclineMessage;

// ---------------------------------------------------------------------------
// Module map for component state preservation
// ---------------------------------------------------------------------------

export interface HmrModuleRecord {
  /** Module ID (file path). */
  id: string;
  /** Accept callbacks for self-accepting modules. */
  acceptCallbacks: Array<(mod: unknown) => void>;
  /** Dispose callbacks (cleanup before replacement). */
  disposeCallbacks: Array<(data: Record<string, unknown>) => void>;
  /** Data passed from dispose to accept (state preservation). */
  data: Record<string, unknown>;
  /** Whether this module accepts hot updates. */
  accepted: boolean;
  /** Whether this module declines hot updates (requires full reload). */
  declined: boolean;
}

/**
 * Create a fresh HMR module record.
 */
export function createHmrModuleRecord(id: string): HmrModuleRecord {
  return {
    id,
    acceptCallbacks: [],
    disposeCallbacks: [],
    data: {},
    accepted: false,
    declined: false,
  };
}
