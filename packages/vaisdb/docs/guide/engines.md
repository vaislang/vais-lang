# VaisDB Engine Reference

## Architecture Overview

VaisDB integrates four search engines that share a single storage layer:

```
                  +------------------+
                  | Hybrid Planner   |
                  | (Cost-Based)     |
                  +--------+---------+
                           |
          +--------+-------+-------+--------+
          |        |               |        |
     +----+---+ +--+----+ +-------+--+ +---+----+
     | Vector | | Graph | | SQL      | | Full   |
     | Engine | | Engine| | Engine   | | Text   |
     +----+---+ +--+----+ +----+----+ +---+----+
          |        |            |          |
          +--------+-----+-----+----------+
                         |
                  +------+------+
                  | Storage     |
                  | (Pages,WAL, |
                  |  Buffer,Txn)|
                  +-------------+
```

All engines share:
- **Buffer Pool** -- Unified page cache with CLOCK eviction
- **WAL** -- Write-ahead log with engine-tagged records (crash recovery)
- **MVCC** -- Snapshot isolation across all engines
- **Transactions** -- ACID transactions spanning all engine types

---

## Vector Engine (HNSW)

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `m` | 16 | Max connections per node per layer |
| `m_max_0` | 32 | Max connections for layer 0 |
| `ef_construction` | 200 | Build-time candidate list size |
| `ef_search` | 50 | Search-time candidate list size |
| `metric` | cosine | Distance metric: cosine, l2, dot_product |

### Features

- **MVCC-filtered search** -- Searches only see vectors visible to the current snapshot
- **Filtered search** -- Pre/post/hybrid filter strategy based on selectivity
- **Bulk loading** -- Efficient batch construction with optional WAL bypass
- **Quantization** -- Adaptive strategy selection:
  - None (< 10K vectors): Full f32 precision
  - Scalar (< 1M vectors): 4x compression, < 1% recall loss
  - Product Quantization (>= 1M vectors): 64x compression
- **Copy-on-write neighbors** -- Epoch-based reclamation for concurrent read/write
- **Layer pinning** -- Upper layers (1+) pinned in memory for fast traversal

### SQL Interface

```sql
-- Create HNSW index
CREATE HNSW INDEX idx ON table(column)
    WITH (m=16, ef_construction=200, metric='cosine');

-- k-NN search
SELECT * FROM VECTOR_SEARCH(table, column, query_vector, k);

-- Filtered search
SELECT * FROM VECTOR_SEARCH(table, column, query_vector, k)
    WHERE condition;
```

---

## Graph Engine (Property Graph)

### Data Model

- **Nodes** -- Labeled entities with properties (key-value pairs)
- **Edges** -- Typed, directed connections between nodes with properties
- **Labels** -- String tags for categorizing nodes (multiple per node)
- **Properties** -- Typed key-value pairs (String, Integer, Float, Boolean)

### Storage

- **Node pages** -- Slotted page format (56B per GraphNode)
- **Adjacency pages** -- Page-chained adjacency lists (42B per AdjEntry)
- **Property pages** -- Separate property storage for edge properties
- **Label index** -- B+Tree (composite key: label_id + node_id)
- **Property index** -- B+Tree (composite key: prop_key_id + value + entity_id)

### Traversal Algorithms

| Algorithm | Description | Use Case |
|-----------|-------------|----------|
| BFS | Breadth-first search with depth limit | Shortest hop count, level-order |
| DFS | Depth-first search with depth limit | Path exploration, tree traversal |
| Dijkstra | Weighted shortest path | Minimum cost path |
| Cycle Detection | 3-color DFS cycle detection | DAG validation |

### Concurrency

- Hash-striped lock manager (256 hash slots by default)
- Deadlock prevention via node ID ordering (lower ID locked first)
- MVCC visibility for both nodes and edges

### SQL Interface

```sql
-- Traverse from node
SELECT * FROM GRAPH_TRAVERSE(
    start_node := node_id,
    max_depth := 3,
    direction := 'outgoing',  -- 'outgoing', 'incoming', 'both'
    edge_type := 'KNOWS'      -- optional filter
);

-- Shortest path
SELECT * FROM GRAPH_SHORTEST_PATH(
    start_node := src_id,
    end_node := dst_id
);

-- Pattern matching (Cypher-like)
SELECT * FROM GRAPH_MATCH(
    pattern := '(a:Person)-[:KNOWS]->(b:Person)-[:WORKS_AT]->(c:Company)'
);
```

---

## Full-Text Engine (BM25)

### Tokenizer

