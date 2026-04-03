VAISDB RUNTIME TEST FAILURE ANALYSIS
=====================================
Snapshot Date: 2026-03-28
Total Tests: 112 | Passed: 63 | Failed: 49 (43.8% failure rate)

================================================================================
SECTION 1: TEST SUITE SUMMARY
================================================================================

test_fulltext:  64 tests → 41 passed, 23 failed (35.9% failure rate)
test_vector:    36 tests → 21 passed, 15 failed (41.7% failure rate)
test_btree:     12 tests →  1 passed, 11 failed (91.7% failure rate)
                ---
                112 tests → 63 passed, 49 failed (43.8% failure rate)

================================================================================
SECTION 2: FAILURE CATEGORIZATION BY SIGNAL TYPE
================================================================================

SIGNAL 11 (SIGSEGV — Segmentation Fault / Null Pointer Dereference):
  test_fulltext:
    - delta_encoding_should_round_trip_sorted_doc_ids
    - delta_encoding_should_handle_single_element
    - delta_encoding_should_handle_empty_list
    - delta_encoding_should_handle_consecutive_doc_ids
    - compressed_posting_list_should_encode_and_decode_a_posting_list
    - compressed_posting_list_should_handle_empty_posting_list
    - compressed_posting_list_should_handle_single_entry
    - compressed_posting_list_should_handle_entries_with_no_positions
  Subtotal: 8 SIGSEGV failures in test_fulltext

  test_btree:
    - key_encoding_should_encode_u64_round_trip
    - key_encoding_should_encode_composite_keys_with_length_prefix
    - keyrange_should_check_containment_for_closed_range
    - keyrange_should_check_containment_for_half_open_range
    - keyrange_should_detect_past_end_correctly
    - prefix_compression_should_save_space_with_prefix_compression
    - prefix_compression_should_support_restart_points_for_random_access
  Subtotal: 7 SIGSEGV failures in test_btree (note: some overlap in signal 10 list below)

  TOTAL SIGSEGV: 15 failures across test_fulltext and test_btree

SIGNAL 10 (SIGBUS — Bus Error / Alignment Issue):
  test_btree:
    - key_encoding_should_encode_i64_with_correct_sort_order
    - key_encoding_should_decode_i64_round_trip
    - prefix_compression_should_compress_and_decompress_keys
    - prefix_compression_should_support_restart_points_for_random_access
  Subtotal: 4 SIGBUS failures in test_btree

  TOTAL SIGBUS: 4 failures in test_btree

SIGNAL 6 (SIGABRT — Abort from unwrap!/panic! in stdlib):
  test_vector:
    - vector_normalization_should_normalize_to_unit_length
    - vector_normalization_should_produce_correct_components
    - vector_normalization_should_normalize_in_place
  Subtotal: 3 SIGABRT failures in test_vector (unwrap panic in normalization)

  TOTAL SIGABRT: 3 failures in test_vector

EXIT 1 (PANIC — Assertion Failure):
  test_fulltext: 12 failures
    - tokenizer_should_tokenize_simple_text
    - tokenizer_should_lowercase_tokens
    - tokenizer_should_track_token_positions
    - tokenizer_should_skip_position_for_stop_words_preserving_phrase_distances
    - tokenizer_should_handle_text_with_only_stop_words
    - tokenizer_helpers_should_classify_word_bytes_correctly
    - tokenizer_helpers_should_lowercase_ascii_correctly
    - bm25scorer_should_calculate_idf_correctly
    - bm25scorer_should_batch_score_by_summing
    - natural_log_approximation_should_compute_ln1_0
    - natural_log_approximation_should_compute_lne_1
    - natural_log_approximation_should_compute_ln10_23026
    - natural_log_approximation_should_compute_ln05_06931
    - postingentry_should_round_trip_via_to_bytesfrom_bytes
    - dictentry_should_serializedeserialize_round_trip

  test_vector: 12 failures
    - cosine_distance_should_return_0_for_identical_vectors
    - cosine_distance_should_return_1_for_orthogonal_vectors
    - cosine_distance_should_handle_multi_dimensional_vectors
    - l2_distance_should_compute_correct_euclidean_distance_3_4_5_triangle
    - l2_distance_should_compute_unit_distance_along_axis
    - l2_distance_should_handle_high_dimensional_vectors
    - dot_product_distance_should_compute_correct_dot_product_negated
    - dot_product_distance_should_return_negative_value_for_similar_vectors
    - vector_magnitude_should_compute_magnitude_of_unit_vector
    - vector_magnitude_should_compute_magnitude_of_340_vector
    - dot_product_raw_should_compute_correct_dot_product
    - layerrng_should_produce_mostly_layer_0_for_m16

  test_btree: 1 failure
    - prefix_compression_should_compute_common_prefix_length

  TOTAL EXIT 1: 25 failures (more than 50% of all failures!)

