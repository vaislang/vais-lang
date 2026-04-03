/**
 * useChat — reactive chat state management hook for @vaisx/ai.
 *
 * Manages a conversation's messages, loading state, errors, and
 * network requests.  State is backed by @vaisx/runtime createSignal
 * so that UI layers can subscribe to fine-grained reactive updates.
 */

import { createSignal } from "@vaisx/runtime";
import type { ChatMessage, ChatOptions, ChatState } from "./types.js";

// ─── ID generation ────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Generate a lightweight unique id for a chat message.
 */
function generateId(): string {
  return `msg-${Date.now()}-${++_idCounter}`;
}

// ─── useChat ─────────────────────────────────────────────────────────────────

/**
 * Create a reactive chat state for the given options.
 *
 * Internally uses @vaisx/runtime `createSignal` for each piece of reactive
 * state so that any effect or computed that reads a signal is automatically
 * re-scheduled when the value changes.
 *
 * @example
 * ```ts
 * const chat = useChat({ api: "/api/chat" });
 * await chat.append({ role: "user", content: "Hello!" });
 * console.log(chat.messages); // [{ role:"user", ... }, { role:"assistant", ... }]
 * ```
 */
export function useChat(options: ChatOptions): ChatState {
  const { api, model, system, onFinish, onError } = options;

  // ── Reactive signals ──────────────────────────────────────────────────────
  const messagesSignal = createSignal<ChatMessage[]>([]);
  const inputSignal = createSignal<string>("");
  const isLoadingSignal = createSignal<boolean>(false);
  const errorSignal = createSignal<Error | null>(null);

  // Active AbortController for the in-flight request.
  let controller: AbortController | null = null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Build the messages array sent to the API:
   * prepend the system message (if configured) and append current history.
   */
  function buildPayload(msgs: ChatMessage[]): { messages: ChatMessage[]; model?: string } {
    const history: ChatMessage[] = system
      ? [{ role: "system", content: system, id: "system" }, ...msgs]
      : [...msgs];
    return model ? { messages: history, model } : { messages: history };
  }

  /**
   * POST to the chat API endpoint and stream the assistant reply back.
   * Mutates `messagesSignal` as tokens arrive.
   */
  async function fetchAndStream(msgs: ChatMessage[]): Promise<void> {
    // Cancel any in-flight request first
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;

    isLoadingSignal.set(true);
    errorSignal.set(null);

    // Placeholder assistant message that will be filled incrementally
    const assistantId = generateId();
    const assistantMsg: ChatMessage = { role: "assistant", content: "", id: assistantId };
    messagesSignal.set([...msgs, assistantMsg]);

    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(buildPayload(msgs)),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status} ${response.statusText}`);
      }

      // Stream is either plain text/event-stream or newline-delimited JSON.
      // We handle both: if Content-Type is text/event-stream we parse SSE,
      // otherwise we read the body as text.
      const contentType = response.headers.get("content-type") ?? "";
      let accumulated = "";

      if (contentType.includes("text/event-stream") && response.body) {
        const { parseSSEStream } = await import("./stream.js");
        for await (const event of parseSSEStream(response)) {
          if (signal.aborted) break;
          if (event.data) {
            // Try to parse OpenAI-style delta, fall back to plain text
            let token = event.data;
            try {
              const parsed = JSON.parse(event.data) as Record<string, unknown>;
              const choices = parsed["choices"] as Array<{ delta?: { content?: string } }> | undefined;
              token = choices?.[0]?.delta?.content ?? "";
            } catch {
              // data is plain text token
            }

            if (token) {
              accumulated += token;
              // Immutably update the last message in the list
              const current = messagesSignal();
              const updated = current.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              );
              messagesSignal.set(updated);
            }
          }
        }
      } else {
        // Non-streaming: read the full response body
        const text = await response.text();
        try {
          const json = JSON.parse(text) as Record<string, unknown>;
          const choices = json["choices"] as Array<{ message?: { content?: string } }> | undefined;
          accumulated = choices?.[0]?.message?.content ?? text;
        } catch {
          accumulated = text;
        }

        const current = messagesSignal();
        const updated = current.map((m) =>
          m.id === assistantId ? { ...m, content: accumulated } : m,
        );
        messagesSignal.set(updated);
      }

      if (!signal.aborted) {
        const finalMsg: ChatMessage = { role: "assistant", content: accumulated, id: assistantId };
        onFinish?.(finalMsg);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Cancelled by stop() — not an error
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      errorSignal.set(error);
      // Remove the empty assistant placeholder on error
      const current = messagesSignal();
      messagesSignal.set(current.filter((m) => m.id !== assistantId));
      onError?.(error);
    } finally {
      if (!signal.aborted) {
        isLoadingSignal.set(false);
        controller = null;
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Append a user message and trigger an assistant response.
   */
  async function append(message: ChatMessage): Promise<void> {
    const userMsg: ChatMessage = {
      ...message,
      id: message.id ?? generateId(),
    };
    const nextMessages = [...messagesSignal(), userMsg];
    messagesSignal.set(nextMessages);
    await fetchAndStream(nextMessages);
  }

  /**
   * Re-generate the last assistant response.
   * Removes the existing assistant message and retries from the last user turn.
   */
  async function reload(): Promise<void> {
    const current = messagesSignal();
    // Drop trailing assistant messages
    let userMessages = [...current];
    while (userMessages.length > 0 && userMessages[userMessages.length - 1]!.role === "assistant") {
      userMessages = userMessages.slice(0, -1);
    }
    if (userMessages.length === 0) return;
    messagesSignal.set(userMessages);
    await fetchAndStream(userMessages);
  }

  /**
   * Abort the in-flight request immediately.
   */
  function stop(): void {
    if (controller) {
      controller.abort();
      controller = null;
      isLoadingSignal.set(false);
    }
  }

  /**
   * Replace the messages list with an externally provided array.
   */
  function setMessages(messages: ChatMessage[]): void {
    messagesSignal.set(messages);
  }

  // Return a plain object whose getters read the current signal values.
  // This means callers always get a fresh value on each property access,
  // and effects/computeds that call these getters are automatically tracked.
  return {
    get messages() {
      return messagesSignal();
    },
    get input() {
      return inputSignal();
    },
    set input(value: string) {
      inputSignal.set(value);
    },
    get isLoading() {
      return isLoadingSignal();
    },
    get error() {
      return errorSignal();
    },
    append,
    reload,
    stop,
    setMessages,
  };
}
