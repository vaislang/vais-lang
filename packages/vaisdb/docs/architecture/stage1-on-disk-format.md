# Stage 1: On-Disk Format Decisions

> **Status**: Design Complete
> **Impact**: IMMUTABLE after first user - these decisions cannot be changed without full migration
> **Last Updated**: 2026-02-02

---

## 1. Unified Page Header Format (48 bytes)

All 4 engines (relational, vector, graph, full-text) share this header. Every page on disk begins with exactly these 48 bytes.

### Layout

```
Offset  Size  Field               Type    Description
──────  ────  ─────               ────    ───────────
0       8     page_lsn            u64     LSN of last WAL record that modified this page
8       8     txn_id              u64     Transaction that last modified this page
16      4     page_id             u32     Unique page identifier (0 = meta page)
20      4     checksum            u32     CRC32C of entire page (excluding this field)
24      4     prev_page           u32     Previous page in chain (0 = none)
28      4     next_page           u32     Next page in chain (0 = none)
32      4     overflow_page       u32     First overflow page (0 = none)
36      2     free_space_offset   u16     Offset to start of free space within page
38      2     item_count          u16     Number of items/tuples/entries in this page
40      2     flags               u16     Bit flags (see below)
42      2     reserved            u16     Reserved for future use (must be 0)
44      1     page_type           u8      Page type (see registry below)
45      1     engine_tag          u8      Engine that owns this page
46      1     compression_algo    u8      0=none, 1=lz4, 2=zstd
47      1     format_version      u8      Page format version (starts at 1)
```

**Total: 48 bytes (naturally aligned)**

> **Alignment Note**: Fields are ordered for natural alignment: u64 at 8-byte boundaries, u32 at 4-byte boundaries, u16 at 2-byte boundaries. This eliminates padding and allows the CPU to access each field with a single aligned load instruction.

### Design Rationale

- **page_id (u32)**: Supports up to 4 billion pages. At 8KB page size = 32TB max database. At 16KB = 64TB. Sufficient for initial release.
- **page_type + engine_tag**: Separated to allow the same page type concept across engines (e.g., "leaf node" exists in B+Tree and HNSW) while still knowing which engine owns it.
- **page_lsn (u64)**: Critical for crash recovery. Buffer pool compares page_lsn to WAL to determine if page needs redo.
- **checksum (u32)**: CRC32C chosen for hardware acceleration (Intel CRC32 instruction, ARM CRC extension). Computed over entire page with checksum field zeroed. Verified on every page read.
- **format_version (u8)**: Enables lazy online migration. Reader checks version, converts old format on access, writes back new format. No dump/restore needed.
- **free_space_offset**: Points to the boundary between used and free space within the page body. Grows from top (items) and bottom (data), meeting in the middle.

### Flags (u16 bit field)

```
Bit 0:  (reserved)         Reserved, must be 0 (see note below)
Bit 1:  IS_LEAF            Leaf node (B+Tree, HNSW layer 0)
Bit 2:  IS_ROOT            Root node
Bit 3:  IS_OVERFLOW        This page is an overflow continuation
Bit 4:  IS_COMPRESSED      Page body is compressed
Bit 5:  NEEDS_COMPACTION   Page has excessive dead space
Bit 6:  IS_PINNED          Do not evict from buffer pool
Bit 7:  HAS_TOMBSTONES     Page contains soft-deleted entries
Bits 8-15: Reserved (must be 0)
```

> **Note on IS_DIRTY**: Dirty tracking is maintained only in the buffer pool's in-memory page descriptor, not persisted on disk. Bit 0 was originally designated IS_DIRTY but is now reserved. A page's dirty state is transient — it indicates the in-memory copy diverges from the on-disk copy — and has no meaning after being flushed to disk.

### Checksum Calculation

```
fn calculate_checksum(page: &[u8; PAGE_SIZE]) -> u32 {
    // Zero out checksum field (offset 20, 4 bytes)
    let mut buf = page.clone();
    buf[20..24] = [0, 0, 0, 0];
    crc32c(&buf)
}
```

Checksum is verified on every read from disk. Mismatch indicates corruption → return error, do not serve corrupted data.

---

## 2. Page Type Registry

Each page type has a unique u8 identifier. Engine tag disambiguates when needed.

### Page Types

```
Value  Name                Engine    Description
─────  ────                ──────    ───────────
0x00   META                common    Database metadata (page 0 only)
0x01   FREELIST            common    Free page tracking
0x02   CATALOG             common    Schema catalog pages

0x10   DATA                sql       Heap data pages (tuples)
0x11   BTREE_INTERNAL      sql       B+Tree internal node
0x12   BTREE_LEAF          sql       B+Tree leaf node

0x20   HNSW_META           vector    HNSW index metadata (parameters, entry point)
0x21   HNSW_NODE           vector    HNSW node data (vector + neighbor lists)
0x22   HNSW_LAYER          vector    HNSW layer structure
0x23   VECTOR_DATA         vector    Raw vector storage (for overflow)

0x30   GRAPH_NODE          graph     Graph node storage
0x31   GRAPH_ADJ           graph     Adjacency list pages
0x32   GRAPH_PROPERTY      graph     Node/edge property storage

0x40   INVERTED_DICT       fulltext  Dictionary B+Tree pages
0x41   INVERTED_POSTING    fulltext  Posting list pages
0x42   INVERTED_META       fulltext  Full-text index metadata

0x50   WAL_SEGMENT         common    WAL segment (reserved, see note below)
0x51   UNDO_LOG            common    Undo log pages

0xFE   OVERFLOW            common    Overflow continuation page
0xFF   UNUSED              common    Unallocated page
```

