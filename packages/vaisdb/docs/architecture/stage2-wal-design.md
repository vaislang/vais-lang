# Stage 2: WAL Design

> **Status**: Design Complete
> **Impact**: Affects crash recovery of ALL engines
> **Last Updated**: 2026-02-02

---

## 1. Unified WAL Record Header (48 bytes)

Every WAL record across all engines begins with this header.

### Layout

```
Offset  Size  Field           Type    Description
──────  ────  ─────           ────    ───────────
0       8     lsn             u64     Log Sequence Number (monotonically increasing)
8       8     txn_id          u64     Transaction that generated this record
16      8     prev_lsn        u64     Previous LSN for this transaction (undo chain)
24      8     timestamp       u64     Unix timestamp in microseconds
32      4     record_length   u32     Total record length including header and payload
36      4     checksum        u32     CRC32C of entire record (header + payload)
40      1     record_type     u8      Type of WAL record (see registry)
41      1     engine_type     u8      Engine that generated this record
42      6     reserved        [u8;6]  Reserved for alignment (must be 0x00)
```

**Total header: 48 bytes**

> **Alignment note:** All fields are naturally aligned: u64 fields at 8-byte boundaries (offsets 0, 8, 16, 24), u32 fields at 4-byte boundaries (offsets 32, 36), u8 fields at any offset (40, 41). The 6 reserved bytes at offset 42 pad the header to 48 bytes, ensuring payload fields starting with u64 values are also naturally aligned. This eliminates unaligned access penalties and prevents bus errors on strict-alignment architectures (e.g., ARM).

**Checksum computation:** The `checksum` field (offset 36, 4 bytes) is set to 0x00000000 before computing CRC32C over the entire record (header + payload). The computed value is then written back to the checksum field. This mirrors the same rule specified for page header checksums in Stage 1.

### LSN Design

- LSN = `(segment_number: u32) << 32 | offset_in_segment: u32`
- Monotonically increasing across all engines
- Single WAL writer (all engines serialize through one writer)
- LSN is stored in page headers (`page_lsn`) to determine if redo is needed

### prev_lsn Chain

- Each transaction's WAL records form a linked list via `prev_lsn`
- Used during ABORT: walk the chain backwards, undo each operation
- `prev_lsn = 0` for the first record of a transaction

---

## 2. WAL Record Type Registry

### Meta Records (0x00-0x0F)

```
Value  Name                Payload
─────  ────                ───────
0x00   TXN_BEGIN           { isolation_level: u8 }
0x01   TXN_COMMIT          { }
0x02   TXN_ABORT           { }
0x03   CHECKPOINT_BEGIN    { active_txns: Vec<u64> }
0x04   CHECKPOINT_END      { }
0x05   SCHEMA_CHANGE       { change_type: u8, schema_data: bytes }
0x06   CLR                 { original_record_type: u8, undo_next_lsn: u64, page_id: u32, file_id: u8 }
0x07   PAGE_ALLOC          { file_id: u8, page_id: u32, page_type: u8 }
0x08   PAGE_DEALLOC        { file_id: u8, page_id: u32 }
0x09   FPI                 { file_id: u8, page_id: u32, page_data: [u8; PAGE_SIZE] }
```

**CLR (Compensation Log Record):** Written during the UNDO phase of recovery. The `original_record_type` identifies the type of record being undone. The `undo_next_lsn` points to the next record to undo, preventing re-undo of already-undone operations if a crash occurs during recovery. CLRs are redo-only records. During recovery UNDO phase, CLRs are skipped (their `undo_next_lsn` is followed instead).

**PAGE_ALLOC / PAGE_DEALLOC:** Records allocation and deallocation of pages from the free list. Prevents page leaks on crash. If PAGE_ALLOC is in WAL but the page is never used (crash before data written), recovery can return it to the free list.

**FPI (Full Page Image):** Written on the first modification to a page after each checkpoint (see Stage 1, Section 6). Contains the complete page image before modification. Used during crash recovery to restore torn pages: if a page's checksum fails, the most recent FPI is used as the base, then subsequent redo records are replayed. FPI is written at most once per page per checkpoint cycle.

### Relational Records (0x10-0x1F)

