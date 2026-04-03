/**
 * @vaisx/ai — Provider tests
 *
 * Tests for OpenAI, Anthropic, and Ollama providers using fetch mocks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOpenAIProvider } from "../providers/openai.js";
import { createAnthropicProvider } from "../providers/anthropic.js";
import { createOllamaProvider } from "../providers/ollama.js";
import type { ChatMessage } from "../types.js";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Build a streaming Response where each string in tokens becomes an SSE frame.
 * extractFn maps a token to the full SSE `data:` JSON payload.
 */
function makeSseResponse(
  sseLines: string[],
  contentType = "text/event-stream",
): Response {
  const encoder = new TextEncoder();
  const body = sseLines.join("") + "data: [DONE]\n\n";
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": contentType } },
  );
}

/** Build an SSE frame for OpenAI chat streaming. */
function openAIChatSseLines(tokens: string[]): string[] {
  return tokens.map(
    (t) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`,
  );
}

/** Build an SSE frame for OpenAI completion streaming. */
function openAICompletionSseLines(tokens: string[]): string[] {
  return tokens.map(
    (t) => `data: ${JSON.stringify({ choices: [{ text: t }] })}\n\n`,
  );
}

/** Build Anthropic-style SSE frames for content_block_delta streaming. */
function anthropicSseLines(tokens: string[]): string[] {
  return tokens.map(
    (t) =>
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: t } })}\n\n`,
  );
}

/** Build Ollama NDJSON streaming response. */
function makeOllamaNdjsonResponse(
  chunks: Array<{ message?: { content: string }; response?: string; done?: boolean }>,
): Response {
  const encoder = new TextEncoder();
  const body = chunks.map((c) => JSON.stringify(c) + "\n").join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
}

function makeJsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status: number, statusText = "Error"): Response {
  return new Response(null, { status, statusText });
}

const testMessages: ChatMessage[] = [{ role: "user", content: "Hello!" }];

// ─── OpenAI provider ──────────────────────────────────────────────────────────

describe("createOpenAIProvider — factory", () => {
  it("returns an AIProvider with id 'openai'", () => {
    const provider = createOpenAIProvider({ apiKey: "test-key" });
    expect(provider.id).toBe("openai");
  });

  it("returns an AIProvider with name 'OpenAI'", () => {
    const provider = createOpenAIProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("OpenAI");
  });

  it("exposes chat and complete functions", () => {
    const provider = createOpenAIProvider({ apiKey: "test-key" });
    expect(typeof provider.chat).toBe("function");
    expect(typeof provider.complete).toBe("function");
  });
});

describe("createOpenAIProvider — chat()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls /v1/chat/completions endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(openAIChatSseLines(["hi"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.chat(testMessages, {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/v1/chat/completions");
  });

  it("sends Authorization header with API key", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(openAIChatSseLines(["hi"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAIProvider({ apiKey: "sk-my-key" });
    await provider.chat(testMessages, {});

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-my-key");
  });

  it("accumulates SSE tokens and returns full text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(makeSseResponse(openAIChatSseLines(["Hello", ", ", "world"]))),
      ),
    );

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    const result = await provider.chat(testMessages, {});
    expect(result).toBe("Hello, world");
  });

  it("calls onToken for each streamed token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(makeSseResponse(openAIChatSseLines(["foo", "bar"]))),
      ),
    );

    const onToken = vi.fn();
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.chat(testMessages, { onToken });

    expect(onToken).toHaveBeenCalledWith("foo");
    expect(onToken).toHaveBeenCalledWith("bar");
  });

  it("calls onFinish with full accumulated text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(makeSseResponse(openAIChatSseLines(["done"]))),
      ),
    );

    const onFinish = vi.fn();
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.chat(testMessages, { onFinish });
    expect(onFinish).toHaveBeenCalledWith("done");
  });

  it("throws on non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(401, "Unauthorized"))));
    const provider = createOpenAIProvider({ apiKey: "bad-key" });
    await expect(provider.chat(testMessages, {})).rejects.toThrow("401");
  });

  it("uses custom baseUrl when provided", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(openAIChatSseLines(["ok"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAIProvider({
      apiKey: "sk-test",
      baseUrl: "https://proxy.example.com",
    });
    await provider.chat(testMessages, {});

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("https://proxy.example.com");
  });

  it("falls back gracefully on non-streaming JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeJsonResponse({ choices: [{ message: { content: "Non-stream response" } }] }),
        ),
      ),
    );

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    const result = await provider.chat(testMessages, {});
    expect(result).toBe("Non-stream response");
  });
});

