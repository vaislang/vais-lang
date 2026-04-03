/**
 * Core type definitions for @vaisx/ai.
 *
 * Defines the fundamental shapes for chat messages, state, options,
 * completions, streaming, and AI provider abstraction.
 */

// ─── Chat ─────────────────────────────────────────────────────────────────────

/**
 * A single message in a chat conversation.
 */
export interface ChatMessage {
  /** Role of the message author. */
  role: "user" | "assistant" | "system";
  /** Text content of the message. */
  content: string;
  /** Optional stable identifier (auto-generated if omitted). */
  id?: string;
}

/**
 * Options passed to useChat().
 */
export interface ChatOptions {
  /** Endpoint URL that the chat hook will POST to. */
  api: string;
  /** Model identifier forwarded to the API. */
  model?: string;
  /** System prompt prepended to every conversation. */
  system?: string;
  /** Called when the full assistant response has been received. */
  onFinish?: (message: ChatMessage) => void;
  /** Called when a network or parsing error occurs. */
  onError?: (error: Error) => void;
}

/**
 * Reactive state + actions returned by useChat().
 */
export interface ChatState {
  /** Current list of chat messages. */
  messages: ChatMessage[];
  /** Current value of the text input field. */
  input: string;
  /** True while an API request is in flight. */
  isLoading: boolean;
  /** Last error that occurred, or null. */
  error: Error | null;
  /** Append a user message and trigger the assistant response. */
  append(message: ChatMessage): Promise<void>;
  /** Regenerate the last assistant response. */
  reload(): Promise<void>;
  /** Cancel the in-flight request. */
  stop(): void;
  /** Replace the messages list entirely. */
  setMessages(messages: ChatMessage[]): void;
}

// ─── Completion ───────────────────────────────────────────────────────────────

/**
 * Options passed to useCompletion().
 */
export interface CompletionOptions {
  /** Endpoint URL that the completion hook will POST to. */
  api: string;
  /** Model identifier forwarded to the API. */
  model?: string;
  /** Default prompt to send when complete() is called without an argument. */
  prompt?: string;
  /** Called when the full completion has been received. */
  onFinish?: (completion: string) => void;
  /** Called when a network or parsing error occurs. */
  onError?: (error: Error) => void;
}

/**
 * Reactive state + actions returned by useCompletion().
 */
export interface CompletionState {
  /** Accumulated completion text (streamed token by token). */
  completion: string;
  /** True while an API request is in flight. */
  isLoading: boolean;
  /** Last error that occurred, or null. */
  error: Error | null;
  /** Trigger a completion request for the given prompt. */
  complete(prompt?: string): Promise<void>;
  /** Cancel the in-flight request. */
  stop(): void;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

/**
 * Options for low-level stream consumption.
 */
export interface StreamOptions {
  /** Called for every text token as it arrives. */
  onToken?: (token: string) => void;
  /** Called when the stream ends with the full accumulated text. */
  onFinish?: (text: string) => void;
  /** AbortSignal to cancel the stream. */
  signal?: AbortSignal;
}

// ─── Provider abstraction ─────────────────────────────────────────────────────

/**
 * An AI provider that can handle chat and completion requests.
 */
export interface AIProvider {
  /** Unique machine-readable identifier (e.g. "openai", "anthropic"). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /**
   * Send a chat conversation and return a streaming response.
   * @param messages - The full conversation so far.
   * @param options  - Stream consumption callbacks.
   */
  chat(messages: ChatMessage[], options: StreamOptions): Promise<string>;
  /**
   * Send a completion prompt and return a streaming response.
   * @param prompt  - The text prompt.
   * @param options - Stream consumption callbacks.
   */
  complete(prompt: string, options: StreamOptions): Promise<string>;
}

/**
 * Configuration object used to instantiate a provider.
 */
export interface ProviderConfig {
  /** API key for the provider. */
  apiKey: string;
  /** Override the default base URL (useful for proxies / self-hosted models). */
  baseUrl?: string;
  /** Default model to use when none is specified per-request. */
  model?: string;
}