```
Value  Name                Payload
─────  ────                ───────
0x10   PAGE_WRITE          { file_id: u8, page_id: u32, offset: u16, old_data: bytes, new_data: bytes }
0x11   TUPLE_INSERT        { file_id: u8, page_id: u32, slot: u16, tuple_data: bytes }
0x12   TUPLE_DELETE        { file_id: u8, page_id: u32, slot: u16, old_tuple: bytes }
0x13   TUPLE_UPDATE        { file_id: u8, page_id: u32, slot: u16, old_tuple: bytes, new_tuple: bytes }
0x14   BTREE_SPLIT         { file_id: u8, page_id: u32, new_page_id: u32, split_key: bytes, direction: u8 }
0x15   BTREE_MERGE         { file_id: u8, page_id: u32, sibling_id: u32, parent_id: u32 }
0x16   BTREE_INSERT        { file_id: u8, page_id: u32, key: bytes, value: bytes }
0x17   BTREE_DELETE        { file_id: u8, page_id: u32, key: bytes, old_value: bytes }
```

### Vector Records (0x20-0x2F)

```
Value  Name                Payload
─────  ────                ───────
0x20   HNSW_INSERT_NODE    { node_id: u64, layer: u8, neighbors: Vec<(u64, f32)>,
                             file_id: u8, page_id: u32, affected_pages: Vec<(u8, u32)> }
0x21   HNSW_DELETE_NODE    { node_id: u64, layers_affected: Vec<u8>,
                             file_id: u8, page_id: u32 }
0x22   HNSW_UPDATE_EDGES   { node_id: u64, layer: u8, old_neighbors: Vec<u64>, new_neighbors: Vec<u64>,
                             file_id: u8, page_id: u32 }
0x23   HNSW_LAYER_PROMOTE  { node_id: u64, new_max_layer: u8,
                             file_id: u8, page_id: u32 }
0x24   VECTOR_DATA_WRITE   { file_id: u8, page_id: u32, offset: u16, vector_data: bytes }
0x25   QUANTIZATION_UPDATE { index_id: u32, codebook: bytes }
```

**Physical page references in HNSW records:** Each HNSW record includes `file_id: u8` and `page_id: u32` fields identifying the primary physical page affected. For HNSW_INSERT_NODE, which affects multiple pages (node data page + neighbor list pages at each layer), the `affected_pages: Vec<(u8, u32)>` field lists all (file_id, page_id) pairs involved. Physical page references enable ARIES-style redo: compare `page_lsn` with record LSN to skip already-applied changes. Without page references, redo would require logical index lookups, creating a chicken-and-egg problem during recovery.

### Graph Records (0x30-0x3F)

```
Value  Name                  Payload
─────  ────                  ───────
0x30   GRAPH_NODE_INSERT     { file_id: u8, page_id: u32,
                               node_id: u64, labels: Vec<String>, properties: bytes }
0x31   GRAPH_NODE_DELETE     { file_id: u8, page_id: u32,
                               node_id: u64, old_labels: Vec<String>, old_properties: bytes }
0x32   GRAPH_EDGE_INSERT     { file_id: u8, edge_id: u64, src: u64, dst: u64, edge_type: String,
                               properties: bytes, src_adj_page: u32, dst_adj_page: u32 }
0x33   GRAPH_EDGE_DELETE     { file_id: u8, edge_id: u64, src: u64, dst: u64,
                               src_adj_page: u32, dst_adj_page: u32, old_data: bytes }
0x34   GRAPH_PROPERTY_UPDATE { file_id: u8, page_id: u32,
                               entity_type: u8, entity_id: u64,
                               old_properties: bytes, new_properties: bytes }
0x35   ADJ_LIST_PAGE_SPLIT   { file_id: u8, node_id: u64, old_page: u32, new_page: u32,
                               direction: u8, split_data: bytes }
```

**Physical page references in graph records:** All graph records include `file_id: u8` for ARIES-style redo (graph data lives in `graph.vdb`, file_id=2). Node records (0x30, 0x31) and property updates (0x34) include `page_id: u32` identifying the affected data page. Edge records (0x32, 0x33) use `src_adj_page` and `dst_adj_page` as their page references for both adjacency list pages. **Edge operations record BOTH adjacency list pages** (source and destination). Crash recovery must update both or neither.

### Full-Text Records (0x40-0x4F)

```
Value  Name                  Payload
─────  ────                  ───────
0x40   POSTING_LIST_APPEND   { term_hash: u64, page_id: u32, entry: PostingEntry }
0x41   POSTING_LIST_DELETE   { term_hash: u64, page_id: u32, doc_id: u64 }
0x42   DICTIONARY_INSERT     { term: String, posting_head_page: u32 }
0x43   DICTIONARY_DELETE     { term: String, old_posting_head: u32 }
0x44   TERM_FREQ_UPDATE      { term_hash: u64, doc_id: u64, old_freq: u32, new_freq: u32 }
```

---

## 3. WAL Segment Files

### Segment Format

```
mydb.vaisdb/wal/
├── 000001.wal    # Segment 1 (up to 64MB)
├── 000002.wal    # Segment 2
└── ...
```

