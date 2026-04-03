# Stage 4: Memory Architecture

> **Status**: Design Complete
> **Impact**: Determines performance characteristics and workload adaptability
> **Last Updated**: 2026-02-02

---

## 1. Memory Budget Allocation System

### Default Allocation

Total memory budget is configurable at startup (`memory_budget`). Default: auto-detect (75% of system RAM, max 16GB).

```
Component                    Default %   Min %   Description
─────────                    ─────────   ─────   ───────────
Buffer Pool                  50%         30%     Relational pages, B+Tree, graph adj, posting lists
HNSW Cache                   25%         10%     Vector index nodes (Layer 1+ pinned)
Full-text Dictionary Cache   5%          2%      Term dictionary for fast lookup
Query Execution Memory       15%         10%     Sort buffers, hash join, intermediates
System Overhead              5%          5%      Connections, WAL buffer, metadata, GC
```

### Budget Spreadsheets

#### 4GB Total Memory

```
Component                    Allocation   Notes
─────────                    ──────────   ─────
Buffer Pool                  2.0 GB       ~250K 8KB pages cached
HNSW Cache                   1.0 GB       ~163K 1536-dim vectors (6KB each) cached
Full-text Dictionary Cache   200 MB       ~2M unique terms
Query Execution Memory       600 MB       2-3 concurrent complex queries
System Overhead              200 MB       ~100 connections
```

**Suitable for**: Small deployments, < 10M rows, < 1M vectors.

#### 8GB Total Memory

```
Component                    Allocation   Notes
─────────                    ──────────   ─────
Buffer Pool                  4.0 GB       ~500K 8KB pages cached
HNSW Cache                   2.0 GB       ~327K 1536-dim vectors cached
Full-text Dictionary Cache   400 MB       ~4M unique terms
Query Execution Memory       1.2 GB       5-10 concurrent complex queries
System Overhead              400 MB       ~200 connections
```

**Suitable for**: Medium deployments, < 100M rows, < 10M vectors.

#### 16GB Total Memory

```
Component                    Allocation   Notes
─────────                    ──────────   ─────
Buffer Pool                  8.0 GB       ~1M 8KB pages cached
HNSW Cache                   4.0 GB       ~654K 1536-dim vectors cached
Full-text Dictionary Cache   800 MB       ~8M unique terms
Query Execution Memory       2.4 GB       10-20 concurrent complex queries
System Overhead              800 MB       ~500 connections
```

**Suitable for**: Large deployments, < 1B rows, < 100M vectors.

### Configuration

```sql
SET GLOBAL memory_budget = '8GB';
SET GLOBAL buffer_pool_percent = 50;
SET GLOBAL hnsw_cache_percent = 25;
SET GLOBAL dict_cache_percent = 5;
SET GLOBAL query_memory_percent = 15;
-- System overhead is always the remainder
```

---

## 2. Adaptive Memory Rebalancing

### Problem

Static allocation wastes memory. A SQL-heavy workload doesn't need 25% for HNSW cache.

### Solution: Workload-Based Rebalancing

```
Every 60 seconds, the memory manager evaluates:

  All pressure values are normalized to 0.0–1.0 range:

  buffer_pool_pressure = miss_rate (0.0–1.0, already a ratio)
  hnsw_pressure = 1.0 - (free_slots / total_slots)
  query_pressure = active_spills / max_concurrent_queries

  Rebalancing triggers when any pressure > 0.8 or when pressures are imbalanced by > 0.3

  If buffer_pool_pressure > threshold AND hnsw_pressure < threshold:
    shift 5% from HNSW Cache → Buffer Pool

  If hnsw_pressure > threshold AND buffer_pool_pressure < threshold:
    shift 5% from Buffer Pool → HNSW Cache

  etc.
```

### Constraints

- No component below its minimum %
- Shift increments: 5% of total budget per rebalancing cycle
- Maximum 2 shifts per cycle (avoid oscillation)
- Rebalancing pauses during checkpoint (too much I/O)

### Monitoring

```sql
SHOW MEMORY STATUS;

-- Returns:
-- component          | allocated_mb | used_mb | hit_rate | miss_rate | pressure
-- buffer_pool        | 4096         | 3800    | 0.94     | 0.06      | low
-- hnsw_cache         | 2048         | 2040    | 0.88     | 0.12      | medium
-- dict_cache         | 400          | 120     | 0.99     | 0.01      | low
-- query_memory       | 1200         | 450     | N/A      | N/A       | low
-- system             | 400          | 280     | N/A      | N/A       | low
```

---

## 3. Memory Pressure Handling

### Eviction Priority (lowest to highest)

When memory is scarce, components evict in this order:

```
Priority  Component                 Reason
────────  ─────────                 ──────
1 (first) Data pages (clean)        Easy to re-read from disk
2         B+Tree leaf pages         Can be re-read, less frequent than data
3         Posting list pages        Full-text lookups less latency-sensitive
4         Graph adjacency pages     Graph traversal can tolerate latency
5         HNSW Layer 0 nodes        Large but re-loadable from disk
6         B+Tree internal pages     Small, high fan-out, hot
7         Dictionary cache          Small, very frequently accessed
8 (never) HNSW Layer 1+ nodes      Upper layers MUST stay in memory
          (and entry point)         for consistent search performance
```

### Why HNSW Layer 1+ is Pinned

HNSW search starts from the top layer and navigates down. If upper layers are evicted:
- Every vector query starts with disk I/O
- Latency becomes unpredictable (cache miss at the start of every search)
- Upper layers are small (exponentially fewer nodes per layer) → low memory cost

```
Layer distribution for M=16, 1M vectors:
  Layer 0: ~1,000,000 nodes (all vectors)
  Layer 1: ~62,500 nodes (1/16)
  Layer 2: ~3,906 nodes
  Layer 3: ~244 nodes
  Layer 4: ~15 nodes
  Layer 5: ~1 node (entry point)

Layers 1-5 total: ~66,666 nodes × 6KB ≈ 400MB for 1M 1536-dim vectors
This is acceptable and pinned.
```

### HNSW Cache vs Buffer Pool I/O Path

HNSW Layer 1+ nodes: Loaded directly from vectors.vdb into the HNSW Cache at startup. Managed by HNSW Cache's own eviction policy (pinned, never evicted). Bypasses buffer pool entirely.

HNSW Layer 0 nodes: Managed through the buffer pool like other data pages. Accessed via standard page read/write through buffer pool.

This means HNSW Layer 0 pages may be evicted from the buffer pool under memory pressure, while Layer 1+ nodes remain pinned in the dedicated HNSW Cache.

I/O for HNSW Cache: Direct file read from vectors.vdb using mmap or buffered I/O. No buffer pool involvement. Dirty HNSW Cache pages are flushed directly during checkpoint.

### Undo Log Memory

Undo log pages are cached within the buffer pool allocation. Under heavy write workloads, undo pages may consume up to 10-15% of the buffer pool.

Buffer pool eviction priority treats undo pages between clean data pages (priority 1) and B+Tree leaf pages (priority 2) in the eviction order: hot undo pages for active transactions are retained, expired undo pages are evicted first.

### Out-of-Memory Handling

```
If all eviction fails and memory is still insufficient:
  1. Reject new queries with VAIS-0003001 "Insufficient memory"
  2. Allow running queries to complete
  3. Trigger aggressive GC
  4. Log warning for operator attention

NEVER crash or corrupt data due to memory pressure.
```

---

## 4. Per-Query Memory Limit

### Default: 256MB per query

```
query_memory_limit: 256MB    # Maximum memory for a single query execution
```

### Why 256MB?

- Prevents a single runaway query from consuming all execution memory
- Sort of 10M rows × 100 bytes = 1GB → exceeds limit → spill to disk
- Hash join build side of 5M rows × 200 bytes = 1GB → exceeds limit → grace hash join

### Spill-to-Disk Strategy

When a query operator exceeds its memory allocation:

```
Sort:
  1. Sort current in-memory chunk
  2. Write sorted run to temp file
  3. Continue sorting next chunk
  4. Merge sorted runs at the end (external merge sort)

Hash Join:
  1. Build side exceeds memory
  2. Partition both sides by hash into temp files
  3. Process each partition that fits in memory
  4. (Grace hash join algorithm)

Aggregation:
  1. Hash table exceeds memory
  2. Spill partition to disk
  3. Re-process spilled partitions one at a time
```

### Temp File Location

```
Temp files stored in: mydb.vaisdb/tmp/
Cleaned up after query completes (or on startup for crash recovery)
```

### Configuration

```sql
SET SESSION query_memory_limit = '512MB';  -- For heavy analytical queries
SET SESSION query_memory_limit = '64MB';   -- For OLTP connections
```

---

## 5. Connection Memory

### Per-Connection Overhead

Connection memory model (revised):

Idle connection: ~200KB (connection state, parse cache, small result buffer, transaction state)

Active connection (executing query): ~4.2MB (idle + sort buffer 4MB)

max_connections governs total connections (mostly idle). max_concurrent_queries (new setting, default = CPU cores * 2) governs simultaneously active queries.

Memory formula: connection_memory = max_connections * 200KB + max_concurrent_queries * 4MB

### Max Connections