> **Note on WAL_SEGMENT (0x50)**: WAL segment files use their own 32-byte segment header format (see Stage 2), not the unified page header. This page type is reserved for future use if WAL data needs to be stored in the unified page format.

### Engine Tags

```
Value  Engine
─────  ──────
0x00   common (shared infrastructure)
0x01   sql (relational engine)
0x02   vector (vector engine)
0x03   graph (graph engine)
0x04   fulltext (full-text engine)
```

### Extension Strategy

- Page types 0x60-0xEF are reserved for future engines
- Engine tags 0x05-0x0F are reserved for future engines
- Any new page type must be registered here before use

---

## 3. Default Page Size

### Decision: 8KB default, 16KB for vector-heavy workloads

```
Page size is set at CREATE DATABASE and is IMMUTABLE for the lifetime of the database.
```

### Trade-off Analysis

| Factor | 4KB | 8KB (default) | 16KB (vector) |
|--------|-----|---------------|---------------|
| B+Tree fanout | Low | Good | High |
| Vector fit (1536-dim f32) | No (6KB > 4KB) | No (6KB > 8KB body) | Yes (6KB < ~16KB body) |
| Vector fit (768-dim f32) | No (3KB) | Yes | Yes |
| I/O amplification | Low | Medium | Higher |
| Buffer pool memory efficiency | Good | Good | Lower |
| Overflow frequency | High | Medium | Low |

### Vector Size Reference

```
Dimensions   Bytes (f32)   Fits in 8KB body?   Fits in 16KB body?
384          1,536         Yes                  Yes
768          3,072         Yes                  Yes
1024         4,096         Yes                  Yes
1536         6,144         No (overflow)        Yes
3072         12,288        No (overflow)        No (overflow)
```

> **Note:** The table above shows raw vector data sizes only. Per-tuple MVCC metadata (32 bytes) and HNSW neighbor list pointers are stored separately and do not reduce the available space for vector data within the page body.

### Decision Rationale

- **8KB default**: Good balance for mixed workloads. Most vectors (up to 1024-dim) fit in a single page. B+Tree fanout is reasonable. Matches common filesystem block sizes.
- **16KB option**: For workloads dominated by 1536-dim vectors (OpenAI embeddings). Eliminates overflow for the most common large embedding size.
- Vectors that don't fit in page body use overflow pages (linked list via `overflow_page` in header).

### Page Body Size

```
Page body = PAGE_SIZE - 48 (header) = 8144 bytes (8KB) or 16336 bytes (16KB)
```

---

## 4. File Layout Strategy

### Decision: Bundle Directory (`.vaisdb/`)

A VaisDB database is a **directory** that appears as a single logical unit.

```
mydb.vaisdb/
├── data.vdb        # Main data file: heap pages, B+Tree, catalog
├── vectors.vdb     # Vector data: HNSW nodes, vector storage
├── graph.vdb       # Graph data: nodes, adjacency lists
├── fulltext.vdb    # Full-text: dictionary, posting lists
├── wal/
│   ├── 000001.wal  # WAL segment files (64MB each)
│   ├── 000002.wal
│   └── ...
├── undo/
│   └── undo.vdb    # Undo log for MVCC
├── tmp/            # Temporary files (spill-to-disk for sorts/joins)
├── meta.vdb        # Database metadata, configuration
└── lock            # flock file for embedded mode
```

### Design Rationale

- **Separate files per engine**: Enables I/O parallelism. Vector queries don't contend with SQL writes at the filesystem level.
- **Unified page format**: All `.vdb` files use the same page format with the same 48-byte header. Only the page types differ.
- **WAL directory**: Separate WAL segments for easy archiving (PITR). Sequential writes are isolated from random data access.
- **Undo directory**: Undo log separated from data for write pattern optimization.
- **tmp/ directory**: Temporary files for query execution spill-to-disk (sorts, hash joins, materialized intermediate results). Cleaned on database open. Files in this directory are ephemeral and never included in backups.
- **lock file**: `flock()` on this file prevents multiple processes opening the same DB in embedded mode.

### Page ID Space

Each file has its own page ID space starting from 0. Pages are addressed as `(file_id, page_id)`:

```
file_id  File
───────  ────
0        data.vdb
1        vectors.vdb
2        graph.vdb
3        fulltext.vdb
4        undo.vdb
```

**`meta.vdb`** is the authoritative metadata store for the database, containing all configuration and schema information.

Page 0 of `data.vdb` is a bootstrap page that contains a pointer/reference to `meta.vdb` for bootstrap purposes only. This allows the database open sequence to locate `meta.vdb` even if the directory structure is not yet fully read. The bootstrap page contains:
- Magic number (to identify valid VaisDB data files)
- Page size
- Format version
- Reference to `meta.vdb` (relative path within the bundle directory)

The full metadata in `meta.vdb` includes:
- Database UUID
- Creation timestamp
- Page size
- Format version
- File layout version
- Engine feature flags

### Single-File Mode (Future)

For SQLite-like simplicity, a future option may pack all data into a single file with engine-tagged regions. This is NOT the initial implementation due to I/O contention concerns.

---

## 5. MVCC Tuple Metadata Format (32 bytes)

Every row/tuple in the database carries this metadata for multi-version concurrency control.

### Layout

