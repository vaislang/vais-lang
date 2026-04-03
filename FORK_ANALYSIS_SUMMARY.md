# VaisDB Fork Test Failure Analysis — Executive Summary

## Status at a Glance
- **Total Test Failures**: 55 (out of 11 test binaries)
- **Build Status**: Produces valid LLVM IR; 0/11 pass clang (type mismatches in generated code)
- **Root Cause**: Compiler codegen bugs (generic type erasure, struct return mismatch, match type inference)
- **Analysis Date**: 2026-03-17

---

## Quick Failure Count

| Module | Tests | Failures | Type | Fixable Now? |
|--------|-------|----------|------|--------------|
| **Vector** | ~30 | 1 | Match panic | Workaround (if-else) |
| **Planner** | ~40 | 15 | Struct return i64 | Partial (IR+code) |
| **FullText** | ~40 | 10 | Vec<struct> element access | Partial (IR workaround) |
| **WAL** | ~20 | 3 | Vec mutation, Mutex | High (ByteBuffer) |
| **BufferPool** | ~15 | 2 | Vec.push() not stored | Medium (HashMap) |
| **Other** | ~80 | 24 | Unknown | TBD |
| **TOTAL** | ~225 | **55** | | **20-30/55 (36-54%)** |

---

## Three Paths Forward

### Path 1: IR Post-Processor Improvements (2-4 hours)
**Confidence: 60% of failures fixable**

1. **Fix H** (new): Detect `call <struct>` returning i64, insert conversion
   - Fixes: Planner struct.add() issues (5-8 fails)
   
2. **Fix I** (new): Detect Vec<struct> element access, reconstruct struct
   - Fixes: FullText tokenizer, buffer tests (5-8 fails)

**Cost**: 150-200 lines Python code  
**Payoff**: 10-15 test passes  
**ROI**: Good (low effort, quick wins)

### Path 2: VaisDB Code Workarounds (4-8 hours)
**Confidence: 95% of failures fixable**

1. **FullText**: Change `Vec<TokenInfo>` → HashMap<usize, TokenInfo>
2. **Planner**: Inline `.name()` and `.add()` methods (avoid struct returns)
3. **WAL/Buffer**: Use ByteBuffer, HashMap instead of Vec<u8>, Vec<bool>
4. **Vector**: Rewrite match to if-else chains

**Cost**: ~1-2 hours refactoring per module  
**Payoff**: 30-40 test passes  
**ROI**: Excellent (proven patterns, high success rate)

### Path 3: Compiler Fix (blocked)
**Confidence: 100% of failures fixed, but requires rebuilding compiler**

1. Fix generic type erasure in Vec<struct> codegen
2. Fix struct return value type tracking
3. Fix match expression type inference
4. Fix Result<T> error codegen

**Cost**: 1-2 weeks (type checker + codegen)  
**Payoff**: All 55 tests pass + cleaner code  
**Status**: Blocked on type checker rebuild (regression Mar 16)

---

## Recommended Quick Start (Next 2 Hours)

### Step 1: IR Post-Processor v5 → v6a (30 min)
**Add Fix H** to ir_postprocess.py:
- Detect `%result = call <struct_type> @func()` returning i64
- Insert: `bitcast i64 %result to <struct_type>`
- Test: Should pass 5-8 more planner tests

### Step 2: VaisDB Workarounds (1.5 hours)
**Highest ROI**:
1. Planner: Inline EngineType.name() (avoid Str return)
   - 3-4 test fixes
   - 15 min work
   
2. FullText: Return Vec<&TokenInfo> instead of Vec<TokenInfo>
   - 3-4 test fixes
   - 15 min work
   
3. WAL: ByteBuffer instead of Vec<u8> for record buffer
   - 2 test fixes
   - 10 min work
   
4. Vector: if-else chains instead of match statement
   - 1 test fix
   - 10 min work

**Total expected pass-through**: 15-20 additional tests (27-36% improvement)

---

## Detailed Issue Summary

### 1. Vector Engine (1 fail)
```
Issue: panic!("Wrong metric") in match expression
Root:  Match type inference bug (CLAUDE.md known issue)
Fix:   Rewrite `M { ... }` to `I ... E I ... E ...`
```

### 2. Planner Engine (15 fails)
```
Issue: struct.add() returns i64 instead of struct
       engine_breakdown() returns i64 instead of Vec<struct>
Root:  Struct return type mismatch (generic type erasure)
Fix:   Path 1: IR post-processor Fix H
       Path 2: Inline struct methods, avoid returns
```

### 3. FullText Engine (10 fails)
```
Issue: tokens[0].term fails (accessing struct field from i64)
       Vec<PostingEntryCompact> element access returns i64
Root:  Vec<struct> generic erasure in codegen
Fix:   Path 1: IR post-processor Fix I (complex)
       Path 2: Change Vec<TokenInfo> to HashMap or &Vec
```