### Segment Header (32 bytes, at start of each segment file)

```
Offset  Size  Field             Type    Description
──────  ────  ─────             ────    ───────────
0       4     magic             u32     0x56414C57 ("VALW")
4       4     segment_number    u32     Monotonically increasing segment ID
8       8     first_lsn         u64     LSN of first record in this segment
16      8     last_lsn          u64     LSN of last record (updated on close)
24      4     format_version    u32     WAL format version
28      4     checksum          u32     CRC32C of segment header
```

### Segment Size

- Default: 64MB per segment
- New segment when current exceeds size limit
- Smaller segments = more granular archiving for PITR
- Configurable: `wal_segment_size` (immutable after creation)

---

## 4. Group Commit

### Problem

`fsync()` is the bottleneck: 100-200 TPS without batching (SSD latency ~0.1-0.5ms per fsync).

### Solution: Group Commit

```
Writer Thread:
  1. Append WAL records to buffer (no fsync)
  2. When COMMIT record received:
     a. Add to "pending commit" queue
     b. If queue has records OR timeout (default 1ms):
        - Write all pending records to WAL file
        - Single fsync()
        - Notify all waiting transactions: "committed"
```

### Configuration

```
wal_sync_mode:
  - "fsync"       : fsync per group (default, durable)
  - "fdatasync"   : fdatasync per group (faster, metadata not synced)
  - "async"       : no fsync (fastest, risk of data loss on crash)

wal_group_commit_timeout_us: 1000  # Max wait before forced fsync (microseconds)
wal_buffer_size: 16MB              # In-memory WAL buffer before forced flush
```

### Throughput Impact

```
Without group commit: ~200 TPS (1 fsync per transaction)
With group commit (1ms window): ~10,000+ TPS (1 fsync per batch)
```

---

## 5. Physiological Logging Strategy

### General Principle

VaisDB uses **physiological logging**: physical to the page, logical within the page.

```
WAL record identifies:
  - WHICH page (physical: file_id + page_id)
  - WHAT operation within that page (logical: insert tuple at slot X)
```

### Why Not Pure Physical?

Pure physical (full page images) wastes WAL space. An 8KB page write for a 100-byte tuple update is 80x overhead.

### Why Not Pure Logical?

Pure logical requires deterministic replay. HNSW insertion is non-deterministic (random layer selection), so logical replay would produce different graph structures.

### Per-Engine Strategy

| Engine | Strategy | Reason |
|--------|----------|--------|
| **Relational** | Physiological | Standard: page + intra-page operation |
| **B+Tree** | Physiological + structure modification (split/merge as compound records) | Split must be atomic even if it spans pages |
| **Vector (HNSW)** | Logical (operation + result) | Record the INSERT result (which layer, which neighbors) not the search process. Replay produces identical graph. |
| **Graph** | Physiological + bidirectional compound | Edge insert = compound record with both adjacency pages |
| **Full-text** | Physiological | Posting list append is a page-level operation |

### HNSW Logical Logging Detail

HNSW insertion involves a random layer selection and a greedy search for neighbors. This is non-deterministic. Therefore:

```
Log AFTER the operation completes:
  HNSW_INSERT_NODE {
    node_id: 42,
    max_layer: 2,
    neighbors_layer_0: [(10, 0.95), (23, 0.87), ...],
    neighbors_layer_1: [(5, 0.91), (17, 0.83), ...],
    neighbors_layer_2: [(1, 0.88)]
  }

Replay: directly insert node with these exact neighbors.
No search needed during recovery → deterministic + fast.
```

---

## 6. Checkpoint

### Purpose

- Force all dirty pages to disk
- Advance the recovery starting point
- Allow truncation of old WAL segments

### Checkpoint Process

```
1. Write CHECKPOINT_BEGIN { active_txns } to WAL
2. Flush all dirty pages in buffer pool to disk (can be gradual/fuzzy)
3. fsync all data files
4. Write CHECKPOINT_END to WAL
5. fsync WAL
6. Update meta page with checkpoint LSN
7. WAL segments before checkpoint LSN are safe to truncate/archive
```

### Fuzzy Checkpoint

Pages are flushed while the database continues to serve queries. No global lock required. The `page_lsn` on each flushed page records the state at flush time.

### Checkpoint Trigger

```
wal_checkpoint_interval: 300       # seconds (default 5 minutes)
wal_checkpoint_wal_size: 256MB     # trigger when WAL exceeds this size
```

---

## 7. Crash Recovery

### ARIES-style Recovery (3 phases)

