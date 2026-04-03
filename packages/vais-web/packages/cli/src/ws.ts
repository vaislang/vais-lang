/**
 * Minimal WebSocket server implementation for HMR.
 *
 * Uses Node.js built-in `http` upgrade mechanism.
 * Only supports text frames (sufficient for JSON HMR messages).
 */

import * as http from "node:http";
import * as crypto from "node:crypto";
import type * as stream from "node:stream";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// WebSocket frame constants
// ---------------------------------------------------------------------------

const OPCODE_TEXT = 0x01;
const OPCODE_CLOSE = 0x08;
const OPCODE_PING = 0x09;
const OPCODE_PONG = 0x0a;
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-5AB9DC80AB06";

// ---------------------------------------------------------------------------
// WebSocket (single connection)
// ---------------------------------------------------------------------------

export class WebSocket extends EventEmitter {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState: number = WebSocket.OPEN;
  private socket: stream.Duplex;

  constructor(socket: stream.Duplex) {
    super();
    this.socket = socket;

    let buffer = Buffer.alloc(0);

    socket.on("data", (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 2) {
        const parsed = this.parseFrame(buffer);
        if (!parsed) break;
        const { frame, bytesConsumed } = parsed;
        buffer = buffer.subarray(bytesConsumed);

        if (frame.opcode === OPCODE_TEXT) {
          this.emit("message", frame.payload.toString("utf-8"));
        } else if (frame.opcode === OPCODE_CLOSE) {
          this.readyState = WebSocket.CLOSED;
          this.sendCloseFrame();
          socket.end();
          this.emit("close");
          return;
        } else if (frame.opcode === OPCODE_PING) {
          this.sendPong(frame.payload);
        }
      }
    });

    socket.on("close", () => {
      this.readyState = WebSocket.CLOSED;
      this.emit("close");
    });

    socket.on("error", (err) => {
      this.readyState = WebSocket.CLOSED;
      this.emit("error", err);
    });
  }

  send(data: string): void {
    if (this.readyState !== WebSocket.OPEN) return;
    const payload = Buffer.from(data, "utf-8");
    const frame = this.createFrame(OPCODE_TEXT, payload);
    this.socket.write(frame);
  }

  close(): void {
    if (this.readyState !== WebSocket.OPEN) return;
    this.readyState = WebSocket.CLOSED;
    this.sendCloseFrame();
    this.socket.end();
  }

  private parseFrame(
    buf: Buffer,
  ): { frame: { opcode: number; payload: Buffer }; bytesConsumed: number } | null {
    if (buf.length < 2) return null;

    const firstByte = buf[0]!;
    const secondByte = buf[1]!;
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (buf.length < 4) return null;
      payloadLength = buf.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (buf.length < 10) return null;
      // For HMR messages, we won't need >2GB frames
      payloadLength = Number(buf.readBigUInt64BE(2));
      offset = 10;
    }

    const maskSize = masked ? 4 : 0;
    const totalLength = offset + maskSize + payloadLength;
    if (buf.length < totalLength) return null;

    let payload: Buffer;
    if (masked) {
      const mask = buf.subarray(offset, offset + 4);
      payload = Buffer.alloc(payloadLength);
      for (let i = 0; i < payloadLength; i++) {
        payload[i] = buf[offset + 4 + i]! ^ mask[i % 4]!;
      }
    } else {
      payload = buf.subarray(offset, offset + payloadLength);
    }

    return { frame: { opcode, payload }, bytesConsumed: totalLength };
  }

  private createFrame(opcode: number, payload: Buffer): Buffer {
    const length = payload.length;
    let header: Buffer;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode; // FIN + opcode
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    return Buffer.concat([header, payload]);
  }

  private sendCloseFrame(): void {
    const frame = this.createFrame(OPCODE_CLOSE, Buffer.alloc(0));
    try {
      this.socket.write(frame);
    } catch {
      // Socket may already be closed
    }
  }

  private sendPong(payload: Buffer): void {
    const frame = this.createFrame(OPCODE_PONG, payload);
    try {
      this.socket.write(frame);
    } catch {
      // Socket may already be closed
    }
  }
}

// ---------------------------------------------------------------------------
// WebSocket Server
// ---------------------------------------------------------------------------

export class WebSocketServer extends EventEmitter {
  constructor(httpServer: http.Server) {
    super();

    httpServer.on("upgrade", (req, socket, head) => {
      // Only handle /__vaisx_hmr path
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/__vaisx_hmr") {
        socket.destroy();
        return;
      }

      const key = req.headers["sec-websocket-key"];
      if (!key) {
        socket.destroy();
        return;
      }

      const acceptKey = crypto
        .createHash("sha1")
        .update(key + WS_MAGIC)
        .digest("base64");

      const headers = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${acceptKey}`,
        "",
        "",
      ].join("\r\n");

      socket.write(headers);

      const ws = new WebSocket(socket);
      this.emit("connection", ws);
    });
  }
}
