# VaisDB Fork Failure Analysis — Technical Appendix

## File References & Code Locations

### 1. Test Files with Failure Points

#### tests/vector/test_vector.vais
```vais
Line 282-286: DistanceComputer test
    it("should return correct metric type") {
        computer := mut DistanceComputer.new(DistanceMetric.L2);
        M computer.metric() {
            DistanceMetric.L2 => {},
            _ => panic!("Wrong metric"),  // <- PANIC HERE
        }
    }
```
**Issue**: Match expression with panic generates bad IR
**Known**: CLAUDE.md — "M statement type inference bug"

---

#### tests/planner/test_planner.vais
```vais
Line 67-73: EngineType.name() string comparison
    it("name returns correct string for each variant", || {
        assert_eq(EngineType.Sql.name(), "sql");      // FAIL
        assert_eq(EngineType.Vector.name(), "vector");
        assert_eq(EngineType.Graph.name(), "graph");
        assert_eq(EngineType.FullText.name(), "fulltext");
        assert_eq(EngineType.Hybrid.name(), "hybrid");
    });

Line 116-156: HybridCost.add() struct return
    it("add combines two costs correctly", || {
        a := mut HybridCost.new();
        // ... set fields ...
        sum := mut a.add(&b);                    // FAIL HERE
        assert_eq(sum.total_io_cost, 13.0);
    });

Line 181-197: engine_breakdown() aggregate return
    it("engine_breakdown returns correct percentages", || {
        breakdown := mut cost.engine_breakdown();  // FAIL: Vec<struct> return
        assert_eq(breakdown.len(), 2u64);
    });
```

**Code locations**:
- `src/planner/types.vais` — HybridCost struct + methods
- `src/planner/cost_model.vais` — Cost calculation methods

---

#### tests/fulltext/test_fulltext.vais
```vais
Line 52-58: Tokenizer Vec<TokenInfo> element access
    it("should tokenize simple text") {
        tokenizer := mut Tokenizer.default();
        tokens := mut tokenizer.tokenize(&"hello world");
        assert_eq(tokens.len(), 2);
        assert_eq(tokens[0].term, "hello");    // FAIL: Vec<struct>[i]
        assert_eq(tokens[1].term, "world");
    }

Line 672-696: Vec<PostingEntryCompact> decoding
    it("should encode and decode a posting list") {
        entries := mut vec![
            PostingEntryCompact { doc_id: 10, term_freq: 3, positions: vec![0u32, 5, 10] },
            PostingEntryCompact { doc_id: 20, term_freq: 1, positions: vec![7u32] },
            PostingEntryCompact { doc_id: 35, term_freq: 2, positions: vec![2u32, 8] },
        ];
        decoded := mut decode_posting_list(&entries)!;
        assert_eq(decoded[0].doc_id, 10);      // FAIL: Vec<struct>[i].field
    }
```

**Code locations**:
- `src/fulltext/tokenizer.vais` line 50+ — Tokenizer.tokenize() returns Vec<TokenInfo>
- `src/fulltext/index/compression.vais` — PostingEntryCompact, encode/decode_posting_list()

---

#### tests/storage/test_wal.vais
```vais
Line 49-69: WAL checksum verification with Vec mutation
    it("should verify checksum over full record") {
        record := mut Vec.with_capacity(56);
        record.resize(56, 0u8);                // FAIL: Vec mutation
        buf := mut ByteBuffer.wrap(&record);
        header := mut WalRecordHeader.new(...);
        header.serialize(&buf);
        checksum := mut calculate_wal_checksum(&record);
        record[36] = (checksum & 0xFF) as u8;  // FAIL: Vec[i] store
    }
```

**Code locations**:
- `src/storage/wal/buffer.vais` — WalBuffer with Mutex<Vec<u8>>

---

#### tests/storage/test_buffer_pool.vais
```vais
Line 86-97: DirtyTracker Vec<u64> retrieval
    it("should list all dirty frame IDs") {
        tracker := mut DirtyTracker.new(8);
        tracker.mark_dirty(1);
        tracker.mark_dirty(4);
        tracker.mark_dirty(6);
        dirty := mut tracker.get_dirty_frames();  // FAIL: Returns Vec<u64>
        assert_eq(dirty.len(), 3);
        assert_true(dirty.contains(&1));         // FAIL: Vec.contains
    }
```

