# Stage 3: MVCC Strategy Decisions

> **Status**: Design Complete
> **Impact**: Affects correctness of ALL concurrent operations across all engines
> **Last Updated**: 2026-02-02

---

## 1. Update Strategy: In-Place Update + Undo Log

### Decision

**In-place update** with undo log (InnoDB-style), NOT append-only (PostgreSQL-style).

### Rationale

| Factor | In-Place + Undo | Append-Only |
|--------|----------------|-------------|
| Vector data bloat | Minimal (1 copy) | Severe (6KB * N versions) |
| Read amplification | Follow undo chain | Scan HOT chain |
| Write amplification | Low (update + undo) | Low (append) |
| VACUUM necessity | Undo log cleanup only | Full table VACUUM (HOT chains) |
| Graph adjacency bloat | Minimal | Each edge update duplicates list |

For VaisDB, vector data at 1536-dim is ~6KB per vector. Append-only would create massive bloat with even moderate update rates. In-place update keeps the current version on the data page and pushes old versions to undo log.

### How It Works

```
UPDATE row:
  1. Copy current row to undo log (including MVCC metadata)
  2. Modify row in-place on data page
  3. Set new row's undo_ptr → undo log entry
  4. Old snapshot readers follow undo_ptr to find their visible version

DELETE row:
  1. Set txn_id_expire = current_txn_id
  2. Row remains on page until GC reclaims it

INSERT row:
  1. Write new row to data page
  2. Set txn_id_create = current_txn_id, txn_id_expire = 0
  3. undo_ptr = 0 (no previous version)
```

---

## 2. MVCC for Vector Indexes: Post-Filter Strategy

### Problem

HNSW index is a shared structure. It cannot maintain per-transaction versions of the graph. But different transactions may see different sets of valid vectors.

### Decision: Post-Filter with Adaptive Oversampling

```
Vector Search Process:
  1. Search HNSW for top_k * oversample_factor candidates
  2. For each candidate, check MVCC visibility against current snapshot
  3. Filter out invisible candidates
  4. Return top_k visible results
```

### Oversample Factor

The oversample factor compensates for candidates that are invisible to the current snapshot (uncommitted inserts by other transactions, or soft-deleted vectors).

```
Base oversample factor: 2.0 (search 2x candidates, filter to k)

Adaptive formula:
  invisible_ratio = (active_uncommitted_vectors + soft_deleted_not_gc_vectors) / total_indexed_vectors
  oversample = max(2.0, 1.0 / (1.0 - invisible_ratio) * 1.5)

Example:
  1% invisible → oversample = 2.0 (base is fine)
  10% invisible → oversample = max(2.0, 1.67) = 2.0
  30% invisible → oversample = max(2.0, 2.14) = 2.14
  50% invisible → oversample = max(2.0, 3.0) = 3.0
```

`soft_deleted_not_gc_vectors` counts vectors marked for deletion but not yet physically removed by GC. These vectors are still present in the HNSW graph and may be returned as candidates, so they must be accounted for in the oversample factor.

### When Oversample Is Insufficient

If after filtering there are fewer than `top_k` results:
1. Double the oversample factor
2. Re-search (with higher `ef_search` if needed)
3. If still insufficient after 3 retries, return available results with warning

### Soft-Deleted Vectors in HNSW

Deleted vectors are NOT immediately removed from the HNSW graph (would require expensive graph repair). Instead:
- Marked as soft-deleted (IS_TOMBSTONE flag in HNSW node)
- Skipped during search result collection
- Physically removed during GC compaction (graph repair phase)

---

## 3. MVCC for Graph Adjacency Lists

### Design

Each adjacency list entry carries MVCC metadata:

```
AdjEntry {
    target_node:    u64,    // Destination node ID
    edge_id:        u64,    // Edge ID for property lookup
    edge_type:      u16,    // Edge type (index into type table)
    txn_id_create:  u64,    // Transaction that created this edge
    txn_id_expire:  u64,    // Transaction that deleted this edge (0 = active)
    cmd_id:         u32,    // Command ID within creating transaction
    expire_cmd_id:  u32,    // Command ID within deleting transaction
}

Total: 42 bytes per adjacency entry
```

`cmd_id` / `expire_cmd_id` enable correct visibility for self-referencing graph operations within a single transaction (e.g., INSERT edges from a `GRAPH_TRAVERSE` result in the same statement, or DELETE followed by re-traverse in the same transaction). These fields mirror `cmd_id` / `expire_cmd_id` in the tuple MVCC metadata (Stage 1) and PostingEntry (Section 5).

Note: The struct uses packed/serialized layout (not C struct alignment) since it is an on-disk format. No padding bytes are added between fields.

### Traversal Visibility

During graph traversal, each edge is checked for visibility:

```
fn traverse_neighbors(node_id: u64, snapshot: &Snapshot) -> Vec<AdjEntry> {
    let adj_page = load_adjacency_page(node_id);
    adj_page.entries
        .filter(|e| is_edge_visible(e, snapshot))
        .collect()
}

fn is_edge_visible(entry: &AdjEntry, snapshot: &Snapshot) -> bool {
    // Check aborted status first via Transaction Status Table (CLOG)
    // If the creating txn was aborted, the edge was never committed → invisible
    if is_aborted(entry.txn_id_create) {
        return false;
    }

    let created_by = entry.txn_id_create;
    let expired_by = entry.txn_id_expire;
    // If the expiring txn was aborted, treat as not expired
    let expired_by_effective = if expired_by != 0 && !is_aborted(expired_by) {
        expired_by
    } else {
        0
    };

    // Case 1: Created by current transaction — use cmd_id for same-txn visibility
    if created_by == snapshot.current_txn {
        if entry.cmd_id >= snapshot.current_cmd_id {
            return false;  // Created by later command in same txn
        }
        if expired_by_effective == 0 {
            return true;
        }
        if expired_by_effective == snapshot.current_txn {
            return entry.expire_cmd_id >= snapshot.current_cmd_id;
        }
        return true;
    }

    // Case 2: Created by committed transaction visible to this snapshot
    if !is_committed_before(created_by, snapshot) {
        return false;  // Creator not yet committed
    }

    // Case 3: Check expiration
    if expired_by_effective == 0 {
        return true;  // Not expired
    }
    if expired_by_effective == snapshot.current_txn {
        return entry.expire_cmd_id >= snapshot.current_cmd_id;
    }
    if !is_committed_before(expired_by_effective, snapshot) {
        return true;  // Expirer not yet committed = still visible
    }
    return false;  // Expired by committed transaction
}
```

The `is_committed_before(txn_id, snapshot)` function must consult the Transaction Status Table (CLOG equivalent) to distinguish between COMMITTED, ABORTED, and IN_PROGRESS states.

> **Unified visibility pattern**: The `is_edge_visible()` function follows the same 3-case structure as the tuple `is_visible()` function in Stage 1, including `cmd_id`/`expire_cmd_id` handling for same-transaction operations. The `is_aborted()` fast-path is an optimization that short-circuits CLOG lookup for known-aborted creators. All three visibility functions (tuple, edge, posting entry) must be kept in sync — consider a single shared implementation during coding.

### Transaction Status Table (CLOG)

A persistent structure mapping `txn_id` to status (`COMMITTED`, `ABORTED`, `IN_PROGRESS`). Required for both tuple and edge visibility checks.

#### Disk Format

Each transaction status is encoded as 2 bits:

```
Value  Status
─────  ──────
0b00   IN_PROGRESS
0b01   COMMITTED
0b10   ABORTED
0b11   RESERVED (for future use)
```

#### Page Layout

CLOG data is stored in dedicated pages within `meta.vdb`:

```
CLOG uses the database's configured page size:

  8KB pages (default):
    Usable space: 8,192 - 48 (page header) = 8,144 bytes
    Transactions per page: 8,144 × 4 = 32,576

  16KB pages:
    Usable space: 16,384 - 48 (page header) = 16,336 bytes
    Transactions per page: 16,336 × 4 = 65,344

General formula:
  txns_per_page = (PAGE_SIZE - 48) * 4

CLOG page addressing:
  clog_page_number = txn_id / txns_per_page
  byte_offset = (txn_id % txns_per_page) / 4
  bit_offset = (txn_id % 4) * 2
```

#### Cache Strategy

The most recent N CLOG pages are cached in memory (within the System Overhead memory budget). Hot transactions (recently committed/aborted) are almost always in the cached pages, avoiding disk reads for the common-case visibility checks.

```
Default cache: 8 pages = ~260K transaction statuses
Configurable: clog_cache_pages (restart-required)
```

#### WAL Relationship

CLOG updates are **not** separately WAL-logged. The `TXN_COMMIT` (0x01) and `TXN_ABORT` (0x02) WAL records implicitly define the CLOG state. During crash recovery, the REDO phase replays these records and reconstructs the CLOG:

```
Recovery REDO:
  TXN_COMMIT record → set CLOG[txn_id] = COMMITTED
  TXN_ABORT record  → set CLOG[txn_id] = ABORTED
  No WAL record      → remains IN_PROGRESS (will be undone in UNDO phase)
```

This avoids double-writing transaction status (once in WAL, once in CLOG) and simplifies the WAL protocol.

#### Garbage Collection

CLOG pages for transactions below the `low_water_mark` (the oldest active transaction ID) can be truncated, since no active snapshot will ever query their status:

```
Truncation rule:
  if all txn_ids on a CLOG page < low_water_mark:
    page can be reclaimed (all statuses are either COMMITTED or ABORTED,
    and no active reader cares)
```

#### File Location

CLOG pages use page type `META` (0x00) with a dedicated region in `meta.vdb`. The meta page (page 0) stores the current CLOG page range (first_page, last_page) for efficient lookup.

#### Crash Safety

Since CLOG writes are not WAL-protected, a torn write to a CLOG page could leave incorrect transaction statuses on disk. VaisDB handles this by **reconstructing CLOG from WAL on every startup** during the REDO phase of crash recovery. The on-disk CLOG is treated as a cache that accelerates normal operation, not as the source of truth. Additionally, CLOG pages carry the standard page header checksum — if a checksum mismatch is detected during normal operation, the affected CLOG page is rebuilt by scanning the relevant WAL segment.

### Snapshot-Consistent Multi-Hop Traversal

Entire multi-hop traversals use a single snapshot. This guarantees:
- No phantom edges appearing mid-traversal
- No disappearing nodes between hops
- Consistent view of the graph at a single point in time

### Bitmap Cache for Hot Snapshots

For frequently accessed snapshots (e.g., long-running analytical queries):
- Build a visibility bitmap per adjacency page
- Cache bitmap keyed by `(page_id, snapshot_id)`
- Avoids per-entry visibility check on repeated page access
- Cache invalidated when page is modified

---

## 4. Garbage Collection Design

### Overview

GC reclaims space from:
1. Undo log entries for committed transactions with no active readers
2. Soft-deleted HNSW nodes
3. Expired adjacency list entries
4. Deleted posting list entries (via deletion bitmap merge)

### Low Water Mark

```
low_water_mark = min(txn_id for all active transactions)

Any version with txn_id_expire < low_water_mark can be safely removed:
  no active transaction can see it.
```

### Per-Engine GC

#### Relational / Undo Log

```
GC Process:
  1. Find undo entries where txn_id < low_water_mark
  2. Undo entries only needed by transactions that are still visible
  3. Remove undo entries that no active snapshot references
  4. Reclaim undo log pages
```

