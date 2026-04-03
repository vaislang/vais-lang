# Stage 7: Vais Implementation Mapping

> **Status**: Design Complete
> **Impact**: Validates that VaisDB can be implemented in pure Vais with C FFI
> **Last Updated**: 2026-02-08

---

## 1. Component-to-Standard-Library Mapping

Every VaisDB component maps to one or more Vais standard library modules. This table documents the mapping and identifies gaps.

| VaisDB Component | Vais std Module | Key Types/Functions Used |
|------------------|-----------------|--------------------------|
| Page I/O | `std/file.vais` | `File.open`, `File.read_at`, `File.write_at`, `File.fsync`, `File.flock` |
| Memory-mapped I/O | `std/file.vais` | `File.mmap`, `File.munmap`, `File.madvise` |
| WAL Writer | `std/file.vais` | Sequential `File.write`, `File.fsync`, `File.fdatasync` |
| Buffer Pool | `std/pool.vais` | `PoolAllocator` for fixed-size page slots |
| Query Arena | `std/arena.vais` | `Arena.new`, `Arena.alloc`, `Arena.destroy` |
| Undo Log | `std/allocator.vais` | `BumpAllocator` for sequential allocation |
| B+Tree | `std/slice.vais` | Binary search on sorted key arrays |
| Hash Join / GROUP BY | `std/hashmap.vais` | `HashMap<Str, V>`, `HashMap<u64, V>` |
| CRC32C Checksum | `std/hash.vais` | `crc32c` (hardware-accelerated via C FFI) |
| Concurrency | `std/sync.vais` | `Mutex`, `RwLock`, `Condvar` |
| Thread Pool | `std/thread.vais` | `Thread.spawn`, `Thread.join` |
| TCP Server | `std/net.vais` | `TcpListener.bind`, `TcpStream.accept` |
| Binary Serialization | `std/bytes.vais` | `ByteBuffer.put_u64_le`, `ByteBuffer.get_u32_le`, etc. |
| String Processing | `std/string.vais` | `Str.split`, `Str.to_lower`, UTF-8 handling |
| Directory Operations | `std/dir.vais` | `Dir.create`, `Dir.list`, `Dir.remove` |
| Timestamp | `std/time.vais` | `Time.now_micros` for WAL timestamps |
| Random | `std/random.vais` | `Random.uniform` for HNSW layer selection |
| Sorting | `std/sort.vais` | `sort`, `sort_by` for in-memory sorts |

---

## 2. Gap Analysis

### Gaps Requiring C FFI

| Gap | Required For | Solution | C Function |
|-----|-------------|----------|------------|
| `pread` / `pwrite` | Page I/O at arbitrary offset without seek | `extern "C"` FFI wrapper | `pread(fd, buf, count, offset)` |
| SIMD distance calc | Vector cosine/L2/dot product | C FFI to SIMD intrinsics | Custom `simd_cosine_f32(a, b, dim)` |
| `mmap` / `munmap` | Memory-mapped page access | `extern "C"` FFI wrapper | `mmap(addr, len, prot, flags, fd, offset)` |
| `madvise` | Prefetch hints for sequential scan | `extern "C"` FFI wrapper | `madvise(addr, len, advice)` |
| `fdatasync` | WAL flush (metadata not needed) | `extern "C"` FFI wrapper | `fdatasync(fd)` |
| CRC32C hardware | Checksum computation | C FFI to hardware CRC instruction | `_mm_crc32_u64` (x86) / `__crc32cd` (ARM) |
| AES-256-CTR | Encryption at rest | C FFI to crypto library | OpenSSL or libsodium |

### Vais std Library Support

All previously identified gaps have been resolved in Vais v1.0.0+:

| Feature | Module | Status |
|---------|--------|--------|
| `fsync` | `std/file.vais` | ✅ Available |
| `flock` | `std/file.vais` | ✅ Available |
| String-keyed HashMap | `std/hashmap.vais` | ✅ Available |
| Binary serialization | `std/bytes.vais` | ✅ Available |
| Directory operations | `std/dir.vais` | ✅ Available |
| Allocator state mutation | `std/allocator.vais` | ✅ Available |

---

## 3. Serialization Patterns

### ByteBuffer-Based Page Header Serialization

All on-disk structures use `ByteBuffer` for portable, endian-correct serialization:

```vais
S PageHeader {
    page_lsn: u64,
    txn_id: u64,
    page_id: u32,
    checksum: u32,
    prev_page: u32,
    next_page: u32,
    overflow_page: u32,
    free_space_offset: u16,
    item_count: u16,
    flags: u16,
    reserved: u16,
    page_type: u8,
    engine_tag: u8,
    compression_algo: u8,
    format_version: u8,
}

I PageHeader {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u64_le(self.page_lsn);
        buf.put_u64_le(self.txn_id);
        buf.put_u32_le(self.page_id);
        buf.put_u32_le(self.checksum);
        buf.put_u32_le(self.prev_page);
        buf.put_u32_le(self.next_page);
        buf.put_u32_le(self.overflow_page);
        buf.put_u16_le(self.free_space_offset);
        buf.put_u16_le(self.item_count);
        buf.put_u16_le(self.flags);
        buf.put_u16_le(self.reserved);
        buf.put_u8(self.page_type);
        buf.put_u8(self.engine_tag);
        buf.put_u8(self.compression_algo);
        buf.put_u8(self.format_version);
    }

    F deserialize(buf: &ByteBuffer) -> Result<PageHeader, Error> {
        Ok(PageHeader {
            page_lsn: buf.get_u64_le()?,
            txn_id: buf.get_u64_le()?,
            page_id: buf.get_u32_le()?,
            checksum: buf.get_u32_le()?,
            prev_page: buf.get_u32_le()?,
            next_page: buf.get_u32_le()?,
            overflow_page: buf.get_u32_le()?,
            free_space_offset: buf.get_u16_le()?,
            item_count: buf.get_u16_le()?,
            flags: buf.get_u16_le()?,
            reserved: buf.get_u16_le()?,
            page_type: buf.get_u8()?,
            engine_tag: buf.get_u8()?,
            compression_algo: buf.get_u8()?,
            format_version: buf.get_u8()?,
        })
    }
}
```

### WAL Record Header Serialization

```vais
S WalRecordHeader {
    lsn: u64,
    txn_id: u64,
    prev_lsn: u64,
    timestamp: u64,
    record_length: u32,
    checksum: u32,
    record_type: u8,
    engine_type: u8,
    reserved: [u8; 6],
}

I WalRecordHeader {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u64_le(self.lsn);
        buf.put_u64_le(self.txn_id);
        buf.put_u64_le(self.prev_lsn);
        buf.put_u64_le(self.timestamp);
        buf.put_u32_le(self.record_length);
        buf.put_u32_le(self.checksum);
        buf.put_u8(self.record_type);
        buf.put_u8(self.engine_type);
        buf.put_bytes(&self.reserved);
    }
}
```

### String Serialization (Length-Prefixed)

```vais
F write_string(buf: &~ByteBuffer, s: &Str) {
    ~bytes = s.as_bytes();
    buf.put_u32_le(bytes.len() as u32);
    buf.put_bytes(bytes);
}

F read_string(buf: &ByteBuffer) -> Result<Str, Error> {
    ~len = buf.get_u32_le()? as usize;
    ~bytes = buf.get_bytes(len)?;
    Str.from_utf8(bytes)
}
```

### MVCC Tuple Metadata Serialization (32 bytes)