================================================================================
SECTION 3: FAILURE PATTERNS & ROOT CAUSES
================================================================================

PATTERN 1: ASSERTION FAILURES (EXIT 1) — VALUES NOT EQUAL
  Indicators:
    "PANIC: Assertion failed: values not equal (actual: X, expected: Y)"
    "PANIC: Assertion failed: expected true"
    "PANIC: Assertion failed: expected false"

  Examples:
    - tokenizer_should_tokenize_simple_text:
        actual: 1, expected: 2
        → Vec len is wrong (token count should be 2, got 1)

    - tokenizer_should_lowercase_tokens:
        actual: 6125938640, expected: 4341052270
        → String comparison is broken (actual value looks like garbage address)

    - bm25scorer_should_calculate_idf_correctly:
        expected true, got false
        → Float comparison failed (likely coercion or precision issue)

    - natural_log_approximation tests:
        All 4 expect true, fail
        → ln() implementation broken (float arithmetic/coercion issue)

    - Distance metric tests (cosine, l2, dot product):
        All expect true, fail
        → Float operations on Vec<f32> broken
        → Possibly generic erasure in Vec<f32> operations

  ROOT CAUSE HYPOTHESIS:
    - Generic erasure: Vec<f32> or Vec<TokenInfo> may be storing elements as i64
    - Float coercion: codegen not properly handling f32→f64 conversions
    - String comparison: cross-module type resolution (TokenInfo.term field)
    - Struct field access: Vec[i].field pattern (known compiler issue)

PATTERN 2: SEGMENTATION FAULTS (SIGNAL 11) — VECTOR OPERATIONS
  Failures cluster in:
    - delta_encoding tests (3 failures)
    - compressed_posting_list tests (4 failures)
    - key_encoding tests (2 failures)
    - keyrange tests (3 failures)
    - prefix_compression tests (2 failures)

  Examples:
    - delta_encoding_should_handle_empty_list → Signal 11
    - delta_encoding_should_round_trip_sorted_doc_ids → Signal 11
    - encode_posting_list() → Signal 11

  ROOT CAUSE HYPOTHESIS:
    - Vec<struct> indexing with field access: v[i].field
      Vais compiler issue: "Vec<struct> field access via indexing fails"
      Workaround documented: "use tmp := mut v[i]; tmp.field"
    - Generic erasure in encode/decode functions
      Vec<PostingEntryCompact> or Vec<DictEntry> may have wrong element size
    - Null pointer in codegen result struct extraction (known issue)

PATTERN 3: BUS ERRORS (SIGNAL 10) — ALIGNMENT ISSUES
  All 4 failures in test_btree key encoding/compression:
    - key_encoding_should_encode_i64_with_correct_sort_order
    - key_encoding_should_decode_i64_round_trip
    - prefix_compression_should_compress_and_decompress_keys
    - (one more listed in signal 11 too)

  ROOT CAUSE HYPOTHESIS:
    - Misaligned struct reads: KeyRange or BTreeEntry structs
    - ByteBuffer serialization not respecting alignment requirements
    - 8-byte boundaries for u64/i64 fields not preserved
    - On-disk format fields ordered by size (WAL header design)
      but code may not be following same alignment principle