```
Offset  Size  Field            Type    Description
──────  ────  ─────            ────    ───────────
0       8     txn_id_create    u64     Transaction that created this version
8       8     txn_id_expire    u64     Transaction that deleted/updated (0 = active)
16      8     undo_ptr         u64     Pointer to previous version in undo log
24      4     cmd_id           u32     Command sequence within creating transaction
28      4     expire_cmd_id    u32     Command sequence within deleting/updating transaction
```

**Total: 32 bytes per tuple**

### Field Details

#### txn_id_create
- Set when the tuple is first inserted
- Never changes after creation
- Used by snapshot visibility: `txn_id_create <= snapshot.txn_id && txn_id_create NOT IN snapshot.active_set`

#### txn_id_expire
- **0**: Tuple is current (not deleted or updated)
- **Non-zero**: Transaction ID that deleted or replaced this tuple
- On UPDATE: old tuple gets `txn_id_expire = current_txn`, new tuple is inserted with new `txn_id_create`
- On DELETE: tuple gets `txn_id_expire = current_txn`

#### undo_ptr
- Points to the previous version of this tuple in the undo log
- Format: `(file_id: u8, page_id: u32, offset: u16, padding: u8)` packed into u64 (8 + 32 + 16 + 8 = 64 bits)
- **0**: No previous version (first version of this tuple)
- Enables traversing version chain for snapshot isolation

#### cmd_id
- Command sequence number within the creating transaction
- Critical for correctness: `INSERT INTO t SELECT * FROM t` must see the table state BEFORE the INSERT started
- Visibility check includes: `cmd_id < current_cmd_id` for same-transaction reads
- Starts at 0 for each transaction, increments per statement

#### expire_cmd_id
- Command sequence number within the deleting/updating transaction
- Tracks which command within a transaction deleted or updated this tuple
- Works in tandem with `cmd_id`: `cmd_id` tracks the creation command sequence, while `expire_cmd_id` tracks the deletion/update command sequence within the same (or different) transaction
- When `txn_id_expire == current_txn`, `expire_cmd_id` determines whether the expiration is visible to the current command: if `expire_cmd_id >= current_cmd_id`, the tuple is still visible (the deletion/update hasn't happened yet from this command's perspective)
- Set to 0 when `txn_id_expire` is 0 (tuple not expired)

### Visibility Function (Pseudocode)

```
fn is_visible(tuple: &Tuple, snapshot: &Snapshot) -> bool {
    // Check aborted status first via Transaction Status Table (CLOG)
    // If the creating txn was aborted, the tuple was never committed → invisible
    if is_aborted(tuple.txn_id_create) {
        return false;
    }

    let created_by = tuple.txn_id_create;
    let expired_by = tuple.txn_id_expire;
    // If the expiring txn was aborted, treat as not expired
    let expired_by_effective = if expired_by != 0 && !is_aborted(expired_by) {
        expired_by
    } else {
        0
    };

    // Case 1: Created by current transaction — use cmd_id for same-txn visibility
    if created_by == snapshot.current_txn {
        // Check cmd_id for same-transaction visibility
        if tuple.cmd_id >= snapshot.current_cmd_id {
            return false;  // Created by later command in same txn
        }
        // Not yet expired, or expired by later command
        if expired_by_effective == 0 {
            return true;
        }
        if expired_by_effective == snapshot.current_txn {
            return tuple.expire_cmd_id >= snapshot.current_cmd_id;
        }
        return true;
    }

    // Case 2: Created by committed transaction visible to this snapshot
    if !is_committed_before(created_by, snapshot) {
        return false;  // Creator not yet committed or aborted
    }

    // Case 3: Check expiration
    if expired_by_effective == 0 {
        return true;  // Not expired
    }
    if expired_by_effective == snapshot.current_txn {
        return tuple.expire_cmd_id >= snapshot.current_cmd_id;
    }
    if !is_committed_before(expired_by_effective, snapshot) {
        return true;  // Expirer not yet committed = still visible
    }
    return false;  // Expired by committed transaction
}

fn is_committed_before(txn_id: u64, snapshot: &Snapshot) -> bool {
    txn_id < snapshot.txn_id && txn_id NOT IN snapshot.active_txns
}
```

> **Unified visibility pattern**: This visibility function follows the same 3-case structure as `is_edge_visible()` in Stage 3 (graph adjacency) and the PostingEntry visibility function in Stage 3 (full-text search). The `is_aborted()` fast-path is an optimization that short-circuits CLOG lookup for known-aborted creators, and the `expired_by_effective` pattern ensures aborted deletions are treated as non-existent. All three visibility functions (tuple, edge, posting entry) must be kept in sync — consider a single shared implementation during coding.

### MVCC Overhead Analysis

```
Per tuple: 32 bytes overhead
Example: 100-byte average row → 32% overhead
Example: 1KB average row → 3.1% overhead
Example: 6KB vector → 0.5% overhead

This is acceptable. InnoDB uses similar overhead (13 bytes hidden columns + undo pointer).
The additional 4 bytes (expire_cmd_id) provide correct same-transaction visibility semantics.
```

---

## 6. Torn Write Protection (Full Page Image)

### The Torn Write Problem

An 8KB (or 16KB) database page write is **not atomic** at the filesystem level. Most filesystems and storage devices guarantee atomicity only at the hardware sector level (typically 512 bytes or 4KB). If VaisDB writes an 8KB page and the system crashes mid-write, the on-disk page may be **half-updated**: the first 4KB contains new data while the second 4KB still contains old data (or vice versa). This is a **torn write** (also called a partial write or fractured write).