```vais
S MvccTupleMeta {
    txn_id_create: u64,
    txn_id_expire: u64,
    undo_ptr: u64,
    cmd_id: u32,
    expire_cmd_id: u32,
}

I MvccTupleMeta {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u64_le(self.txn_id_create);
        buf.put_u64_le(self.txn_id_expire);
        buf.put_u64_le(self.undo_ptr);
        buf.put_u32_le(self.cmd_id);
        buf.put_u32_le(self.expire_cmd_id);
    }

    F deserialize(buf: &ByteBuffer) -> Result<MvccTupleMeta, Error> {
        Ok(MvccTupleMeta {
            txn_id_create: buf.get_u64_le()?,
            txn_id_expire: buf.get_u64_le()?,
            undo_ptr: buf.get_u64_le()?,
            cmd_id: buf.get_u32_le()?,
            expire_cmd_id: buf.get_u32_le()?,
        })
    }
}
```

### AdjEntry Serialization (42 bytes, packed)

```vais
S AdjEntry {
    target_node: u64,
    edge_id: u64,
    edge_type: u16,
    txn_id_create: u64,
    txn_id_expire: u64,
    cmd_id: u32,
    expire_cmd_id: u32,
}

I AdjEntry {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u64_le(self.target_node);
        buf.put_u64_le(self.edge_id);
        buf.put_u16_le(self.edge_type);
        buf.put_u64_le(self.txn_id_create);
        buf.put_u64_le(self.txn_id_expire);
        buf.put_u32_le(self.cmd_id);
        buf.put_u32_le(self.expire_cmd_id);
    }

    F deserialize(buf: &ByteBuffer) -> Result<AdjEntry, Error> {
        Ok(AdjEntry {
            target_node: buf.get_u64_le()?,
            edge_id: buf.get_u64_le()?,
            edge_type: buf.get_u16_le()?,
            txn_id_create: buf.get_u64_le()?,
            txn_id_expire: buf.get_u64_le()?,
            cmd_id: buf.get_u32_le()?,
            expire_cmd_id: buf.get_u32_le()?,
        })
    }
}
```

> **Note:** AdjEntry uses packed (serialized) layout — no padding between fields. The `edge_type: u16` between two u64 fields is intentional since this is an on-disk format read/written via ByteBuffer, not pointer-cast.

### PostingEntry Serialization (variable length)

```vais
S PostingEntry {
    doc_id: u64,
    term_freq: u32,
    positions: Vec<u32>,
    txn_id_create: u64,
    txn_id_expire: u64,
    cmd_id: u32,
    expire_cmd_id: u32,
}

I PostingEntry {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u64_le(self.doc_id);
        buf.put_u32_le(self.term_freq);
        buf.put_u32_le(self.positions.len() as u32);
        for pos in self.positions {
            buf.put_u32_le(pos);
        }
        buf.put_u64_le(self.txn_id_create);
        buf.put_u64_le(self.txn_id_expire);
        buf.put_u32_le(self.cmd_id);
        buf.put_u32_le(self.expire_cmd_id);
    }
}
```

### WAL Segment Header Serialization (32 bytes)

```vais
S WalSegmentHeader {
    magic: u32,             // 0x56414C57 ("VALW")
    segment_number: u32,
    first_lsn: u64,
    last_lsn: u64,
    format_version: u32,
    checksum: u32,
}

I WalSegmentHeader {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u32_le(self.magic);
        buf.put_u32_le(self.segment_number);
        buf.put_u64_le(self.first_lsn);
        buf.put_u64_le(self.last_lsn);
        buf.put_u32_le(self.format_version);
        buf.put_u32_le(self.checksum);
    }

    F deserialize(buf: &ByteBuffer) -> Result<WalSegmentHeader, Error> {
        Ok(WalSegmentHeader {
            magic: buf.get_u32_le()?,
            segment_number: buf.get_u32_le()?,
            first_lsn: buf.get_u64_le()?,
            last_lsn: buf.get_u64_le()?,
            format_version: buf.get_u32_le()?,
            checksum: buf.get_u32_le()?,
        })
    }
}
```