PATTERN 4: ABORT SIGNALS (SIGNAL 6) — STDLIB UNWRAP PANIC
  3 failures in vector normalization:
    - vector_normalization_should_normalize_to_unit_length
    - vector_normalization_should_produce_correct_components
    - vector_normalization_should_normalize_in_place

  Message: "unwrap failed: panic!"
    → normalize_vector() calls Result.unwrap()
    → magnitude computation returns Err (likely zero-length vector check)
    → But test vectors are non-zero, so Err is incorrect

  ROOT CAUSE HYPOTHESIS:
    - magnitude calculation overflow/underflow on f32 operations
    - sqrt() coercion issue (f32→f64→f32)
    - Vec<f32> iteration broken (dot_product not summing correctly)

================================================================================
SECTION 4: GROUPED ANALYSIS BY ROOT CAUSE
================================================================================

ROOT CAUSE GROUP A: GENERIC ERASURE IN VEC<T> (15-20 failures)
  Affected Tests:
    - Vec<TokenInfo> in tokenizer tests
    - Vec<f32> in vector distance tests
    - Vec<PostingEntryCompact> in compression tests
    - Vec<DictEntry> in dictionary tests

  Manifestations:
    - String field reads return garbage (4341052270 instead of ASCII hash)
    - Float comparisons fail (expected true, got false)
    - SIGSEGV in indexing operations (v[i])
    - Token count wrong (1 instead of 2)

  Codegen Issue:
    - generate_enum_variant_constructor stores payload as single i64
    - Result<T> type defs are 88 bytes but only first 8 bytes extracted
    - Vec element size inferred as i64 (8 bytes) for all generic T
    - Cross-module type info lost during codegen → can't recover true T size

  Fix Path:
    1. Monomorphize Vec<TokenInfo> → separate Vec type in codegen
    2. Monomorphize Vec<f32> → separate Vec type
    3. Align Result<T> extraction with postprocessor-generated struct sizes
    4. OR: Add runtime type metadata to Vec<T> for size calculation

ROOT CAUSE GROUP B: STRUCT FIELD ACCESS & ALIGNMENT (15 failures)
  Affected Tests:
    - key_encoding tests (SIGBUS on i64 decode, SIGSEGV on u64)
    - keyrange tests (SIGSEGV on containment check)
    - prefix_compression tests (SIGBUS/SIGSEGV mix)
    - postingentry serialization (PANIC on wrong values)

  Manifestations:
    - SIGBUS: 8-byte alignment required for i64, not met
    - SIGSEGV: Null pointer from accessing field after misaligned read
    - PANIC: Value read from wrong offset

  Compiler Issue:
    - "Vec<struct> field access via indexing fails — use tmp := mut v[i]; tmp.field"
    - ByteBuffer reading may not advance cursor correctly
    - Struct layout not matching on-disk format expectations

  Fix Path:
    1. Audit ByteBuffer reads for alignment (8-byte align before u64 read)
    2. Replace v[i].field with tmp := mut v[i]; tmp.field pattern
    3. Ensure struct field ordering matches on-disk format (size descending)

ROOT CAUSE GROUP C: FLOAT TYPE COERCION (18+ failures)
  Affected Tests:
    - All 12 vector distance tests (cosine, L2, dot product)
    - All 4 natural log tests
    - BM25 IDF calculation
    - Vector normalization (magnitude)
    - Dot product tests

  Manifestations:
    - Expected true, got false (comparison after computation)
    - No arithmetic/overflow (just wrong values)
    - Pattern: all f32 operations return wrong results

  Codegen Issue:
    - f32→i64 implicit coercion not matching f64 results
    - sqrt() may be operating on wrong type
    - Float arithmetic not using wide accumulator pattern
    - No f32/f64 distinction in method resolution

  Fix Path:
    1. Enable f32-specific implementations (cosine_distance_f32 vs f64)
    2. Audit sqrt, abs, and arithmetic ops for width coercion
    3. Check float literal handling (1.0f32 vs 1.0)
    4. Add explicit .as_f32() or .as_f64() casts in critical paths