```
Phase 1: ANALYSIS
  - Scan WAL from last checkpoint forward
  - Rebuild Active Transaction Table (ATT)
  - Identify dirty pages

Phase 2: REDO (all engines)
  - Replay WAL records from checkpoint forward
  - For each record: if page_lsn < record_lsn → apply redo
  - This restores ALL changes (committed and uncommitted)
  - Engine tag routes record to correct engine's redo handler

Phase 3: UNDO (uncommitted transactions)
  - For each transaction in ATT that was not committed:
    - Walk prev_lsn chain backwards
    - Apply compensating operations (undo)
    - Write CLR (Compensation Log Record) to WAL
  - After all uncommitted transactions are undone, recovery complete
```

### Cross-Engine Recovery Example

```
Scenario: Crash during a transaction that did:
  1. INSERT INTO docs (content, embedding) VALUES (...)    [SQL + Vector]
  2. Graph edges auto-created for chunking                 [Graph]
  3. Full-text index updated                               [Full-text]
  4. COMMIT (not reached - crash)

Recovery:
  REDO: Replay all 4 engine operations (pages are restored)
  UNDO: Transaction was not committed
    - Undo full-text posting list append
    - Undo graph edge inserts (both adjacency lists)
    - Undo HNSW node insert (mark as soft-deleted)
    - Undo SQL tuple insert
  Result: All 4 engines consistent, as if transaction never happened
```

### Compensation Log Records (CLR)

During UNDO, write CLR records to WAL. This ensures:
- If crash occurs DURING recovery, undo is not re-done (CLR has `undo_next_lsn` pointing past the undone record)
- Recovery is idempotent

---

## 8. WAL Truncation & Archiving

### Truncation

After a successful checkpoint, WAL segments whose last LSN < checkpoint LSN can be deleted.

```
# Safe to delete segments where last_lsn < checkpoint_lsn
# Also ensure no active transaction references records in those segments
```

### Archiving (for PITR)

```
wal_archive_mode: off | on
wal_archive_path: "/backups/wal/"

When on:
  - Completed WAL segments are copied to archive path before deletion
  - PITR: restore base backup + replay archived WAL segments up to target timestamp
```

---

## 9. WAL Record Serialization Format

All WAL record payloads follow these binary serialization rules:

- **Integers:** All multi-byte integers are **little-endian**. This applies to u16, u32, u64, i32, i64, f32, f64, etc.
- **Strings:** Length-prefixed with a u32 byte count followed by UTF-8 encoded bytes. No null terminator is written or expected.
- **Byte arrays (`bytes`):** Length-prefixed with a u32 byte count followed by raw bytes.
- **`Vec<T>`:** A u32 element count followed by each element serialized according to its type's rules.
- **Varint:** Unsigned LEB128 encoding, used for compact storage of small values where appropriate (e.g., in contexts where values are typically small but may occasionally be large).
- **Self-describing payloads:** All payloads are self-describing via their `record_type` field in the WAL header — no additional type tags are needed within the payload itself.

---

## Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| Unified WAL record header | Done | 48 bytes, all fields naturally aligned (u64→8B, u32→4B boundaries) |
| Relational WAL records | Done | PAGE_WRITE, TUPLE_*, BTREE_* |
| Vector WAL records | Done | HNSW_*, VECTOR_*, QUANTIZATION_* |
| Graph WAL records | Done | Bidirectional edge records, ADJ_LIST_SPLIT |
| Full-text WAL records | Done | POSTING_*, DICTIONARY_*, TERM_FREQ_* |
| Meta WAL records | Done | TXN_*, CHECKPOINT_*, SCHEMA_CHANGE |
| Physiological logging strategy | Done | Per-engine strategy documented |
| HNSW non-determinism handled | Done | Log result, not process |
| Cross-engine crash recovery | Done | ARIES 3-phase with engine routing |
| Group commit | Done | 1ms batching for throughput |
| Checkpoint design | Done | Fuzzy checkpoint, no global lock |
| WAL archiving hook | Done | For PITR support |
| CLR record type | Done | Meta record 0x06, redo-only with undo_next_lsn |
| HNSW physical page references | Done | file_id + page_id on all HNSW records |
| Checksum zeroing rule | Done | Set to 0 before CRC32C computation |
| PAGE_ALLOC / PAGE_DEALLOC records | Done | Meta records 0x07, 0x08 for free list tracking |
| FPI record type | Done | Meta record 0x09, full page image for torn write protection |
| Graph physical page references | Done | file_id on all graph records, page_id on node/property records |
| Binary serialization format | Done | Little-endian, length-prefixed strings/bytes, LEB128 varint |
| Header alignment padding | Done | All fields naturally aligned; 6 reserved bytes pad to 48 bytes |
