/**
 * @vaisx/ai — RAG utilities tests
 */

import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  createEmbedding,
  embedMany,
  createVectorStore,
  createDocumentSplitter,
  createRAGPipeline,
} from "../rag.js";
import type {
  EmbeddingProvider,
  RAGDocument,
} from "../rag.js";

// ─── Mock embedding provider ──────────────────────────────────────────────────

/**
 * A deterministic mock provider that converts each character to its
 * char-code and pads/truncates to a fixed dimension.
 */
function makeMockProvider(dim = 4): EmbeddingProvider {
  return {
    embed(text: string): number[] {
      const vec = new Array<number>(dim).fill(0);
      for (let i = 0; i < Math.min(text.length, dim); i++) {
        vec[i] = text.charCodeAt(i) / 128;
      }
      return vec;
    },
  };
}

/** A provider that also exposes embedMany to test the batch path. */
function makeBatchProvider(dim = 4): EmbeddingProvider {
  const base = makeMockProvider(dim);
  return {
    embed: base.embed,
    embedMany(texts: string[]): number[][] {
      return texts.map((t) => base.embed(t));
    },
  };
}

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 when the first vector is zero", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("returns 0 when the second vector is zero", () => {
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
  });

  it("throws when vectors have different lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });

  it("handles negative component values", () => {
    const score = cosineSimilarity([-1, -1], [-1, -1]);
    expect(score).toBeCloseTo(1);
  });
});

// ─── createEmbedding ──────────────────────────────────────────────────────────

describe("createEmbedding", () => {
  it("delegates to provider.embed", () => {
    const provider = makeMockProvider(4);
    const result = createEmbedding("hi", provider);
    expect(result).toEqual(provider.embed("hi"));
  });

  it("returns a numeric array", () => {
    const result = createEmbedding("hello", makeMockProvider(4));
    expect(Array.isArray(result)).toBe(true);
    result.forEach((v) => expect(typeof v).toBe("number"));
  });
});

// ─── embedMany ────────────────────────────────────────────────────────────────

describe("embedMany", () => {
  it("returns one vector per input text", () => {
    const texts = ["foo", "bar", "baz"];
    const result = embedMany(texts, makeMockProvider(4));
    expect(result).toHaveLength(3);
  });

  it("uses provider.embedMany when available", () => {
    const provider = makeBatchProvider(4);
    const texts = ["a", "b"];
    const result = embedMany(texts, provider);
    expect(result).toHaveLength(2);
  });

  it("falls back to individual embed when embedMany is absent", () => {
    const provider = makeMockProvider(4);
    const texts = ["x", "y"];
    const result = embedMany(texts, provider);
    expect(result[0]).toEqual(provider.embed("x"));
    expect(result[1]).toEqual(provider.embed("y"));
  });
});

// ─── createVectorStore ────────────────────────────────────────────────────────

describe("createVectorStore — basic operations", () => {
  it("starts empty", () => {
    const store = createVectorStore();
    expect(store.size).toBe(0);
  });

  it("size increases after add()", () => {
    const store = createVectorStore();
    store.add("a", [1, 0]);
    expect(store.size).toBe(1);
  });

  it("size decreases after remove()", () => {
    const store = createVectorStore();
    store.add("a", [1, 0]);
    store.remove("a");
    expect(store.size).toBe(0);
  });

  it("remove() returns true when entry existed", () => {
    const store = createVectorStore();
    store.add("x", [1, 0]);
    expect(store.remove("x")).toBe(true);
  });

  it("remove() returns false when entry did not exist", () => {
    const store = createVectorStore();
    expect(store.remove("missing")).toBe(false);
  });

  it("clear() empties the store", () => {
    const store = createVectorStore();
    store.add("a", [1, 0]);
    store.add("b", [0, 1]);
    store.clear();
    expect(store.size).toBe(0);
  });
});

describe("createVectorStore — search", () => {
  it("returns results sorted by descending cosine similarity", () => {
    const store = createVectorStore();
    store.add("east", [1, 0]);
    store.add("north", [0, 1]);
    store.add("northeast", [0.707, 0.707]);

    // Query pointing mostly east
    const results = store.search([1, 0.1], 3);
    expect(results[0]!.id).toBe("east");
  });

  it("respects topK parameter", () => {
    const store = createVectorStore();
    store.add("a", [1, 0]);
    store.add("b", [0, 1]);
    store.add("c", [1, 1]);
    const results = store.search([1, 0], 2);
    expect(results).toHaveLength(2);
  });

  it("returns metadata attached to matching entries", () => {
    const store = createVectorStore<{ label: string }>();
    store.add("v1", [1, 0], { label: "first" });
    const [top] = store.search([1, 0], 1);
    expect(top!.metadata?.label).toBe("first");
  });

  it("uses defaultTopK from options when topK is omitted", () => {
    const store = createVectorStore({ defaultTopK: 2 });
    for (let i = 0; i < 5; i++) {
      store.add(`item-${i}`, [i, 0]);
    }
    const results = store.search([1, 0]);
    expect(results).toHaveLength(2);
  });

  it("returns all entries if store has fewer than topK", () => {
    const store = createVectorStore();
    store.add("only", [1, 0]);
    const results = store.search([1, 0], 10);
    expect(results).toHaveLength(1);
  });
});