ROOT CAUSE GROUP D: CROSS-MODULE TYPE RESOLUTION (4+ failures)
  Affected Tests:
    - tokenizer string comparisons (token.term field)
    - dictentry serialization
    - postingentry serialization

  Manifestations:
    - String values show as i64 garbage addresses
    - Struct fields read from wrong offset

  Codegen Issue:
    - TC (type checker) resolves cross-module struct fields correctly
    - codegen's infer_expr_type cannot determine receiver type
    - Method not normalized to correct struct path
    - Cross-module struct size not computed in codegen

  Fix Path:
    1. Connect codegen infer_expr_type to TC resolved type info
    2. Add method name fallback to search multiple struct types
    3. Or: monomorphize all cross-module generic calls at TC stage

================================================================================
SECTION 5: FAILURE RATE BY MODULE
================================================================================

Module               Tests  Pass  Fail  Rate    Severity
─────────────────────────────────────────────────────────
fulltext/tokenizer    8     3     5     62.5%   HIGH (string ops)
fulltext/distance     4     0     4     100%    CRITICAL (all fail)
fulltext/compression  8     4     4     50.0%   HIGH (SIGSEGV)
fulltext/encoding     4     2     2     50.0%   MEDIUM
fulltext/posting      4     2     2     50.0%   MEDIUM

vector/distance      12     6     6     50.0%   HIGH (float coercion)
vector/normalization  4     1     3     75.0%   HIGH (unwrap panic)
vector/hnsw/types    12    11     1      8.3%   LOW

storage/btree/key     4     0     4     100%    CRITICAL
storage/btree/range   3     0     3     100%    CRITICAL
storage/btree/prefix  5     1     4     80.0%   CRITICAL

================================================================================
SECTION 6: RECOMMENDATIONS FOR FIX PRIORITY
================================================================================

TIER 1: IMMEDIATE (Fix 20+ failures with small targeted changes)
  1. Float coercion in codegen
     Impact: 18 failures (vector distance, BM25, ln, magnitude)
     Fix: audit sqrt/abs/arithmetic ops, ensure f32 not coerced to i64
     Effort: LOW
     Est. time: 1-2 hours

  2. SIGSEGV in Vec<struct> operations
     Impact: 8 failures (delta_encoding, compressed_posting_list)
     Fix: apply v[i].field → tmp := mut v[i]; tmp.field pattern to test code
     Effort: MEDIUM
     Est. time: 1-2 hours

TIER 2: HIGH-IMPACT (Fix complex cross-module issues)
  3. Generic erasure in Vec<T>
     Impact: 12+ failures (tokenizer tokens, distance calculations)
     Fix: monomorphize Vec<TokenInfo>, Vec<f32> in codegen
     Effort: HIGH (requires codegen changes)
     Est. time: 4-6 hours

  4. ByteBuffer alignment issues in key encoding
     Impact: 7 failures (test_btree SIGBUS/SIGSEGV)
     Fix: explicit alignment before u64 reads, field order audit
     Effort: MEDIUM
     Est. time: 2-3 hours

TIER 3: COMPLEX (Long-term compiler fixes)
  5. Cross-module type resolution in codegen
     Impact: 4+ failures (tokenizer, serialization)
     Fix: connect TC resolved types to codegen infer_expr_type
     Effort: VERY HIGH (compiler change)
     Est. time: 6-8 hours

================================================================================
SECTION 7: TEST FAILURE SUMMARY TABLE
================================================================================

Test Name                                      Signal  Root Cause
─────────────────────────────────────────────────────────────────
tokenizer_should_tokenize_simple_text          exit 1  Vec<TokenInfo> len wrong (generic erasure)
tokenizer_should_lowercase_tokens              exit 1  TokenInfo.term reads garbage (cross-module)
tokenizer_should_track_token_positions         exit 1  Token position field wrong type
tokenizer_should_skip_position_for_stop_words  exit 1  Vec len/field access broken
tokenizer_should_handle_text_with_only_stop_   exit 1  Boolean field coercion
tokenizer_helpers_should_classify_word_bytes   exit 1  String/char comparison broken
tokenizer_helpers_should_lowercase_ascii       exit 1  String operation fail