### CLOG Page Access Helper

```vais
S ClogPage {
    data: [u8; PAGE_BODY_SIZE],  // PAGE_SIZE - 48 (header)
}

// Transaction status values (2 bits each)
L TxnStatus = InProgress(0u8) | Committed(1u8) | Aborted(2u8) | Reserved(3u8);

I ClogPage {
    F get_status(self, txn_id: u64, txns_per_page: u64) -> TxnStatus {
        ~local_id = txn_id % txns_per_page;
        ~byte_offset = (local_id / 4) as usize;
        ~bit_offset = ((local_id % 4) * 2) as u8;
        ~bits = (self.data[byte_offset] >> bit_offset) & 0b11;
        TxnStatus.from_u8(bits)
    }

    F set_status(~self, txn_id: u64, txns_per_page: u64, status: TxnStatus) {
        ~local_id = txn_id % txns_per_page;
        ~byte_offset = (local_id / 4) as usize;
        ~bit_offset = ((local_id % 4) * 2) as u8;
        ~mask = !(0b11u8 << bit_offset);
        self.data[byte_offset] = (self.data[byte_offset] & mask) | (status.to_u8() << bit_offset);
    }
}
```

### HeapPageSlot Serialization (4 bytes, slot directory entry)

```vais
S HeapPageSlot {
    tuple_off: u16,    // Offset from page start to tuple data
    tuple_len: u16,    // Tuple length (including MVCC header)
}

I HeapPageSlot {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u16_le(self.tuple_off);
        buf.put_u16_le(self.tuple_len);
    }

    F deserialize(buf: &ByteBuffer) -> Result<HeapPageSlot, Error> {
        Ok(HeapPageSlot {
            tuple_off: buf.get_u16_le()?,
            tuple_len: buf.get_u16_le()?,
        })
    }
}
```

### UndoEntry Serialization (28 byte fixed header + variable data)

```vais
S UndoEntry {
    txn_id: u64,           // Transaction ID that created this undo entry
    entry_type: u8,        // 0x01=INSERT_UNDO, 0x02=UPDATE_UNDO, 0x03=DELETE_UNDO
    file_id: u8,           // File ID (heap.vdb, vector.vdb, graph.vdb, etc.)
    page_id: u32,          // Page ID within the file
    slot_id: u16,          // Slot ID within the page
    prev_undo_ptr: u64,    // Pointer to previous undo entry in chain
    data_len: u32,         // Length of old_data
    old_data: Vec<u8>,     // Old tuple data (for UPDATE/DELETE)
}

I UndoEntry {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u64_le(self.txn_id);
        buf.put_u8(self.entry_type);
        buf.put_u8(self.file_id);
        buf.put_u32_le(self.page_id);
        buf.put_u16_le(self.slot_id);
        buf.put_u64_le(self.prev_undo_ptr);
        buf.put_u32_le(self.data_len);
        buf.put_bytes(&self.old_data);
    }

    F deserialize(buf: &ByteBuffer) -> Result<UndoEntry, Error> {
        ~txn_id = buf.get_u64_le()?;
        ~entry_type = buf.get_u8()?;
        ~file_id = buf.get_u8()?;
        ~page_id = buf.get_u32_le()?;
        ~slot_id = buf.get_u16_le()?;
        ~prev_undo_ptr = buf.get_u64_le()?;
        ~data_len = buf.get_u32_le()?;
        ~old_data = buf.get_bytes(data_len as usize)?;
        Ok(UndoEntry {
            txn_id,
            entry_type,
            file_id,
            page_id,
            slot_id,
            prev_undo_ptr,
            data_len,
            old_data,
        })
    }
}
```

### FreelistBitmap Helpers

