/**
 * Bridge layer — JS ↔ Native communication (Hermes/JSC integration).
 *
 * Provides message passing, batching, native module invocation,
 * and an event emitter between JavaScript and the native layer.
 */

import type { MessageHandler, NativeModule } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration options for createBridge(). */
export interface BridgeConfig {
  /** Interval in ms at which the message batch is flushed (default: 16). */
  batchInterval?: number;
  /** Maximum number of messages per batch before an immediate flush (default: 50). */
  maxBatchSize?: number;
  /** Called when an internal bridge error occurs (e.g. callNative timeout). */
  onError?: (error: Error) => void;
}

/** A queued outgoing message waiting to be flushed to the native side. */
interface QueuedMessage {
  type: string;
  payload: unknown;
}

/** Pending promise callbacks for a callNative invocation. */
interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** The public interface returned by createBridge(). */
export interface Bridge {
  // Message passing
  sendMessage(type: string, payload: unknown): void;
  onMessage(handler: MessageHandler): () => void;
  flushMessages(): void;

  // Native module system
  callNative(module: string, method: string, args: unknown[]): Promise<unknown>;
  registerModule(module: NativeModule): void;
  getModule(name: string): NativeModule | undefined;

  // Event emitter
  emit(event: string, data?: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;

  // Lifecycle
  destroy(): void;

  // Internal — used by tests to simulate native → JS messages
  _receiveMessage(type: string, payload: unknown): void;
  // Internal — used by tests to resolve/reject callNative promises
  _resolveCall(callId: string, result: unknown): void;
  _rejectCall(callId: string, reason: unknown): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _callIdCounter = 0;

function generateCallId(): string {
  return `call_${Date.now()}_${++_callIdCounter}`;
}

// ---------------------------------------------------------------------------
// createBridge
// ---------------------------------------------------------------------------

/**
 * Create a new bridge instance.
 *
 * @param config - Optional configuration overrides.
 */
export function createBridge(config: BridgeConfig = {}): Bridge {
  const batchInterval = config.batchInterval ?? 16;
  const maxBatchSize = config.maxBatchSize ?? 50;
  const onError = config.onError ?? ((err: Error) => console.error("[Bridge]", err));

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------

  /** Outgoing message queue (JS → native). */
  const _messageQueue: QueuedMessage[] = [];

  /** Registered native → JS message handlers. */
  const _messageHandlers: Set<MessageHandler> = new Set();

  /** Pending callNative promises keyed by callId. */
  const _pendingCalls = new Map<string, PendingCall>();

  /** Registered native modules. */
  const _modules = new Map<string, NativeModule>();

  /** Event listener map. */
  const _eventListeners = new Map<string, Set<(data: unknown) => void>>();

  /** Batch flush interval timer. */
  let _batchTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether destroy() has been called. */
  let _destroyed = false;

  // -------------------------------------------------------------------------
  // Batch processing
  // -------------------------------------------------------------------------

  function _startBatchTimer(): void {
    if (_batchTimer !== null) return;
    _batchTimer = setInterval(() => {
      if (_messageQueue.length > 0) {
        _flushMessages();
      }
    }, batchInterval);
  }

  function _flushMessages(): void {
    if (_messageQueue.length === 0) return;

    // Drain the queue
    const batch = _messageQueue.splice(0, _messageQueue.length);

    // In a real Hermes/JSC bridge this would call into native code.
    // Here we dispatch to registered handlers so tests can observe the flow.
    for (const msg of batch) {
      for (const handler of _messageHandlers) {
        try {
          handler(msg.type, msg.payload);
        } catch (err) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Message passing
  // -------------------------------------------------------------------------

  function sendMessage(type: string, payload: unknown): void {
    if (_destroyed) return;

    _messageQueue.push({ type, payload });
    _startBatchTimer();

    // Auto-flush when batch is full
    if (_messageQueue.length >= maxBatchSize) {
      _flushMessages();
    }
  }

  function onMessage(handler: MessageHandler): () => void {
    _messageHandlers.add(handler);
    return () => {
      _messageHandlers.delete(handler);
    };
  }

  function flushMessages(): void {
    _flushMessages();
  }

  // -------------------------------------------------------------------------
  // Native module system
  // -------------------------------------------------------------------------

  function callNative(
    moduleName: string,
    method: string,
    args: unknown[],
    timeoutMs = 5000
  ): Promise<unknown> {
    if (_destroyed) {
      return Promise.reject(new Error("Bridge has been destroyed"));
    }

    const mod = _modules.get(moduleName);

    // If the module is registered locally, call it directly.
    if (mod) {
      const fn = mod.methods[method];
      if (typeof fn !== "function") {
        const err = new Error(`Method "${method}" not found on module "${moduleName}"`);
        onError(err);
        return Promise.reject(err);
      }
      try {
        return Promise.resolve(fn(...args));
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError(error);
        return Promise.reject(error);
      }
    }

    // Otherwise, send a message to the native side and wait for a response.
    return new Promise<unknown>((resolve, reject) => {
      const callId = generateCallId();

      const timer = setTimeout(() => {
        if (_pendingCalls.has(callId)) {
          _pendingCalls.delete(callId);
          const err = new Error(
            `callNative timeout: ${moduleName}.${method} (${timeoutMs}ms)`
          );
          onError(err);
          reject(err);
        }
      }, timeoutMs);

      _pendingCalls.set(callId, { resolve, reject, timer });

      sendMessage("callNative", { callId, module: moduleName, method, args });
    });
  }

  function registerModule(module: NativeModule): void {
    _modules.set(module.name, module);
  }

  function getModule(name: string): NativeModule | undefined {
    return _modules.get(name);
  }

  // -------------------------------------------------------------------------
  // Event emitter
  // -------------------------------------------------------------------------

  function emit(event: string, data?: unknown): void {
    const listeners = _eventListeners.get(event);
    if (!listeners) return;
    for (const handler of listeners) {
      try {
        handler(data);
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  function on(event: string, handler: (data: unknown) => void): void {
    if (!_eventListeners.has(event)) {
      _eventListeners.set(event, new Set());
    }
    _eventListeners.get(event)!.add(handler);
  }

  function off(event: string, handler: (data: unknown) => void): void {
    _eventListeners.get(event)?.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  function destroy(): void {
    if (_destroyed) return;
    _destroyed = true;

    if (_batchTimer !== null) {
      clearInterval(_batchTimer);
      _batchTimer = null;
    }

    // Reject all pending calls
    for (const [callId, pending] of _pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Bridge destroyed"));
      _pendingCalls.delete(callId);
    }

    _messageQueue.length = 0;
    _messageHandlers.clear();
    _modules.clear();
    _eventListeners.clear();
  }

  // -------------------------------------------------------------------------
  // Internal test helpers
  // -------------------------------------------------------------------------

  /**
   * Simulate a native → JS message delivery.
   * Useful in tests to verify onMessage handlers are triggered.
   */
  function _receiveMessage(type: string, payload: unknown): void {
    for (const handler of _messageHandlers) {
      try {
        handler(type, payload);
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Simulate a successful callNative response from the native side.
   */
  function _resolveCall(callId: string, result: unknown): void {
    const pending = _pendingCalls.get(callId);
    if (!pending) return;
    clearTimeout(pending.timer);
    _pendingCalls.delete(callId);
    pending.resolve(result);
  }

  /**
   * Simulate a failed callNative response from the native side.
   */
  function _rejectCall(callId: string, reason: unknown): void {
    const pending = _pendingCalls.get(callId);
    if (!pending) return;
    clearTimeout(pending.timer);
    _pendingCalls.delete(callId);
    pending.reject(reason);
  }

  // -------------------------------------------------------------------------
  // Kick off the batch timer
  // -------------------------------------------------------------------------
  _startBatchTimer();

  return {
    sendMessage,
    onMessage,
    flushMessages,
    callNative,
    registerModule,
    getModule,
    emit,
    on,
    off,
    destroy,
    _receiveMessage,
    _resolveCall,
    _rejectCall,
  };
}
