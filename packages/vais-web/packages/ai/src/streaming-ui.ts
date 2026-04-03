/**
 * LLM Streaming UI — SSE/WebSocket based real-time token rendering utilities.
 *
 * Provides primitives for:
 * - createStreamingText: reactive streaming text state management
 * - createTokenBuffer: batched token buffering for performance
 * - createTypingEffect: character-by-character typing animation
 * - createWebSocketStream: WebSocket based stream with auto-reconnect
 * - StreamRenderer: unified render/update/complete interface
 */

// ─── StreamingText ─────────────────────────────────────────────────────────────

/**
 * Options for createStreamingText().
 */
export interface StreamingTextOptions {
  /** Initial text content. Default: "". */
  initialText?: string;
  /** Whether to show a cursor character. Default: true. */
  cursor?: boolean;
  /** Cursor character to display. Default: "▋". */
  cursorChar?: string;
}

/**
 * Reactive state for a streaming text component.
 */
export interface StreamingTextState {
  /** Full accumulated text. */
  text: string;
  /** All tokens received so far. */
  tokens: string[];
  /** True while tokens are actively being received. */
  isStreaming: boolean;
  /** Current cursor character (empty string when cursor is disabled or streaming is complete). */
  cursor: string;
}

/**
 * Streaming text component helper returned by createStreamingText().
 */
export interface StreamingTextInstance {
  /** Current reactive state. */
  state: StreamingTextState;
  /** Append a new token and update state. */
  appendToken(token: string): void;
  /** Reset all state back to initial. */
  reset(): void;
  /** Return the accumulated text formatted as markdown. */
  getMarkdown(): string;
  /** Mark streaming as complete (hides cursor). */
  complete(): void;
  /** Start streaming (shows cursor, sets isStreaming = true). */
  start(): void;
}

/**
 * Create a streaming text component helper with reactive state tracking.
 */
export function createStreamingText(
  options: StreamingTextOptions = {},
): StreamingTextInstance {
  const {
    initialText = "",
    cursor: showCursor = true,
    cursorChar = "▋",
  } = options;

  const state: StreamingTextState = {
    text: initialText,
    tokens: initialText ? [initialText] : [],
    isStreaming: false,
    cursor: "",
  };

  function appendToken(token: string): void {
    state.tokens.push(token);
    state.text += token;
    state.isStreaming = true;
    state.cursor = showCursor ? cursorChar : "";
  }

  function reset(): void {
    state.text = initialText;
    state.tokens = initialText ? [initialText] : [];
    state.isStreaming = false;
    state.cursor = "";
  }

  function getMarkdown(): string {
    return state.text;
  }

  function complete(): void {
    state.isStreaming = false;
    state.cursor = "";
  }

  function start(): void {
    state.isStreaming = true;
    state.cursor = showCursor ? cursorChar : "";
  }

  return { state, appendToken, reset, getMarkdown, complete, start };
}

// ─── TokenBuffer ───────────────────────────────────────────────────────────────

/**
 * Options for createTokenBuffer().
 */
export interface TokenBufferOptions {
  /** Interval in ms between flush batches. Default: 16 (one frame at 60fps). */
  flushInterval?: number;
  /** Called with all buffered tokens when flushed. */
  onFlush?: (tokens: string[]) => void;
}

/**
 * Token buffering instance returned by createTokenBuffer().
 */
export interface TokenBufferInstance {
  /** Add a token to the internal buffer. */
  push(token: string): void;
  /** Immediately flush any buffered tokens via onFlush. */
  flush(): void;
  /** Start the automatic flush interval. */
  start(): void;
  /** Stop the automatic flush interval (does not flush remaining tokens). */
  stop(): void;
  /** Stop the interval and flush any remaining tokens. */
  destroy(): void;
  /** Number of tokens currently in the buffer. */
  readonly bufferedCount: number;
}

/**
 * Create a token buffer that batches tokens and flushes them periodically
 * for efficient UI rendering.
 */
