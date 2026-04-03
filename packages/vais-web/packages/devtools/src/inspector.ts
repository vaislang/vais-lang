import { WebSocketServer, WebSocket } from "ws";
import type { DevToolsEvent, DevToolsMessage } from "./protocol.js";

export type MessageHandler = (
  msg: DevToolsMessage,
  clientId: string
) => void;

export class InspectorServer {
  private port: number;
  private wss: WebSocketServer | null = null;
  private messageHandlers: MessageHandler[] = [];
  private clientCounter = 0;

  readonly clients: Map<string, WebSocket> = new Map();

  constructor(options?: { port?: number }) {
    this.port = options?.port ?? 8098;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on("error", (err) => {
        reject(err);
      });

      this.wss.on("listening", () => {
        resolve();
      });

      this.wss.on("connection", (socket: WebSocket) => {
        const clientId = `client-${++this.clientCounter}`;
        this.clients.set(clientId, socket);

        socket.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString()) as DevToolsMessage;
            for (const handler of this.messageHandlers) {
              handler(msg, clientId);
            }
          } catch {
            // ignore malformed messages
          }
        });

        socket.on("close", () => {
          this.clients.delete(clientId);
        });

        socket.on("error", () => {
          this.clients.delete(clientId);
        });
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.wss) {
        resolve();
        return;
      }

      // Close all client connections first
      for (const [, socket] of this.clients) {
        socket.terminate();
      }
      this.clients.clear();

      this.wss.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.wss = null;
          resolve();
        }
      });
    });
  }

  broadcast(event: DevToolsEvent): void {
    const payload = JSON.stringify(event);
    for (const [, socket] of this.clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }
}
