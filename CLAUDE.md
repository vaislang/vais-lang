# CLAUDE.md - VaisDB AI Assistant Guide

## Project Overview

VaisDB is a RAG-native hybrid database written in pure Vais. It combines vector, graph, relational, and full-text search engines into a single database with unified ACID transactions.

## Language

- **Implementation**: Pure Vais (.vais files) with C FFI for system calls
- **Compiler**: [vaislang/vais](https://github.com/vaislang/vais) v1.0.0+
- **Build**: `vaisc build`

## Project Structure

```
src/
├── storage/       # Page manager, WAL, buffer pool, B+Tree
├── sql/           # SQL parser, executor, optimizer
├── vector/        # HNSW index, quantization, vector storage
├── graph/         # Property graph, traversal, path finding
├── fulltext/      # Inverted index, BM25, tokenizer
├── planner/       # Hybrid query planner, cost model, score fusion
├── rag/           # Semantic chunking, context preservation, RAG_SEARCH
├── server/        # TCP server, wire protocol, connection pool
├── ops/           # Production operations: backup, metrics, VACUUM, REINDEX
├── client/        # Client libraries
└── main.vais      # Entry point
```

## Key Design Decisions

1. **Single-file storage** (like SQLite) - one `.vaisdb` file per database
2. **WAL-based durability** - write-ahead log with fsync for ACID
3. **Page-based storage** - all engines share the same page manager
4. **Unified query planner** - cost-based optimizer across all engine types

## Dependencies

- Vais standard library:
  - `std/file.vais` - fsync, mmap, flock
  - `std/net.vais` - TCP server
  - `std/sync.vais` - Mutex, RwLock for concurrency
  - `std/hashmap.vais` - String-keyed HashMap

## Coding Conventions

- Follow Vais standard style (single-char keywords: `F`, `S`, `I`, `L`, `M`, etc.)
- Use `mut` for mutable bindings (e.g., `x := mut 0;`, `F method(mut self, ...)`, `&mut Type`)
- Use `|>` pipe operator for data transformations
- All public APIs must have doc comments
- Error handling: use `Result<T, E>` with `?` operator

## Testing

- Unit tests per module
- Integration tests for cross-engine queries
- Benchmark tests against reference implementations (SQLite for SQL, HNSW lib for vector)

## Roadmap Reference

See [ROADMAP.md](ROADMAP.md) for detailed phase breakdown.
Current phase: Phases 0-10 complete. All implementation phases finished.
