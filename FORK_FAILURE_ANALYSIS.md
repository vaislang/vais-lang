# VaisDB Fork Test Failure Analysis (55 fails)

## Overview
- **Total failures**: 55
- **Test files affected**: 5 modules
- **Build/IR**: Produces IR; 0/11 pass clang (type mismatches)
- **Root cause**: Compiler type propagation bugs + IR codegen issues

---

## Failure Breakdown by Category

### 1. VECTOR ENGINE: 1 Failure
**File**: `tests/vector/test_vector.vais`

**Failing test**: Unknown (unwrap panic)
- **Line**: Unknown `panic!("Wrong metric")` or similar
- **Root cause**: Compiler bug with pattern match codegen
- **Type**: **COMPILER BUG** (unfixable without compiler fix)

**Symptoms**:
- `M` (match) statement likely generates incorrect IR
- Unwrap on Option/Result panics unexpectedly
- Pattern match arms have type inference issues

**Workaround**: Rewrite match to if-else chains (CLAUDE.md known issue: "M inside I {} returns pointer, not value")

---

### 2. PLANNER ENGINE: 15 Failures
**File**: `tests/planner/test_planner.vais`

**Failing tests** (estimated):
1. `it("name returns correct string for each variant")`
2. `it("total returns weighted sum of IO and CPU")`
3-15. Various struct serialization, HybridCost methods, EngineBreakdown

**Common failure patterns**:

#### Pattern A: String Equality (str_eq) — 3-4 fails
```vais
assert_eq(EngineType.Sql.name(), "sql");
```
- **Root cause**: Compiler's `Str` comparison bug or method return type mismatch
- **IR issue**: Likely `store i64 <struct_return>` where should be `store Str`
- **Fixable by**: IR post-processor Fix D (store type mismatch) or workaround

#### Pattern B: Struct Serialization — 8-10 fails
```vais
HybridCost.add(&b)  // returns HybridCost struct
cost.engine_breakdown()  // returns Vec<EngineBreakdown>
restored := HybridCost.deserialize(...)!  // Result type issues
```
- **Root cause**: 
  - Aggregate type codegen returns i64 instead of struct
  - Result<struct> returns as i64 with embedded error code
  - Vec<struct> element access returns i64 (codegen erasure)
- **IR issues**:
  - `extractvalue { type, ... } %i64_var` (Fix E) — i64 being used as aggregate
  - `call <struct_type> @func()` returning i64
- **Fixable by**: 
  - IR post-processor Fix E (extractvalue with i64)
  - Fix F (call with wrong return type)
  - VaisDB workaround: avoid `.add()` method; use inline cost addition

---

### 3. FULLTEXT ENGINE: 10 Failures
**File**: `tests/fulltext/test_fulltext.vais`

**Failing tests**:
1-5. Tokenizer tests (5 fails)
   - `it("should tokenize simple text")` — tokens[0].term access
   - `it("should lowercase tokens")` 
   - `it("should track token positions")` — tokens[i].position
   - Similar 2-3 more tokenizer tests

6-10. Compression tests (5 fails)
   - `it("should encode and decode a posting list")` — decoded[0].doc_id access
   - `it("should handle single entry")` — entry.doc_id
   - `it("should handle entries with no positions")`
   - Similar 2 more compression tests

**Common failure patterns**:

#### Pattern A: Vec<TokenInfo> element access — 5 fails
```vais
tokens := tokenizer.tokenize(&"hello world");
assert_eq(tokens[0].term, "hello");  // FAIL
```
- **Root cause**: Compiler Vec<struct> generic erasure
  - Elements stored as i64 in codegen
  - `.term` field access from i64 fails
- **IR issue**: Load from Vec yields i64, then struct field access fails
- **CLAUDE.md reference**: "Vec<struct> generic erasure: elements stored as i64 in codegen"
- **Fixable by**:
  - IR post-processor: Could add Vec element reconstruction (alloca + bitcast + load)
  - VaisDB workaround: Change Vec<TokenInfo> to HashMap<usize, TokenInfo> or wrap in Option

