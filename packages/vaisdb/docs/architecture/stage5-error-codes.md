# Stage 5: Error Code System

> **Status**: Design Complete
> **Impact**: IMMUTABLE after first client - error codes become part of the API contract
> **Last Updated**: 2026-02-02

---

## 1. Error Code Format

```
VAIS-EECCNNN

EE  = Engine code (2 digits)
CC  = Category code (2 digits)
NNN = Error number (3 digits)
```

Example: `VAIS-0102003` = Engine 01 (SQL), Category 02 (constraint), Error 003

### Format Rules

- Always 7 digits after `VAIS-`
- Zero-padded
- Codes are NEVER reused or reassigned
- Deprecated codes are marked but never recycled

---

## 2. Engine Codes (EE)

```
Code  Engine           Description
────  ──────           ───────────
00    common           Shared infrastructure errors that are NOT specific to any engine. Includes: transactions, configuration, authentication, and **unexpected internal errors** (programming bugs, assertion failures, invariant violations).
01    sql              SQL/relational engine
02    vector           Vector engine (HNSW, quantization)
03    graph            Graph engine (traversal, adjacency)
04    fulltext         Full-text search engine
05    storage          Storage layer errors for **expected failure conditions**: page corruption detected on read, WAL segment corruption, disk full, I/O errors. These are operational issues, not bugs.
06    server           Server/protocol layer
07    client           Client-side errors
08-99 (reserved)       Future engines and components
```

**Guideline**: If the error indicates a bug in VaisDB code, use EE=00 CC=05. If the error indicates a hardware/filesystem/operational issue, use EE=05.

---

## 3. Category Codes (CC)

```
Code  Category         Description
────  ────────         ───────────
01    syntax           Parse errors, malformed input
02    constraint       Constraint violations (PK, FK, NOT NULL, CHECK)
03    resource         Resource exhaustion (memory, disk, connections)
04    concurrency      Deadlock, timeout, write-write conflict
05    internal         Internal/unexpected errors (bugs)
06    auth             Authentication and authorization
07    config           Configuration errors
08    io               I/O errors (disk, network)
09    type             Type mismatch, casting errors
10    notfound         Entity not found (table, index, column)
11-99 (reserved)       Future categories
```

---

## 4. Initial Error Catalog

### Common Errors (EE=00)

```
Code           Name                        Message Template
────           ────                        ────────────────
VAIS-0001001   SYNTAX_ERROR                "Syntax error at position {pos}: {detail}"
VAIS-0001002   NOT_IMPLEMENTED             "Feature '{feature}' is not yet implemented"
VAIS-0003001   OUT_OF_MEMORY               "Insufficient memory: {component} requires {needed}, available {available}"
VAIS-0003002   DISK_FULL                   "Disk full: cannot write {bytes} bytes to {file}"
VAIS-0003003   MAX_CONNECTIONS             "Maximum connections ({max}) reached"
VAIS-0004001   TRANSACTION_TIMEOUT         "Transaction timeout after {seconds} seconds"
VAIS-0004002   DEADLOCK                    "Deadlock detected, transaction {txn_id} aborted"
VAIS-0004003   WRITE_CONFLICT              "Write-write conflict on {table}.{row}: transaction {other_txn} committed first"
VAIS-0004004   LOCK_TIMEOUT                "Lock wait timeout after {seconds} seconds"
VAIS-0004005   SERIALIZATION_FAILURE       "Transaction could not be serialized. Retry recommended."
VAIS-0005001   INTERNAL_ERROR              "Internal error: {detail} (please report this bug)"
VAIS-0005002   CHECKSUM_MISMATCH           "Page checksum mismatch: page {page_id} in {file}"
VAIS-0005003   WAL_CORRUPTION              "WAL corruption detected at LSN {lsn}"
VAIS-0006001   AUTH_FAILED                 "Authentication failed for user '{user}'"
VAIS-0006002   ACCESS_DENIED               "Access denied: {user} lacks {privilege} on {object}"
VAIS-0007001   INVALID_CONFIG              "Invalid configuration: {key} = {value}: {reason}"
VAIS-0007002   IMMUTABLE_CONFIG            "Cannot change immutable setting '{key}' after database creation"
VAIS-0008001   IO_ERROR                    "I/O error on {file}: {os_error}"
VAIS-0008002   FILE_NOT_FOUND              "Database file not found: {path}"
```

