/**
 * @vaisx/ai — streaming-ui tests
 *
 * Tests for createStreamingText, createTokenBuffer, createTypingEffect,
 * createWebSocketStream, and createStreamRenderer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createStreamingText,
  createTokenBuffer,
  createTypingEffect,
  createWebSocketStream,
  createStreamRenderer,
} from "../streaming-ui.js";

// ─── createStreamingText ───────────────────────────────────────────────────────

describe("createStreamingText — initial state", () => {
  it("starts with empty text when no options provided", () => {
    const st = createStreamingText();
    expect(st.state.text).toBe("");
  });

  it("starts with empty tokens array", () => {
    const st = createStreamingText();
    expect(st.state.tokens).toEqual([]);
  });

  it("starts with isStreaming false", () => {
    const st = createStreamingText();
    expect(st.state.isStreaming).toBe(false);
  });

  it("starts with empty cursor string", () => {
    const st = createStreamingText();
    expect(st.state.cursor).toBe("");
  });

  it("initialises text with initialText option", () => {
    const st = createStreamingText({ initialText: "hello" });
    expect(st.state.text).toBe("hello");
    expect(st.state.tokens).toEqual(["hello"]);
  });
});

describe("createStreamingText — appendToken", () => {
  it("appends a token to the text", () => {
    const st = createStreamingText();
    st.appendToken("hello");
    expect(st.state.text).toBe("hello");
  });

  it("accumulates multiple tokens in order", () => {
    const st = createStreamingText();
    st.appendToken("foo");
    st.appendToken(" ");
    st.appendToken("bar");
    expect(st.state.text).toBe("foo bar");
  });

  it("tracks each token in the tokens array", () => {
    const st = createStreamingText();
    st.appendToken("a");
    st.appendToken("b");
    expect(st.state.tokens).toEqual(["a", "b"]);
  });

  it("sets isStreaming to true on first token", () => {
    const st = createStreamingText();
    st.appendToken("x");
    expect(st.state.isStreaming).toBe(true);
  });

  it("shows cursor character while streaming (default enabled)", () => {
    const st = createStreamingText();
    st.appendToken("hello");
    expect(st.state.cursor).toBe("▋");
  });

  it("uses custom cursor character when specified", () => {
    const st = createStreamingText({ cursorChar: "|" });
    st.appendToken("hi");
    expect(st.state.cursor).toBe("|");
  });

  it("does not show cursor when cursor option is false", () => {
    const st = createStreamingText({ cursor: false });
    st.appendToken("hi");
    expect(st.state.cursor).toBe("");
  });
});

describe("createStreamingText — reset", () => {
  it("resets text to empty string after tokens", () => {
    const st = createStreamingText();
    st.appendToken("hello");
    st.reset();
    expect(st.state.text).toBe("");
  });

  it("resets tokens to empty array", () => {
    const st = createStreamingText();
    st.appendToken("a");
    st.appendToken("b");
    st.reset();
    expect(st.state.tokens).toEqual([]);
  });

  it("resets isStreaming to false", () => {
    const st = createStreamingText();
    st.appendToken("token");
    st.reset();
    expect(st.state.isStreaming).toBe(false);
  });

  it("resets cursor to empty string", () => {
    const st = createStreamingText();
    st.appendToken("token");
    st.reset();
    expect(st.state.cursor).toBe("");
  });

  it("restores initialText when provided", () => {
    const st = createStreamingText({ initialText: "seed" });
    st.appendToken("extra");
    st.reset();
    expect(st.state.text).toBe("seed");
    expect(st.state.tokens).toEqual(["seed"]);
  });
});

describe("createStreamingText — getMarkdown & complete", () => {
  it("getMarkdown returns the full accumulated text", () => {
    const st = createStreamingText();
    st.appendToken("# Title\n\n");
    st.appendToken("body text");
    expect(st.getMarkdown()).toBe("# Title\n\nbody text");
  });

  it("complete sets isStreaming to false", () => {
    const st = createStreamingText();
    st.appendToken("token");
    st.complete();
    expect(st.state.isStreaming).toBe(false);
  });

  it("complete clears the cursor", () => {
    const st = createStreamingText();
    st.appendToken("token");
    st.complete();
    expect(st.state.cursor).toBe("");
  });
});

// ─── createTokenBuffer ─────────────────────────────────────────────────────────

describe("createTokenBuffer — basics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bufferedCount is 0 initially", () => {
    const buf = createTokenBuffer();
    expect(buf.bufferedCount).toBe(0);
  });

  it("bufferedCount increases as tokens are pushed", () => {
    const buf = createTokenBuffer();
    buf.push("a");
    buf.push("b");
    expect(buf.bufferedCount).toBe(2);
  });

  it("flush() calls onFlush with buffered tokens", () => {
    const onFlush = vi.fn();
    const buf = createTokenBuffer({ onFlush });
    buf.push("x");
    buf.push("y");
    buf.flush();
    expect(onFlush).toHaveBeenCalledWith(["x", "y"]);
  });

  it("flush() empties the buffer", () => {
    const buf = createTokenBuffer({ onFlush: vi.fn() });
    buf.push("z");
    buf.flush();
    expect(buf.bufferedCount).toBe(0);
  });

  it("flush() does not call onFlush when buffer is empty", () => {
    const onFlush = vi.fn();
    const buf = createTokenBuffer({ onFlush });
    buf.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("auto-flushes after the flush interval", () => {
    const onFlush = vi.fn();
    const buf = createTokenBuffer({ flushInterval: 16, onFlush });
    buf.push("token");
    buf.start();
    vi.advanceTimersByTime(16);
    expect(onFlush).toHaveBeenCalledWith(["token"]);
  });

  it("stop() prevents further auto-flushes", () => {
    const onFlush = vi.fn();
    const buf = createTokenBuffer({ flushInterval: 16, onFlush });
    buf.start();
    buf.push("a");
    buf.stop();
    vi.advanceTimersByTime(100);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("destroy() flushes remaining tokens and stops the timer", () => {
    const onFlush = vi.fn();
    const buf = createTokenBuffer({ flushInterval: 16, onFlush });
    buf.start();
    buf.push("final");
    buf.destroy();
    expect(onFlush).toHaveBeenCalledWith(["final"]);
    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

// ─── createTypingEffect ────────────────────────────────────────────────────────

describe("createTypingEffect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("currentIndex starts at 0", () => {
    const effect = createTypingEffect("hello");
    expect(effect.currentIndex).toBe(0);
  });

  it("isRunning is false before start()", () => {
    const effect = createTypingEffect("hello");
    expect(effect.isRunning).toBe(false);
  });

  it("isRunning becomes true after start()", () => {
    const effect = createTypingEffect("hello", { speed: 10 });
    effect.start();
    expect(effect.isRunning).toBe(true);
    effect.stop();
  });

  it("advances index over time", () => {
    const effect = createTypingEffect("hi", { speed: 10 });
    effect.start();
    vi.advanceTimersByTime(100); // 10 chars/sec = 100ms/char → 1 char
    expect(effect.currentIndex).toBeGreaterThan(0);
    effect.stop();
  });

  it("calls onUpdate with current text and cursor", () => {
    const onUpdate = vi.fn();
    const effect = createTypingEffect("hi", { speed: 100, cursor: true, cursorChar: "|", onUpdate });
    effect.start();
    vi.advanceTimersByTime(10);
    expect(onUpdate).toHaveBeenCalled();
    effect.stop();
  });

  it("calls onComplete when all characters are displayed", () => {
    const onComplete = vi.fn();
    const effect = createTypingEffect("ab", { speed: 100, onComplete });
    effect.start();
    vi.advanceTimersByTime(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("skip() immediately shows all text and calls onComplete", () => {
    const onUpdate = vi.fn();
    const onComplete = vi.fn();
    const effect = createTypingEffect("hello world", { speed: 1, onUpdate, onComplete });
    effect.skip();
    expect(onUpdate).toHaveBeenCalledWith("hello world", "");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("stop() pauses the animation", () => {
    const onUpdate = vi.fn();
    const effect = createTypingEffect("abcde", { speed: 100, onUpdate });
    effect.start();
    vi.advanceTimersByTime(20);
    effect.stop();
    const callsAfterStop = onUpdate.mock.calls.length;
    vi.advanceTimersByTime(200);
    // No new calls should be made after stop()
    expect(onUpdate.mock.calls.length).toBe(callsAfterStop);
  });

  it("hides cursor when cursor option is false", () => {
    const onUpdate = vi.fn();
    const effect = createTypingEffect("hi", { speed: 100, cursor: false, onUpdate });
    effect.start();
    vi.advanceTimersByTime(10);
    const calls = onUpdate.mock.calls;
    if (calls.length > 0) {
      const lastCall = calls[calls.length - 1];
      expect(lastCall![1]).toBe("");
    }
    effect.stop();
  });
});

// ─── createWebSocketStream ─────────────────────────────────────────────────────

describe("createWebSocketStream — connection state", () => {
  let MockWebSocket: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket = vi.fn(() => ({
      readyState: WebSocket.CONNECTING,
      onopen: null as ((e: Event) => void) | null,
      onmessage: null as ((e: MessageEvent) => void) | null,
      onerror: null as ((e: Event) => void) | null,
      onclose: null as ((e: CloseEvent) => void) | null,
      close: vi.fn(),
      send: vi.fn(),
    }));
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts in idle state", () => {
    const ws = createWebSocketStream("ws://localhost");
    expect(ws.connectionState).toBe("idle");
  });

  it("transitions to connecting after connect()", () => {
    const ws = createWebSocketStream("ws://localhost");
    ws.connect();
    expect(ws.connectionState).toBe("connecting");
  });

  it("transitions to connected when WebSocket opens", () => {
    const ws = createWebSocketStream("ws://localhost");
    ws.connect();
    const mockInstance = MockWebSocket.mock.results[0]!.value;
    mockInstance.readyState = WebSocket.OPEN;
    mockInstance.onopen(new Event("open"));
    expect(ws.connectionState).toBe("connected");
  });

  it("calls onOpen callback when connected", () => {
    const onOpen = vi.fn();
    const ws = createWebSocketStream("ws://localhost", { onOpen });
    ws.connect();
    const mockInstance = MockWebSocket.mock.results[0]!.value;
    mockInstance.onopen(new Event("open"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("calls onMessage with message data", () => {
    const onMessage = vi.fn();
    const ws = createWebSocketStream("ws://localhost", { onMessage });
    ws.connect();
    const mockInstance = MockWebSocket.mock.results[0]!.value;
    mockInstance.onopen(new Event("open"));
    const msgEvent = new MessageEvent("message", { data: "token" });
    mockInstance.onmessage(msgEvent);
    expect(onMessage).toHaveBeenCalledWith("token", msgEvent);
  });

  it("calls onError when an error event fires", () => {
    const onError = vi.fn();
    const ws = createWebSocketStream("ws://localhost", { onError, maxRetries: 0 });
    ws.connect();
    const mockInstance = MockWebSocket.mock.results[0]!.value;
    mockInstance.onerror(new Event("error"));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when connection closes", () => {
    const onClose = vi.fn();
    const ws = createWebSocketStream("ws://localhost", { onClose, maxRetries: 0 });
    ws.connect();
    const mockInstance = MockWebSocket.mock.results[0]!.value;
    mockInstance.readyState = WebSocket.OPEN;
    mockInstance.onopen(new Event("open"));
    mockInstance.onclose(new CloseEvent("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("retryCount starts at 0", () => {
    const ws = createWebSocketStream("ws://localhost");
    expect(ws.retryCount).toBe(0);
  });

  it("disconnect() transitions to closed state", () => {
    const ws = createWebSocketStream("ws://localhost");
    ws.connect();
    const mockInstance = MockWebSocket.mock.results[0]!.value;
    mockInstance.readyState = WebSocket.OPEN;
    ws.disconnect();
    expect(ws.connectionState).toBe("closed");
  });

  it("reconnect() resets retryCount and reconnects", () => {
    const ws = createWebSocketStream("ws://localhost", { maxRetries: 3 });
    ws.connect();
    ws.reconnect();
    expect(ws.retryCount).toBe(0);
    expect(ws.connectionState).toBe("connecting");
  });
});

// ─── createStreamRenderer ─────────────────────────────────────────────────────

describe("createStreamRenderer", () => {
  it("update() appends token and calls onRender", () => {
    const onRender = vi.fn();
    const renderer = createStreamRenderer({ onRender });
    renderer.update("hello");
    expect(onRender).toHaveBeenCalledTimes(1);
    expect(renderer.streamingText.state.text).toBe("hello");
  });

  it("update() accumulates multiple tokens", () => {
    const renderer = createStreamRenderer();
    renderer.update("foo");
    renderer.update(" bar");
    expect(renderer.streamingText.state.text).toBe("foo bar");
  });

  it("complete() sets isStreaming to false", () => {
    const renderer = createStreamRenderer();
    renderer.update("text");
    renderer.complete();
    expect(renderer.streamingText.state.isStreaming).toBe(false);
  });

  it("complete() calls onRender with final state", () => {
    const onRender = vi.fn();
    const renderer = createStreamRenderer({ onRender });
    renderer.update("text");
    renderer.complete();
    const lastCall = onRender.mock.calls[onRender.mock.calls.length - 1]!;
    expect(lastCall[0].isStreaming).toBe(false);
  });

  it("render() calls onRender with provided state", () => {
    const onRender = vi.fn();
    const renderer = createStreamRenderer({ onRender });
    const fakeState = {
      text: "custom",
      tokens: ["custom"],
      isStreaming: false,
      cursor: "",
    };
    renderer.render(fakeState);
    expect(onRender).toHaveBeenCalledWith(fakeState);
  });

  it("exposes streamingText instance", () => {
    const renderer = createStreamRenderer();
    expect(renderer.streamingText).toBeDefined();
    expect(typeof renderer.streamingText.appendToken).toBe("function");
  });
});
