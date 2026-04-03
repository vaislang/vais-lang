/**
 * useCompletion — reactive text completion state management hook for @vaisx/ai.
 *
 * Manages a single completion request: input prompt, streaming output,
 * loading state, and errors.  State is backed by @vaisx/runtime createSignal.
 */

import { createSignal } from "@vaisx/runtime";
import type { CompletionOptions, CompletionState } from "./types.js";

// ─── useCompletion ────────────────────────────────────────────────────────────

/**
 * Create a reactive completion state for the given options.
 *
 * Each call to `complete(prompt?)` will POST to `options.api` and stream
 * the response back, accumulating tokens in the `completion` signal.
 *
 * @example
 * ```ts
 * const { completion, complete, isLoading } = useCompletion({ api: "/api/complete" });
 * await complete("Tell me a joke.");
 * console.log(completion); // "Why did the chicken cross the road? ..."
 * ```
 */
export function useCompletion(options: CompletionOptions): CompletionState {
  const { api, model, prompt: defaultPrompt, onFinish, onError } = options;

  // ── Reactive signals ──────────────────────────────────────────────────────
  const completionSignal = createSignal<string>("");
  const isLoadingSignal = createSignal<boolean>(false);
  const errorSignal = createSignal<Error | null>(null);

  // Active AbortController for the in-flight request.
  let controller: AbortController | null = null;

  // ── complete ──────────────────────────────────────────────────────────────

  /**
   * Trigger a completion for the given prompt (or `options.prompt` if omitted).
   * The `completion` signal is reset before each new request.
   */
  async function complete(prompt?: string): Promise<void> {
    const resolvedPrompt = prompt ?? defaultPrompt ?? "";

    // Cancel any previous request
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;

    completionSignal.set("");
    isLoadingSignal.set(true);
    errorSignal.set(null);

    const body: Record<string, unknown> = { prompt: resolvedPrompt };
    if (model) body["model"] = model;

    try {
      const response = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Completion API error: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      let accumulated = "";

      if (contentType.includes("text/event-stream") && response.body) {
        const { parseSSEStream } = await import("./stream.js");
        for await (const event of parseSSEStream(response)) {
          if (signal.aborted) break;
          if (event.data) {
            let token = event.data;
            try {
              const parsed = JSON.parse(event.data) as Record<string, unknown>;
              // OpenAI-style: { choices: [{ text: "..." }] }
              const choices = parsed["choices"] as Array<{ text?: string; delta?: { content?: string } }> | undefined;
              token = choices?.[0]?.text ?? choices?.[0]?.delta?.content ?? "";
            } catch {
              // plain text token
            }

            if (token) {
              accumulated += token;
              completionSignal.set(accumulated);
            }
          }
        }
      } else {
        // Non-streaming fallback
        const text = await response.text();
        try {
          const json = JSON.parse(text) as Record<string, unknown>;
          const choices = json["choices"] as Array<{ text?: string; message?: { content?: string } }> | undefined;
          accumulated = choices?.[0]?.text ?? choices?.[0]?.message?.content ?? text;
        } catch {
          accumulated = text;
        }
        completionSignal.set(accumulated);
      }

      if (!signal.aborted) {
        onFinish?.(accumulated);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      errorSignal.set(error);
      onError?.(error);
    } finally {
      if (!signal.aborted) {
        isLoadingSignal.set(false);
        controller = null;
      }
    }
  }

  // ── stop ─────────────────────────────────────────────────────────────────

  /**
   * Abort the in-flight completion request immediately.
   */
  function stop(): void {
    if (controller) {
      controller.abort();
      controller = null;
      isLoadingSignal.set(false);
    }
  }

  // Return a plain object whose getters read the current signal values.
  return {
    get completion() {
      return completionSignal();
    },
    get isLoading() {
      return isLoadingSignal();
    },
    get error() {
      return errorSignal();
    },
    complete,
    stop,
  };
}