A torn page is internally inconsistent — the checksum will fail, but more critically, the data cannot be trusted. Simply discarding the page is not an option since it may contain committed data. Standard WAL redo cannot fix this either, because redo applies a logical delta that assumes the base page is intact.

### Solution: Full Page Image (FPI)

VaisDB adopts the **Full Page Image** approach, following PostgreSQL's design:

1. **After each checkpoint**, a per-page flag (`needs_fpi`) is set for every page in the buffer pool.
2. **On the first modification** to any page after a checkpoint, the complete **old page image** (the full 8KB/16KB page as it existed on disk) is written to the WAL **before** the modification's redo record.
3. This FPI WAL record is written only **once per page per checkpoint cycle**. After the FPI is written, subsequent modifications to the same page within the same checkpoint cycle write only the normal (compact) redo records.
4. The `needs_fpi` flag is cleared after the FPI is written.

### Recovery with FPI

During crash recovery, if a page's checksum fails (torn write detected):

1. Scan the WAL backward to find the most recent FPI record for that page.
2. **Restore** the page from the FPI (overwrite the torn page with the complete page image from WAL).
3. Then **replay** all subsequent redo records for that page to bring it to the latest committed state.

This guarantees that recovery always has a consistent base page to work from, even if the on-disk copy is torn.

### Trade-offs

| Aspect | FPI (VaisDB/PostgreSQL) | Doublewrite Buffer (InnoDB) |
|--------|------------------------|---------------------------|
| WAL size | Larger (full page images in WAL) | Smaller WAL, but extra doublewrite file |
| Write amplification | Higher right after checkpoint | Constant 2x for all dirty pages |
| Implementation complexity | Simpler (WAL-only mechanism) | More complex (separate doublewrite file) |
| Recovery speed | Fast (FPI directly in WAL stream) | Extra step to check doublewrite buffer |

**Design decision**: FPI is chosen over InnoDB's doublewrite buffer for its simplicity. The WAL size increase is transient (only right after each checkpoint) and is bounded by the number of distinct pages modified in the first checkpoint cycle.

### FPI WAL Record Format

```
FPI WAL record:
  - record_type:  FPI (dedicated WAL record type)
  - file_id:      u8    Which data file
  - page_id:      u32   Which page
  - page_data:    [u8; PAGE_SIZE]  Complete page image
```

The FPI record is a self-contained snapshot of the page. No dependency on other WAL records for correctness.

---

## 7. Heap Page Internal Layout (DATA 0x10)

### Overview

Heap pages store relational tuples using a **slotted page** structure (PostgreSQL/InnoDB-style). The page has two growth directions: the slot directory grows downward from the top, and tuple data grows upward from the bottom.

### Physical Layout

```
Offset 0                                              Offset PAGE_SIZE
┌──────────┬──────────┬─────────────────┬─────────────────────────┐
│  Page     │  Slot    │   Free Space    │      Tuple Data         │
│  Header   │  Directory│                │  (grows ← from bottom)  │
│  (48B)    │  (grows →)│                │                         │
└──────────┴──────────┴─────────────────┴─────────────────────────┘
           ↑                            ↑                         ↑
        offset 48              free_space_offset          PAGE_SIZE
```

- **Slot Directory**: Starts immediately after the 48-byte page header. Each slot is 4 bytes. Grows toward higher offsets (left to right).
- **Tuple Data**: Starts from the end of the page and grows toward lower offsets (right to left).
- **Free Space**: The gap between the end of the slot directory and the start of the lowest tuple.
- **`free_space_offset`** (in page header): Points to the first byte of free space (= end of slot directory). The start of tuple data is tracked by scanning the slot directory for the minimum offset.

### Slot Directory Entry (4 bytes)

```
Offset  Size  Field       Type    Description
──────  ────  ─────       ────    ───────────
0       2     tuple_off   u16     Byte offset of tuple data from page start (0 = unused slot)
2       2     tuple_len   u16     Length of tuple data in bytes (including MVCC metadata)
```

- **tuple_off = 0**: Slot is dead (tuple deleted, slot reusable after compaction).
- Maximum tuple size: `PAGE_SIZE - 48 (header) - 4 (at least one slot) = 8140 bytes (8KB page)`. Larger tuples use overflow pages.
- Slot count is tracked in page header's `item_count` field.

### Tuple Layout Within Page

Each tuple stored in the tuple data area has:

```
┌───────────────────┬────────────────────┐
│  MVCC Metadata    │   User Data        │
│  (32 bytes)       │   (variable)       │
└───────────────────┴────────────────────┘
```

- MVCC metadata (32 bytes) is always the first part of the tuple, followed by user column data.
- `tuple_len` in the slot entry = 32 (MVCC) + user data length.

### Tuple Insertion

```
1. Check: slot directory size + new tuple size ≤ free space available
2. Allocate slot: increment item_count, write slot entry at offset (48 + (item_count - 1) * 4)
3. Write tuple: place tuple data at (lowest_tuple_offset - tuple_len)
4. Update slot entry: tuple_off = new tuple position, tuple_len = total length
5. Update free_space_offset = 48 + item_count * 4
```

### Tuple Deletion

```
1. Set tuple's MVCC txn_id_expire = current_txn_id
2. After GC determines tuple is invisible to all snapshots:
   a. Set slot entry tuple_off = 0 (mark dead)
   b. Set page flag HAS_TOMBSTONES
   c. Page compaction reclaims space (see below)
```

### Page Compaction

When free space is fragmented (dead slots between live tuples):