### SQL Engine Errors (EE=01)

```
Code           Name                        Message Template
────           ────                        ────────────────
VAIS-0101001   SQL_PARSE_ERROR             "SQL parse error at line {line}, col {col}: {detail}"
VAIS-0101002   UNKNOWN_FUNCTION            "Unknown function: {name}"
VAIS-0101003   AMBIGUOUS_COLUMN            "Ambiguous column reference: {column}"
VAIS-0102001   PK_VIOLATION                "Duplicate primary key: {table}({key})"
VAIS-0102002   NOT_NULL_VIOLATION          "NOT NULL constraint failed: {table}.{column}"
VAIS-0102003   UNIQUE_VIOLATION            "Unique constraint failed: {table}.{index}({value})"
VAIS-0102004   CHECK_VIOLATION             "CHECK constraint failed: {table}.{constraint}"
VAIS-0102005   FK_VIOLATION                "Foreign key constraint failed: {detail}"
VAIS-0102006   DATA_TOO_LONG               "Data too long for column '{column}' (max {max_len}, got {actual_len})"
VAIS-0109001   TYPE_MISMATCH               "Type mismatch: expected {expected}, got {actual}"
VAIS-0109002   CAST_ERROR                  "Cannot cast {value} from {from_type} to {to_type}"
VAIS-0109003   DIVISION_BY_ZERO            "Division by zero"
VAIS-0110001   TABLE_NOT_FOUND             "Table '{name}' does not exist"
VAIS-0110002   COLUMN_NOT_FOUND            "Column '{name}' not found in table '{table}'"
VAIS-0110003   INDEX_NOT_FOUND             "Index '{name}' does not exist"
VAIS-0110004   TABLE_EXISTS                "Table '{name}' already exists"
VAIS-0110005   INDEX_EXISTS                "Index '{name}' already exists"
```

### Vector Engine Errors (EE=02)

```
Code           Name                        Message Template
────           ────                        ────────────────
VAIS-0201001   VECTOR_PARSE_ERROR          "Invalid vector literal: {detail}"
VAIS-0202001   DIMENSION_MISMATCH          "Vector dimension mismatch: index expects {expected}, got {actual}"
VAIS-0202002   INVALID_DISTANCE_METRIC     "Unknown distance metric: {metric}"
VAIS-0202003   MODEL_MISMATCH              "Embedding model mismatch: index uses '{model}', got vector from '{other}'"
VAIS-0203001   HNSW_OOM                    "HNSW index out of memory: {index_name} requires {needed}"
VAIS-0205001   HNSW_CORRUPTION             "HNSW index corruption detected in {index_name}: {detail}"
VAIS-0209001   INVALID_VECTOR              "Invalid vector: {reason} (NaN, Inf, or wrong type)"
VAIS-0209002   VECTOR_TOO_LARGE            "Vector dimension {dim} exceeds maximum {max}"
VAIS-0210001   VECTOR_INDEX_NOT_FOUND      "Vector index '{name}' does not exist"
```

### Graph Engine Errors (EE=03)

```
Code           Name                        Message Template
────           ────                        ────────────────
VAIS-0301001   GRAPH_SYNTAX_ERROR          "Graph query syntax error: {detail}"
VAIS-0302001   SELF_LOOP                   "Self-loop not allowed: node {node_id}"
VAIS-0302002   DUPLICATE_EDGE              "Duplicate edge: ({src})-[:{type}]->({dst}) already exists"
VAIS-0303001   MAX_DEPTH_EXCEEDED          "Traversal depth limit ({max}) exceeded"
VAIS-0303002   TRAVERSAL_TIMEOUT           "Graph traversal timeout after {seconds} seconds"
VAIS-0310001   NODE_NOT_FOUND              "Node {node_id} does not exist"
VAIS-0310002   EDGE_NOT_FOUND              "Edge {edge_id} does not exist"
VAIS-0310003   EDGE_TYPE_NOT_FOUND         "Edge type '{type}' does not exist"
```

### Full-Text Engine Errors (EE=04)

