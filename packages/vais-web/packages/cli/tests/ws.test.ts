import { describe, it, expect, afterEach } from "vitest";
import * as http from "node:http";
import * as crypto from "node:crypto";
import * as net from "node:net";
import { WebSocketServer, WebSocket } from "../src/ws.js";

const openSockets: net.Socket[] = [];

function createTestServer(): { server: http.Server; wss: WebSocketServer; getPort: () => number } {
  const server = http.createServer();
  // Track all connections so we can force-close them
  server.on("connection", (socket) => openSockets.push(socket));
  const wss = new WebSocketServer(server);
  return {
    server,
    wss,
    getPort: () => {
      const addr = server.address();
      return typeof addr === "object" && addr ? addr.port : 0;
    },
  };
}

function connectWs(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString("base64");
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        [
          "GET /__vaisx_hmr HTTP/1.1",
          "Host: 127.0.0.1",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"),
      );
      // Wait for the 101 response
      socket.once("data", () => resolve(socket));
    });
    openSockets.push(socket);
    socket.on("error", reject);
  });
}

function sendTextFrame(socket: net.Socket, text: string): void {
  const payload = Buffer.from(text, "utf-8");
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i]! ^ mask[i % 4]!;
  }

  let header: Buffer;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text
    header[1] = 0x80 | payload.length; // masked
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  }

  socket.write(Buffer.concat([header, mask, masked]));
}

describe("WebSocketServer", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    // Force-close all open sockets first
    for (const s of openSockets) {
      s.destroy();
    }
    openSockets.length = 0;

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it("accepts WebSocket connections on /__vaisx_hmr", async () => {
    const { server: s, wss, getPort } = createTestServer();
    server = s;

    const connected = new Promise<WebSocket>((resolve) => {
      wss.on("connection", resolve);
    });

    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    const port = getPort();

    const socket = await connectWs(port);
    const ws = await connected;

    expect(ws.readyState).toBe(WebSocket.OPEN);

    socket.destroy();
  });

  it("sends and receives text messages", async () => {
    const { server: s, wss, getPort } = createTestServer();
    server = s;

    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    const port = getPort();

    // Set up server-side handling before client connects
    const serverMsg = new Promise<string>((resolve) => {
      wss.on("connection", (ws) => {
        ws.on("message", (data: string) => resolve(data));
      });
    });

    const socket = await connectWs(port);

    // Send a client message and verify the server receives it
    sendTextFrame(socket, "hello from client");
    const received = await serverMsg;
    expect(received).toBe("hello from client");

    socket.destroy();
  });

  it("rejects non-HMR upgrade paths", async () => {
    const { server: s, getPort } = createTestServer();
    server = s;

    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    const port = getPort();

    const socket = net.connect(port, "127.0.0.1");
    openSockets.push(socket);
    const key = crypto.randomBytes(16).toString("base64");

    socket.write(
      [
        "GET /not-hmr HTTP/1.1",
        "Host: 127.0.0.1",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"),
    );

    // Should get destroyed (connection closed)
    await new Promise<void>((resolve) => {
      socket.on("close", () => resolve());
      socket.on("error", () => resolve());
    });
  });
});