```vais
S FreelistBitmap {
    data: [u8; PAGE_BODY_SIZE],  // PAGE_SIZE - 48 (header)
}

I FreelistBitmap {
    // Calculate how many pages can be tracked per bitmap page
    F pages_per_bitmap_page(page_size: u32) -> u32 {
        (page_size - 48) * 8  // Each byte tracks 8 pages (1 bit per page)
    }

    // Get bit for page_id (true = free, false = allocated)
    F get_bit(self, page_id: u32, pages_per_bitmap: u32) -> bool {
        ~local_id = page_id % pages_per_bitmap;
        ~byte_offset = (local_id / 8) as usize;
        ~bit_offset = (local_id % 8) as u8;
        (self.data[byte_offset] & (1u8 << bit_offset)) != 0
    }

    // Set bit for page_id (true = free, false = allocated)
    F set_bit(~self, page_id: u32, pages_per_bitmap: u32, free: bool) {
        ~local_id = page_id % pages_per_bitmap;
        ~byte_offset = (local_id / 8) as usize;
        ~bit_offset = (local_id % 8) as u8;
        if free {
            self.data[byte_offset] |= (1u8 << bit_offset);
        } else {
            self.data[byte_offset] &= !(1u8 << bit_offset);
        }
    }
}
```

### BTreeInternalEntry Serialization (8 byte directory + variable key)

```vais
S BTreeInternalEntry {
    key_off: u16,      // Offset from page body start to key data
    key_len: u16,      // Key length
    child_page: u32,   // Child page ID
}

I BTreeInternalEntry {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u16_le(self.key_off);
        buf.put_u16_le(self.key_len);
        buf.put_u32_le(self.child_page);
    }

    F deserialize(buf: &ByteBuffer) -> Result<BTreeInternalEntry, Error> {
        Ok(BTreeInternalEntry {
            key_off: buf.get_u16_le()?,
            key_len: buf.get_u16_le()?,
            child_page: buf.get_u32_le()?,
        })
    }
}

S BTreeInternalNode {
    leftmost_child: u32,              // Page ID of leftmost child
    entries: Vec<BTreeInternalEntry>, // Sorted entries (key + child_page)
}

I BTreeInternalNode {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u32_le(self.leftmost_child);
        buf.put_u32_le(self.entries.len() as u32);
        for entry in self.entries {
            entry.serialize(buf);
        }
    }
}
```

### BTreeLeafEntry Serialization (8 byte directory + variable key)

```vais
S BTreeLeafEntry {
    key_off: u16,      // Offset from page body start to key data
    key_len: u16,      // Key length
    tid: u32,          // Tuple ID (encoded page_id + slot_id)
}

I BTreeLeafEntry {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u16_le(self.key_off);
        buf.put_u16_le(self.key_len);
        buf.put_u32_le(self.tid);
    }

    F deserialize(buf: &ByteBuffer) -> Result<BTreeLeafEntry, Error> {
        Ok(BTreeLeafEntry {
            key_off: buf.get_u16_le()?,
            key_len: buf.get_u16_le()?,
            tid: buf.get_u32_le()?,
        })
    }

    // TID encoding helpers: upper 20 bits = page_id, lower 12 bits = slot_id
    // Supports up to 1M pages (2^20) and 4096 slots/page (2^12)
    F encode_tid(page_id: u32, slot_id: u16) -> u32 {
        ((page_id & 0xFFFFF) << 12) | ((slot_id & 0xFFF) as u32)
    }

    F decode_tid(tid: u32) -> (u32, u16) {
        ~page_id = (tid >> 12) & 0xFFFFF;
        ~slot_id = (tid & 0xFFF) as u16;
        (page_id, slot_id)
    }
}
```

### MetaPageHeader Serialization (96 bytes, database header)

