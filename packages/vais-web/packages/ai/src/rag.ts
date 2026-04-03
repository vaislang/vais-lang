/**
 * RAG (Retrieval-Augmented Generation) utilities for @vaisx/ai.
 *
 * Provides embedding abstraction, in-memory vector store, document chunking,
 * and a full RAG pipeline helper.
 */

// ─── Embedding ────────────────────────────────────────────────────────────────

/**
 * An embedding provider that converts text into a numeric vector.
 */
export interface EmbeddingProvider {
  /** Embed a single text string into a number array. */
  embed(text: string): number[];
  /** Embed multiple texts at once. */
  embedMany?(texts: string[]): number[][];
}

/**
 * Create an embedding for a single text using the given provider.
 *
 * @param text     - The text to embed.
 * @param provider - The embedding provider to use.
 * @returns        A numeric vector representing the text.
 */
export function createEmbedding(text: string, provider: EmbeddingProvider): number[] {
  return provider.embed(text);
}

/**
 * Create embeddings for multiple texts using the given provider.
 * Falls back to calling `embed()` individually if `embedMany` is not defined.
 *
 * @param texts    - The texts to embed.
 * @param provider - The embedding provider to use.
 * @returns        An array of numeric vectors, one per input text.
 */
export function embedMany(texts: string[], provider: EmbeddingProvider): number[][] {
  if (provider.embedMany) {
    return provider.embedMany(texts);
  }
  return texts.map((t) => provider.embed(t));
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

/**
 * Compute the cosine similarity between two vectors.
 *
 * Returns a value in [-1, 1] where 1 means identical direction,
 * 0 means orthogonal, and -1 means opposite direction.
 * Returns 0 when either vector has zero magnitude.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns   Cosine similarity score.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: a.length=${a.length}, b.length=${b.length}`,
    );
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ─── Vector Store ─────────────────────────────────────────────────────────────

/**
 * A single entry stored in the vector store.
 */
export interface VectorEntry<TMeta = Record<string, unknown>> {
  id: string;
  vector: number[];
  metadata?: TMeta;
}

/**
 * A search result returned by the vector store.
 */
export interface SearchResult<TMeta = Record<string, unknown>> {
  id: string;
  score: number;
  metadata?: TMeta;
}

/**
 * Options for creating a vector store.
 */
export interface VectorStoreOptions {
  /** Default number of top results to return from `search`. Defaults to 5. */
  defaultTopK?: number;
}

/**
 * An in-memory vector store backed by cosine similarity search.
 */
export interface VectorStore<TMeta = Record<string, unknown>> {
  /** Add a vector (with optional metadata) under the given id. */
  add(id: string, vector: number[], metadata?: TMeta): void;
  /** Search for the `topK` most similar vectors to `query`. */
  search(query: number[], topK?: number): SearchResult<TMeta>[];
  /** Remove the entry with the given id. Returns true if it existed. */
  remove(id: string): boolean;
  /** Remove all entries. */
  clear(): void;
  /** Number of entries currently stored. */
  readonly size: number;
}

/**
 * Create a new in-memory vector store.
 *
 * @param options - Optional configuration.
 * @returns         A `VectorStore` instance.
 */
export function createVectorStore<TMeta = Record<string, unknown>>(
  options?: VectorStoreOptions,
): VectorStore<TMeta> {
  const { defaultTopK = 5 } = options ?? {};
  const entries = new Map<string, VectorEntry<TMeta>>();

  return {
    add(id: string, vector: number[], metadata?: TMeta): void {
      entries.set(id, { id, vector, metadata });
    },

    search(query: number[], topK?: number): SearchResult<TMeta>[] {
      const k = topK ?? defaultTopK;
      const results: SearchResult<TMeta>[] = [];

      for (const entry of entries.values()) {
        const score = cosineSimilarity(query, entry.vector);
        results.push({ id: entry.id, score, metadata: entry.metadata });
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, k);
    },

    remove(id: string): boolean {
      return entries.delete(id);
    },

    clear(): void {
      entries.clear();
    },

    get size(): number {
      return entries.size;
    },
  };
}

// ─── Document Splitter ────────────────────────────────────────────────────────

/**
 * Options for the document splitter.
 */
export interface SplitOptions {
  /** Target size of each chunk in characters. Defaults to 1000. */
  chunkSize?: number;
  /** Number of characters to overlap between consecutive chunks. Defaults to 200. */
  overlap?: number;
  /** Custom separator to split on before applying chunk size. */
  separator?: string;
}

/**
 * A document splitter that chunks text into overlapping segments.
 */
export interface DocumentSplitter {
  /** Split `text` into an array of overlapping chunks. */
  split(text: string): string[];
}

/**
 * Create a document splitter with the given options.
 *
 * @param options - Chunking options.
 * @returns         A `DocumentSplitter` instance.
 */
export function createDocumentSplitter(options?: SplitOptions): DocumentSplitter {
  const { chunkSize = 1000, overlap = 200, separator } = options ?? {};

  return {
    split(text: string): string[] {
      if (!text) return [];

      // If a separator is provided, split on it first then re-join into chunks.
      let segments: string[];
      if (separator) {
        segments = text.split(separator).filter((s) => s.length > 0);
      } else {
        // Treat the whole text as one segment.
        segments = [text];
      }

      // Re-assemble segments into chunks respecting chunkSize and overlap.
      const chunks: string[] = [];

      // Flatten into a single string and then apply sliding window.
      const joined = segments.join(separator ?? " ");

      if (joined.length <= chunkSize) {
        return [joined];
      }

      let start = 0;
      while (start < joined.length) {
        const end = Math.min(start + chunkSize, joined.length);
        chunks.push(joined.slice(start, end));
        if (end === joined.length) break;
        start += chunkSize - overlap;
        if (start >= joined.length) break;
      }

      return chunks;
    },
  };
}

// ─── RAG Pipeline ─────────────────────────────────────────────────────────────

/**
 * A document to ingest into the RAG pipeline.
 */
export interface RAGDocument {
  /** Unique identifier for this document. */
  id: string;
  /** The full text content of the document. */
  content: string;
  /** Optional metadata to attach to each chunk. */
  metadata?: Record<string, unknown>;
}

/**
 * The result of a RAG query.
 */
export interface RAGResult {
  /** The matched document chunks (as metadata entries from the vector store). */
  documents: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>;
  /** Similarity scores for each matched document chunk. */
  scores: number[];
  /** The retrieved chunks joined into a single context string. */
  context: string;
}

/**
 * Options for creating a RAG pipeline.
 */
export interface RAGPipelineOptions {
  /** The embedding provider to use. */
  provider: EmbeddingProvider;
  /** Splitter options for chunking documents during ingestion. */
  splitOptions?: SplitOptions;
  /** Default number of top results to retrieve. Defaults to 5. */
  defaultTopK?: number;
}

/**
 * A full RAG pipeline that ingests documents and answers queries.
 */
export interface RAGPipeline {
  /** Embed and store all chunks from the given documents. */
  ingest(documents: RAGDocument[]): void;
  /** Retrieve the most relevant document chunks for a question. */
  query(question: string, topK?: number): RAGResult;
}

/**
 * Create a RAG pipeline.
 *
 * @param options - Pipeline configuration including the embedding provider.
 * @returns         A `RAGPipeline` instance.
 */
export function createRAGPipeline(options: RAGPipelineOptions): RAGPipeline {
  const { provider, splitOptions, defaultTopK = 5 } = options;

  const splitter = createDocumentSplitter(splitOptions);
  const store = createVectorStore<{ content: string; docId: string; metadata?: Record<string, unknown> }>(
    { defaultTopK },
  );

  // Track chunk content by chunk id for reconstruction.
  const chunkContentMap = new Map<string, string>();

  return {
    ingest(documents: RAGDocument[]): void {
      for (const doc of documents) {
        const chunks = splitter.split(doc.content);
        for (let i = 0; i < chunks.length; i++) {
          const chunkId = `${doc.id}::chunk::${i}`;
          const chunkText = chunks[i]!;
          const vector = provider.embed(chunkText);
          store.add(chunkId, vector, {
            content: chunkText,
            docId: doc.id,
            metadata: doc.metadata,
          });
          chunkContentMap.set(chunkId, chunkText);
        }
      }
    },

    query(question: string, topK?: number): RAGResult {
      const queryVector = provider.embed(question);
      const results = store.search(queryVector, topK ?? defaultTopK);

      const documents = results.map((r) => ({
        id: r.id,
        content: r.metadata?.content ?? chunkContentMap.get(r.id) ?? "",
        metadata: r.metadata?.metadata,
      }));

      const scores = results.map((r) => r.score);
      const context = documents.map((d) => d.content).join("\n\n");

      return { documents, scores, context };
    },
  };
}