**Code locations**:
- `src/storage/buffer/dirty_tracker.vais` — DirtyTracker.get_dirty_frames()

---

## IR Post-Processor Architecture

### Current Fixes (ir_postprocess.py v5)

**Fix A: Struct/void type corrections** (lines 14-18)
```python
content = content.replace('{ void,', '{ i8,')
content = re.sub(r'\bvoid\*', 'i8*', content)
content = re.sub(r'store i64 void,', 'store i64 0,', content)
```
- Handles: void types in aggregates

**Fix B: __store_sized parameter conversion** (lines 354-391)
```python
# Detects: call void @__store_sized(i64 %a, i64 %b, i64 %c)
# Where %c is wrong type (float/double/ptr/alloca)
# Inserts: ptrtoint/bitcast conversion before call
```
- Handles: Float/double/pointer/struct to i64 conversion
- **Currently doesn't catch**: Mutex::lock() return type mismatches

**Fix C: __try_call_fn parameter conversion** (lines 392-404)
```python
# Similar to Fix B but for exception handler calls
```

**Fix D: store type mismatch** (lines 406-468)
```python
# Detects: store i64 %var where %var is i32/float/double/ptr/struct
# Inserts: type conversion (trunc/sext/bitcast) before store
```
- Handles: Integer width, float↔int conversion
- **Could fix**: Vec.resize() type issues

**Fix E: extractvalue with i64 source** (lines 470-489)
```python
# Detects: extractvalue { type, ... } %i64_var
# Where %i64_var should be aggregate, not i64
# Inserts: alloca struct, bitcast i64→i8*, store, load aggregate, extractvalue
```
- Handles: Struct members returned as i64 from functions
- **Limitation**: Single-level only; doesn't handle nested Vecs

**Fix F: call with wrong argument type** (lines 583-693)
```python
# Detects: call @func(..., i64 %var, ...)
# Where %var is alloca/float/double/ptr/struct
# Inserts: ptrtoint/bitcast conversion before call
# **Also handles**: { i8*, i64 } slice type conversion (Fix G embedded)
```
- Handles: Integer width, alloca pointer, float conversion
- **Limitation**: Doesn't detect when call returns wrong type

---

### Proposed New Fixes

**Fix H: call struct return stored as i64** (proposed)
```python
# Pattern: %result = call <struct_type> @func(...) returns i64
# Solution: Insert bitcast + load after call
# Lines to add: ~30 in ir_postprocess.py line ~694

def fix_call_struct_return(lines):
    new_lines = []
    for fl in lines:
        m = re.match(r'(\s+)(%\S+) = call (.*?) @(\w+)\(', fl)
        if m:
            call_ret_type = m.group(3).strip()
            # If return type is struct but assigned to i64...
            # Insert inttoptr + bitcast + load chain
        new_lines.append(fl)
    return new_lines
```

**Fix I: Vec element access (proposed)**
```python
# Pattern: %elem = call i64 @Vec_get_unsafe(%Vec*, i64)
#          extractvalue { ... } %elem, 0  // WRONG
# Solution: Between call and extractvalue, insert reconstruction
# 
# %tmp_a = alloca { ... }
# %tmp_c = bitcast { ... }* %tmp_a to i64*
# store i64 %elem, i64* %tmp_c
# %tmp_v = load { ... }, { ... }* %tmp_a
# extractvalue { ... } %tmp_v, 0
```

---

## Compiler Root Causes (CLAUDE.md References)

### 1. Vec<struct> Generic Erasure
**Reference**: CLAUDE.md — "Vec<struct> generic erasure: elements stored as i64 in codegen"

**Impact**: 
- `Vec<TokenInfo>` → element access returns i64
- Codegen doesn't preserve struct layout in Vec payload
- Affects: FullText tests (5 fails), Buffer tests (2 fails)

**Why**: Vais compiler's generic specialization erases element type at codegen time

---

### 2. Struct Return Type Mismatch
**Reference**: CLAUDE.md — "Struct literal in function returning different struct type causes type propagation bug"

**Impact**:
- `HybridCost.add()` returns i64 instead of HybridCost struct
- `cost.engine_breakdown()` returns i64 instead of Vec<EngineBreakdown>
- Affects: Planner tests (8+ fails)

**Why**: Type checker doesn't properly thread struct types through return path

---

### 3. Match Expression Type Inference
**Reference**: CLAUDE.md — "M inside I {} block returns pointer, not value"

