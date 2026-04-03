# VaisDB

**RAG-Native Hybrid Database** written in [Vais](https://github.com/vaislang/vais)

> Vector + Graph + Relational + Full-Text in a single query, a single transaction.

---

## Why VaisDB?

Building a RAG (Retrieval-Augmented Generation) system today requires **4 separate databases**:

| Need | Current Solution | Monthly Cost |
|------|-----------------|-------------|
| Vector search | Pinecone / Milvus | $200~500 |
| Graph traversal | Neo4j | $200~500 |
| Relational queries | PostgreSQL | $200~500 |
| Full-text search | Elasticsearch | $500~750 |
| **Total** | **4 DBs + sync logic** | **$1,100~2,250** |

This means 4 connections, 4 schemas, 4 consistency models, and application-level data merging.

**VaisDB replaces all of them with one database.**

```
Before:  App → Vector DB → LLM
          ├→ Graph DB  ─┘
          ├→ RDBMS    ─┘
          └→ Search   ─┘

After:   App → VaisDB → LLM
```

---

## Key Features

### Hybrid Query Engine
Run vector similarity, graph traversal, SQL joins, and full-text search in a **single query**:

```sql
SELECT d.title, d.content, v.similarity, g.relationship
FROM documents d
  VECTOR_SEARCH(d.embedding, @query_vector, top_k=10) v
  GRAPH_TRAVERSE(d.id, depth=2, edge_type='references') g
  FULLTEXT_MATCH(d.content, 'transformer attention') ft
WHERE d.created_at > '2025-01-01'
  AND v.similarity > 0.7
ORDER BY v.similarity * 0.4 + ft.score * 0.3 + g.relevance * 0.3
LIMIT 20;
```

### ACID Transactions
Vector index updates, graph mutations, and relational writes in a **single transaction** with WAL-based durability.

### RAG-Native Features
- **Semantic chunking** at the DB level -- no external chunking libraries needed
- **Context-preserving** chunk relationships stored as graph edges
- **Fact verification** -- cross-check vector results against relational data via SQL JOIN

### Built with Vais
Written in [Vais](https://github.com/vaislang/vais), an AI-optimized systems programming language with token-efficient syntax and LLVM backend for native performance.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Hybrid Query Planner            │
│     (Cost-based optimizer across engines)    │
├──────────┬──────────┬──────────┬────────────┤
│  Vector  │  Graph   │   SQL    │  Full-Text │
│  Engine  │  Engine  │  Engine  │  Engine    │
│  (HNSW)  │ (Property│ (B+Tree) │ (Inverted  │
│          │  Graph)  │          │  Index)    │
├──────────┴──────────┴──────────┴────────────┤
│           Unified Storage Engine             │
│     (Page Manager + WAL + Buffer Pool)       │
├─────────────────────────────────────────────┤
│              RAG-Native Layer                │
│  (Semantic Chunking + Context Preservation)  │
└─────────────────────────────────────────────┘
```

---

## Project Status

**Stage: Design & Foundation**

See [ROADMAP.md](ROADMAP.md) for detailed phase breakdown.

---

## Building

> Requires [Vais compiler](https://github.com/vaislang/vais) v1.0.0+

```bash
# TODO: Build instructions will be added as implementation progresses
```

---

## License

MIT

---

## Links

- [Vais Language](https://github.com/vaislang/vais)
- [ROADMAP](ROADMAP.md)