```
1. Collect all live tuples (slot entries where tuple_off ≠ 0)
2. Sort by current offset (descending — highest offset first)
3. Rewrite tuples contiguously from the end of the page
4. Update slot directory offsets
5. Clear HAS_TOMBSTONES flag
6. Trigger: when NEEDS_COMPACTION flag is set (set by GC or when insertion fails
   despite total free space being sufficient)
```

Compaction is a page-local operation. It does not move tuples across pages. A WAL record (PAGE_WRITE) is generated for the compacted page.

### Free Space Calculation

```
total_free = (lowest_live_tuple_offset) - (48 + item_count * 4)
usable_free = total_free  (if no fragmentation)
             OR: sum of dead slot spaces + contiguous free  (after compaction)
```

### Overflow Handling

Heap pages use **tuple-level** overflow, not page-level. Each tuple independently decides whether it needs overflow pages. The page header's `overflow_page` field is **NOT used** for heap tuple overflow — it is reserved for page-level overflow in other page types (e.g., single large B+Tree keys).

#### Tuple-Level Overflow (Heap Pages)

If a tuple's user data exceeds the page body capacity:

```
1. Store in the main page slot:
   - MVCC metadata (32B)
   - Inline data prefix (up to a threshold, e.g., first 64 bytes for indexing)
   - Overflow pointer: { overflow_page_id: u32, overflow_total_len: u32 } (8 bytes)
   - Slot flag: IS_OVERFLOW bit set in a flags byte within the tuple header

2. Overflow page(s):
   - Page type: OVERFLOW (0xFE)
   - Page header (48B) + continuation data
   - Chain via next_page in overflow page headers
   - Last overflow page has next_page = 0

3. Read path: if tuple has IS_OVERFLOW flag, follow overflow_page_id
   to read remaining data from overflow page chain.
```

#### Slot Directory Extension for Overflow

```
When a tuple has overflow, the slot directory entry still uses the standard 4-byte format:
  tuple_off: u16    Offset to tuple data (MVCC + inline prefix + overflow pointer)
  tuple_len: u16    Length of on-page data (NOT total tuple length)

The actual total length is reconstructed from the inline data + overflow_total_len.
```

#### Page Header overflow_page Field

The `overflow_page` field in the unified page header is used for **page-level** overflow in non-heap page types:
- **Vector data pages**: A single 1536-dim vector (6KB) that doesn't fit in an 8KB page body
- **Graph property pages**: A single node/edge with very large properties
- Heap pages set `overflow_page = 0` (tuple-level overflow uses per-tuple pointers instead)

---

## 8. Free Page Management (FREELIST 0x01)

### Strategy: Per-File Free Page Bitmap

Each data file (`data.vdb`, `vectors.vdb`, `graph.vdb`, `fulltext.vdb`, `undo.vdb`) maintains its own freelist. This avoids cross-file locking and matches the per-file I/O parallelism design.

### Freelist Page Layout

```
Offset 0                                              Offset PAGE_SIZE
┌──────────┬──────────────────────────────────────────────────────┐
│  Page     │  Bitmap Data                                        │
│  Header   │  (1 bit per page: 0 = allocated, 1 = free)         │
│  (48B)    │                                                     │
└──────────┴──────────────────────────────────────────────────────┘
```

- Each freelist page tracks `(PAGE_SIZE - 48) * 8` pages.
  - 8KB page: `8096 * 8 = 64,768` pages per freelist page = ~507MB of data (at 8KB/page)
  - 16KB page: `16,288 * 8 = 130,304` pages per freelist page = ~2GB of data (at 16KB/page)
- Multiple freelist pages are chained via `next_page` in the page header for larger files.

### Page Addressing

```
file_id's freelist starts at a well-known page:
  data.vdb      (file_id=0): freelist at page 1
  vectors.vdb   (file_id=1): freelist at page 1
  graph.vdb     (file_id=2): freelist at page 1
  fulltext.vdb  (file_id=3): freelist at page 1
  undo.vdb      (file_id=4): freelist at page 1

Page 0 of each file is reserved (meta/bootstrap for data.vdb, file header for others).

Bitmap lookup:
  freelist_page_index = target_page_id / pages_per_freelist_page
  bit_index = target_page_id % pages_per_freelist_page
  byte_offset = 48 + (bit_index / 8)
  bit_offset = bit_index % 8
```

### Allocation Algorithm

```
Allocate page:
  1. Scan bitmap for first free bit (1-bit) — hint: start from last_alloc_position for locality
  2. Set bit to 0 (allocated)
  3. Write PAGE_ALLOC WAL record (0x07) BEFORE using the page
  4. Update last_alloc_position hint
  5. Return (file_id, page_id)

Deallocate page:
  1. Write PAGE_DEALLOC WAL record (0x08)
  2. Set bit to 1 (free)
  3. Zero out the deallocated page (prevent stale data leaks)
```

### File Extension

When all pages are allocated and no free bits remain:

```
1. Extend file by allocation_increment pages (default: 256 pages = 2MB at 8KB)
2. Add new freelist page if needed (chain via next_page)
3. Mark new pages as free in the bitmap
4. WAL: PAGE_ALLOC for the new freelist page itself
```

### Concurrency

- Freelist bitmap is protected by a per-file mutex (lightweight, since allocation is infrequent relative to page access).
- The bitmap page is a regular page in the buffer pool and follows normal dirty page / checkpoint protocol.

### Anti-Fragmentation

