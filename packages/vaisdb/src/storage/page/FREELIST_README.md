# Freelist Bitmap and Page Allocator Implementation

## Overview

This implementation provides a per-file bitmap-based freelist for tracking free pages across VaisDB's five data files (data.vdb, vectors.vdb, graph.vdb, fulltext.vdb, undo.vdb).

## Architecture

Based on **Stage 1 Section 8: Free Page Management** from the VaisDB architecture documentation.

### Key Design Decisions

1. **Per-File Freelists**: Each file maintains its own freelist at page 1, avoiding cross-file locking
2. **Bitmap Representation**: 1 bit per page (0=allocated, 1=free)
3. **Capacity**: Each 8KB freelist page tracks 65,168 pages (~507MB of data at 8KB/page)
4. **Sequential Allocation**: `last_alloc_position` hint provides locality for better read-ahead
5. **Bulk Allocation**: Support for allocating multiple contiguous/near-contiguous pages

## File Structure

### 1. freelist.vais

**Core Type**: `FreelistBitmap`
- Fixed-size array: `[u8; PAGE_BODY_SIZE_8K]` (8144 bytes)
- Tracks up to 65,152 pages per bitmap

**Key Functions**:
- `pages_per_bitmap_page(page_size: u32) -> u32` - Calculate capacity
- `get_bit(page_id, pages_per_bitmap) -> bool` - Check if page is free
- `set_bit(page_id, pages_per_bitmap, free: bool)` - Mark page allocated/free
- `find_first_free_fast(pages_per_bitmap, start_hint) -> Option<u32>` - Fast byte-level scan
- `count_free(pages_per_bitmap) -> u32` - Count free pages using bit population count
- `allocate_bulk(pages_per_bitmap, count) -> Vec<u32>` - Allocate multiple pages

**Serialization**:
- `write_to_page()` - Write to full page buffer with 48B header + bitmap data
- `read_from_page()` - Read from full page buffer
- Includes page header with correct `page_type` (FREELIST 0x01) and `engine_tag` (COMMON 0x00)

### 2. allocator.vais

**Core Types**:
- `FileAllocState` - Per-file allocation state tracking
- `PageAllocator` - Main allocator coordinating all files
- `ThreadSafeAllocator` - Mutex-wrapped thread-safe version

**FileAllocState**:
- `file_id: u8` - Which file (0-4)
- `last_alloc_position: u32` - Sequential allocation hint
- `total_pages: u32` - Current file size in pages
- `freelist_pages: u32` - Number of freelist pages in chain
- `freelist_head: u32` - First freelist page (always 1)

**PageAllocator Key Functions**:
- `allocate_page(file_id, bitmap) -> Result<u32>` - Allocate single page
- `deallocate_page(file_id, page_id, bitmap) -> Result<()>` - Free single page
- `allocate_bulk(file_id, count, bitmap) -> Result<Vec<u32>>` - Bulk allocation
- `needs_extension(file_id, bitmap) -> bool` - Check if file needs growth
- `mark_extended_pages_free(file_id, old_total, new_total, bitmap)` - After file extension
- `get_stats(file_id, bitmap) -> AllocStats` - Query utilization

**Design Notes**:
- Simplified version: Real implementation would integrate with buffer pool for I/O
- Allocation writes are WAL-logged via `PAGE_ALLOC` (0x07) and `PAGE_DEALLOC` (0x08) records
- Thread safety provided via `Mutex<PageAllocator>` wrapper

### 3. overflow.vais

**Core Types**:
- `OverflowPointer` - 8-byte inline pointer (page_id + total_len)
- `OverflowPage` - Single page in overflow chain

**Key Functions**:
- `write_overflow_data()` - Write large data across multiple overflow pages
- `read_overflow_data()` - Read complete data from overflow chain
- `free_overflow_chain()` - Deallocate entire chain
- `overflow_pages_needed()` - Calculate pages required
- `needs_overflow()` - Check if data exceeds inline threshold
- `split_for_overflow()` - Split into inline + overflow portions

**Overflow Chain Structure**:
```
Main Page:
  ┌─────────────────────────────┐
  │ MVCC metadata (32B)         │
  │ Inline data prefix (≥64B)   │
  │ OverflowPointer (8B):       │
  │   - overflow_page_id: u32   │
  │   - overflow_total_len: u32 │
  └─────────────────────────────┘

Overflow Page 1:
  ┌─────────────────────────────┐
  │ PageHeader (48B)            │
  │   next_page -> page_id_2    │
  │ Data chunk 1 (8144B)        │
  └─────────────────────────────┘

Overflow Page 2:
  ┌─────────────────────────────┐
  │ PageHeader (48B)            │
  │   next_page -> NULL_PAGE    │
  │ Data chunk 2 (remaining)    │
  └─────────────────────────────┘
```

