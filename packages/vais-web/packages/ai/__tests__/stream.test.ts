/**
 * @vaisx/ai — stream utilities tests
 */

import { describe, it, expect } from "vitest";
import {
  readableStreamToAsyncIterable,
  parseSSEStream,
  consumeTextStream,
} from "../src/stream.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function makeResponse(body: string, contentType = "text/event-stream"): Response {
  return new Response(makeStream([body]), {
    headers: { "Content-Type": contentType },
  });
}

// ─── readableStreamToAsyncIterable ───────────────────────────────────────────

describe("readableStreamToAsyncIterable", () => {
  it("yields chunks from a ReadableStream", async () => {
    const stream = makeStream(["hello", " ", "world"]);
    const chunks: Uint8Array[] = [];
    for await (const chunk of readableStreamToAsyncIterable(stream)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(3);
  });

  it("decodes chunks to the original text", async () => {
    const stream = makeStream(["foo", "bar"]);
    const decoder = new TextDecoder();
    let text = "";
    for await (const chunk of readableStreamToAsyncIterable(stream)) {
      text += decoder.decode(chunk);
    }
    expect(text).toBe("foobar");
  });

  it("handles an empty stream without error", async () => {
    const stream = makeStream([]);
    const chunks: Uint8Array[] = [];
    for await (const chunk of readableStreamToAsyncIterable(stream)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(0);
  });

  it("handles a single-chunk stream", async () => {
    const stream = makeStream(["single"]);
    const decoder = new TextDecoder();
    let text = "";
    for await (const chunk of readableStreamToAsyncIterable(stream)) {
      text += decoder.decode(chunk);
    }
    expect(text).toBe("single");
  });
});

// ─── parseSSEStream ───────────────────────────────────────────────────────────

describe("parseSSEStream", () => {
  it("parses a single data event", async () => {
    const body = "data: hello\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toBe("hello");
    expect(events[0]!.event).toBe("message");
  });

  it("parses multiple events separated by blank lines", async () => {
    const body = "data: first\n\ndata: second\n\ndata: third\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(3);
    expect(events[0]!.data).toBe("first");
    expect(events[1]!.data).toBe("second");
    expect(events[2]!.data).toBe("third");
  });

  it("parses the event type field", async () => {
    const body = "event: custom\ndata: payload\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events[0]!.event).toBe("custom");
    expect(events[0]!.data).toBe("payload");
  });

  it("parses the id field", async () => {
    const body = "id: 42\ndata: test\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events[0]!.id).toBe("42");
  });

  it("parses the retry field as a number", async () => {
    const body = "retry: 3000\ndata: test\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events[0]!.retry).toBe(3000);
  });

  it("ignores comment lines starting with ':'", async () => {
    const body = ": this is a comment\ndata: real\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toBe("real");
  });

  it("skips the [DONE] sentinel without emitting an event", async () => {
    const body = "data: token\n\ndata: [DONE]\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toBe("token");
  });

  it("strips the single leading space from the value", async () => {
    const body = "data: hello world\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events[0]!.data).toBe("hello world");
  });

  it("concatenates multiple data lines with newline", async () => {
    const body = "data: line1\ndata: line2\n\n";
    const response = makeResponse(body);
    const events = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }
    expect(events[0]!.data).toBe("line1\nline2");
  });

  it("throws when response body is null", async () => {
    const response = new Response(null, { status: 200 });
    await expect(async () => {
      for await (const _ of parseSSEStream(response)) {
        // noop
      }
    }).rejects.toThrow("Response body is null");
  });
});

// ─── consumeTextStream ────────────────────────────────────────────────────────

describe("consumeTextStream", () => {
  it("accumulates all tokens and returns full text", async () => {
    const body = "data: hello\n\ndata: world\n\n";
    const response = makeResponse(body);
    const result = await consumeTextStream(response);
    expect(result).toBe("helloworld");
  });

  it("calls onToken for each token", async () => {
    const body = "data: foo\n\ndata: bar\n\n";
    const response = makeResponse(body);
    const tokens: string[] = [];
    await consumeTextStream(response, (t) => tokens.push(t));
    expect(tokens).toEqual(["foo", "bar"]);
  });

  it("stops consuming when signal is aborted", async () => {
    const body = "data: a\n\ndata: b\n\ndata: c\n\n";
    const response = makeResponse(body);
    const controller = new AbortController();
    const tokens: string[] = [];

    // Abort after first token
    const onToken = (t: string) => {
      tokens.push(t);
      controller.abort();
    };

    await consumeTextStream(response, onToken, controller.signal);
    expect(tokens.length).toBeLessThanOrEqual(2);
  });
});
