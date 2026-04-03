/**
 * Ollama provider for @vaisx/ai.
 *
 * Implements the AIProvider interface using the local Ollama REST API.
 * Defaults to http://localhost:11434 and supports streaming via
 * newline-delimited JSON (NDJSON).
 */

import type { AIProvider, ProviderConfig, ChatMessage, StreamOptions } from "../types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OllamaChatChunk {
  message?: { content?: string };
  done?: boolean;
}

interface OllamaGenerateChunk {
  response?: string;
  done?: boolean;
}

interface OllamaChatResponse {
  message?: { content?: string };
}

interface OllamaGenerateResponse {
  response?: string;
}

// ─── NDJSON stream parsing ────────────────────────────────────────────────────

/**
 * Parse an Ollama NDJSON stream, yielding text tokens.
 */
async function* parseOllamaNDJSON<T>(
  response: Response,
  extractToken: (chunk: T) => string,
  isDone: (chunk: T) => boolean,
): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("Ollama NDJSON: response body is null.");
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
        const line = raw.trim();
        if (!line) continue;

        try {
          const chunk = JSON.parse(line) as T;
          if (isDone(chunk)) return;
          const token = extractToken(chunk);
          if (token) yield token;
        } catch {
          // Ignore malformed JSON lines
        }
      }
    }

    // Flush remaining buffer
    const remaining = (buffer + decoder.decode()).trim();
    if (remaining) {
      try {
        const chunk = JSON.parse(remaining) as T;
        if (!isDone(chunk)) {
          const token = extractToken(chunk);
          if (token) yield token;
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an Ollama AI provider instance.
 *
 * @example
 * ```ts
 * const provider = createOllamaProvider({
 *   apiKey: "",           // Not required by Ollama, but kept for interface compatibility
 *   baseUrl: "http://localhost:11434",
 *   model: "llama3",
 * });
 * const result = await provider.chat([{ role: "user", content: "Hello!" }], {});
 * ```
 */
export function createOllamaProvider(config: ProviderConfig): AIProvider {
  const {
    baseUrl = "http://localhost:11434",
    model: defaultModel = "llama3",
  } = config;

  // ── chat ──────────────────────────────────────────────────────────────────

  async function chat(messages: ChatMessage[], options: StreamOptions = {}): Promise<string> {
    const { onToken, onFinish, signal } = options;
    const url = `${baseUrl}/api/chat`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: defaultModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama chat error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    let accumulated = "";

    if (contentType.includes("application/x-ndjson") || contentType.includes("application/json")) {
      const extractToken = (chunk: OllamaChatChunk): string => chunk.message?.content ?? "";
      const isDone = (chunk: OllamaChatChunk): boolean => chunk.done === true;

      for await (const token of parseOllamaNDJSON<OllamaChatChunk>(response, extractToken, isDone)) {
        if (signal?.aborted) break;
        accumulated += token;
        onToken?.(token);
      }
    } else {
      // Non-streaming fallback
      const text = await response.text();
      try {
        const json = JSON.parse(text) as OllamaChatResponse;
        accumulated = json.message?.content ?? text;
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
    const url = `${baseUrl}/api/generate`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: defaultModel,
        prompt,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama generate error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    let accumulated = "";

    if (contentType.includes("application/x-ndjson") || contentType.includes("application/json")) {
      const extractToken = (chunk: OllamaGenerateChunk): string => chunk.response ?? "";
      const isDone = (chunk: OllamaGenerateChunk): boolean => chunk.done === true;

      for await (const token of parseOllamaNDJSON<OllamaGenerateChunk>(response, extractToken, isDone)) {
        if (signal?.aborted) break;
        accumulated += token;
        onToken?.(token);
      }
    } else {
      // Non-streaming fallback
      const text = await response.text();
      try {
        const json = JSON.parse(text) as OllamaGenerateResponse;
        accumulated = json.response ?? text;
      } catch {
        accumulated = text;
      }
      onToken?.(accumulated);
    }

    onFinish?.(accumulated);
    return accumulated;
  }

  return {
    id: "ollama",
    name: "Ollama",
    chat,
    complete,
  };
}