bm25scorer_should_calculate_idf_correctly      exit 1  Float comparison (expected true)
bm25scorer_should_batch_score_by_summing       exit 1  Float operation result wrong

natural_log_approximation_should_compute_*     exit 1  ln() implementation broken (sqrt coercion)
  (4 tests)                                     exit 1

delta_encoding_should_round_trip_*             sig 11  Vec<u32> indexing with field access
delta_encoding_should_handle_single_element    sig 11  (same as above)
delta_encoding_should_handle_empty_list        sig 11  Null pointer from Vec operations
delta_encoding_should_handle_consecutive_*     sig 11  (same as above)

compressed_posting_list_should_*               sig 11  Vec<PostingEntryCompact> element size wrong
  (4 tests)                                     sig 11

postingentry_should_round_trip_via_to_bytes    exit 1  Serialized size mismatch (cross-module)
dictentry_should_serializedeserialize_*        exit 1  String field reads wrong bytes

cosine_distance_*                              exit 1  f32 operations return wrong (expected true)
l2_distance_*                                  exit 1  (sqrt operation, same cause)
dot_product_distance_*                         exit 1  (float arithmetic, same cause)
vector_magnitude_*                             exit 1  (sqrt, same cause)
dot_product_raw_*                              exit 1  (float sum, same cause)

vector_normalization_should_*                  sig 6   magnitude check unwrap panic
layerrng_should_produce_mostly_layer_*         exit 1  f32 float operation/rng

key_encoding_should_encode_i64_*               sig 10  ByteBuffer alignment (u64 not 8-byte aligned)
key_encoding_should_decode_i64_*               sig 10  (same)
key_encoding_should_encode_u64_*               sig 11  Misaligned u64 read → null pointer
key_encoding_should_encode_composite_*         sig 11  Vec<Vec<u8>> operations broken

keyrange_should_check_containment_*            sig 11  Vec field access or null pointer
keyrange_should_detect_past_end_*              sig 11  (same)

prefix_compression_should_compute_*            exit 1  Assertion: value mismatch (algorithm)
prefix_compression_should_compress_and_*       sig 10  ByteBuffer alignment
prefix_compression_should_save_space_*         sig 11  Vec operations
prefix_compression_should_support_restart_*    sig 10/11 (above two)

================================================================================
CONCLUSION
================================================================================

The 49 runtime failures fall into 4 main categories:

1. FLOAT TYPE COERCION (18 failures) — f32 operations not working
   - All distance metric tests fail (cosine, L2, dot product)
   - All ln() tests fail
   - Likely: sqrt, abs, arithmetic coercion to i64 instead of f32

2. GENERIC ERASURE IN VEC<T> (15+ failures) — Vec element size wrong
   - TokenInfo fields read as garbage (cross-module struct)
   - f32 vector operations fail (Vec<f32> stored as i64)
   - PostingEntry vector operations SIGSEGV
   - Root: generate_enum_variant_constructor uses single i64 payload

3. STRUCT FIELD ACCESS & ALIGNMENT (11 failures) — SIGBUS/SIGSEGV in key/compression tests
   - ByteBuffer reads unaligned (u64 not 8-byte aligned)
   - Vec[i].field pattern causes SIGSEGV
   - Workaround exists: tmp := mut v[i]; tmp.field

4. CROSS-MODULE TYPE RESOLUTION (5 failures) — codegen can't resolve remote struct fields
   - TokenInfo.term reads from wrong offset
   - Serialization size calculations wrong
   - Root: codegen infer_expr_type doesn't have TC resolved types

RECOMMENDED NEXT STEPS:
  a) Fix float coercion (easy, high-impact)
  b) Apply Vec[i].field → tmp workaround in tests
  c) Audit and fix ByteBuffer alignment
  d) Consider monomorphizing generic Vec types in codegen