- **Sequential allocation hint**: `last_alloc_position` starts from bit 0 and advances, providing sequential page allocation for new data. This improves read-ahead performance.
- **Bulk allocation**: For operations like B+Tree bulk load or COPY import, allocate N pages at once to guarantee contiguous blocks.

---

## 9. B+Tree Node Page Format

### Overview

B+Tree indexes use two page types: internal nodes (BTREE_INTERNAL 0x11) and leaf nodes (BTREE_LEAF 0x12). Both live in `data.vdb` (file_id=0) and use the standard 48-byte page header. B+Tree nodes use a slotted structure similar to heap pages but with sorted key order.

### Internal Node Layout (BTREE_INTERNAL 0x11)

Internal nodes store separator keys and child page pointers. Keys are sorted.

```
┌──────────┬──────────┬──────────────────────┬───────────────────────┐
│  Page     │  Key     │   Free Space         │    Key Data + Child   │
│  Header   │  Directory│                     │    Pointers           │
│  (48B)    │  (grows →)│                     │    (grows ←)          │
└──────────┴──────────┴──────────────────────┴───────────────────────┘
```

#### Key Directory Entry (8 bytes)

```
Offset  Size  Field        Type    Description
──────  ────  ─────        ────    ───────────
0       2     key_off      u16     Byte offset to key data from page start
2       2     key_len      u16     Length of key data in bytes
4       4     child_page   u32     Page ID of child to the RIGHT of this key
```

The child page to the LEFT of all keys (the "leftmost child") is stored separately:

```
First 4 bytes of page body (offset 48):
  leftmost_child: u32    Page ID of leftmost child pointer
```

The key directory starts at offset 52 (48 header + 4 leftmost_child).

#### Search Algorithm

```
For key K in internal node:
  1. Binary search key directory for smallest key_i where K < key_i
  2. If found: follow child_page of key_(i-1), or leftmost_child if i=0
  3. If K ≥ all keys: follow child_page of last key
```

#### Fanout

```
Internal node fanout (8KB page):
  Usable space: 8192 - 48 (header) - 4 (leftmost_child) = 8140 bytes
  Per key entry: 8 (directory) + key_data_avg bytes
  Example: 8-byte integer key → 8 + 8 = 16 bytes per key → ~508 keys per node
  Example: 32-byte string key → 8 + 32 = 40 bytes per key → ~203 keys per node
```

### Leaf Node Layout (BTREE_LEAF 0x12)

Leaf nodes store key-value pairs. Values are tuple pointers (TIDs) pointing to heap pages.

```
┌──────────┬──────────┬──────────────────────┬───────────────────────┐
│  Page     │  Entry   │   Free Space         │    Key Data +         │
│  Header   │  Directory│                     │    Value (TID)        │
│  (48B)    │  (grows →)│                     │    (grows ←)          │
└──────────┴──────────┴──────────────────────┴───────────────────────┘
```

#### Entry Directory (8 bytes per entry)

```
Offset  Size  Field       Type    Description
──────  ────  ─────       ────    ───────────
0       2     key_off     u16     Byte offset to key data from page start
2       2     key_len     u16     Length of key data in bytes
4       4     tid         u32     Tuple ID: heap page_id (upper 20 bits) + slot (lower 12 bits)
```

**TID Encoding** (4 bytes):

```
Bits 31-12: page_id   (20 bits → max 1M pages = 8GB at 8KB, sufficient for single-file scope)
Bits 11-0:  slot_id   (12 bits → max 4096 slots per page)
```

> **Note**: If 20-bit page_id is insufficient, leaf entries can use an extended 6-byte TID format: `page_id: u32 (4B) + slot_id: u16 (2B)`. This is chosen per-index at creation time via `index_tid_size` (immutable). Default is compact 4-byte TID.

#### Doubly-Linked Leaf Chain

Leaf nodes form a doubly-linked list via the page header's `prev_page` and `next_page` fields. This enables efficient range scans:

```
Range scan [A, Z]:
  1. Tree descent to leaf containing A
  2. Scan entries ≥ A in current leaf
  3. Follow next_page to next leaf
  4. Continue until entry > Z or next_page = 0

Reverse range scan:
  1. Tree descent to leaf containing Z
  2. Scan entries ≤ Z backward in current leaf
  3. Follow prev_page to previous leaf
```

### Node Split

When a node is full and a new entry must be inserted:

```
Internal node split:
  1. Allocate new page (PAGE_ALLOC WAL record FIRST)
  2. Find median key
  3. Move keys > median to new page
  4. Push median key up to parent
  5. Write BTREE_SPLIT WAL record (after PAGE_ALLOC in step 1)
  6. If parent is also full: recursive split (propagate up)

Leaf node split:
  1. Allocate new page
  2. Find split point (median or 90/10 split for sequential inserts)
  3. Move upper half of entries to new page
  4. Update linked list: new_page.next_page = old_page.next_page, old_page.next_page = new_page
  5. Insert separator key in parent internal node
  6. Write BTREE_SPLIT WAL record
```

### Node Merge

When a node drops below ~40% utilization after deletion:

```
1. Check sibling: if sibling utilization < 50%, merge is possible
2. Move all entries from smaller sibling to larger sibling
3. Remove separator key from parent
4. Deallocate empty page (PAGE_DEALLOC)
5. Update linked list pointers (for leaves)
6. Write BTREE_MERGE WAL record
```

### Prefix Compression (Internal Nodes Only)

For string keys, internal node separator keys can be shortened to the minimum prefix that distinguishes left from right subtrees:

```
Left max key: "application_config"
Right min key: "application_data"
Separator: "application_d" (or even shorter if unambiguous)
```

This significantly increases fanout for long string keys.

---

## 10. Undo Page Layout (UNDO_LOG 0x51)

### Overview

Undo pages store previous versions of tuples for MVCC snapshot reads and transaction rollback. Undo pages live in `undo.vdb` (file_id=4) and use the standard 48-byte page header.

### Undo Entry Format

Each undo entry is a self-contained record of a previous tuple version:

```
Offset  Size  Field            Type    Description
──────  ────  ─────            ────    ───────────
0       8     txn_id           u64     Transaction that created this undo entry
8       1     entry_type       u8      0x01=INSERT_UNDO, 0x02=UPDATE_UNDO, 0x03=DELETE_UNDO
9       1     file_id          u8      Original data file
10      4     page_id          u32     Original page
14      2     slot_id          u16     Original slot in heap page
16      8     prev_undo_ptr    u64     Previous undo entry for same tuple (0 = end of chain)
24      4     data_len         u32     Length of old tuple data (0 for INSERT_UNDO)
28      N     old_data         [u8]    Old tuple data (MVCC metadata + user data)
```

**Fixed header: 28 bytes** + variable-length old_data.

### Entry Types

| Type | Value | old_data contains | Purpose |
|------|-------|-------------------|---------|
| INSERT_UNDO | 0x01 | Empty (data_len=0) | Undo an INSERT: delete the tuple |
| UPDATE_UNDO | 0x02 | Previous tuple version (MVCC + user data) | Undo an UPDATE: restore old version |
| DELETE_UNDO | 0x03 | Deleted tuple version (MVCC + user data) | Undo a DELETE: restore tuple |

### Undo Page Internal Layout

```
┌──────────┬────────────┬────────────┬─────┬────────────────────┐
│  Page     │  Undo      │  Undo      │ ... │   Free Space       │
│  Header   │  Entry 1   │  Entry 2   │     │                    │
│  (48B)    │  (var len)  │  (var len)  │     │                    │
└──────────┴────────────┴────────────┴─────┴────────────────────┘
                                            ↑
                                     free_space_offset
```

- Undo entries are appended sequentially (append-only within a page).
- No slot directory needed — entries are accessed via `undo_ptr` which encodes the exact byte offset.
- `free_space_offset` tracks the next write position.
- `item_count` tracks the number of entries in the page.

### Undo Pointer Encoding (Recap)

```
undo_ptr (u64) packing:
  Bits 63-56: file_id    (u8)   — always 4 for undo.vdb
  Bits 55-24: page_id    (u32)  — undo page number
  Bits 23-8:  offset     (u16)  — byte offset within page body
  Bits 7-0:   padding    (u8)   — reserved, must be 0

Decode:
  file_id = (undo_ptr >> 56) & 0xFF
  page_id = (undo_ptr >> 24) & 0xFFFFFFFF
  offset  = (undo_ptr >> 8)  & 0xFFFF
```

### Page Full Handling

When an undo entry doesn't fit in the current page:

```
1. Allocate new undo page from undo.vdb freelist
2. Write undo entry to new page at offset 48
3. Chain: new page's prev_page points to current page (for sequential scan during GC)
```

### Per-Transaction Undo Chain

Each transaction maintains a pointer to its most recent undo entry. On ABORT/rollback:

```
1. Start from transaction's latest undo_ptr
2. Read undo entry → restore old data to original (file_id, page_id, slot_id)
3. Follow prev_undo_ptr to previous entry
4. Repeat until prev_undo_ptr = 0
5. Write CLR for each undo operation
```

### Undo GC

After all active snapshots are past a transaction's commit point:

```
1. Undo entries for that transaction are no longer needed
2. Mark entries as reclaimable (or simply reclaim entire pages when all entries are expired)
3. Return pages to undo.vdb freelist
```

---

## 11. Meta Page Layout (META 0x00)

### Overview

`meta.vdb` stores database-wide metadata: configuration, CLOG, schema catalog pointers, and runtime state. Page 0 of `meta.vdb` is the **database header page** containing critical bootstrap information.

### meta.vdb Page 0: Database Header

```
Offset  Size  Field                  Type      Description
──────  ────  ─────                  ────      ───────────
0       48    page_header            PageHeader Standard page header (page_type=0x00, page_id=0)
48      8     magic                  u64       0x5641495344422031 ("VAISDB 1")
56      4     db_format_version      u32       Database format version (starts at 1)
60      4     page_size              u32       Page size in bytes (8192 or 16384)
64      16    db_uuid                [u8; 16]  Database UUID (generated at CREATE DATABASE)
80      8     creation_timestamp     u64       Unix timestamp in microseconds
88      8     last_checkpoint_lsn    u64       LSN of last completed checkpoint
96      4     clog_first_page        u32       First CLOG page number in meta.vdb
100     4     clog_last_page         u32       Last CLOG page number in meta.vdb
104     4     catalog_root_page      u32       Root page of schema catalog (in data.vdb)
108     4     next_txn_id_page       u32       Page storing the persistent next_txn_id counter
112     4     config_first_page      u32       First page of ALTER SYSTEM config store
116     4     file_layout_version    u32       File layout version (for future migration)
120     8     next_txn_id            u64       Next transaction ID to assign (crash-safe)
128     128   reserved               [u8; 128] Reserved for future fields (must be 0)
```

**Total used: 256 bytes** (48 header + 208 metadata). Remainder of page is reserved.