**Design Notes**:
- Pages chained via `next_page` field in PageHeader
- Last page has `next_page = NULL_PAGE (0)`
- Maximum data per overflow page: `PAGE_SIZE - 48` bytes
- Safety limit: Max 1000 pages per chain to prevent infinite loops
- Inline threshold: Store at least 64 bytes inline for indexing

## Usage Example

```vais
# Initialize allocator
~allocator = PageAllocator.new(8192);  # 8KB pages
~bitmap = FreelistBitmap.new_all_free();

# Allocate a single page
~page_id = allocator.allocate_page(FILE_ID_DATA, &bitmap)?;
# Returns: page_id = 2 (first allocatable page after meta/freelist)

# Allocate 10 pages for bulk insert
~page_ids = allocator.allocate_bulk(FILE_ID_VECTORS, 10, &bitmap)?;
# Returns: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] (contiguous if possible)

# Check if file needs extension
if allocator.needs_extension(FILE_ID_DATA, &bitmap) {
    # Extend file by 256 pages
    # ... physical file extension code ...
    allocator.mark_extended_pages_free(FILE_ID_DATA, old_total, new_total, &bitmap)?;
}

# Deallocate a page (after zeroing)
allocator.deallocate_page(FILE_ID_DATA, page_id, &bitmap)?;

# Query statistics
~stats = allocator.get_stats(FILE_ID_DATA, &bitmap)?;
# stats.utilization_percent = 85%
```

## Integration with Buffer Pool

This implementation is **simplified** for initial implementation. In the full system:

1. **Buffer Pool Integration**:
   - `allocate_page()` would pin the freelist page in buffer pool
   - All freelist modifications would dirty the page in buffer pool
   - Freelist page would be flushed to disk via checkpoint protocol

2. **WAL Integration**:
   - `PAGE_ALLOC` (0x07) record before marking page allocated
   - `PAGE_DEALLOC` (0x08) record before marking page free
   - WAL records ensure crash recovery can rebuild freelist state

3. **Concurrency**:
   - Per-file mutex protects freelist bitmap modifications
   - Buffer pool latching prevents concurrent freelist page access
   - Lock order: buffer pool latch → allocator mutex (to prevent deadlock)

4. **File Extension**:
   - Physical file extended via `ftruncate()` or `fallocate()`
   - New freelist page allocated and chained if needed
   - All new pages marked free in bitmap
   - File header updated with new total_pages count

## Testing Notes

To test this implementation:

1. **Unit Tests** (freelist.vais):
   - Bit manipulation correctness
   - Sequential allocation with hint
   - Bulk allocation fills contiguous blocks
   - Count free pages after allocation/deallocation
   - Serialization round-trip

2. **Unit Tests** (allocator.vais):
   - Allocate pages until full, verify err_freelist_empty
   - Deallocate and reallocate same pages
   - Bulk allocation of 1000 pages
   - Statistics accuracy

3. **Unit Tests** (overflow.vais):
   - Write/read small overflow (1 page)
   - Write/read large overflow (100 pages)
   - Free chain and verify pages returned to freelist
   - Split data at inline threshold

4. **Integration Tests**:
   - Allocate from all 5 files concurrently
   - File extension when freelist exhausted
   - Crash recovery: partial allocation WAL replay
   - Concurrent allocation from multiple threads

## Performance Characteristics

- **Allocation**: O(n) worst case (scan bitmap), O(1) amortized with hint
- **Deallocation**: O(1) - direct bit flip
- **Bulk Allocation**: O(n*k) where k = pages requested, n = bitmap size
- **Count Free**: O(n) - full bitmap scan
- **Find First Free (Fast)**: O(n/8) - byte-level scan, ~8x faster than bit-by-bit

## Memory Usage

Per allocator instance:
- 5 × `FileAllocState` = 5 × 24 bytes = 120 bytes
- Metadata = ~32 bytes
- **Total**: ~152 bytes

Per freelist bitmap:
- 8144 bytes (one page body) when in memory
- Tracks up to 65,152 pages (~507MB of data at 8KB/page)

## Future Enhancements

1. **Freelist Chaining**: Support multiple freelist pages for files >507MB
2. **Buddy Allocator**: For better contiguous allocation
3. **Extent-Based Allocation**: Allocate in 1MB extents instead of individual pages
4. **Free Space Map**: PostgreSQL-style two-level bitmap for large databases
5. **Async Extension**: Pre-allocate pages in background to avoid allocation stalls
