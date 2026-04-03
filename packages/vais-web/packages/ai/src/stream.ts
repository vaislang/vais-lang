/**
 * SSE (Server-Sent Events) stream parsing utilities for @vaisx/ai.
 *
 * Provides primitives for consuming text/event-stream responses from
 * AI API endpoints and converting them into async iterables.
 */

// ─── ReadableStream → AsyncIterable ──────────────────────────────────────────

/**
 * Convert a WHATWG ReadableStream<Uint8Array> into an AsyncIterable<Uint8Array>.
 *
 * This allows `for await...of` iteration over raw stream chunks, bridging
 * the gap between the Fetch API and standard async iteration.
 */
export async function* readableStreamToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── SSE parsing ─────────────────────────────────────────────────────────────

/**
 * A parsed Server-Sent Event frame.
 */
export interface SSEEvent {
  /** Event type (from the `event:` field, defaults to "message"). */
  event: string;
  /** Event data (from the `data:` field). */
  data: string;
  /** Event id (from the `id:` field), if present. */
  id?: string;
  /** Retry interval in ms (from the `retry:` field), if present. */
  retry?: number;
}

/**
 * Parse a raw SSE response into an async sequence of SSEEvent objects.
 *
 * The parser follows the WHATWG EventSource processing model:
 * - Lines starting with `:` are comments and are skipped.
 * - A blank line dispatches the accumulated event.
 * - `data:` lines are concatenated with `\n` between them.
 * - The sentinel `data: [DONE]` (used by OpenAI-compatible APIs) ends the stream.
 *
 * @param response - A Fetch `Response` whose body is `text/event-stream`.
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<SSEEvent> {
  if (!response.body) {
    throw new Error("Response body is null — cannot parse SSE stream.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  // Accumulated fields for the current event frame
  let eventType = "message";
  const dataLines: string[] = [];
  let lastEventId: string | undefined;
  let retryMs: number | undefined;

  /**
   * Dispatch the accumulated event frame and reset accumulators.
   */
  function* dispatchEvent(): Generator<SSEEvent> {
    if (dataLines.length === 0) return; // No data → no event

    const data = dataLines.join("\n");
    // OpenAI-compatible sentinel: skip [DONE] as a data event but let callers
    // detect end-of-stream via the generator completing naturally.
    if (data !== "[DONE]") {
      const ev: SSEEvent = { event: eventType, data };
      if (lastEventId !== undefined) ev.id = lastEventId;
      if (retryMs !== undefined) ev.retry = retryMs;
      yield ev;
    }

    // Reset per-event state (id and retry persist across events per spec)
    eventType = "message";
    dataLines.length = 0;
  }

  for await (const chunk of readableStreamToAsyncIterable(response.body)) {
    buffer += decoder.decode(chunk, { stream: true });

    // Process all complete lines in the buffer
    const lines = buffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      // Normalise CRLF → LF
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

      if (line === "") {
        // Blank line → dispatch event
        yield* dispatchEvent();
      } else if (line.startsWith(":")) {
        // Comment — ignore
      } else {
        const colonIdx = line.indexOf(":");
        let field: string;
        let value: string;

        if (colonIdx === -1) {
          field = line;
          value = "";
        } else {
          field = line.slice(0, colonIdx);
          // A single leading space after `:` is stripped per spec
          value = line.slice(colonIdx + 1).replace(/^ /, "");
        }

        switch (field) {
          case "event":
            eventType = value;
            break;
          case "data":
            dataLines.push(value);
            break;
          case "id":
            lastEventId = value;
            break;
          case "retry": {
            const ms = parseInt(value, 10);
            if (!isNaN(ms)) retryMs = ms;
            break;
          }
          // Unknown fields are ignored per spec
        }
      }
    }
  }

  // Flush any remaining buffered content
  const remaining = buffer + decoder.decode();
  if (remaining.trim() !== "") {
    // Process leftover lines
    for (const raw of remaining.split("\n")) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (line === "") {
        yield* dispatchEvent();
      } else if (!line.startsWith(":")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const field = line.slice(0, colonIdx);
          const value = line.slice(colonIdx + 1).replace(/^ /, "");
          if (field === "data") dataLines.push(value);
        }
      }
    }
  }

  // Dispatch any remaining buffered event
  yield* dispatchEvent();
}

/**
 * Convenience helper: consume a parsed SSE stream and call callbacks for
 * each text token.  Returns the full accumulated text when the stream ends.
 *
 * The function expects `data` fields to be plain text tokens.  For JSON-
 * encoded delta formats (e.g. OpenAI) callers should parse the data themselves
 * via `parseSSEStream` directly.
 *
 * @param response   - Fetch Response with a `text/event-stream` body.
 * @param onToken    - Called for every non-empty data token.
 * @param signal     - Optional AbortSignal.
 */
export async function consumeTextStream(
  response: Response,
  onToken?: (token: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let full = "";

  for await (const event of parseSSEStream(response)) {
    if (signal?.aborted) break;
    if (event.data) {
      full += event.data;
      onToken?.(event.data);
    }
  }

  return full;
}
