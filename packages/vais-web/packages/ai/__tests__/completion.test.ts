/**
 * @vaisx/ai — useCompletion tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCompletion } from "../src/completion.js";

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

function makePlainTextResponse(text: string): Response {
  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

function makeJsonResponse(text: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ text }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeErrorResponse(status: number): Response {
  return new Response(null, { status, statusText: "Bad Request" });
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("useCompletion — initial state", () => {
  it("starts with empty completion", () => {
    const c = useCompletion({ api: "/api/complete" });
    expect(c.completion).toBe("");
  });

  it("starts with isLoading false", () => {
    const c = useCompletion({ api: "/api/complete" });
    expect(c.isLoading).toBe(false);
  });

  it("starts with null error", () => {
    const c = useCompletion({ api: "/api/complete" });
    expect(c.error).toBeNull();
  });

  it("exposes complete and stop functions", () => {
    const c = useCompletion({ api: "/api/complete" });
    expect(typeof c.complete).toBe("function");
    expect(typeof c.stop).toBe("function");
  });
});

describe("useCompletion — complete (plain text response)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makePlainTextResponse("The answer is 42."))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sets completion to the response text", async () => {
    const c = useCompletion({ api: "/api/complete" });
    await c.complete("What is the answer?");
    expect(c.completion).toBe("The answer is 42.");
  });

  it("isLoading is false after completion", async () => {
    const c = useCompletion({ api: "/api/complete" });
    await c.complete("prompt");
    expect(c.isLoading).toBe(false);
  });

  it("calls onFinish with the full text", async () => {
    const onFinish = vi.fn();
    const c = useCompletion({ api: "/api/complete", onFinish });
    await c.complete("prompt");
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledWith("The answer is 42.");
  });
});

describe("useCompletion — complete (JSON response)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeJsonResponse("Generated text here."))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("extracts text from JSON choices array", async () => {
    const c = useCompletion({ api: "/api/complete" });
    await c.complete("prompt");
    expect(c.completion).toBe("Generated text here.");
  });
});

describe("useCompletion — complete (SSE streaming)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeSseResponse(["token1", " token2"]))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accumulates tokens into completion", async () => {
    const c = useCompletion({ api: "/api/complete" });
    await c.complete("prompt");
    expect(c.completion).toContain("token1");
  });
});

describe("useCompletion — default prompt", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses options.prompt when complete() is called without an argument", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makePlainTextResponse("ok")));
    vi.stubGlobal("fetch", fetchMock);

    const c = useCompletion({ api: "/api/complete", prompt: "default prompt" });
    await c.complete();

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as { prompt: string };
    expect(body.prompt).toBe("default prompt");
  });

  it("overrides the default prompt when an argument is passed", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makePlainTextResponse("ok")));
    vi.stubGlobal("fetch", fetchMock);

    const c = useCompletion({ api: "/api/complete", prompt: "default" });
    await c.complete("override");

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as { prompt: string };
    expect(body.prompt).toBe("override");
  });
});

describe("useCompletion — error handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sets error on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(400))));
    const c = useCompletion({ api: "/api/complete" });
    await c.complete("prompt");
    expect(c.error).toBeInstanceOf(Error);
    expect(c.error!.message).toContain("400");
  });

  it("calls onError on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(500))));
    const onError = vi.fn();
    const c = useCompletion({ api: "/api/complete", onError });
    await c.complete("prompt");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("isLoading is false after an error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeErrorResponse(500))));
    const c = useCompletion({ api: "/api/complete" });
    await c.complete("prompt");
    expect(c.isLoading).toBe(false);
  });

  it("resets completion to empty on a new request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makePlainTextResponse("result"))),
    );
    const c = useCompletion({ api: "/api/complete" });
    await c.complete("first");
    expect(c.completion).toBe("result");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makePlainTextResponse("second"))),
    );
    await c.complete("second");
    expect(c.completion).toBe("second");
  });
});

describe("useCompletion — stop", () => {
  it("stop() can be called when nothing is in flight", () => {
    const c = useCompletion({ api: "/api/complete" });
    expect(() => c.stop()).not.toThrow();
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

    const c = useCompletion({ api: "/api/complete" });
    const promise = c.complete("prompt");
    c.stop();
    resolveFetch(makePlainTextResponse("late"));
    await promise;
    expect(c.isLoading).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("useCompletion — model option", () => {
  it("includes the model in the request body when specified", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makePlainTextResponse("ok")));
    vi.stubGlobal("fetch", fetchMock);

    const c = useCompletion({ api: "/api/complete", model: "gpt-4o" });
    await c.complete("prompt");

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as { model: string };
    expect(body.model).toBe("gpt-4o");
    vi.unstubAllGlobals();
  });
});