describe("createOpenAIProvider — complete()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls /v1/completions endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(openAICompletionSseLines(["result"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await provider.complete("Tell me a joke", {});

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/v1/completions");
  });

  it("accumulates completion tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeSseResponse(openAICompletionSseLines(["Why", " did", " the chicken"])),
        ),
      ),
    );

    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    const result = await provider.complete("joke", {});
    expect(result).toBe("Why did the chicken");
  });

  it("throws on non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(500, "Server Error"))));
    const provider = createOpenAIProvider({ apiKey: "sk-test" });
    await expect(provider.complete("prompt", {})).rejects.toThrow("500");
  });
});

// ─── Anthropic provider ───────────────────────────────────────────────────────

describe("createAnthropicProvider — factory", () => {
  it("returns an AIProvider with id 'anthropic'", () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    expect(provider.id).toBe("anthropic");
  });

  it("returns an AIProvider with name 'Anthropic'", () => {
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    expect(provider.name).toBe("Anthropic");
  });
});

describe("createAnthropicProvider — chat()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls /v1/messages endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(anthropicSseLines(["hi"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.chat(testMessages, {});

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/v1/messages");
  });

  it("sends x-api-key header", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(anthropicSseLines(["hi"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAnthropicProvider({ apiKey: "sk-ant-my-key" });
    await provider.chat(testMessages, {});

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-my-key");
  });

  it("sends anthropic-version header", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(anthropicSseLines(["hi"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.chat(testMessages, {});

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBeDefined();
  });

  it("accumulates content_block_delta SSE tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(makeSseResponse(anthropicSseLines(["Claude", " here"]))),
      ),
    );

    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    const result = await provider.chat(testMessages, {});
    expect(result).toBe("Claude here");
  });

  it("extracts system message into the request body system field", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(anthropicSseLines(["ok"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const messagesWithSystem: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ];

    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.chat(messagesWithSystem, {});

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body["system"]).toBe("You are a helpful assistant.");
    const msgs = body["messages"] as Array<{ role: string }>;
    expect(msgs.every((m) => m.role !== "system")).toBe(true);
  });

  it("calls onToken for each streamed token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(makeSseResponse(anthropicSseLines(["a", "b", "c"]))),
      ),
    );

    const onToken = vi.fn();
    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.chat(testMessages, { onToken });

    expect(onToken).toHaveBeenCalledTimes(3);
    expect(onToken).toHaveBeenCalledWith("a");
    expect(onToken).toHaveBeenCalledWith("b");
    expect(onToken).toHaveBeenCalledWith("c");
  });

  it("throws on non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(403, "Forbidden"))));
    const provider = createAnthropicProvider({ apiKey: "bad-key" });
    await expect(provider.chat(testMessages, {})).rejects.toThrow("403");
  });

  it("falls back gracefully on non-streaming JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeJsonResponse({ content: [{ type: "text", text: "Non-stream anthropic" }] }),
        ),
      ),
    );

    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    const result = await provider.chat(testMessages, {});
    expect(result).toBe("Non-stream anthropic");
  });
});

describe("createAnthropicProvider — complete()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("delegates to /v1/messages (wraps prompt as user message)", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(makeSseResponse(anthropicSseLines(["result"]))),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAnthropicProvider({ apiKey: "sk-ant-test" });
    const result = await provider.complete("Tell me something", {});

    expect(result).toBe("result");
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/v1/messages");
  });
});

// ─── Ollama provider ──────────────────────────────────────────────────────────

