# VaisDB Test Suite Status Report (2026-03-27)

## Summary
- **21 test files** organized by subsystem
- **6,533 total lines** of test code
- **9 test binaries** from Mar 15 (2026) — stale, need rebuilds
- **Compilation status**: Multiple IR files generated but with errors

---

## Test Files by Category

### Storage Subsystem (5 tests, ~1,200 LOC)
| File | Lines | Modified | Status | Issues |
|------|-------|----------|--------|--------|
| tests/storage/test_page_manager.vais | 172 | 2026-03-14 | IR exists | Constants OK |
| tests/storage/test_wal.vais | 218 | 2026-03-24 | IR exists | Constants OK |
| tests/storage/test_buffer_pool.vais | 223 | 2026-03-24 | IR exists | Constants OK |
| tests/storage/test_transaction.vais | 324 | 2026-03-23 | IR exists | Constants OK |
| tests/storage/test_btree.vais | 396 | 2026-03-24 | IR exists | **Missing: PAGE_SIZE_DEFAULT** (12 references) |

### Vector Subsystem (1 test, ~500 LOC)
| File | Lines | Modified | Status | Issues |
|------|-------|----------|--------|--------|
| tests/vector/test_vector.vais | 486 | 2026-03-24 | IR exists | **Missing: DistanceMetric enum** (6 references) |

### Graph Subsystem (1 test, ~560 LOC)
| File | Lines | Modified | Status | Issues |
|------|-------|----------|--------|--------|
| tests/graph/test_graph.vais | 558 | 2026-03-27 | IR exists | Uses `assert_eq_str()` for string comparison ✓ |

### Full-Text Subsystem (1 test, ~760 LOC)
| File | Lines | Modified | Status | Issues |
|------|-------|----------|--------|--------|
| tests/fulltext/test_fulltext.vais | 763 | 2026-03-19 | IR exists | Uses `assert_eq()` with string literals (12 refs) |

### Planner/RAG Subsystem (1 test, ~1,400 LOC)
| File | Lines | Modified | Status | Issues |
|------|-------|----------|--------|--------|
| tests/planner/test_planner.vais | 1,375 | 2026-03-27 | **STACK OVERFLOW** | Codegen infinite recursion (test_planner.ll 1.6MB) |

### SQL Subsystem (7 debug tests, ~300 LOC)
| File | Lines | Modified | Status | Issues |
|------|-------|----------|--------|--------|
| tests/sql/test_types.vais | 814 | 2026-03-23 | IR exists | Constants OK |
| tests/sql/test_row_encode.vais | 83 | 2026-01-01 | IR exists | Constants OK |
| tests/sql/test_row_debug*.vais (5) | ~150 | Various | IR exists | Debug helpers |

### Integration Subsystem (1 test, ~800 LOC)
| File | Lines | Modified | Status | Issues |
|------|-------|----------|--------|--------|
| tests/integration/test_cross_engine.vais | 816 | 2026-03-16 | Not compiled yet | Uses `assert_eq()` with string literals (2 refs) |

---

## Compilation Pipeline Results

### IR Generation Summary
**Fresh compilation attempts (2026-03-27):**

#### ✅ test_vector.vais — 8 codegen errors, IR partial
- **Error**: `DistanceMetric` enum not imported/defined
- **Lines affected**: 260, 268, 276, 283, 295, 311
- **Type error at 443**: Generic field access `cj.distance` fails on type `T`
- **Expected fix**: Add import or define DistanceMetric enum in test

#### ✅ test_btree.vais — 12 codegen errors, IR partial
- **Error**: `PAGE_SIZE_DEFAULT` constant not defined
- **Lines affected**: 110, 136, 158, 178, 192, 205, 349 (7 unique)
- **Expected fix**: Import or define PAGE_SIZE_DEFAULT constant

#### ❌ test_planner.vais — STACK OVERFLOW during codegen
- **Generated**: 1.6MB IR file (/tmp/test_planner_fresh.ll)
- **Error**: Infinite recursion in codegen resolved_function_sigs
- **Blocker**: Compiler bug, not test code issue
- **Likely cause**: Circular method resolution or generic specialization explosion

---

## String Assertion Pattern

Tests use three patterns for string assertions:

### Pattern 1: assert_eq_str() — Correct ✓
```vais
assert_eq_str(pv.string_val, "hello");
assert_eq_str(*n, "LIKES");
```
**Used in**: test_graph.vais (5+ calls)

### Pattern 2: assert_eq() with string literals — Problematic
```vais
assert_eq(tokens[0].term, "hello");
assert_eq(to_ascii_lowercase(&"Hello WORLD"), "hello world");
assert_eq(result.source_text, "main content");
```
**Used in**:
- test_fulltext.vais (12+ calls)
- test_cross_engine.vais (2 calls)

### Pattern 3: assert_eq() with field comparison — OK
```vais
assert_eq(entry.term, "hello");  # if term is a string variable
```

---

## Test Binary Status

**All 9 binaries are stale (compiled Mar 15, 2026):**
```
tests/sql/test_types_bin         246 KB  Mar 15 22:54
tests/graph/test_graph_bin       184 KB  Mar 15 22:54
tests/vector/test_vector_bin     164 KB  Mar 15 22:54
tests/storage/test_wal_bin       148 KB  Mar 15 22:54
tests/storage/test_page_manager_bin  161 KB  Mar 15 22:54
tests/storage/test_buffer_pool_bin   106 KB  Mar 15 22:54
tests/storage/test_btree_bin     194 KB  Mar 15 22:54
tests/planner/test_planner_bin   410 KB  Mar 15 22:54
tests/fulltext/test_fulltext_bin 202 KB  Mar 15 22:54
```

⚠️ **These need recompilation after codegen fixes**

---

## Compilation Artifacts in /tmp

**Extensive IR generation history** (127+ files from 2026-03-14 onward):
- Fresh baseline: `/tmp/test_*.ll` (Mar 26-27)
- Iterative fixes: `/tmp/test_*_fixed*.ll`, `/tmp/test_*_baseline*.ll`, etc.
- Analysis artifacts: `/tmp/test_*_analysis.ll`, `/tmp/test_*_alloca.ll`

**Latest successful IR files** (all dated Mar 26-27):
- `/tmp/test_vector.ll` (20.5 KB)
- `/tmp/test_btree.ll` (partial, errors)
- `/tmp/test_buffer_pool.ll` (50+ KB)
- `/tmp/test_fulltext.ll` (769 KB)
- `/tmp/test_wal.ll` (150+ KB)
- `/tmp/test_transaction.ll` (150+ KB)
- `/tmp/test_types.ll` (100+ KB)

---

## Next Steps Priority

### 🔴 Blocker (test_planner.vais)
1. **Investigate compiler stack overflow** in test_planner compilation
   - Likely infinite recursion in codegen's method resolution
   - Check for circular generic specializations
   - May need Vais compiler patch

### 🟠 High Priority (test_vector.vais, test_btree.vais)
1. Add missing imports:
   - `DistanceMetric` enum to test_vector.vais
   - `PAGE_SIZE_DEFAULT` constant to test_btree.vais
2. Fix generic field access pattern in test_vector.vais:443

### 🟡 Medium Priority (test_fulltext.vais, test_cross_engine.vais)
1. Verify assert_eq() vs assert_eq_str() usage
2. Consider string comparison test fixes
3. Update string assertion patterns for consistency

### 🟢 Completed
- test_graph.vais: ✓ Uses correct `assert_eq_str()`
- test_page_manager.vais: ✓ No assertion issues
- test_transaction.vais: ✓ IR generated
- test_wal.vais: ✓ IR generated