#### Vector / HNSW

```
HNSW GC (Compaction):
  1. Identify soft-deleted nodes where txn_id_expire < low_water_mark
  2. For each deleted node:
     a. Remove from neighbor lists of connected nodes
     b. Repair graph: connect neighbors to each other if needed
     c. Reclaim node page space
  3. This is expensive: batch and run during low-traffic periods
```

#### Graph / Adjacency Lists

```
Adjacency GC:
  1. Scan adjacency pages for entries where txn_id_expire < low_water_mark
  2. Remove expired entries
  3. Compact adjacency pages (move entries to fill gaps)
  4. Reclaim empty adjacency pages
```

#### Full-Text / Posting Lists

```
Posting List GC:
  1. Merge deletion bitmap into posting list
  2. Remove entries marked as deleted
  3. Re-compress posting list (delta encoding)
  4. Reclaim freed pages
```

### I/O Throttling

```
gc_io_limit_mbps: 50           # Max MB/s of I/O for GC operations
gc_cpu_limit_percent: 10       # Max CPU% for GC threads
gc_schedule: "02:00-06:00"     # Preferred GC window (optional)
gc_min_interval_sec: 60        # Minimum interval between GC runs
```

GC yields to active queries. If query latency increases during GC, GC backs off automatically.

### GC Trigger Conditions

```
Trigger when ANY of:
  - Undo log size > undo_log_max_size (default 1GB)
  - Dead tuples ratio > 20% of total tuples
  - HNSW soft-deleted nodes > 10% of total nodes
  - Adjacency dead entries > 20% of total entries
  - Posting list deletion bitmap > 30% of posting entries
```

---

## 5. MVCC for Full-Text Posting Lists

### Design

Each posting list entry carries MVCC metadata:

```
PostingEntry {
    doc_id:         u64,    // Document ID
    term_freq:      u32,    // Term frequency in document
    positions:      [u32],  // Term positions (variable length)
    txn_id_create:  u64,    // Transaction that created this entry
    txn_id_expire:  u64,    // Transaction that deleted this entry (0 = active)
    cmd_id:         u32,    // Command sequence within creating transaction
    expire_cmd_id:  u32,    // Command sequence within deleting transaction
}

MVCC overhead: 24 bytes per posting entry (txn_id_create + txn_id_expire + cmd_id + expire_cmd_id)
```

### Visibility Check

Visibility check is the same as tuple visibility: `is_visible(posting_entry, snapshot)`. Each posting entry's `txn_id_create`, `txn_id_expire`, `cmd_id`, and `expire_cmd_id` are evaluated against the current snapshot using the same logic as tuple visibility (including same-transaction cmd_id checks) to determine if the entry should be included in search results.

### Deletion Bitmap Optimization

A deletion bitmap is used for performance optimization: entries marked in the deletion bitmap are quickly skipped without checking MVCC fields. This avoids the overhead of full visibility checks for entries that are known to be deleted.

The deletion bitmap is reconciled with MVCC during GC: entries where `txn_id_expire` is committed below the low water mark are permanently removed from the posting list and their corresponding bits cleared from the bitmap.

### BM25 Document Frequency Tracking

BM25 scoring requires accurate document frequency (DF) and total document count. Under concurrent writes, these counts may be slightly stale. VaisDB uses approximate counts with a documented tolerance for slight inaccuracy under concurrent writes. The approximation is bounded: DF can only be off by the number of in-flight transactions modifying the relevant terms, which is typically negligible relative to total document count.

### FULLTEXT_MATCH Visibility

`FULLTEXT_MATCH` results are post-filtered by MVCC visibility, similar to the HNSW post-filter strategy. The posting list is traversed to collect candidate documents, and each candidate is then checked against the current snapshot. Only visible documents are included in the final ranked result set.

---

## 6. Transaction Timeout

### Default: 5 minutes

