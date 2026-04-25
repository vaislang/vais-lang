# VaisDB Master Roadmap — Trust & Production Readiness

> **Created**: 2026-04-25 (after Phase 17 Wave 2/3/4a completion, 258 codegen sites migrated)
> **Mission**: Build a database that users *trust enough to depend on for real work*.
> **Philosophy**: Earn trust incrementally. Every phase produces something *demonstrable to a stranger*.

## 0. The Brutal Honest Diagnosis

After ~63 iterations of compiler invariant work:

| Metric | State |
|--------|-------|
| Compiler IR generation | 14/15 standalone codegen ✅ |
| Test link errors | ~14-22 per 8-run avg (down from 165) ✅ |
| Tests linking to executable | **0/14** ❌ |
| Tests passing | **0/14** ❌ |
| External users | 0 |
| Working demo | None |

The compiler refactor is meaningful internal infrastructure. But **a database with 0 working tests cannot be trusted by anyone**. Wave 4 catch-all refactor is essential for compiler purity, but pursuing it alone for another 6 months leaves vaisdb at 0 users.

**Pivot**: ship something users can run, before perfecting compiler internals.

## 1. Trust-Earning Principles

A user trusts a database when they observe these, in order:

1. **It runs** — `vaisdb` binary executes without crashing
2. **It does what it says** — `INSERT 1; SELECT 1` returns 1
3. **It survives surprises** — power loss, malformed input, concurrent access don't corrupt data
4. **It's honest about limits** — README shows what works AND what doesn't
5. **It's reproducible** — same input → same output, on any machine
6. **It scales** — 1MB works, 100MB works, 10GB works
7. **Someone else uses it** — external user shipped product that depends on it

Each phase below targets one tier. **Skipping tiers destroys trust**.

## 2. Five-Phase Roadmap

### Phase α: One Test Passes (target: 2-3 weeks)

**Goal**: Pick the single simplest test → make it link, execute, assertion-pass.

**Candidate**: `tests/storage/test_btree.vais` (smallest deps; or `test_page_manager.vais`)

**Method**: Forget Wave 4 catch-all theory. For *this one test*, fix every link error one by one:
- `clang -O0 -o test_btree /tmp/test_btree_*.ll runtime.o sync.o -lm 2>&1` shows ~14 errors
- Each error → narrow root cause → minimal fix in compiler or stdlib
- No "structural refactor" — pure surgical fixes
- Per fix: cargo test still 796/796, IR still emits, this test gets one error closer

**Exit**: `./test_btree` runs, prints "PASS" or assertion message. Single binary. Reproducible.

**Deliverable**: GitHub Action that runs this test on every push. **Public**.

### Phase β: Five Tests Pass + CLI Demo (target: 1-2 months)

**Goal**: 5/14 tests passing AND a `vaisdb` binary that does *one thing useful end-to-end*.

**Sub-phases**:
- β.1: Apply Phase α method to 4 more tests (storage focus first: btree → page_manager → wal → buffer_pool → transaction)
- β.2: Wire `src/main.vais` → produces `vaisdb` binary
- β.3: Ship a 5-line interactive demo:
  ```
  $ vaisdb --memory
  > CREATE TABLE notes (id INT PRIMARY KEY, body TEXT);
  > INSERT INTO notes VALUES (1, 'hello');
  > SELECT * FROM notes;
  1 | hello
  ```

**Exit criteria**:
- 5/14 tests green in CI
- `vaisdb --memory` accepts that exact 5-line demo
- README updated with `quickstart.md` link
- README badge: "5/14 tests passing — see [STATUS.md](STATUS.md)"

**Deliverable**: First user can `cargo install` (or `vaisc install`), run, see output, believe it's real.

### Phase γ: Persistence + Crash Recovery (target: 2-3 months)

**Goal**: Data survives process crashes. Single-machine persistence story complete.

**Sub-phases**:
- γ.1: SQL subset stable — `CREATE TABLE`, `INSERT`, `SELECT WHERE`, `UPDATE`, `DELETE`. No `JOIN`, no aggregates yet.
- γ.2: WAL works — `kill -9` mid-transaction → next open recovers committed state.
- γ.3: Single-file `.vaisdb` format stable — open the file, see version magic bytes, page count, schema.
- γ.4: Stress test: 1M `INSERT`s, kill at random points, no corruption ever.

**Exit criteria**:
- 10/14 tests green
- `vaisdb_bench --crash-loop --workload=insert -n 1000000` runs without corruption (a hand-rolled torture script)
- File format documented in `docs/file_format.md` (with hex dumps)

**Deliverable**: Someone can build a real CLI tool on top of vaisdb (e.g., a journal app) and trust it not to lose data.

### Phase δ: Vector + Hybrid Query (target: 3-4 months)

**Goal**: The "RAG-native" promise becomes real.