```
Examples:

4GB budget (System Overhead: 200MB, assuming 8 cores):
  max_connections = 100
  max_concurrent_queries = 16
  connection_memory = 100 * 200KB + 16 * 4MB = 20MB + 64MB = 84MB

8GB budget (System Overhead: 400MB, assuming 8 cores):
  max_connections = 500
  max_concurrent_queries = 16
  connection_memory = 500 * 200KB + 16 * 4MB = 100MB + 64MB = 164MB

16GB budget (System Overhead: 800MB, assuming 16 cores):
  max_connections = 1000
  max_concurrent_queries = 32
  connection_memory = 1000 * 200KB + 32 * 4MB = 200MB + 128MB = 328MB
```

These are conservative estimates. Actual per-connection memory varies with query complexity.

---

## 6. WAL Buffer

### Size

```
wal_buffer_size: 16MB (default)
```

- In-memory buffer for WAL records before flush
- Sized to hold ~1ms of WAL writes at peak throughput
- Flushed on group commit or when buffer is full

---

## 7. Vais Memory Management Strategy

### Component Allocation Strategy

Each VaisDB component uses a memory allocation strategy tailored to its lifetime and access pattern:

| Component | Allocator | Lifetime | Rationale |
|-----------|-----------|----------|-----------|
| Buffer Pool | PoolAllocator | Process | Fixed-size 8KB/16KB page slots, pre-allocated at startup. No fragmentation. |
| Query Execution | Arena (per-query) | Query | Bulk-free on query completion. No per-object free overhead. Matches PostgreSQL MemoryContext pattern. |
| WAL Buffer | Fixed malloc | Process | Single 16MB contiguous buffer. Allocated once, never resized during operation. |
| Undo Log | BumpAllocator (per-txn) | Transaction | Fast sequential allocation for undo entries. Bulk-free on GC. |
| HNSW Cache | PoolAllocator | Process | Fixed-size node slots for Layer 1+ pinned nodes. |
| Sort/Hash Buffers | Arena (per-operator) | Operator | Allocated from query arena, released when operator completes. |
| Connection State | malloc + defer | Connection | Small, long-lived. `defer` ensures cleanup on disconnect. |
| Temporary Results | Arena (per-query) | Query | Intermediate results freed with query arena. |

### Resource Cleanup with `defer`

Vais's `defer` statement guarantees resource cleanup on all exit paths (normal return, early return, error propagation via `?`). This is critical for error-path correctness:

```vais
F open_and_process(path: Str) -> Result<(), Error> {
    ~file = File.open(path)?;
    defer file.close();

    ~page = buffer_pool.fetch_page(page_id)?;
    defer buffer_pool.release_page(page);

    // Even if process() returns Err, both page and file are released
    process(page)?;
    Ok(())
}
```

All buffer pool page acquisitions, file handles, lock acquisitions, and temporary allocations use `defer` for cleanup.

### Arena-Based Query Memory (PostgreSQL MemoryContext Pattern)

Each query execution creates a dedicated Arena allocator. All memory allocated during query execution (sort buffers, hash tables, intermediate results, expression evaluation temporaries) is allocated from this arena:

```vais
F execute_query(plan: &Plan, snapshot: &Snapshot) -> Result<ResultSet, Error> {
    ~arena = Arena.new(query_memory_limit);
    defer arena.destroy();  // Bulk-free everything at once

    ~executor = Executor.new(&arena, plan, snapshot);
    executor.run()
}
```

Benefits:
- **No memory leaks**: Arena destruction frees everything, regardless of error paths
- **Fast allocation**: Bump pointer, no free-list management
- **No fragmentation**: Arena is contiguous, freed as a whole
- **Spill-to-disk**: When arena reaches `query_memory_limit`, operators spill to `tmp/`

### Implementation References

- `std/allocator.vais` — Base allocator trait, malloc/free wrappers
- `std/arena.vais` — Arena allocator with bulk-free
- `std/pool.vais` — Fixed-size pool allocator (for buffer pool page slots)

---

## Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| Memory allocation system | Done | Default percentages with min bounds |
| 4GB budget spreadsheet | Done | No component starved |
| 8GB budget spreadsheet | Done | No component starved |
| 16GB budget spreadsheet | Done | No component starved |
| Adaptive rebalancing | Done | Workload-based with oscillation protection |
| Memory pressure handling | Done | Eviction priority defined, HNSW L1+ pinned |
| Per-query memory limit | Done | 256MB default, spill-to-disk |
| Connection memory model | Done | ~200KB idle / ~4.2MB active per connection |
| OOM handling | Done | Reject queries, never crash |
| Vais memory management strategy | Done | Per-component allocators, defer cleanup, arena queries |