```
transaction_timeout_sec: 300
```

### Why 5 Minutes?

- Long transactions block GC (low_water_mark stays old)
- Accumulate undo log entries
- Hold write locks preventing other writers
- Most OLTP transactions complete in < 1 second
- 5 minutes is generous for batch operations while preventing runaway transactions

### Behavior on Timeout

```
1. Transaction is marked as ABORTED
2. Undo chain is immediately traversed and old values are restored to data pages (eager undo)
3. Undo operations generate CLR (Compensation Log Records) in the WAL for crash recovery correctness
4. All locks released after undo is complete
5. Client receives error: VAIS-0004001 "Transaction timeout after 300 seconds"
6. Client must BEGIN new transaction
```

VaisDB uses eager undo (InnoDB style): when a transaction aborts (timeout, explicit ROLLBACK, or deadlock victim), the undo chain is immediately traversed and old values are restored to data pages. This ensures the visibility function never needs to traverse undo chains for aborted transactions.

Undo operations generate CLR (Compensation Log Records) in the WAL for crash recovery correctness.

### Configurable per Session

```sql
SET SESSION transaction_timeout = 600;  -- 10 minutes for this session
SET SESSION transaction_timeout = 0;    -- No timeout (dangerous)
```

---

## 7. Isolation Levels

### Supported Levels

| Level | Description | Default |
|-------|-------------|---------|
| READ COMMITTED | See committed data at statement start | No |
| SNAPSHOT ISOLATION (REPEATABLE READ) | See committed data at transaction start | **Yes** |

### Not Supported Initially

- READ UNCOMMITTED: Not useful, easy to add later
- SERIALIZABLE: Requires SSI (serializable snapshot isolation), significant complexity. Planned for future.

### Snapshot Isolation Implementation

```
BEGIN:
  snapshot = {
    txn_id: next_txn_id(),
    active_txns: copy of Active Transaction Table,
    current_cmd_id: 0
  }

Each statement:
  snapshot.current_cmd_id += 1

COMMIT:
  Check for write-write conflicts (first-committer-wins)
  If conflict: ABORT and return error
  If no conflict: Write TXN_COMMIT to WAL, release locks

ABORT:
  Write TXN_ABORT to WAL, release locks
```

### Write-Write Conflict Detection

```
On UPDATE/DELETE:
  1. Check if the target tuple's txn_id_expire has been set
     by another committed transaction since our snapshot
  2. If yes: write-write conflict → abort this transaction
  3. If set by an active (uncommitted) transaction: wait for it to commit/abort
     (with deadlock detection timeout)
```

#### Graph Edge Write-Write Conflict

Graph edge write-write conflict: If T1 sets `txn_id_expire` on edge E (marking deletion) and T2 also attempts to set `txn_id_expire` on edge E, the second writer detects the conflict via the non-zero `txn_id_expire` field.

Resolution: first-committer-wins, same as tuple conflict detection. The later transaction is aborted with `VAIS-0004003 WRITE_CONFLICT`.

Edge property updates follow the same conflict detection: check `txn_id_expire` of the current version before applying update.

---

## 8. MVCC Concurrency Scenarios (Verification)

### Scenario 1: Basic Snapshot Isolation
```
T1: BEGIN
T1: SELECT * FROM t WHERE id = 1  → sees row version V1
T2: BEGIN
T2: UPDATE t SET x = 2 WHERE id = 1
T2: COMMIT
T1: SELECT * FROM t WHERE id = 1  → still sees V1 (snapshot)
T1: COMMIT
```
**Expected**: T1 sees consistent snapshot throughout. **Verified in visibility function**.

### Scenario 2: Write-Write Conflict
```
T1: BEGIN
T2: BEGIN
T1: UPDATE t SET x = 1 WHERE id = 1
T2: UPDATE t SET x = 2 WHERE id = 1  → blocks (T1 holds write)
T1: COMMIT
T2: detects conflict → ABORT with error
```
**Expected**: First-committer wins. T2 must retry. **Verified**.

