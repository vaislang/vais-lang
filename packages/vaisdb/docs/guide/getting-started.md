# VaisDB Getting Started Guide

## Overview

VaisDB is a RAG-native hybrid database that combines four search engines in a single ACID-transactional system:
- **Vector** (HNSW) -- Approximate nearest neighbor search
- **Graph** (Property Graph) -- Multi-hop traversal, shortest path, cycle detection
- **Relational** (SQL) -- Full SQL with joins, aggregations, window functions
- **Full-Text** (BM25) -- Boolean/phrase search with inverted index

## Installation

```bash
# Build from source (requires Vais v1.0.0+)
git clone https://github.com/vaislang/vaisdb.git
cd vaisdb
vaisc build
```

## Quick Start

### Server Mode (default)

```bash
# Start server on default port 5433
./vaisdb

# Start with custom port and data directory
./vaisdb --port 5434 --data-dir /path/to/data
```

### Embedded Mode

```bash
./vaisdb --embedded --data-dir ./mydb.vaisdb
```

## Connecting

VaisDB uses a PostgreSQL-compatible wire protocol (on port 5433):

```bash
# Using psql
psql -h localhost -p 5433 -U admin -d vaisdb
```

## SQL Reference

### Data Definition (DDL)

```sql
-- Create table
CREATE TABLE documents (
    id INTEGER PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    embedding VECTOR(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_title ON documents(title);
CREATE HNSW INDEX idx_embedding ON documents(embedding)
    WITH (m=16, ef_construction=200, metric='cosine');
CREATE FULLTEXT INDEX idx_content ON documents(content);

-- Alter table
ALTER TABLE documents ADD COLUMN category VARCHAR(64);
ALTER TABLE documents DROP COLUMN category;

-- Drop
DROP TABLE documents;
DROP INDEX idx_embedding;
```

### Data Manipulation (DML)

```sql
-- Insert
INSERT INTO documents (id, title, content, embedding)
VALUES (1, 'VaisDB', 'A hybrid database', [0.1, 0.2, ...]);

-- Update
UPDATE documents SET title = 'VaisDB v2' WHERE id = 1;

-- Delete
DELETE FROM documents WHERE id = 1;
```

### Queries (SELECT)

```sql
-- Basic query
SELECT id, title FROM documents WHERE id > 10 ORDER BY title LIMIT 20;

-- Aggregation
SELECT category, COUNT(*), AVG(score) FROM documents
GROUP BY category HAVING COUNT(*) > 5;

-- Window functions
SELECT id, title,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY score DESC) as rank
FROM documents;

-- Joins
SELECT d.title, c.name
FROM documents d
JOIN categories c ON d.category_id = c.id
WHERE c.active = true;

-- Subqueries
SELECT * FROM documents
WHERE id IN (SELECT doc_id FROM favorites WHERE user_id = 42);
```

### Transaction Control

```sql
BEGIN;
INSERT INTO documents (id, title) VALUES (1, 'test');
COMMIT;

-- Or rollback
BEGIN;
DELETE FROM documents WHERE id = 1;
ROLLBACK;
```

### Prepared Statements

```sql
PREPARE find_doc AS SELECT * FROM documents WHERE id = $1;
EXECUTE find_doc(42);
DEALLOCATE find_doc;
```

## Vector Search

```sql
-- k-NN search (top 10 nearest neighbors)
SELECT id, title, distance
FROM VECTOR_SEARCH(documents, embedding, [0.1, 0.2, ...], 10);

-- Filtered vector search
SELECT id, title, distance
FROM VECTOR_SEARCH(documents, embedding, [0.1, 0.2, ...], 10)
WHERE category = 'science';
```

## Graph Queries

```sql
-- Create graph nodes and edges
INSERT INTO graph_nodes (id, label, properties)
VALUES (1, 'Person', '{"name": "Alice"}');

-- BFS traversal
SELECT * FROM GRAPH_TRAVERSE(
    start_node := 1,
    max_depth := 3,
    direction := 'outgoing'
);

-- Shortest path
SELECT * FROM GRAPH_SHORTEST_PATH(
    start_node := 1,
    end_node := 42
);
```

## Full-Text Search

```sql
-- BM25 search
SELECT doc_id, score
FROM FULLTEXT_MATCH(documents, content, 'hybrid database', 10);

-- Boolean query
SELECT doc_id, score
FROM FULLTEXT_MATCH(documents, content, 'hybrid AND database NOT legacy', 10);

-- Phrase search
SELECT doc_id, score
FROM FULLTEXT_MATCH(documents, content, '"hybrid database"', 10);
```

## Hybrid Queries

```sql
-- Combine vector + full-text with score fusion
SELECT id, title, fused_score
FROM HYBRID_SEARCH(
    vector := VECTOR_SEARCH(documents, embedding, $query_vec, 20),
    fulltext := FULLTEXT_MATCH(documents, content, $query_text, 20),
    fusion := 'rrf',
    top_k := 10
);
```

## RAG Search

```sql
-- Ingest a document for RAG
CALL RAG_INGEST('documents', 1, 'sentence');

-- RAG search with context preservation
SELECT chunk_id, content, score, attribution
FROM RAG_SEARCH(
    query := 'How does VaisDB handle transactions?',
    top_k := 5,
    fusion := 'weighted_sum'
);
```

## EXPLAIN

```sql
-- Show query plan
EXPLAIN SELECT * FROM documents WHERE id = 1;

-- Show with cost breakdown
EXPLAIN VERBOSE SELECT * FROM VECTOR_SEARCH(documents, embedding, [...], 10);

-- JSON format
EXPLAIN (FORMAT JSON) SELECT * FROM documents;
```

## Configuration

```sql
-- Session-level settings
SET work_mem = '64MB';
SET statement_timeout = '30s';

-- System-level settings (persistent)
ALTER SYSTEM SET max_connections = 200;
```

## Maintenance

```sql
-- Refresh table statistics
ANALYZE documents;

-- Reclaim dead tuples
VACUUM documents;
VACUUM FULL documents;

-- Rebuild index
REINDEX INDEX idx_embedding;
REINDEX TABLE documents;
```