**Impact**:
- Pattern match on enum may generate bad IR
- Panic branches have wrong type
- Affects: Vector tests (1 fail)

**Why**: Match arms have independent type environments that don't merge correctly

---

### 4. Result<T> Codegen Error Storage
**Reference**: CLAUDE.md — "Result Err() codegen: VaisError struct를 i64로 저장"

**Impact**:
- `Result<Vec<EngineBreakdown>>` deserialize returns i64-encoded error
- Can't extract actual Result discriminant
- Affects: Planner tests (2-3 fails)

---

## Reproducible Test Cases for IR Fixes

### Test Case 1: Vec<struct> element access
```vais
# Source:
tokens := vec![TokenInfo { term: "hello", position: 0 }];
x := tokens[0].term;

# Generates IR:
%vec = call %Vec* @Vec_new()
%elem_i64 = call i64 @Vec_get_unsafe(%Vec* %vec, i64 0)
%term = extractvalue <TokenInfo { Str, u32 }> %elem_i64, 0  # WRONG

# Should be:
%vec = call %Vec* @Vec_new()
%elem_i64 = call i64 @Vec_get_unsafe(%Vec* %vec, i64 0)
%tmp_a = alloca <TokenInfo { Str, u32 }>
%tmp_c = bitcast <TokenInfo { Str, u32 }>* %tmp_a to i64*
store i64 %elem_i64, i64* %tmp_c
%tmp_v = load <TokenInfo { Str, u32 }>, <TokenInfo { Str, u32 }>* %tmp_a
%term = extractvalue <TokenInfo { Str, u32 }> %tmp_v, 0
```

### Test Case 2: Struct return as i64
```vais
# Source:
cost := HybridCost.new();
sum := cost.add(&other);

# Generates IR:
%cost = call %HybridCost @HybridCost_new()
%sum_i64 = call i64 @HybridCost_add(%HybridCost %cost, ...)
store %HybridCost %sum_i64, %HybridCost* %sum_ptr  # TYPE MISMATCH

# Should be:
%sum_i64 = call i64 @HybridCost_add(...)
%sum = bitcast i64 %sum_i64 to %HybridCost
store %HybridCost %sum, %HybridCost* %sum_ptr
```

---

## Quick Reference: Which Fixes Apply to Which Failures

| Failure Category | Current Fix | Proposed Fix | Confidence |
|------------------|------------|--------------|------------|
| Vector panic | — | if-else rewrite | High |
| Planner str_eq | Fix D | Fix D + string impl | Med |
| Planner struct.add() | Fix E | Fix H (new) | Med-High |
| Planner engine_breakdown() | Fix E | Fix H + Fix I | Med |
| FullText tokenize[0] | — | Fix I (new) | Med-High |
| FullText decode[0] | — | Fix I (complex) | Low-Med |
| WAL Vec.resize() | Fix D | Fix D + ByteBuffer | High |
| WAL record[i] = x | Fix D | Fix D + ByteBuffer | High |
| Buffer dirty_frames | Fix D | Fix I (new) | Med-High |

---

## Implementation Roadmap for IR Post-Processor v6

### PR 1: Enhance Fix D (immediate, 30 min)
- Better detection of Vec element type tracking
- Handle i32/i64/float in store operations

### PR 2: Add Fix H (2-4 hours)
- Detect `call <struct>` returning i64
- Insert bitcast + potential load chain
- Test against planner tests

### PR 3: Add Fix I (4-6 hours)
- Detect Vec element access pattern
- Insert alloca + bitcast + store + load + extractvalue chain
- Handle nested struct fields
- Test against fulltext/buffer tests

### PR 4: Fix G Enhancement (if needed)
- Improve { i8*, i64 } slice conversion for function calls
- Already partially implemented in Fix F

---

## Testing Strategy

### Binary Testing
```bash
# For each failing binary:
/tmp/fork_runner.sh <binary> <source.vais>

# Output shows:
# ✅ PASS tests (expected: 0)
# ❌ FAIL tests (expected: 55)
# ⏭  SKIP tests (compilation failures)
```

### Regression Testing
```bash
# Before IR fix v5: baseline
# After IR fix v6a (Fix H): should reduce Planner fails by 5-8
# After IR fix v6b (Fix I): should reduce FullText/Buffer fails by 10-15
```

