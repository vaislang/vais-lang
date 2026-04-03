/**
 * OpenAI provider for @vaisx/ai.
 *
 * Implements the AIProvider interface using the OpenAI REST API.
 * Supports streaming via SSE (Server-Sent Events).
 */

import type { AIProvider, ProviderConfig, ChatMessage, StreamOptions } from "../types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenAIStreamDelta {
  choices: Array<{ delta?: { content?: string } }>;
}

interface OpenAICompletionStreamDelta {
  choices: Array<{ text?: string }>;
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
}

interface OpenAICompletionResponse {
  choices: Array<{ text: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse an SSE (Server-Sent Events) stream from an OpenAI API response.
 * Yields decoded text delta tokens.
 */
async function* parseOpenAISSE(
  response: Response,
  extractToken: (parsed: Record<string, unknown>) => string,
): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("OpenAI SSE: response body is null.");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

        if (line === "" || line.startsWith(":")) continue;

        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            const token = extractToken(parsed);
            if (token) yield token;
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }
    }

    // Flush remaining buffer
    const remaining = buffer + decoder.decode();
    for (const raw of remaining.split("\n")) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const token = extractToken(parsed);
          if (token) yield token;
        } catch {
          // Ignore malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an OpenAI AI provider instance.
 *
 * @example
 * ```ts
 * const provider = createOpenAIProvider({ apiKey: "sk-...", model: "gpt-4" });
 * const result = await provider.chat([{ role: "user", content: "Hello!" }], {});
 * ```
 */
export function createOpenAIProvider(config: ProviderConfig): AIProvider {
  const {
    apiKey,
    baseUrl = "https://api.openai.com",
    model: defaultModel = "gpt-4",
  } = config;

  // ── chat ──────────────────────────────────────────────────────────────────

  async function chat(messages: ChatMessage[], options: StreamOptions = {}): Promise<string> {
    const { onToken, onFinish, signal } = options;
    const url = `${baseUrl}/v1/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: defaultModel,
        messages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI chat error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    let accumulated = "";

    if (contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson")) {
      const extractToken = (parsed: Record<string, unknown>): string => {
        const delta = parsed as unknown as OpenAIStreamDelta;
        return delta.choices?.[0]?.delta?.content ?? "";
      };

      for await (const token of parseOpenAISSE(response, extractToken)) {
        if (signal?.aborted) break;
        accumulated += token;
        onToken?.(token);
      }
    } else {
      // Non-streaming fallback
      const text = await response.text();
      try {
        const json = JSON.parse(text) as OpenAIChatResponse;
        accumulated = json.choices?.[0]?.message?.content ?? text;
      } catch {
        accumulated = text;
      }
      onToken?.(accumulated);
    }

    onFinish?.(accumulated);
    return accumulated;
  }

  // ── complete ──────────────────────────────────────────────────────────────

  async function complete(prompt: string, options: StreamOptions = {}): Promise<string> {
    const { onToken, onFinish, signal } = options;
    const url = `${baseUrl}/v1/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: defaultModel,
        prompt,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI completion error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    let accumulated = "";

    if (contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson")) {
      const extractToken = (parsed: Record<string, unknown>): string => {
        const delta = parsed as unknown as OpenAICompletionStreamDelta;
        return delta.choices?.[0]?.text ?? "";
      };

      for await (const token of parseOpenAISSE(response, extractToken)) {
        if (signal?.aborted) break;
        accumulated += token;
        onToken?.(token);
      }
    } else {
      // Non-streaming fallback
      const text = await response.text();
      try {
        const json = JSON.parse(text) as OpenAICompletionResponse;
        accumulated = json.choices?.[0]?.text ?? text;
      } catch {
        accumulated = text;
      }
      onToken?.(accumulated);
    }

    onFinish?.(accumulated);
    return accumulated;
  }

  return {
    id: "openai",
    name: "OpenAI",
    chat,
    complete,
  };
}