### data.vdb Page 0: Bootstrap Page

```
Offset  Size  Field                  Type      Description
──────  ────  ─────                  ────      ───────────
0       48    page_header            PageHeader Standard page header (page_type=0x00, page_id=0)
48      8     magic                  u64       0x5641495344422031 ("VAISDB 1") — same magic
56      4     db_format_version      u32       Database format version
60      4     page_size              u32       Page size in bytes
64      32    meta_vdb_path          [u8; 32]  Relative path to meta.vdb ("meta.vdb\0" padded)
96      160   reserved               [u8; 160] Reserved (must be 0)
```

**Total used: 256 bytes.** The bootstrap page contains only enough information to locate `meta.vdb`. All authoritative metadata is in `meta.vdb` page 0.

### Other File Page 0: File Header

`vectors.vdb`, `graph.vdb`, `fulltext.vdb`, `undo.vdb` each have a minimal file header at page 0:

```
Offset  Size  Field                  Type      Description
──────  ────  ─────                  ────      ───────────
0       48    page_header            PageHeader Standard page header (page_type=0x00, page_id=0)
48      8     magic                  u64       0x5641495344422031 ("VAISDB 1")
56      4     db_format_version      u32       Database format version
60      4     page_size              u32       Page size in bytes
64      1     file_id                u8        This file's ID (1=vectors, 2=graph, 3=fulltext, 4=undo)
65      4     total_pages            u32       Total pages allocated in this file
69      4     freelist_page          u32       Page ID of first freelist page (always 1)
73      183   reserved               [u8; 183] Reserved (must be 0)
```

**Total used: 256 bytes.**

### meta.vdb CLOG Region

CLOG pages occupy a contiguous range within `meta.vdb`, tracked by `clog_first_page` and `clog_last_page` in the database header. New CLOG pages are appended as the transaction ID space grows. See Stage 3 Section 3 for CLOG page internals.

### meta.vdb Config Store (ALTER SYSTEM)

ALTER SYSTEM settings are persisted in config store pages within `meta.vdb`, starting at `config_first_page`. Each config entry is a key-value pair:

```
Config Entry:
  key_len:    u16     Setting name length
  key:        [u8]    Setting name (UTF-8)
  value_len:  u16     Setting value length
  value:      [u8]    Setting value (UTF-8)
```

Config entries are stored sequentially in pages. On RELOAD or startup, the entire config store is read into memory. This is a small dataset (typically < 1 page) so no complex indexing is needed.

### Startup Sequence

```
1. Open data.vdb → read page 0 → verify magic → extract page_size → locate meta.vdb path
2. Open meta.vdb → read page 0 → verify magic → load database header
3. Load CLOG pages into cache
4. Load ALTER SYSTEM config store
5. Open remaining files (vectors.vdb, graph.vdb, fulltext.vdb, undo.vdb) → verify headers
6. Begin crash recovery (WAL replay from last_checkpoint_lsn)
7. Accept connections
```

---

## Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| Page header format documented | Done | 48 bytes, naturally aligned, all fields specified |
| format_version included | Done | Offset 47, u8 |
| All page types enumerated | Done | 16 types across 5 engines |
| Page size decision documented | Done | 8KB default, 16KB option |
| File layout documented | Done | Bundle directory with per-engine files + tmp/ |
| meta.vdb vs page 0 clarified | Done | meta.vdb authoritative, page 0 bootstrap only |
| MVCC metadata format documented | Done | 32 bytes, visibility function specified |
| expire_cmd_id field added | Done | Offset 28, u32, same-txn expiration tracking |
| undo_ptr packing corrected | Done | u8 + u32 + u16 + u8 = 64 bits |
| Visibility function pseudocode | Done | Handles same-txn cmd_id/expire_cmd_id, snapshot isolation |
| Visibility function is_aborted fast-path | Done | Short-circuit for aborted txns, expired_by_effective pattern |
| Torn write protection documented | Done | FPI approach (PostgreSQL style) |
| IS_DIRTY flag clarified | Done | In-memory only, not persisted on disk |
| WAL_SEGMENT page type clarified | Done | Reserved; WAL uses own segment header format |
| Extension points identified | Done | Reserved page types, engine tags |
| Heap page internal layout | Done | Slotted page: slot directory (4B/slot) + bottom-up tuple data |
| Freelist page format | Done | Per-file bitmap, 1 bit/page, PAGE_ALLOC/DEALLOC WAL integration |
| B+Tree internal node format | Done | 8B key directory + leftmost_child, sorted keys, prefix compression |
| B+Tree leaf node format | Done | 8B entry directory with TID (4B compact), doubly-linked list |
| Node split/merge strategy | Done | WAL-first allocation, median split, 40% merge threshold |
| Undo page layout | Done | 28B fixed header + variable old_data, append-only, undo_ptr direct addressing |
| Meta page (meta.vdb page 0) | Done | 256B used: magic, UUID, checkpoint LSN, CLOG range, catalog root, config store |
| Bootstrap page (data.vdb page 0) | Done | 256B used: magic, page_size, meta.vdb path |
| Other file headers | Done | 256B: magic, file_id, total_pages, freelist pointer |
| Startup sequence | Done | 7-step: bootstrap → meta → CLOG → config → files → recovery → accept |
| Overflow handling clarified | Done | Tuple-level overflow (per-tuple pointer) vs page-level overflow (page header field) |
| B+Tree split WAL order | Done | PAGE_ALLOC first, then BTREE_SPLIT |