```
Code           Name                        Message Template
────           ────                        ────────────────
VAIS-0401001   FTS_PARSE_ERROR             "Full-text query syntax error: {detail}"
VAIS-0403001   INDEX_TOO_LARGE             "Full-text index exceeds memory limit: {size}"
VAIS-0410001   FTS_INDEX_NOT_FOUND         "Full-text index '{name}' does not exist"
VAIS-0409001   UNSUPPORTED_LANGUAGE        "Unsupported language for tokenizer: {lang}"
```

### Storage Layer Errors (EE=05)

```
Code           Name                        Message Template
────           ────                        ────────────────
VAIS-0503001   PAGE_FULL                   "Page {page_id} is full, cannot insert {bytes} bytes"
VAIS-0503002   FREELIST_EMPTY              "No free pages available, file expansion required"
VAIS-0505001   PAGE_CORRUPTION             "Page corruption: {page_id} type={type} checksum mismatch"
VAIS-0505002   WAL_SEGMENT_CORRUPT         "WAL segment {segment} corrupted at offset {offset}"
VAIS-0508001   FSYNC_FAILED                "fsync failed on {file}: {os_error}"
VAIS-0508002   MMAP_FAILED                 "mmap failed: {os_error}"
VAIS-0508003   FLOCK_FAILED                "Cannot acquire database lock: another process has it"
VAIS-0508004   DISK_IO_ERROR               "Disk I/O error on {file}: {os_error}"
```

### Server Errors (EE=06)

```
Code           Name                        Message Template
────           ────                        ────────────────
VAIS-0601001   PROTOCOL_ERROR              "Wire protocol error: {detail}"
VAIS-0603001   SERVER_OVERLOADED           "Server overloaded: {active_queries} active queries"
VAIS-0608001   CONNECTION_RESET            "Connection reset by peer"
VAIS-0608002   TLS_ERROR                   "TLS handshake failed: {detail}"
```

---

## 5. Error Response Structure

### Internal Representation

```
struct VaisError {
    code: String,          // "VAIS-0102001"
    message: String,       // Human-readable message
    detail: Option<String>,// Additional detail (stack trace for internal errors)
    hint: Option<String>,  // Suggested fix
    severity: ErrorSeverity,  // ERROR, WARNING, FATAL
    line: Option<u32>,     // Source line number (for SQL parse errors)
    column: Option<u32>,   // Source column number (for SQL parse errors)
}

// Severity levels (matches PostgreSQL severity levels for client compatibility)
// - ERROR: Operation failed but connection is intact, can continue
// - WARNING: Operation succeeded but with caveats (e.g., truncation)
// - FATAL: Connection must be terminated (e.g., protocol violation, out of memory)
```

### Wire Protocol Response

```
ERROR {
    code: "VAIS-0102001",
    message: "Duplicate primary key: users(42)",
    hint: "Use INSERT ... ON CONFLICT to handle duplicates"
}
```

### Security: Error Sanitization

Client-facing errors NEVER include:
- Internal file paths
- Page IDs or LSNs
- Transaction IDs
- Stack traces
- Schema details not related to the query

Internal errors (VAIS-00050xx) log full details to server log but return generic message to client.

---

## 6. Extension Strategy

- New engines: use codes 08-99
- New categories: use codes 11-99
- New errors within existing engine/category: increment NNN
- Errors are NEVER removed or renumbered
- Deprecated errors are documented but code is reserved forever

---

## Verification Checklist

| Item | Status | Notes |
|------|--------|-------|
| Error code format defined | Done | VAIS-EECCNNN (7 digits) |
| Engine codes assigned | Done | 00-07, 08-99 reserved |
| Category codes assigned | Done | 01-10, 11-99 reserved |
| Common errors (EE=00) | Done | 19 error codes |
| SQL errors (EE=01) | Done | 17 error codes |
| Vector errors (EE=02) | Done | 9 error codes |
| Graph errors (EE=03) | Done | 8 error codes |
| Full-text errors (EE=04) | Done | 4 error codes |
| Storage errors (EE=05) | Done | 8 error codes |
| Server errors (EE=06) | Done | 4 error codes |
| Total error codes | Done | 69 error codes |
| No conflicts | Done | All codes unique |
| Extensible | Done | Reserved ranges for future |
| Error sanitization | Done | No internal details to clients |