#### Pattern B: Vec<PostingEntryCompact> element access — 5 fails
```vais
entries := vec![PostingEntryCompact { ... }];
decoded := decode_posting_list(&entries)!;
assert_eq(decoded[0].doc_id, 10);  // FAIL
```
- **Root cause**: Same Vec<struct> erasure issue
- **Compound issue**: Vec<PostingEntryCompact> has nested Vec<u32> (positions)
- **IR issue**: Double indirection: Vec<struct> → i64 → extract field → i64 for Vec
- **Fixable by**:
  - IR post-processor: Complex fix (reconstruct aggregate with nested Vecs)
  - VaisDB workaround: Return iterator instead of Vec, or use intermediate representation

---

### 4. STORAGE/WAL: 3 Failures
**File**: `tests/storage/test_wal.vais`

**Failing tests**:
1. `it("should verify checksum over full record")`
2-3. Unknown (Mutex-related)

**Common failure patterns**:

#### Pattern A: Mutex Deadlock — 2-3 fails
```vais
record := Vec.with_capacity(56);
record.resize(56, 0u8);
// Mutex operations on record?
```
- **Root cause**: 
  - Compiler may fail to release locks in Vec mutation
  - WAL buffer append uses Mutex<Vec<u8>>
  - Type mismatch in Mutex::lock() return
- **IR issue**: Lock guard not properly dropped; `call @__store_sized` with wrong arg types
- **Fixable by**:
  - IR post-processor Fix B (store_sized type conversions)
  - VaisDB workaround: Use ByteBuffer (already safer) instead of Vec<u8> for WAL

#### Pattern B: Array/Vec initialization — 1 fail
```vais
record := Vec.with_capacity(56);
record.resize(56, 0u8);  // Record as i64 instead of Vec?
record[36] = (checksum & 0xFF) as u8;  // Fails
```
- **Root cause**: Vec return type mismatch
- **Fixable by**: IR post-processor or ByteBuffer workaround

---

### 5. STORAGE/BUFFER_POOL: 2 Failures
**File**: `tests/storage/test_buffer_pool.vais`

**Failing tests**:
1. `it("should list all dirty frame IDs")`
   ```vais
   dirty := tracker.get_dirty_frames();  // Returns Vec<u64>
   assert_true(dirty.contains(&1));  // FAIL
   ```
2. `it("should track dirty pages")` or similar

**Common failure patterns**:

#### Pattern: Vec<struct> store-back — 2 fails
```vais
dirty_ids: Vec<u64> := Vec.new();
dirty_ids.push(1);
dirty_ids.push(4);
// Later: try to retrieve and use
```
- **Root cause**: 
  - Vec.push() doesn't actually store (i64 value lost)
  - Vec.len() returns incorrect value
  - Vec indexing fails
- **IR issue**: `store i64 %pushed_value` missing pointer deref, or wrong type in Vec struct
- **CLAUDE.md reference**: "Vec<struct> store-back: must reconstruct manually"
- **Fixable by**:
  - IR post-processor: Add Vec mutation fix (track i64 store into Vec fields)
  - VaisDB workaround: Use HashMap<u64, bool> instead of Vec for bitmap tracking

---

### 6. REMAINING: ~24 Failures (Uncategorized)
- Integration tests
- Graph tests
- Other cross-engine tests

---

## IR Post-Processor Improvement Opportunities

### Fix E Enhancement: extractvalue with i64 (3-5 fixes possible)
**Current**: Reconstructs aggregate from i64 via alloca + bitcast
**Limitation**: Only handles single-level aggregates
**Improvement**: Extend to nested aggregates like `{ i64, Vec<u32> }`
**Impact**: Could fix some planner struct serialization fails

### Fix F Enhancement: call with aggregate return (5-8 fixes possible)
**Current**: Handles i32/i64 type mismatches
**Limitation**: Doesn't handle struct return values being stored as i64
**Improvement**: Track `call <struct_type> @func()` where result treated as i64
**Impact**: Could fix planner `HybridCost.add()` and similar