export function createTokenBuffer(
  options: TokenBufferOptions = {},
): TokenBufferInstance {
  const { flushInterval = 16, onFlush } = options;

  let buffer: string[] = [];
  let timerId: ReturnType<typeof setInterval> | null = null;

  function flush(): void {
    if (buffer.length === 0) return;
    const tokens = buffer.slice();
    buffer = [];
    onFlush?.(tokens);
  }

  function push(token: string): void {
    buffer.push(token);
  }

  function start(): void {
    if (timerId !== null) return;
    timerId = setInterval(flush, flushInterval);
  }

  function stop(): void {
    if (timerId === null) return;
    clearInterval(timerId);
    timerId = null;
  }

  function destroy(): void {
    stop();
    flush();
  }

  return {
    push,
    flush,
    start,
    stop,
    destroy,
    get bufferedCount() {
      return buffer.length;
    },
  };
}

// ─── TypingEffect ──────────────────────────────────────────────────────────────

/**
 * Options for createTypingEffect().
 */
export interface TypingEffectOptions {
  /** Characters typed per second. Default: 30. */
  speed?: number;
  /** Whether to show a blinking cursor. Default: true. */
  cursor?: boolean;
  /** Cursor character. Default: "|". */
  cursorChar?: string;
  /** Called on each character update with the current displayed text. */
  onUpdate?: (displayedText: string, cursor: string) => void;
  /** Called when the full text has been displayed. */
  onComplete?: () => void;
}

/**
 * Typing effect instance returned by createTypingEffect().
 */
export interface TypingEffectInstance {
  /** Start the typing animation. */
  start(): void;
  /** Stop/pause the animation. */
  stop(): void;
  /** Skip to the end immediately (shows all text). */
  skip(): void;
  /** Current number of characters displayed. */
  readonly currentIndex: number;
  /** Whether the animation is currently running. */
  readonly isRunning: boolean;
}

/**
 * Create a typing effect that reveals text character by character.
 */
export function createTypingEffect(
  text: string,
  options: TypingEffectOptions = {},
): TypingEffectInstance {
  const {
    speed = 30,
    cursor: showCursor = true,
    cursorChar = "|",
    onUpdate,
    onComplete,
  } = options;

  const delayMs = speed > 0 ? Math.round(1000 / speed) : 0;
  let index = 0;
  let timerId: ReturnType<typeof setInterval> | null = null;
  let running = false;

  function emitUpdate(): void {
    const displayed = text.slice(0, index);
    const cur = showCursor && running ? cursorChar : "";
    onUpdate?.(displayed, cur);
  }

  function tick(): void {
    if (index < text.length) {
      index++;
      emitUpdate();
    }

    if (index >= text.length) {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
      running = false;
      // Emit final update without cursor
      const displayed = text.slice(0, index);
      onUpdate?.(displayed, "");
      onComplete?.();
    }
  }

  function start(): void {
    if (running || index >= text.length) return;
    running = true;
    emitUpdate();
    timerId = setInterval(tick, delayMs);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    emitUpdate();
  }

  function skip(): void {
    stop();
    index = text.length;
    running = false;
    onUpdate?.(text, "");
    onComplete?.();
  }

  return {
    start,
    stop,
    skip,
    get currentIndex() {
      return index;
    },
    get isRunning() {
      return running;
    },
  };
}

// ─── WebSocketStream ───────────────────────────────────────────────────────────

/**
 * Options for createWebSocketStream().
 */
export interface WebSocketStreamOptions {
  /** Protocols to pass to the WebSocket constructor. */
  protocols?: string | string[];
  /** Maximum number of reconnect attempts. Default: 3. */
  maxRetries?: number;
  /** Initial backoff delay in ms (doubles on each retry). Default: 1000. */
  backoffMs?: number;
  /** Called when a message is received. */
  onMessage?: (data: string, event: MessageEvent) => void;
  /** Called when an error occurs. */
  onError?: (error: Event) => void;
  /** Called when the connection closes. */
  onClose?: (event: CloseEvent) => void;
  /** Called when the connection is established. */
  onOpen?: (event: Event) => void;
}

/**
 * WebSocket stream connection states.
 */
export type WebSocketConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

/**
 * WebSocket stream instance returned by createWebSocketStream().
 */