- Unicode-aware case folding
- 174 English stop words
- Position tracking (for phrase search)
- Configurable via FullTextConfig

### Scoring

BM25 formula with configurable parameters:
- `k1` = 1.2 (term frequency saturation)
- `b` = 0.75 (document length normalization)
- IDF: `log((N - df + 0.5) / (df + 0.5) + 1.0)`

### Search Modes

| Mode | Description | Syntax |
|------|-------------|--------|
| BM25 | Single/multi-term search | `hybrid database` |
| Phrase | Position-based exact match | `"hybrid database"` |
| Boolean | AND/OR/NOT operators | `hybrid AND database NOT legacy` |

### Index Structure

- **Dictionary** -- B+Tree mapping term_hash to posting list head page
- **Posting lists** -- Slotted pages with page chaining
- **Compression** -- VByte encoding, delta encoding for doc_id lists
- **Deletion bitmap** -- 1 bit per doc_id for fast delete checks

### Maintenance

- **Compaction** -- Merges posting list pages, removes expired entries
- **I/O throttling** -- Configurable pages-per-second limit during compaction

### SQL Interface

```sql
-- Create full-text index
CREATE FULLTEXT INDEX idx ON table(column);

-- BM25 search
SELECT * FROM FULLTEXT_MATCH(table, column, 'query text', top_k);

-- Boolean search
SELECT * FROM FULLTEXT_MATCH(table, column, 'term1 AND term2 OR term3', top_k);

-- Phrase search
SELECT * FROM FULLTEXT_MATCH(table, column, '"exact phrase"', top_k);
```

---

## RAG Engine

### Document Processing Pipeline

1. **Ingestion** -- Document text input
2. **Chunking** -- Semantic splitting (Fixed/Sentence/Paragraph strategies)
3. **Embedding** -- Vector representation (pluggable embedding models)
4. **Hierarchy** -- Document > Section > Paragraph > Chunk tree
5. **Graph edges** -- NEXT_CHUNK, SAME_SECTION, SAME_DOCUMENT, CONTAINS, REFERENCES

### Chunking Strategies

| Strategy | Description | Best For |
|----------|-------------|----------|
| Fixed | Fixed character/token windows with overlap | Generic text |
| Sentence | Sentence boundary detection | Articles, papers |
| Paragraph | Paragraph boundary detection | Structured documents |

### Context Preservation

- **Context window** -- Expands chunk results to include surrounding context
- **Cross-references** -- Tracks inter-chunk references
- **Versioning** -- Tracks chunk versions across document updates

### Agent Memory

Four memory types for AI agent systems:
- **Episodic** -- Event-based memories with temporal ordering
- **Semantic** -- Factual knowledge, concept associations
- **Procedural** -- How-to instructions, workflows
- **Working** -- Short-term session context (auto-consolidated)

Memory features:
- Importance scoring with exponential decay
- Session-scoped memory isolation
- Hybrid retrieval (vector + graph + recency fusion)
- Lifecycle management (consolidation, eviction, archival)

### SQL Interface

```sql
-- Ingest document
CALL RAG_INGEST(table_name, doc_id, chunk_strategy);

-- RAG search
SELECT * FROM RAG_SEARCH(
    query := 'search text',
    top_k := 10,
    fusion := 'weighted_sum'  -- or 'rrf'
);

-- Store memory
CALL MEMORY_STORE(session_id, content, memory_type, importance);

-- Search memory
SELECT * FROM MEMORY_SEARCH(
    session_id := $1,
    query := 'search text',
    top_k := 5
);
```

---

## Hybrid Query Planner

### Cost Model

The planner estimates costs per engine:
- **Vector (HNSW)**: O(log N * ef_search) page reads
- **Graph (BFS/DFS)**: O(V + E) per traversal depth
- **SQL (B+Tree)**: O(log N) for index scan, O(N) for full scan
- **Full-Text (BM25)**: O(terms * avg_posting_length)

### Optimization Passes

1. **Predicate pushdown** -- Push WHERE conditions into engine scans
2. **Fusion selection** -- Choose WeightedSum or RRF based on result count
3. **Join reorder** -- Cost-based join ordering
4. **Cost recalculation** -- Final cost estimation after optimizations

### Score Fusion Methods

| Method | Formula | Best For |
|--------|---------|----------|
| WeightedSum | `w1*score1 + w2*score2` | Known score distributions |
| RRF (k=60) | `1/(k + rank1) + 1/(k + rank2)` | Unknown distributions, rank-based |

### Plan Cache

- LRU eviction with FNV-1a query fingerprinting
- DDL invalidation (table changes invalidate related plans)
- Prepared statement linking
