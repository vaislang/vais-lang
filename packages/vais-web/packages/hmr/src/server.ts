/**
 * HMR server-side logic.
 *
 * Manages the list of connected clients and broadcasts HMR messages.
 * Designed to integrate with the VaisX dev server's WebSocket layer.
 */

import type {
  HmrServerMessage,
  HmrUpdateMessage,
  HmrCssUpdateMessage,
  HmrErrorMessage,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal WebSocket interface (compatible with @vaisx/cli's ws.ts). */
export interface HmrWebSocket {
  send(data: string): void;
  close(): void;
  readyState: number;
  on(event: "message", handler: (data: string) => void): void;
  on(event: "close", handler: () => void): void;
}

export interface HmrServerOptions {
  /** Called when a client sends a message. */
  onClientMessage?: (ws: HmrWebSocket, data: string) => void;
}

// ---------------------------------------------------------------------------
// HMR Server
// ---------------------------------------------------------------------------

export class HmrServer {
  private clients = new Set<HmrWebSocket>();
  private options: HmrServerOptions;

  constructor(options: HmrServerOptions = {}) {
    this.options = options;
  }

  /** Register a new WebSocket client. */
  addClient(ws: HmrWebSocket): void {
    this.clients.add(ws);

    // Send connected message
    this.send(ws, { type: "connected" });

    ws.on("message", (data: string) => {
      this.options.onClientMessage?.(ws, data);
    });

    ws.on("close", () => {
      this.clients.delete(ws);
    });
  }

  /** Number of connected clients. */
  get clientCount(): number {
    return this.clients.size;
  }

  /** Send a component update to all clients. */
  notifyUpdate(file: string, code?: string): void {
    const msg: HmrUpdateMessage = {
      type: "update",
      file,
      timestamp: Date.now(),
      code,
    };
    this.broadcast(msg);
  }

  /** Send a CSS-only update to all clients. */
  notifyCssUpdate(file: string, css: string): void {
    const msg: HmrCssUpdateMessage = {
      type: "css-update",
      file,
      css,
      timestamp: Date.now(),
    };
    this.broadcast(msg);
  }

  /** Send a full reload signal. */
  notifyFullReload(file?: string): void {
    this.broadcast({ type: "full-reload", file });
  }

  /** Send an error to all clients. */
  notifyError(file: string, message: string, offset?: number): void {
    const msg: HmrErrorMessage = {
      type: "error",
      file,
      message,
      offset,
    };
    this.broadcast(msg);
  }

  /** Broadcast a message to all connected clients. */
  private broadcast(msg: HmrServerMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      this.send(client, msg, data);
    }
  }

  /** Send a message to a single client. */
  private send(ws: HmrWebSocket, _msg: HmrServerMessage, serialized?: string): void {
    const data = serialized ?? JSON.stringify(_msg);
    try {
      ws.send(data);
    } catch {
      // Client may have disconnected
      this.clients.delete(ws);
    }
  }

  /** Disconnect all clients. */
  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}