export interface WebSocketStreamInstance {
  /** Connect (or reconnect) to the WebSocket URL. */
  connect(): void;
  /** Disconnect the WebSocket cleanly. */
  disconnect(): void;
  /** Force-close and immediately reconnect. */
  reconnect(): void;
  /** Send a message over the WebSocket. */
  send(data: string): void;
  /** Current connection state. */
  readonly connectionState: WebSocketConnectionState;
  /** Number of reconnect attempts made so far. */
  readonly retryCount: number;
}

/**
 * Create a WebSocket-based stream with automatic reconnection.
 */
export function createWebSocketStream(
  url: string,
  options: WebSocketStreamOptions = {},
): WebSocketStreamInstance {
  const {
    protocols,
    maxRetries = 3,
    backoffMs = 1000,
    onMessage,
    onError,
    onClose,
    onOpen,
  } = options;

  let ws: WebSocket | null = null;
  let connectionState: WebSocketConnectionState = "idle";
  let retryCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manuallyDisconnected = false;

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (manuallyDisconnected || retryCount >= maxRetries) {
      connectionState = "closed";
      return;
    }

    connectionState = "reconnecting";
    const delay = backoffMs * Math.pow(2, retryCount);
    retryCount++;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      doConnect();
    }, delay);
  }

  function doConnect(): void {
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      ws = null;
    }

    connectionState = "connecting";

    try {
      ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    } catch (err) {
      connectionState = "error";
      scheduleReconnect();
      return;
    }

    ws.onopen = (event: Event) => {
      connectionState = "connected";
      retryCount = 0;
      onOpen?.(event);
    };

    ws.onmessage = (event: MessageEvent) => {
      onMessage?.(String(event.data), event);
    };

    ws.onerror = (event: Event) => {
      connectionState = "error";
      onError?.(event);
    };

    ws.onclose = (event: CloseEvent) => {
      ws = null;
      onClose?.(event);
      if (!manuallyDisconnected) {
        scheduleReconnect();
      } else {
        connectionState = "closed";
      }
    };
  }

  function connect(): void {
    manuallyDisconnected = false;
    clearReconnectTimer();
    retryCount = 0;
    doConnect();
  }

  function disconnect(): void {
    manuallyDisconnected = true;
    clearReconnectTimer();
    connectionState = "closed";
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      ws = null;
    }
  }

  function reconnect(): void {
    manuallyDisconnected = false;
    clearReconnectTimer();
    retryCount = 0;
    doConnect();
  }

  function send(data: string): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(
        "WebSocket is not connected. Call connect() before send().",
      );
    }
    ws.send(data);
  }

  return {
    connect,
    disconnect,
    reconnect,
    send,
    get connectionState() {
      return connectionState;
    },
    get retryCount() {
      return retryCount;
    },
  };
}

// ─── StreamRenderer ────────────────────────────────────────────────────────────

/**
 * Options for creating a StreamRenderer.
 */
export interface StreamRendererOptions {
  /** Called on every render with the current state. */
  onRender?: (state: StreamingTextState) => void;
}

/**
 * A unified interface for rendering streaming LLM output.
 */
export interface StreamRenderer {
  /** Trigger a full re-render with the given state. */
  render(state: StreamingTextState): void;
  /** Append a new token and trigger a re-render. */
  update(token: string): void;
  /** Mark the stream as complete and trigger a final render. */
  complete(): void;
  /** Current internal streaming text instance. */
  readonly streamingText: StreamingTextInstance;
}

/**
 * Create a StreamRenderer that combines StreamingTextInstance management
 * with a render callback.
 */
export function createStreamRenderer(
  options: StreamRendererOptions = {},
): StreamRenderer {
  const { onRender } = options;
  const streamingText = createStreamingText();

  function render(state: StreamingTextState): void {
    onRender?.(state);
  }

  function update(token: string): void {
    streamingText.appendToken(token);
    onRender?.(streamingText.state);
  }

  function complete(): void {
    streamingText.complete();
    onRender?.(streamingText.state);
  }

  return {
    render,
    update,
    complete,
    get streamingText() {
      return streamingText;
    },
  };
}