```vais
S MetaPageHeader {
    magic: u64,                   // 0x5641495344422031 ("VAISDB 1")
    db_format_version: u32,       // Database format version (1)
    page_size: u32,               // Page size in bytes (8192 or 16384)
    db_uuid: [u8; 16],            // Database UUID
    creation_timestamp: u64,      // Unix timestamp (microseconds)
    last_checkpoint_lsn: u64,     // LSN of last checkpoint
    clog_first_page: u32,         // First CLOG page ID
    clog_last_page: u32,          // Last CLOG page ID
    catalog_root_page: u32,       // Root page of catalog B+Tree
    next_txn_id_page: u32,        // Page storing next_txn_id counter
    config_first_page: u32,       // First config page ID
    file_layout_version: u32,     // File layout version (1)
    next_txn_id: u64,             // Next transaction ID
    reserved: [u8; 128],          // Reserved for future fields (must be 0)
}

// Total serialized size: 48 (page header) + 80 (fields above) + 128 (reserved) = 256 bytes
// Matches Stage 1 Section 11 meta.vdb page 0 layout

I MetaPageHeader {
    F serialize(self, buf: &~ByteBuffer) {
        buf.put_u64_le(self.magic);
        buf.put_u32_le(self.db_format_version);
        buf.put_u32_le(self.page_size);
        buf.put_bytes(&self.db_uuid);
        buf.put_u64_le(self.creation_timestamp);
        buf.put_u64_le(self.last_checkpoint_lsn);
        buf.put_u32_le(self.clog_first_page);
        buf.put_u32_le(self.clog_last_page);
        buf.put_u32_le(self.catalog_root_page);
        buf.put_u32_le(self.next_txn_id_page);
        buf.put_u32_le(self.config_first_page);
        buf.put_u32_le(self.file_layout_version);
        buf.put_u64_le(self.next_txn_id);
        buf.put_bytes(&self.reserved);
    }

    F deserialize(buf: &ByteBuffer) -> Result<MetaPageHeader, Error> {
        ~magic = buf.get_u64_le()?;
        if magic != 0x5641495344422031 {
            return Err(Error.new("Invalid VaisDB magic number"));
        }
        Ok(MetaPageHeader {
            magic,
            db_format_version: buf.get_u32_le()?,
            page_size: buf.get_u32_le()?,
            db_uuid: buf.get_bytes(16)?.try_into()?,
            creation_timestamp: buf.get_u64_le()?,
            last_checkpoint_lsn: buf.get_u64_le()?,
            clog_first_page: buf.get_u32_le()?,
            clog_last_page: buf.get_u32_le()?,
            catalog_root_page: buf.get_u32_le()?,
            next_txn_id_page: buf.get_u32_le()?,
            config_first_page: buf.get_u32_le()?,
            file_layout_version: buf.get_u32_le()?,
            next_txn_id: buf.get_u64_le()?,
            reserved: buf.get_bytes(128)?.try_into()?,
        })
    }
}
```

---

## 4. Memory Management Strategy Summary