// ─── createDocumentSplitter ───────────────────────────────────────────────────

describe("createDocumentSplitter", () => {
  it("returns the full text as one chunk when text is shorter than chunkSize", () => {
    const splitter = createDocumentSplitter({ chunkSize: 100 });
    const chunks = splitter.split("hello world");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("hello world");
  });

  it("returns an empty array for empty input", () => {
    const splitter = createDocumentSplitter();
    expect(splitter.split("")).toEqual([]);
  });

  it("splits a long text into multiple chunks", () => {
    const text = "a".repeat(2500);
    const splitter = createDocumentSplitter({ chunkSize: 1000, overlap: 0 });
    const chunks = splitter.split(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("each chunk does not exceed chunkSize", () => {
    const text = "x".repeat(3000);
    const splitter = createDocumentSplitter({ chunkSize: 500, overlap: 50 });
    for (const chunk of splitter.split(text)) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it("consecutive chunks overlap by the specified amount", () => {
    const text = "a".repeat(300);
    const splitter = createDocumentSplitter({ chunkSize: 200, overlap: 100 });
    const chunks = splitter.split(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The tail of chunk[0] should equal the head of chunk[1] for length=overlap
    const tail = chunks[0]!.slice(-100);
    const head = chunks[1]!.slice(0, 100);
    expect(tail).toBe(head);
  });

  it("uses default chunkSize=1000 and overlap=200", () => {
    const text = "z".repeat(1500);
    const splitter = createDocumentSplitter();
    const chunks = splitter.split(text);
    // With default 1000/200: chunk0 = 0-1000, chunk1 = 800-1500
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.length).toBe(1000);
  });

  it("splits on separator when provided", () => {
    const text = "alpha\nbeta\ngamma";
    const splitter = createDocumentSplitter({ chunkSize: 1000, separator: "\n" });
    const chunks = splitter.split(text);
    // All fits in one chunk (reassembled)
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("alpha");
    expect(chunks[0]).toContain("beta");
  });
});

// ─── createRAGPipeline ────────────────────────────────────────────────────────

describe("createRAGPipeline", () => {
  function makeDocs(): RAGDocument[] {
    return [
      { id: "doc1", content: "The quick brown fox jumps over the lazy dog." },
      { id: "doc2", content: "Machine learning is a subset of artificial intelligence." },
      { id: "doc3", content: "TypeScript is a typed superset of JavaScript." },
    ];
  }

  it("query returns a RAGResult with documents, scores, and context", () => {
    const pipeline = createRAGPipeline({ provider: makeMockProvider(8) });
    pipeline.ingest(makeDocs());
    const result = pipeline.query("fox dog", 2);
    expect(result).toHaveProperty("documents");
    expect(result).toHaveProperty("scores");
    expect(result).toHaveProperty("context");
  });

  it("scores array length matches documents array length", () => {
    const pipeline = createRAGPipeline({ provider: makeMockProvider(8) });
    pipeline.ingest(makeDocs());
    const result = pipeline.query("TypeScript", 2);
    expect(result.scores).toHaveLength(result.documents.length);
  });

  it("context is a non-empty string after ingestion", () => {
    const pipeline = createRAGPipeline({ provider: makeMockProvider(8) });
    pipeline.ingest(makeDocs());
    const { context } = pipeline.query("question", 3);
    expect(typeof context).toBe("string");
    expect(context.length).toBeGreaterThan(0);
  });

  it("returns topK results", () => {
    const pipeline = createRAGPipeline({ provider: makeMockProvider(8) });
    pipeline.ingest(makeDocs());
    const result = pipeline.query("test", 2);
    expect(result.documents.length).toBeLessThanOrEqual(2);
  });

  it("each document in results has an id and content", () => {
    const pipeline = createRAGPipeline({ provider: makeMockProvider(8) });
    pipeline.ingest(makeDocs());
    const { documents } = pipeline.query("fox");
    for (const doc of documents) {
      expect(typeof doc.id).toBe("string");
      expect(typeof doc.content).toBe("string");
    }
  });

  it("ingesting no documents yields empty results", () => {
    const pipeline = createRAGPipeline({ provider: makeMockProvider(4) });
    pipeline.ingest([]);
    const result = pipeline.query("anything");
    expect(result.documents).toHaveLength(0);
    expect(result.scores).toHaveLength(0);
    expect(result.context).toBe("");
  });

  it("uses defaultTopK from options when topK is omitted", () => {
    const pipeline = createRAGPipeline({ provider: makeMockProvider(8), defaultTopK: 2 });
    pipeline.ingest(makeDocs());
    const result = pipeline.query("test");
    expect(result.documents.length).toBeLessThanOrEqual(2);
  });
});
