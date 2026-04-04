/**
 * vais-web/kit — Generic WebSocket client with RPC envelope protocol.
 *
 * Mirrors the server-side WsEnvelope defined in vais-server/src/ws/protocol.vais.
 * Envelope JSON shape:
 *   { id, msg_type, method, payload, error }
 *
 * Patterns adapted from:
 *   packages/ai/src/streaming-ui.ts  (createWebSocketStream auto-reconnect)
 *   packages/hmr/src/client.ts       (WebSocket lifecycle management)
 */

// ─── Envelope ─────────────────────────────────────────────────────────────────

/** Wire format matching vais-server WsEnvelope */
export interface WsEnvelope {
  /** Correlation ID for request-response matching */
  id: string;
  /** "request" | "response" | "event" | "stream" */
  msg_type: "request" | "response" | "event" | "stream";
  /** RPC method name or event type */
  method: string;
  /** JSON-serialised application payload */
  payload: string;
  /** Non-empty when msg_type == "response" and the call failed */
  error: string;
}

function serializeEnvelope(env: WsEnvelope): string {
  return JSON.stringify(env);
}

function parseEnvelope(raw: string): WsEnvelope | null {
  try {
    const obj = JSON.parse(raw) as Partial<WsEnvelope>;
    if (
      typeof obj.id === "string" &&
      typeof obj.msg_type === "string" &&
      typeof obj.method === "string"
    ) {
      return {
        id: obj.id,
        msg_type: obj.msg_type as WsEnvelope["msg_type"],
        method: obj.method,
        payload: typeof obj.payload === "string" ? obj.payload : "",
        error: typeof obj.error === "string" ? obj.error : "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── ID generation ────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `req_${_idCounter}_${Date.now()}`;
}

// ─── Connection state ─────────────────────────────────────────────────────────

export type WsConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface WebSocketOptions {
  /** Protocols to pass to the WebSocket constructor. */
  protocols?: string | string[];
  /** Maximum reconnect attempts before giving up. Default: 5. */
  maxRetries?: number;
  /** Initial backoff delay in ms (doubles on each retry). Default: 1000. */
  backoffMs?: number;
  /** Called when the connection opens. */
  onOpen?: (event: Event) => void;
  /** Called when the connection closes. */
  onClose?: (event: CloseEvent) => void;
  /** Called on a connection error. */
  onError?: (event: Event) => void;
}

// ─── Pending request record ───────────────────────────────────────────────────

interface PendingRequest {
  resolve: (payload: string) => void;
  reject: (error: Error) => void;
}

// ─── Stream handler record ────────────────────────────────────────────────────

type StreamChunkHandler = (chunk: string) => void;

// ─── WebSocket client instance ────────────────────────────────────────────────

export interface WebSocketInstance {
  /** Connect (or reconnect). */
  connect(): void;
  /** Disconnect cleanly; stops auto-reconnect. */
  disconnect(): void;
  /**
   * Send an RPC request and return a Promise for the response payload.
   * Rejects if the server returns an error envelope or the connection is closed.
   */
  send(method: string, payload?: string): Promise<string>;
  /**
   * Subscribe to server-pushed events for the given method name.
   * Returns an unsubscribe function.
   */
  on(method: string, handler: (payload: string) => void): () => void;
  /**
   * Subscribe to stream chunks for the given streamId.
   * The handler receives each chunk payload; call the returned function to
   * unsubscribe and stop receiving chunks.
   */
  onStream(streamId: string, handler: StreamChunkHandler): () => void;
  /** Current connection state. */
  readonly connectionState: WsConnectionState;
  /** Number of reconnect attempts made so far. */
  readonly retryCount: number;
}

/**
 * Create a WebSocket client that speaks the vais-server WsEnvelope protocol.
 *
 * Features:
 * - Automatic exponential-backoff reconnect
 * - Request-response correlation via envelope.id
 * - Event subscription via on()
 * - Streaming via onStream()
 */
export function createWebSocket(
  url: string,
  options: WebSocketOptions = {},
): WebSocketInstance {
  const {
    protocols,
    maxRetries = 5,
    backoffMs = 1000,
    onOpen,
    onClose,
    onError,
  } = options;

  let ws: WebSocket | null = null;
  let connectionState: WsConnectionState = "idle";
  let retryCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manuallyDisconnected = false;

  // Pending request-response correlations: id → { resolve, reject }
  const pending = new Map<string, PendingRequest>();

  // Event subscriptions: method → Set<handler>
  const eventHandlers = new Map<string, Set<(payload: string) => void>>();

  // Stream subscriptions: streamId → Set<handler>
  const streamHandlers = new Map<string, Set<StreamChunkHandler>>();

  // ── Internal helpers ────────────────────────────────────────────────────────

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (manuallyDisconnected || retryCount >= maxRetries) {
      connectionState = "closed";
      // Reject all pending requests
      for (const [, req] of pending) {
        req.reject(new Error("WebSocket closed; max retries reached."));
      }
      pending.clear();
      return;
    }

    connectionState = "reconnecting";
    const delay = backoffMs * Math.pow(2, retryCount);
    retryCount += 1;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      doConnect();
    }, delay);
  }

  function handleMessage(raw: string): void {
    const env = parseEnvelope(raw);
    if (env === null) return;

    if (env.msg_type === "response") {
      const req = pending.get(env.id);
      if (req) {
        pending.delete(env.id);
        if (env.error && env.error !== "") {
          req.reject(new Error(env.error));
        } else {
          req.resolve(env.payload);
        }
      }
      return;
    }

    if (env.msg_type === "event") {
      const handlers = eventHandlers.get(env.method);
      if (handlers) {
        for (const h of handlers) {
          h(env.payload);
        }
      }
      return;
    }

    if (env.msg_type === "stream") {
      // stream_end and stream_flush use envelope.payload as the stream id
      if (env.method === "stream_end" || env.method === "stream_flush") {
        // Nothing to do for flush; end is informational — handlers decide cleanup
        return;
      }
      // Regular chunk: streamId is the method field
      const handlers = streamHandlers.get(env.method);
      if (handlers) {
        for (const h of handlers) {
          h(env.payload);
        }
      }
    }
  }

  function doConnect(): void {
    // Clean up any existing socket
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
    } catch {
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
      handleMessage(String(event.data));
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

  // ── Public API ──────────────────────────────────────────────────────────────

  function connect(): void {
    manuallyDisconnected = false;
    clearReconnectTimer();
    retryCount = 0;
    doConnect();
  }

  function disconnect(): void {
    manuallyDisconnected = true;
    clearReconnectTimer();

    // Reject pending requests
    for (const [, req] of pending) {
      req.reject(new Error("WebSocket disconnected by client."));
    }
    pending.clear();

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

  function send(method: string, payload = ""): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(
          new Error(
            "WebSocket is not connected. Call connect() before send().",
          ),
        );
        return;
      }

      const id = nextId();
      const envelope: WsEnvelope = {
        id,
        msg_type: "request",
        method,
        payload,
        error: "",
      };

      pending.set(id, { resolve, reject });

      try {
        ws.send(serializeEnvelope(envelope));
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  function on(
    method: string,
    handler: (payload: string) => void,
  ): () => void {
    if (!eventHandlers.has(method)) {
      eventHandlers.set(method, new Set());
    }
    eventHandlers.get(method)!.add(handler);

    return () => {
      const set = eventHandlers.get(method);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          eventHandlers.delete(method);
        }
      }
    };
  }

  function onStream(
    streamId: string,
    handler: StreamChunkHandler,
  ): () => void {
    if (!streamHandlers.has(streamId)) {
      streamHandlers.set(streamId, new Set());
    }
    streamHandlers.get(streamId)!.add(handler);

    return () => {
      const set = streamHandlers.get(streamId);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          streamHandlers.delete(streamId);
        }
      }
    };
  }

  return {
    connect,
    disconnect,
    send,
    on,
    onStream,
    get connectionState() {
      return connectionState;
    },
    get retryCount() {
      return retryCount;
    },
  };
}

