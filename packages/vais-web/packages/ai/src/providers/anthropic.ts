/**
 * Anthropic provider for @vaisx/ai.
 *
 * Implements the AIProvider interface using the Anthropic Messages API.
 * Supports streaming via SSE with content_block_delta events.
 */

import type { AIProvider, ProviderConfig, ChatMessage, StreamOptions } from "../types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicContentBlockDelta {
  type: "content_block_delta";
  delta: {
    type: "text_delta";
    text: string;
  };
}

interface AnthropicMessageResponse {
  content: Array<{ type: "text"; text: string }>;
}

// ─── Message format conversion ────────────────────────────────────────────────

/**
 * Convert OpenAI-style ChatMessage[] to Anthropic message format.
 * Extracts system prompt separately (Anthropic uses a top-level system field).
 */
function convertMessages(messages: ChatMessage[]): {
  system: string | undefined;
  messages: AnthropicMessage[];
} {
  let system: string | undefined;
  const converted: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Anthropic uses a top-level system field; collect all system messages
      system = system ? `${system}\n${msg.content}` : msg.content;
    } else {
      converted.push({ role: msg.role, content: msg.content });
    }
  }

  return { system, messages: converted };
}

// ─── SSE parsing ─────────────────────────────────────────────────────────────

/**
 * Parse an Anthropic SSE stream.
 * Yields text deltas from content_block_delta events.
 */
async function* parseAnthropicSSE(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error("Anthropic SSE: response body is null.");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let currentEvent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

        if (line === "") {
          // Reset event type on blank line
          currentEvent = "";
          continue;
        }

        if (line.startsWith(":")) continue; // SSE comment

        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }

        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;

          // Only process content_block_delta events for text streaming
          if (currentEvent === "content_block_delta") {
            try {
              const parsed = JSON.parse(data) as AnthropicContentBlockDelta;
              if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                yield parsed.delta.text;
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
    }

    // Flush remaining buffer
    const remaining = buffer + decoder.decode();
    for (const raw of remaining.split("\n")) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        if (currentEvent === "content_block_delta") {
          try {
            const parsed = JSON.parse(data) as AnthropicContentBlockDelta;
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              yield parsed.delta.text;
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an Anthropic AI provider instance.
 *
 * @example
 * ```ts
 * const provider = createAnthropicProvider({
 *   apiKey: "sk-ant-...",
 *   model: "claude-sonnet-4-20250514",
 * });
 * const result = await provider.chat([{ role: "user", content: "Hello!" }], {});
 * ```
 */
export function createAnthropicProvider(config: ProviderConfig): AIProvider {
  const {
    apiKey,
    baseUrl = "https://api.anthropic.com",
    model: defaultModel = "claude-sonnet-4-20250514",
  } = config;

  // ── chat ──────────────────────────────────────────────────────────────────

  async function chat(messages: ChatMessage[], options: StreamOptions = {}): Promise<string> {
    const { onToken, onFinish, signal } = options;
    const url = `${baseUrl}/v1/messages`;

    const { system, messages: convertedMessages } = convertMessages(messages);

    const requestBody: Record<string, unknown> = {
      model: defaultModel,
      max_tokens: 4096,
      messages: convertedMessages,
      stream: true,
    };

    if (system) {
      requestBody["system"] = system;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic chat error: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    let accumulated = "";

    if (contentType.includes("text/event-stream")) {
      for await (const token of parseAnthropicSSE(response)) {
        if (signal?.aborted) break;
        accumulated += token;
        onToken?.(token);
      }
    } else {
      // Non-streaming fallback
      const text = await response.text();
      try {
        const json = JSON.parse(text) as AnthropicMessageResponse;
        const textBlock = json.content?.find((b) => b.type === "text");
        accumulated = textBlock?.text ?? text;
      } catch {
        accumulated = text;
      }
      onToken?.(accumulated);
    }

    onFinish?.(accumulated);
    return accumulated;
  }

  // ── complete ──────────────────────────────────────────────────────────────

  /**
   * complete() converts the prompt to a user message and delegates to chat().
   * Anthropic does not have a dedicated completions endpoint.
   */
  async function complete(prompt: string, options: StreamOptions = {}): Promise<string> {
    return chat([{ role: "user", content: prompt }], options);
  }

  return {
    id: "anthropic",
    name: "Anthropic",
    chat,
    complete,
  };
}