### 4. Storage/WAL (3 fails)
```
Issue: Vec.resize(56, 0u8) doesn't actually allocate
       record[36] = value doesn't store
Root:  Vec mutation codegen issue, Mutex lock type mismatch
Fix:   Path 2: Use ByteBuffer (already in codebase)
```

### 5. Buffer/Pool (2 fails)
```
Issue: dirty.contains(&1) fails (Vec not populated)
Root:  Vec.push() not actually storing elements
Fix:   Path 2: Use HashMap<u64, bool> instead of Vec
```

---

## Files to Modify for Path 2 (Recommended First)

| File | Change | Effort | Impact |
|------|--------|--------|--------|
| `src/planner/types.vais` | Inline `.name()` → match to string literals | 5 min | 3-4 fails |
| `src/planner/cost_model.vais` | Inline `.add()` → struct field assignment | 10 min | 5-8 fails |
| `src/fulltext/tokenizer.vais` | Return Vec<&TokenInfo> or use HashMap | 15 min | 3-5 fails |
| `src/fulltext/index/compression.vais` | Iterator-based return instead of Vec | 10 min | 2-3 fails |
| `src/storage/wal/buffer.vais` | ByteBuffer instead of Vec<u8> | 10 min | 2 fails |
| `src/storage/buffer/dirty_tracker.vais` | HashMap<u64, bool> instead of Vec<bool> | 10 min | 2 fails |
| `tests/vector/test_vector.vais` | if-else instead of match | 5 min | 1 fail |

**Total Effort**: ~70 min = 1 hour 10 min  
**Expected Passes**: 20-30 tests (36-54% reduction in failures)

---

## File Locations Reference

### Analysis Documents (newly created)
- `/Users/sswoo/study/projects/vaisdb/FORK_FAILURE_ANALYSIS.md` — Main analysis (288 lines)
- `/Users/sswoo/study/projects/vaisdb/FORK_ANALYSIS_APPENDIX.md` — Technical details (360 lines)
- `/Users/sswoo/study/projects/vaisdb/FORK_ANALYSIS_SUMMARY.md` — This file

### Key Test Files
- `tests/vector/test_vector.vais` — 1 panic test (line 282-286)
- `tests/planner/test_planner.vais` — 15 struct tests (line 67-400)
- `tests/fulltext/test_fulltext.vais` — 10 Vec access tests (line 52-716)
- `tests/storage/test_wal.vais` — 3 Vec mutation tests (line 49-200)
- `tests/storage/test_buffer_pool.vais` — 2 Vec tests (line 86-144)

### Key Implementation Files
- `src/planner/types.vais` — HybridCost, EngineType
- `src/fulltext/tokenizer.vais` — Tokenizer.tokenize()
- `src/fulltext/index/compression.vais` — PostingEntryCompact
- `src/storage/wal/buffer.vais` — WalBuffer
- `src/storage/buffer/dirty_tracker.vais` — DirtyTracker

### Build & Test Tools
- `/tmp/fork_runner.sh` — Per-function test runner (97 lines)
- `/tmp/ir_postprocess.py` — IR post-processor v5 (714 lines)

---

## Risk Assessment

### Low Risk (implement immediately)
- Path 2 workarounds: Proven patterns, isolated changes
- Fix existing code to avoid compiler bugs
- 95% confidence of success

### Medium Risk (2-4 hours)
- Path 1 IR improvements: New code, requires testing
- 60% confidence, high value if works
- Can be done in parallel with Path 2

### High Risk (blocked)
- Path 3 compiler fix: Requires major refactoring
- 100% confidence if done, but 1-2 weeks effort
- Blocked on type checker rebuild

---

## Success Criteria

### Realistic (Path 1 + Path 2): 30-40/55 passes (54-73% reduction)
- After 1-2 hours work
- 95% confidence
- Leaves 15-25 tests failing (requires compiler fix)

### Optimistic (Path 1 + Path 2 well done): 40-45/55 passes (73-82%)
- After 2-3 hours focused work
- 70% confidence
- Leaves 10-15 tests failing

### Ideal (Path 3): 55/55 passes (100%)
- After 1-2 weeks compiler work
- 100% confidence
- Clean codebase, no workarounds

---

## Decision Matrix

**Choose Path 1+2 if**: Need test passes in < 2 hours
**Choose Path 1+2+3 if**: Have 3-4 weeks and want clean solution
**Choose Path 2 only if**: Don't have time for IR debugging

---

## Next Steps

1. **Read**: FORK_FAILURE_ANALYSIS.md (main report) — 10 min
2. **Read**: FORK_ANALYSIS_APPENDIX.md (code locations) — 10 min
3. **Decide**: Which path (1, 2, or both)
4. **Implement**: Start with highest-ROI changes
5. **Test**: Use fork_runner.sh to measure progress

---

## Contact / Questions

For detailed technical questions, see FORK_ANALYSIS_APPENDIX.md
For compiler regression details, see ROADMAP.md "현재 작업 (2026-03-15 #3)"
For known compiler bugs, see CLAUDE.md

