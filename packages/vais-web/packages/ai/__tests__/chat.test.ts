/**
 * @vaisx/ai — useChat tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChat } from "../src/chat.js";
import type { ChatMessage } from "../src/types.js";

// ─── fetch mock helpers ───────────────────────────────────────────────────────

function makeSseResponse(tokens: string[]): Response {
  const encoder = new TextEncoder();
  const body = tokens.map((t) => `data: ${t}\n\n`).join("");
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode(body));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function makePlainJsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeErrorResponse(status: number): Response {
  return new Response(null, { status, statusText: "Internal Server Error" });
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("useChat — initial state", () => {
  it("starts with empty messages", () => {
    const chat = useChat({ api: "/api/chat" });
    expect(chat.messages).toEqual([]);
  });

  it("starts with empty input", () => {
    const chat = useChat({ api: "/api/chat" });
    expect(chat.input).toBe("");
  });

  it("starts with isLoading false", () => {
    const chat = useChat({ api: "/api/chat" });
    expect(chat.isLoading).toBe(false);
  });

  it("starts with null error", () => {
    const chat = useChat({ api: "/api/chat" });
    expect(chat.error).toBeNull();
  });

  it("exposes append, reload, stop, setMessages functions", () => {
    const chat = useChat({ api: "/api/chat" });
    expect(typeof chat.append).toBe("function");
    expect(typeof chat.reload).toBe("function");
    expect(typeof chat.stop).toBe("function");
    expect(typeof chat.setMessages).toBe("function");
  });
});

describe("useChat — setMessages", () => {
  it("replaces messages array", () => {
    const chat = useChat({ api: "/api/chat" });
    const msgs: ChatMessage[] = [{ role: "user", content: "hi" }];
    chat.setMessages(msgs);
    expect(chat.messages).toEqual(msgs);
  });

  it("replaces messages with empty array", () => {
    const chat = useChat({ api: "/api/chat" });
    chat.setMessages([{ role: "user", content: "hi" }]);
    chat.setMessages([]);
    expect(chat.messages).toEqual([]);
  });
});

describe("useChat — append (non-streaming JSON)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makePlainJsonResponse("Hello from assistant"))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("appends the user message to messages", async () => {
    const chat = useChat({ api: "/api/chat" });
    await chat.append({ role: "user", content: "Hi" });
    expect(chat.messages[0]!.role).toBe("user");
    expect(chat.messages[0]!.content).toBe("Hi");
  });

  it("appends an assistant message after the API responds", async () => {
    const chat = useChat({ api: "/api/chat" });
    await chat.append({ role: "user", content: "Hi" });
    const last = chat.messages[chat.messages.length - 1]!;
    expect(last.role).toBe("assistant");
    expect(last.content).toBe("Hello from assistant");
  });

  it("isLoading is false after the request completes", async () => {
    const chat = useChat({ api: "/api/chat" });
    await chat.append({ role: "user", content: "Hi" });
    expect(chat.isLoading).toBe(false);
  });

  it("calls onFinish when the response is complete", async () => {
    const onFinish = vi.fn();
    const chat = useChat({ api: "/api/chat", onFinish });
    await chat.append({ role: "user", content: "Hi" });
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant" }),
    );
  });

  it("assigns an id to each message", async () => {
    const chat = useChat({ api: "/api/chat" });
    await chat.append({ role: "user", content: "Hi" });
    for (const msg of chat.messages) {
      expect(msg.id).toBeDefined();
    }
  });
});

describe("useChat — append (SSE streaming)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeSseResponse(["Hello", " world"]))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accumulates tokens into the assistant message", async () => {
    const chat = useChat({ api: "/api/chat" });
    await chat.append({ role: "user", content: "Hi" });
    const last = chat.messages[chat.messages.length - 1]!;
    expect(last.role).toBe("assistant");
    expect(last.content).toContain("Hello");
  });
});

describe("useChat — error handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sets error signal on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(500))));
    const chat = useChat({ api: "/api/chat" });
    await chat.append({ role: "user", content: "Hi" });
    expect(chat.error).toBeInstanceOf(Error);
    expect(chat.error!.message).toContain("500");
  });

  it("calls onError callback on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(503))));
    const onError = vi.fn();
    const chat = useChat({ api: "/api/chat", onError });
    await chat.append({ role: "user", content: "Hi" });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("removes the empty assistant placeholder on error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(500))));
    const chat = useChat({ api: "/api/chat" });
    await chat.append({ role: "user", content: "Hi" });
    // Only the user message should remain
    expect(chat.messages.every((m) => m.role !== "assistant" || m.content !== "")).toBe(true);
  });

  it("isLoading is false after an error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(500))));
    const chat = useChat({ api: "/api/chat" });
    await chat.append({ role: "user", content: "Hi" });
    expect(chat.isLoading).toBe(false);
  });
});

describe("useChat — stop", () => {
  it("stop() can be called when nothing is in flight", () => {
    const chat = useChat({ api: "/api/chat" });
    expect(() => chat.stop()).not.toThrow();
  });

  it("stop() sets isLoading to false", async () => {
    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const chat = useChat({ api: "/api/chat" });
    const appendPromise = chat.append({ role: "user", content: "Hi" });
    chat.stop();
    resolveFetch(makePlainJsonResponse("late"));
    await appendPromise;
    expect(chat.isLoading).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("useChat — reload", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makePlainJsonResponse("Reloaded response"))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reload() does nothing when messages are empty", async () => {
    const chat = useChat({ api: "/api/chat" });
    await chat.reload();
    expect(chat.messages).toEqual([]);
  });

  it("reload() regenerates the assistant reply", async () => {
    const chat = useChat({ api: "/api/chat" });
    chat.setMessages([
      { role: "user", content: "Hello", id: "u1" },
      { role: "assistant", content: "Old reply", id: "a1" },
    ]);
    await chat.reload();
    const last = chat.messages[chat.messages.length - 1]!;
    expect(last.role).toBe("assistant");
    expect(last.content).toBe("Reloaded response");
  });

  it("reload() removes the old assistant message before fetching", async () => {
    const chat = useChat({ api: "/api/chat" });
    chat.setMessages([
      { role: "user", content: "Hello", id: "u1" },
      { role: "assistant", content: "Old", id: "a1" },
    ]);
    await chat.reload();
    // There should be exactly one user message and one new assistant message
    const roles = chat.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant"]);
  });
});

describe("useChat — system prompt", () => {
  it("prepends the system message in the fetch payload", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makePlainJsonResponse("ok")));
    vi.stubGlobal("fetch", fetchMock);

    const chat = useChat({ api: "/api/chat", system: "You are helpful." });
    await chat.append({ role: "user", content: "Hi" });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      messages: ChatMessage[];
    };
    expect(body.messages[0]!.role).toBe("system");
    expect(body.messages[0]!.content).toBe("You are helpful.");
    vi.unstubAllGlobals();
  });
});
