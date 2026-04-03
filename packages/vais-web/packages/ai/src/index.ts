/**
 * @vaisx/ai — Public API
 *
 * Re-exports all public APIs from the AI package.
 */

// Chat hook
export { useChat } from "./chat.js";

// Completion hook
export { useCompletion } from "./completion.js";

// Stream utilities
export {
  parseSSEStream,
  readableStreamToAsyncIterable,
  consumeTextStream,
} from "./stream.js";

// Type definitions
export type {
  // Chat
  ChatMessage,
  ChatOptions,
  ChatState,
  // Completion
  CompletionOptions,
  CompletionState,
  // Streaming
  StreamOptions,
  // Provider
  AIProvider,
  ProviderConfig,
} from "./types.js";

// SSE event type
export type { SSEEvent } from "./stream.js";

// Providers
export { createOpenAIProvider, createAnthropicProvider, createOllamaProvider } from "./providers/index.js";

// Streaming UI utilities
export {
  createStreamingText,
  createTokenBuffer,
  createTypingEffect,
  createWebSocketStream,
  createStreamRenderer,
} from "./streaming-ui.js";

export type {
  StreamingTextOptions,
  StreamingTextState,
  StreamingTextInstance,
  TokenBufferOptions,
  TokenBufferInstance,
  TypingEffectOptions,
  TypingEffectInstance,
  WebSocketStreamOptions,
  WebSocketConnectionState,
  WebSocketStreamInstance,
  StreamRendererOptions,
  StreamRenderer,
} from "./streaming-ui.js";

// Component generator
export {
  createComponentGenerator,
  buildPrompt,
  parseGeneratedCode,
  validateGeneratedCode,
  COMPONENT_TEMPLATES,
} from "./generate.js";

export type {
  GenerateOptions,
  GenerateResult,
  ParsedCodeBlock,
  ValidationResult,
  ComponentGenerator,
  ComponentTemplate,
  TemplateId,
} from "./generate.js";

// RAG utilities
export {
  createEmbedding,
  embedMany,
  cosineSimilarity,
  createVectorStore,
  createDocumentSplitter,
  createRAGPipeline,
} from "./rag.js";

export type {
  EmbeddingProvider,
  VectorEntry,
  SearchResult,
  VectorStoreOptions,
  VectorStore,
  SplitOptions,
  DocumentSplitter,
  RAGDocument,
  RAGResult,
  RAGPipelineOptions,
  RAGPipeline,
} from "./rag.js";

// Error diagnosis utilities
export {
  buildDiagnosticPrompt,
  parseDiagnosticResponse,
  matchOfflinePattern,
  createErrorDiagnoser,
  createErrorHandler,
  CommonErrors,
} from "./diagnose.js";

export type {
  ErrorContext,
  DiagnosisResult,
  DiagnosisEntry,
  ErrorDiagnoser,
  ErrorHandler,
} from "./diagnose.js";
