import { describe, it, expect, vi, beforeEach } from "vitest";
import { HmrServer } from "../src/server.js";
import type { HmrWebSocket } from "../src/server.js";
import { EventEmitter } from "node:events";

function createMockWs(): HmrWebSocket & EventEmitter {
  const emitter = new EventEmitter() as HmrWebSocket & EventEmitter;
  emitter.readyState = 1; // OPEN
  emitter.send = vi.fn();
  emitter.close = vi.fn();
  return emitter;
}

describe("HmrServer", () => {
  let server: HmrServer;

  beforeEach(() => {
    server = new HmrServer();
  });

  it("tracks connected clients", () => {
    expect(server.clientCount).toBe(0);

    const ws = createMockWs();
    server.addClient(ws);
    expect(server.clientCount).toBe(1);

    // Simulate disconnect
    ws.emit("close");
    expect(server.clientCount).toBe(0);
  });

  it("sends connected message on addClient", () => {
    const ws = createMockWs();
    server.addClient(ws);

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"connected"'),
    );
  });

  it("broadcasts update to all clients", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    server.addClient(ws1);
    server.addClient(ws2);

    server.notifyUpdate("App.vaisx", "// new code");

    // Both should receive (connected msg + update msg = 2 calls each)
    expect(ws1.send).toHaveBeenCalledTimes(2);
    expect(ws2.send).toHaveBeenCalledTimes(2);

    const lastCall1 = (ws1.send as ReturnType<typeof vi.fn>).mock.calls[1]![0] as string;
    const msg = JSON.parse(lastCall1);
    expect(msg.type).toBe("update");
    expect(msg.file).toBe("App.vaisx");
    expect(msg.code).toBe("// new code");
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it("broadcasts CSS update", () => {
    const ws = createMockWs();
    server.addClient(ws);

    server.notifyCssUpdate("styles.css", "body { color: blue; }");

    const lastCall = (ws.send as ReturnType<typeof vi.fn>).mock.calls[1]![0] as string;
    const msg = JSON.parse(lastCall);
    expect(msg.type).toBe("css-update");
    expect(msg.file).toBe("styles.css");
    expect(msg.css).toBe("body { color: blue; }");
  });

  it("broadcasts full reload", () => {
    const ws = createMockWs();
    server.addClient(ws);

    server.notifyFullReload("config.ts");

    const lastCall = (ws.send as ReturnType<typeof vi.fn>).mock.calls[1]![0] as string;
    const msg = JSON.parse(lastCall);
    expect(msg.type).toBe("full-reload");
    expect(msg.file).toBe("config.ts");
  });

  it("broadcasts error", () => {
    const ws = createMockWs();
    server.addClient(ws);

    server.notifyError("Bad.vaisx", "Parse error", 42);

    const lastCall = (ws.send as ReturnType<typeof vi.fn>).mock.calls[1]![0] as string;
    const msg = JSON.parse(lastCall);
    expect(msg.type).toBe("error");
    expect(msg.file).toBe("Bad.vaisx");
    expect(msg.message).toBe("Parse error");
    expect(msg.offset).toBe(42);
  });

  it("removes client on send failure", () => {
    const ws = createMockWs();
    server.addClient(ws);
    expect(server.clientCount).toBe(1);

    // Make send throw
    (ws.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("connection closed");
    });

    server.notifyUpdate("test.vaisx");
    expect(server.clientCount).toBe(0);
  });

  it("close disconnects all clients", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    server.addClient(ws1);
    server.addClient(ws2);

    server.close();

    expect(ws1.close).toHaveBeenCalled();
    expect(ws2.close).toHaveBeenCalled();
    expect(server.clientCount).toBe(0);
  });

  it("forwards client messages to onClientMessage handler", () => {
    const handler = vi.fn();
    const serverWithHandler = new HmrServer({ onClientMessage: handler });

    const ws = createMockWs();
    serverWithHandler.addClient(ws);

    ws.emit("message", '{"type":"accept","file":"App.vaisx"}');

    expect(handler).toHaveBeenCalledWith(ws, '{"type":"accept","file":"App.vaisx"}');
  });
});