### New Fix G: Vec<struct> element access (5-10 fixes possible)
**Pattern**: 
```llvm
%vec_ptr = load %Vec*, ...
%elem_i64 = call i64 @vec_get_unsafe(%vec_ptr, i64 0)
%field = extractvalue <struct>, 0  # WRONG: extracting from i64
```
**Solution**:
1. After vec_get_unsafe → i64
2. Before extractvalue: alloca struct, bitcast i64→i8*, store, load struct
3. Then extractvalue on correct struct

**Feasibility**: Moderate (requires inttoptr + bitcast + load chain insertion)
**Impact**: Could fix 5-10 fulltext/buffer_pool Vec<struct> failures

---

## Fixability Matrix

| Category | Issue | IR Fix? | Code Workaround? | Compiler Fix? |
|----------|-------|--------|------------------|---------------|
| Vector | Panic on match | No | Yes (if-else) | YES (required) |
| Planner | str_eq | Maybe | Yes (avoid .name()) | Maybe (Str impl) |
| Planner | struct return i64 | Maybe (Fix F) | Yes (inline) | YES (required) |
| FullText | Vec<TokenInfo>[0] | Maybe (Fix G) | Yes (HashMap) | YES (required) |
| FullText | Vec<PostingEntryCompact> | No (nested) | Yes (iterator) | YES (required) |
| WAL | Mutex deadlock | Maybe (Fix B) | Yes (ByteBuffer) | YES (required) |
| WAL | Vec.resize() | Maybe (Fix D) | Yes (ByteBuffer) | YES (required) |
| BufferPool | Vec.push() not stored | Maybe (Fix G) | Yes (HashMap) | YES (required) |

---

## Summary: Fixable vs Unfixable Now

### Likely Fixable via IR Post-Processing (5-15 fails)
1. **Planner struct serialization** (3-5 fails)
   - Enhance Fix F to handle struct returns
2. **FullText Vec<struct> access** (5-8 fails)
   - New Fix G: Vec element → i64 → reconstruct struct
3. **WAL/Buffer Vec operations** (2-4 fails)
   - Enhanced Fix D + new array handling

**Effort**: Medium (100-200 lines Python)
**Confidence**: 60% (compiler IR quirks vary per function)

### Fixable via VaisDB Code Workarounds (20-30 fails)
1. **Planner**: Avoid `.name()` method; use inline string
2. **Planner**: Avoid `.add()` method; inline cost arithmetic
3. **FullText**: Change `Vec<TokenInfo>` → `HashMap<usize, TokenInfo>`
4. **FullText**: Return iterator instead of `Vec<PostingEntryCompact>`
5. **WAL**: Use `ByteBuffer` instead of `Vec<u8>`
6. **Buffer**: Use `HashMap<u64, bool>` instead of `Vec<bool>` tracking

**Effort**: Low (1-2 hours refactoring per module)
**Confidence**: 95% (proven patterns)

### Requires Compiler Fix (5-10 fails)
1. **Vector match statement panic** (1 fail)
2. **Struct return type codegen** (3-5 fails)
3. **Vec<struct> generic erasure** (5+ fails)
4. **Mutex lock release** (1-2 fails)

**Effort**: High (type checker reconstruction + codegen rewrite)
**Status**: Blocked on compiler rebuild (Mar 16 regression)

---

## Recommended Action Plan

### Phase 1: IR Post-Processor (2-4 hours)
1. Enhance Fix F: Detect `call <struct_type>` returning i64, add conversion
2. Add Fix G: Detect `extractvalue { ... } %i64_var`, add Vec reconstruction
3. Test on 5-10 failing binaries

### Phase 2: VaisDB Workarounds (4-8 hours, high ROI)
1. FullText: `Vec<TokenInfo>` → `Vec<&TokenInfo>` or HashMap
2. Planner: Inline `.name()` and `.add()` methods
3. WAL: Replace Vec<u8> with ByteBuffer
4. Buffer: Use HashMap for dirty page tracking

### Phase 3: Compiler (blocked)
- Wait for type checker rebuild
- Fix: Generic type erasure for Vec<struct>
- Fix: Struct return value codegen
- Fix: Match statement type inference