// ─── useWebSocket composable ───────────────────────────────────────────────────

export interface UseWebSocketOptions extends WebSocketOptions {
  /** If true, connect immediately on creation. Default: true. */
  autoConnect?: boolean;
}

export interface UseWebSocketReturn {
  /** The underlying WebSocket client instance. */
  client: WebSocketInstance;
  /** Current connection state (reactive-friendly getter). */
  readonly connectionState: WsConnectionState;
  /** Number of reconnect attempts made. */
  readonly retryCount: number;
  /** Send an RPC request and return a Promise for the response payload. */
  send(method: string, payload?: string): Promise<string>;
  /** Subscribe to server-pushed events. Returns an unsubscribe function. */
  on(method: string, handler: (payload: string) => void): () => void;
  /** Subscribe to stream chunks. Returns an unsubscribe function. */
  onStream(streamId: string, handler: StreamChunkHandler): () => void;
  /** Manually connect (or reconnect). */
  connect(): void;
  /** Disconnect cleanly. */
  disconnect(): void;
}

/**
 * Composable that wraps createWebSocket() for use inside VaisX components.
 *
 * Usage:
 *   const ws = useWebSocket("ws://localhost:8080/ws");
 *   const result = await ws.send("chat.send", JSON.stringify({ text: "hi" }));
 *   ws.on("chat.message", (payload) => console.log(payload));
 *   ws.onStream("ai.response", (chunk) => appendToken(chunk));
 */
export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  const { autoConnect = true, ...wsOptions } = options;

  const client = createWebSocket(url, wsOptions);

  if (autoConnect) {
    client.connect();
  }

  return {
    client,
    get connectionState() {
      return client.connectionState;
    },
    get retryCount() {
      return client.retryCount;
    },
    send(method: string, payload?: string) {
      return client.send(method, payload);
    },
    on(method: string, handler: (payload: string) => void) {
      return client.on(method, handler);
    },
    onStream(streamId: string, handler: StreamChunkHandler) {
      return client.onStream(streamId, handler);
    },
    connect() {
      client.connect();
    },
    disconnect() {
      client.disconnect();
    },
  };
}