See [Stage 4: Memory Architecture, Section 7](stage4-memory-architecture.md#7-vais-memory-management-strategy) for the detailed per-component allocation strategy.

Key patterns:
- **Buffer Pool**: `PoolAllocator` with fixed-size page slots
- **Query Execution**: `Arena` per query (bulk-free on completion)
- **WAL Buffer**: Single fixed `malloc` (16MB, never resized)
- **Undo Log**: `BumpAllocator` per transaction
- **Resource Cleanup**: `defer` on all exit paths

---

## 5. SIMD Strategy for Vector Distance

Vector distance computation is the single most performance-critical operation in VaisDB. It must use SIMD for production viability.

### Architecture-Specific Implementation

```
Architecture  ISA Extension     Expected Speedup    C FFI Function
────────────  ─────────────     ────────────────    ──────────────
ARM (Apple)   NEON              8-10x               simd_cosine_neon_f32
x86-64        SSE4.2 + AVX2    8-12x               simd_cosine_avx2_f32
x86-64        AVX-512          12-16x              simd_cosine_avx512_f32
Fallback      None             1x (baseline)        cosine_scalar_f32
```

### Runtime Dispatch

```vais
// Detect SIMD capability at startup, select function pointer
~distance_fn: F(&[f32], &[f32]) -> f32 = I {
    if cpu_has_avx512()  { simd_cosine_avx512_f32 }
    else if cpu_has_avx2() { simd_cosine_avx2_f32 }
    else if cpu_has_neon() { simd_cosine_neon_f32 }
    else { cosine_scalar_f32 }
};
```

### C FFI Wrapper

```c
// simd_distance.c — compiled separately, linked via Vais C FFI
#include <immintrin.h>

float simd_cosine_avx2_f32(const float* a, const float* b, uint32_t dim) {
    __m256 sum_ab = _mm256_setzero_ps();
    __m256 sum_aa = _mm256_setzero_ps();
    __m256 sum_bb = _mm256_setzero_ps();

    for (uint32_t i = 0; i < dim; i += 8) {
        __m256 va = _mm256_loadu_ps(a + i);
        __m256 vb = _mm256_loadu_ps(b + i);
        sum_ab = _mm256_fmadd_ps(va, vb, sum_ab);
        sum_aa = _mm256_fmadd_ps(va, va, sum_aa);
        sum_bb = _mm256_fmadd_ps(vb, vb, sum_bb);
    }

    // horizontal sum and compute cosine distance
    float dot = hsum_avx2(sum_ab);
    float norm_a = sqrtf(hsum_avx2(sum_aa));
    float norm_b = sqrtf(hsum_avx2(sum_bb));
    return 1.0f - (dot / (norm_a * norm_b + 1e-8f));
}
```

---

## 6. Implementation Feasibility Assessment

### Verdict: Implementable

VaisDB can be fully implemented in Vais with C FFI for the following reasons:

1. **Storage Layer**: All page I/O uses `pread`/`pwrite` (C FFI) or `File.read_at`/`File.write_at` (std). Binary serialization via `ByteBuffer` eliminates endianness and alignment issues.

2. **Concurrency**: `std/sync.vais` provides `Mutex`, `RwLock`, and `Condvar`. Thread spawning via `std/thread.vais`. This covers all concurrency primitives needed for buffer pool, WAL writer, and query execution.

3. **Memory Management**: Vais's ownership model with `defer` ensures resource safety. Arena and pool allocators from `std/allocator.vais` and `std/arena.vais` match the allocation patterns of database components.

4. **Networking**: `std/net.vais` provides TCP server capabilities for client/server mode.

5. **Performance-Critical Paths**: SIMD distance computation and CRC32C checksums are delegated to C FFI, matching the pattern used by databases like SQLite (written in C, called from higher-level languages).

### Risk Areas

| Risk | Mitigation |
|------|-----------|
| Vais runtime changes | Monitor Vais std updates; C FFI wrappers as fallback if needed |
| SIMD portability | Runtime dispatch with scalar fallback; C FFI isolates platform differences |
| GC pressure from Vais runtime | Arena/pool allocators minimize GC involvement for hot paths |
| Missing profiling tools | Use C-level profilers (perf, Instruments) via extern symbols |

---

## Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| Component-to-std mapping | Done | All components mapped to Vais std or C FFI |
| Gap analysis | Done | 7 C FFI gaps, std gaps resolved (Vais v1.0.0+) |
| Serialization patterns | Done | All on-disk structs: PageHeader, WAL header, MVCC tuple, AdjEntry, PostingEntry, WAL segment header, CLOG, HeapPageSlot, UndoEntry, FreelistBitmap, BTreeInternalEntry, BTreeLeafEntry, MetaPageHeader |
| Memory management strategy | Done | Cross-referenced with Stage 4 Section 7 |
| SIMD strategy | Done | Runtime dispatch, C FFI wrappers |
| Feasibility assessment | Done | Implementable with documented risks |
| Cross-doc consistency (Stage 10) | Done | Magic number, page_size, entry_type, reserved field aligned with Stage 1 |