### Scenario 3: INSERT...SELECT Self-Reference
```
T1: BEGIN
T1: INSERT INTO t SELECT * FROM t
```
**Expected**: SELECT sees table state BEFORE the INSERT started (cmd_id check). **Verified via cmd_id in visibility function**.

### Scenario 4: Phantom Reads (Allowed in SI)
```
T1: BEGIN
T1: SELECT COUNT(*) FROM t WHERE x > 5  → 10 rows
T2: INSERT INTO t (x) VALUES (100)
T2: COMMIT
T1: SELECT COUNT(*) FROM t WHERE x > 5  → still 10 rows (snapshot)
```
**Expected**: No phantom in snapshot isolation. **Verified**.

### Scenario 5: Vector Search Visibility
```
T1: BEGIN
T2: INSERT INTO docs (embedding) VALUES ([...])  -- uncommitted
T1: VECTOR_SEARCH(embedding, query, top_k=5)
```
**Expected**: T2's vector is in HNSW but filtered by MVCC post-filter. T1 does not see it. **Verified via post-filter strategy**.

### Scenario 6: Graph Traversal Consistency
```
T1: BEGIN, start 3-hop traversal
T2: DELETE edge (A→B), COMMIT (during T1's traversal)
T1: continues traversal
```
**Expected**: T1 still sees edge A→B (snapshot). Entire traversal is consistent. **Verified via adjacency entry visibility**.

### Scenario 7: Concurrent HNSW Insert
```
T1: INSERT vector V1 into HNSW
T2: INSERT vector V2 into HNSW (concurrent)
Both COMMIT
```
**Expected**: Both vectors in HNSW. Graph structure may differ from serial execution (HNSW is non-deterministic) but both are valid. **Verified: single-writer serializes HNSW writes**.

### Scenario 8: Deadlock
```
T1: UPDATE row A, then UPDATE row B
T2: UPDATE row B, then UPDATE row A
```
**Expected**: Deadlock detected. One transaction aborted. **Handled by wait-for graph with 1-second timeout**.

### Scenario 9: Long Transaction GC Blocking
```
T1: BEGIN (holds snapshot at txn_id 100)
... many other transactions commit ...
GC runs: cannot clean anything after txn_id 100
```
**Expected**: Low water mark stuck at 100. Transaction timeout (5 min) eventually aborts T1, allowing GC. **Verified**.

### Scenario 10: Cross-Engine Transaction
```
T1: BEGIN
T1: INSERT INTO docs (content, embedding) VALUES (...)  -- SQL + Vector
T1: Auto graph edges created                             -- Graph
T1: Full-text index updated                              -- Full-text
T1: COMMIT
```
**Expected**: All-or-nothing across all 4 engines. If crash before COMMIT, all undone. **Verified via unified WAL and ARIES recovery**.

---

## Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| In-place update + undo strategy | Done | Vector bloat prevented |
| Vector MVCC post-filter | Done | Adaptive oversampling |
| Graph adjacency MVCC | Done | Per-entry visibility (42B AdjEntry with cmd_id/expire_cmd_id), bitmap cache |
| GC design (all engines) | Done | Low water mark, per-engine strategy |
| GC I/O throttling | Done | Configurable limits |
| Transaction timeout | Done | 5 min default, configurable |
| Isolation levels | Done | Snapshot isolation default |
| Write-write conflict | Done | First-committer-wins |
| 10 concurrency scenarios | Done | All verified against visibility function |
| CLOG detailed design | Done | 2-bit/txn, page layout (8KB/16KB), cache, WAL relationship, GC |
| CLOG crash safety | Done | Reconstructed from WAL on startup; checksum-triggered rebuild |
| Unified visibility pattern | Done | Tuple, edge, posting entry all use same 3-case + cmd_id logic |