**Sub-phases**:
- δ.1: HNSW vector index works — `CREATE INDEX ... USING vector(dim=768)`, `SELECT ... ORDER BY vec_distance(...) LIMIT k`
- δ.2: BM25 full-text — `WHERE bm25('term') > 0`
- δ.3: Hybrid scoring — `RAG_SEARCH('query')` returns SQL+vec+text fused results
- δ.4: One reference benchmark — compare against `sqlite-vec` or `Chroma` on a public RAG dataset (Hotpotqa or Natural Questions)

**Exit criteria**:
- 14/14 tests green
- Public benchmark page showing: latency p50/p99, recall@k vs reference systems
- One blog post / README section showing actual code that does RAG retrieval in <50 lines

**Deliverable**: AI app developers can prototype a RAG app with vaisdb in one afternoon.

### Phase ε: Production Hardening (target: 6+ months)

**Goal**: Someone deploys vaisdb to a real backend that takes user traffic.

**Sub-phases**:
- ε.1: Connection pooling, TCP wire protocol stable
- ε.2: Auth + RBAC functional (tests passing for `src/security/`)
- ε.3: Backup / restore tested (`vaisdb backup` + `vaisdb restore` roundtrip)
- ε.4: Observability — Prometheus metrics, structured logs
- ε.5: A small open-source project somewhere uses vaisdb in their `Cargo.toml` / similar

**Exit criteria**:
- v1.0 release tag
- One external GitHub project depends on vaisdb
- Issues page has 5+ closed bugs (real users found real bugs)

**Deliverable**: trust-earned status. People recommend vaisdb without disclaiming.

## 3. Process Rules

These rules prevent the failure modes that got us to "0/14 tests passing":

### 3.1 Demo-driven, not refactor-driven

Every commit message should ideally cite a *user-visible behavior change*. "internal cleanup" is allowed but flagged for review if 3 in a row.

### 3.2 Honesty in README

`README.md` always reflects current state. If 5/14 tests pass, it says so. If `JOIN` is unimplemented, the SQL section says so. **Hidden limitations are betrayals**.

### 3.3 No phase skipping

Don't start Phase γ until 5 tests pass. Don't start Phase δ until WAL crash-tested. Each phase's exit criterion is a *trust contract*; ship-ready means a stranger could pick this up and it would work.

### 3.4 Compiler upstream coupling

If a phase blocks on a vais compiler bug:
- Fix the compiler in `~/study/projects/vais/compiler/`
- Land the fix with a test that proves it
- Document the fix in vaisdb ROADMAP

vais compiler is the foundation. If it's broken, vaisdb can't be trusted. **Phase 17 codegen work continues opportunistically as we hit real bugs**, but no longer drives the schedule.

### 3.5 One sub-phase = one PR (or commit)

Bisect-friendly history. Easy revert. Each sub-phase has:
- Clear scope (one paragraph)
- Verification command (`cargo test ... && ./test_X`)
- Exit signal (output you can paste in PR description)

### 3.6 Failures are a feature

When a test breaks, don't hide it (`#[ignore]`). Mark it `STATUS: regressing` in `STATUS.md`. Fix forward.

## 4. Immediate Next Action (Phase α.1)

**This week**: pick `test_btree.vais`, run the link command, list every error.

```bash
cd packages/vaisdb
VAIS_DEP_PATHS="$(pwd)/src:/tmp/vais-lib/std" \
  ~/.cargo/bin/vaisc build tests/storage/test_btree.vais \
  --emit-ir -o /tmp/test_btree.ll --force-rebuild
clang -O0 -o /tmp/test_btree /tmp/test_btree_*.ll \
  /tmp/test_runtime.o /tmp/sync_runtime.o -lm 2>&1 \
  > /tmp/test_btree_link.log
```

Then categorize errors:
1. Type mismatch (e.g., `i64 vs ptr`)
2. Undefined symbol (e.g., `Vec_truncate`)
3. PHI predecessor mismatch
4. Other

Each category → 1 fix attempt. Report which fixed.

**Goal of next 5 iters**: drive `test_btree` link errors from 14 → 0.

## 5. Anti-goals (what we explicitly will NOT do)

- ❌ Add features before tests pass for existing features
- ❌ Refactor compiler internals without a failing test that the refactor will fix
- ❌ Hide failures (`#[ignore]`, `// TODO`, silent passes)
- ❌ Marketing materials (blog, demo video) before Phase β complete
- ❌ Performance optimization before correctness (Phase γ exit)
- ❌ Distributed / replication features (post-v1.0)

## 6. Success Looks Like

A year from today, someone who has never heard of vaisdb:
1. Sees a tweet/post mentioning it
2. `cargo install vaisdb` (or equivalent)
3. Runs the README quickstart
4. It works on first try
5. They `git clone` to peek at internals
6. They open an issue with a real use-case question
7. They ship a small project that depends on it

That sequence is the trust currency. Every phase above is calibrated to make it possible.