describe("createOllamaProvider — factory", () => {
  it("returns an AIProvider with id 'ollama'", () => {
    const provider = createOllamaProvider({ apiKey: "" });
    expect(provider.id).toBe("ollama");
  });

  it("returns an AIProvider with name 'Ollama'", () => {
    const provider = createOllamaProvider({ apiKey: "" });
    expect(provider.name).toBe("Ollama");
  });

  it("defaults to http://localhost:11434 base URL", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeOllamaNdjsonResponse([
          { message: { content: "hi" }, done: false },
          { done: true },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaProvider({ apiKey: "" });
    await provider.chat(testMessages, {});

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("http://localhost:11434");
    vi.unstubAllGlobals();
  });
});

describe("createOllamaProvider — chat()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls /api/chat endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeOllamaNdjsonResponse([
          { message: { content: "Hello" }, done: false },
          { done: true },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaProvider({ apiKey: "" });
    await provider.chat(testMessages, {});

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/api/chat");
  });

  it("accumulates NDJSON message tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeOllamaNdjsonResponse([
            { message: { content: "Hi" }, done: false },
            { message: { content: " there" }, done: false },
            { done: true },
          ]),
        ),
      ),
    );

    const provider = createOllamaProvider({ apiKey: "" });
    const result = await provider.chat(testMessages, {});
    expect(result).toBe("Hi there");
  });

  it("calls onToken for each streamed chunk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeOllamaNdjsonResponse([
            { message: { content: "chunk1" }, done: false },
            { message: { content: "chunk2" }, done: false },
            { done: true },
          ]),
        ),
      ),
    );

    const onToken = vi.fn();
    const provider = createOllamaProvider({ apiKey: "" });
    await provider.chat(testMessages, { onToken });

    expect(onToken).toHaveBeenCalledWith("chunk1");
    expect(onToken).toHaveBeenCalledWith("chunk2");
  });

  it("calls onFinish with accumulated text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeOllamaNdjsonResponse([
            { message: { content: "final" }, done: false },
            { done: true },
          ]),
        ),
      ),
    );

    const onFinish = vi.fn();
    const provider = createOllamaProvider({ apiKey: "" });
    await provider.chat(testMessages, { onFinish });
    expect(onFinish).toHaveBeenCalledWith("final");
  });

  it("throws on non-OK HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(503, "Service Unavailable"))));
    const provider = createOllamaProvider({ apiKey: "" });
    await expect(provider.chat(testMessages, {})).rejects.toThrow("503");
  });

  it("uses custom baseUrl when provided", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeOllamaNdjsonResponse([{ message: { content: "ok" }, done: true }]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaProvider({
      apiKey: "",
      baseUrl: "http://myserver:11434",
    });
    await provider.chat(testMessages, {});

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("http://myserver:11434");
  });
});

describe("createOllamaProvider — complete()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls /api/generate endpoint", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        makeOllamaNdjsonResponse([
          { response: "result", done: false },
          { done: true },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaProvider({ apiKey: "" });
    await provider.complete("Tell me something", {});

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/api/generate");
  });

  it("accumulates NDJSON response tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          makeOllamaNdjsonResponse([
            { response: "The", done: false },
            { response: " answer", done: false },
            { done: true },
          ]),
        ),
      ),
    );

    const provider = createOllamaProvider({ apiKey: "" });
    const result = await provider.complete("question", {});
    expect(result).toBe("The answer");
  });

  it("throws on non-OK HTTP response for generate", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(500, "Internal Error"))));
    const provider = createOllamaProvider({ apiKey: "" });
    await expect(provider.complete("prompt", {})).rejects.toThrow("500");
  });
});

// ─── Provider interface compatibility ─────────────────────────────────────────

describe("Provider interface — switchable providers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("all providers implement the same AIProvider interface", () => {
    const openai = createOpenAIProvider({ apiKey: "sk-test" });
    const anthropic = createAnthropicProvider({ apiKey: "sk-ant-test" });
    const ollama = createOllamaProvider({ apiKey: "" });

    for (const provider of [openai, anthropic, ollama]) {
      expect(typeof provider.id).toBe("string");
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.chat).toBe("function");
      expect(typeof provider.complete).toBe("function");
    }
  });

  it("providers can be swapped via a common variable", async () => {
    // Simulate switching from OpenAI to Anthropic provider dynamically
    const openai = createOpenAIProvider({ apiKey: "sk-test" });
    const anthropic = createAnthropicProvider({ apiKey: "sk-ant-test" });

    let activeProvider = openai;
    expect(activeProvider.id).toBe("openai");

    activeProvider = anthropic;
    expect(activeProvider.id).toBe("anthropic");
  });
});
