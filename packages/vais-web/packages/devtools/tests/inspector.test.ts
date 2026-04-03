import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocket } from "ws";
import { InspectorServer } from "../src/inspector.js";
import type { DevToolsMessage, DevToolsEvent } from "../src/protocol.js";

const BASE_PORT = 18098;

async function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

async function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("message timeout")),
      2000
    );
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

async function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (
      ws.readyState === WebSocket.CLOSED ||
      ws.readyState === WebSocket.CLOSING
    ) {
      resolve();
      return;
    }
    ws.once("close", () => resolve());
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Test: start / stop ───────────────────────────────────────────────────────

describe("InspectorServer — lifecycle", () => {
  it("starts and stops without error", async () => {
    const server = new InspectorServer({ port: BASE_PORT });
    await expect(server.start()).resolves.toBeUndefined();
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it("stop() resolves even when not started", async () => {
    const server = new InspectorServer({ port: BASE_PORT + 50 });
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it("uses default port 8098 when no options provided", () => {
    const server = new InspectorServer();
    expect((server as unknown as { port: number }).port).toBe(8098);
  });
});

// ─── Test: connections ────────────────────────────────────────────────────────

describe("InspectorServer — client connections", () => {
  const port = BASE_PORT + 1;
  let server: InspectorServer;

  beforeAll(async () => {
    server = new InspectorServer({ port });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("accepts client connections and assigns client IDs", async () => {
    expect(server.clients.size).toBe(0);

    const ws = await connectClient(port);
    await sleep(50);
    expect(server.clients.size).toBe(1);

    ws.close();
    await waitForClose(ws);
    await sleep(50);
    expect(server.clients.size).toBe(0);
  });

  it("removes client on disconnect (terminate)", async () => {
    const ws = await connectClient(port);
    await sleep(50);
    expect(server.clients.size).toBe(1);

    ws.terminate();
    await sleep(50);
    expect(server.clients.size).toBe(0);
  });
});

// ─── Test: broadcast ─────────────────────────────────────────────────────────

describe("InspectorServer — broadcast", () => {
  const port = BASE_PORT + 2;
  let server: InspectorServer;

  beforeAll(async () => {
    server = new InspectorServer({ port });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("broadcasts event to all connected clients", async () => {
    const ws1 = await connectClient(port);
    const ws2 = await connectClient(port);
    await sleep(50);

    const event: DevToolsEvent = {
      type: "component-tree",
      tree: [{ id: "c1", name: "App", props: {}, children: [] }],
    };

    const [msg1, msg2] = await Promise.all([
      waitForMessage(ws1),
      waitForMessage(ws2),
      Promise.resolve().then(() => server.broadcast(event)),
    ]);

    expect(msg1).toEqual(event);
    expect(msg2).toEqual(event);

    ws1.close();
    ws2.close();
    await sleep(50);
  });
});

// ─── Test: onMessage ─────────────────────────────────────────────────────────

describe("InspectorServer — onMessage", () => {
  const port = BASE_PORT + 3;
  let server: InspectorServer;

  beforeAll(async () => {
    server = new InspectorServer({ port });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("calls onMessage handler when client sends a message", async () => {
    const received: Array<{ msg: DevToolsMessage; clientId: string }> = [];
    server.onMessage((msg, clientId) => {
      received.push({ msg, clientId });
    });

    const ws = await connectClient(port);
    await sleep(50);

    const outgoing: DevToolsMessage = {
      type: "subscribe",
      channel: "components",
    };
    ws.send(JSON.stringify(outgoing));

    await sleep(100);

    expect(received).toHaveLength(1);
    expect(received[0].msg).toEqual(outgoing);
    expect(received[0].clientId).toMatch(/^client-\d+$/);

    ws.close();
    await sleep(50);
  });

  it("supports multiple onMessage handlers", async () => {
    let count1 = 0;
    let count2 = 0;
    server.onMessage(() => { count1++; });
    server.onMessage(() => { count2++; });

    const ws = await connectClient(port);
    await sleep(50);

    ws.send(JSON.stringify({ type: "inspect", componentId: "c1" } satisfies DevToolsMessage));
    await sleep(100);

    expect(count1).toBeGreaterThanOrEqual(1);
    expect(count2).toBeGreaterThanOrEqual(1);

    ws.close();
    await sleep(50);
  });

  it("ignores malformed messages from client", async () => {
    let handlerCalled = false;
    server.onMessage(() => { handlerCalled = true; });

    const ws = await connectClient(port);
    await sleep(50);

    ws.send("not valid json{{");
    await sleep(100);

    expect(handlerCalled).toBe(false);

    ws.close();
    await sleep(50);
  });
});
