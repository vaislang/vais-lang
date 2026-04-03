# VaisDB Operations Guide

## Security

### User Management

```sql
-- Create user
CREATE USER analyst WITH PASSWORD 'secure_password';

-- Alter user
ALTER USER analyst WITH PASSWORD 'new_password';
ALTER USER analyst VALID UNTIL '2027-01-01';

-- Drop user
DROP USER analyst;
DROP USER IF EXISTS analyst CASCADE;
```

### Role Management

```sql
-- Create role
CREATE ROLE readonly;
CREATE ROLE readwrite;

-- Grant privileges
GRANT SELECT ON documents TO readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO readwrite;

-- Column-level privileges
GRANT SELECT (id, title) ON documents TO analyst;

-- Assign roles to users
GRANT readonly TO analyst;

-- Revoke
REVOKE INSERT ON documents FROM readwrite;
```

### Row-Level Security (RLS)

```sql
-- Enable RLS on a table
CREATE POLICY tenant_isolation ON documents
    USING (tenant_id = current_tenant_id());

-- Policy applies to all operations (SELECT, INSERT, UPDATE, DELETE)
-- Superusers bypass RLS
```

### Encryption

VaisDB supports transparent data encryption:
- **Page encryption** -- AES-256-CTR for data pages
- **WAL encryption** -- Encrypts WAL records at rest
- **Key rotation** -- Online key rotation without downtime

Configuration:
```sql
ALTER SYSTEM SET encryption_enabled = true;
ALTER SYSTEM SET encryption_algorithm = 'aes-256-ctr';
```

### TLS

```sql
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_cert_file = '/path/to/server.crt';
ALTER SYSTEM SET ssl_key_file = '/path/to/server.key';
```

### Audit Logging

```sql
ALTER SYSTEM SET audit_enabled = true;
ALTER SYSTEM SET audit_log_level = 'all';  -- 'none', 'ddl', 'dml', 'all'
```

Audit log features:
- Append-only with checksum chain (tamper detection)
- Logs: authentication events, DDL, DML, privilege checks
- Includes: timestamp, user, client address, SQL statement, result

---

## Backup & Recovery

### Physical Backup

```sql
-- Online physical backup (while database is running)
BACKUP TO '/path/to/backup/';

-- Backup with WAL archiving for PITR
BACKUP TO '/path/to/backup/' WITH (wal_archive = true);
```

### Point-in-Time Recovery (PITR)

```sql
-- Restore to a specific LSN
RESTORE FROM '/path/to/backup/' TO LSN 12345678;

-- Restore to a timestamp
RESTORE FROM '/path/to/backup/' TO TIMESTAMP '2026-02-28 10:00:00';
```

### Logical Backup (SQL Dump)

```sql
-- Dump entire database
DUMP TO '/path/to/dump.sql';

-- Dump specific tables
DUMP TABLE documents TO '/path/to/documents.sql';

-- Restore from dump
RESTORE FROM '/path/to/dump.sql';
```

### Data Import/Export (COPY)

```sql
-- Import CSV
COPY documents FROM '/path/to/data.csv' WITH (FORMAT CSV, HEADER true);

-- Import JSON
COPY documents FROM '/path/to/data.json' WITH (FORMAT JSON);

-- Import JSONL (one object per line)
COPY documents FROM '/path/to/data.jsonl' WITH (FORMAT JSONL);

-- Import binary vectors
COPY vectors FROM '/path/to/vectors.bin' WITH (FORMAT VECTOR_BINARY);

-- Export CSV
COPY documents TO '/path/to/export.csv' WITH (FORMAT CSV, HEADER true);
```

---

## Monitoring

### System Metrics

```sql
-- System health check
SELECT * FROM vais_health();

-- Buffer pool metrics
SELECT * FROM vais_metrics('buffer_pool');

-- WAL metrics
SELECT * FROM vais_metrics('wal');

-- Transaction metrics
SELECT * FROM vais_metrics('txn');

-- Per-engine metrics
SELECT * FROM vais_metrics('vector');
SELECT * FROM vais_metrics('graph');
SELECT * FROM vais_metrics('fulltext');
```

Key metrics tracked:
- **Buffer pool**: hit ratio, page reads/writes, evictions, dirty pages
- **WAL**: bytes written, syncs, group commit batches, checkpoint duration
- **Transactions**: active count, commits/sec, aborts/sec, deadlocks
- **Vector**: search latency, insert throughput, node count
- **Graph**: traversal latency, node/edge count, avg degree
- **Full-text**: search latency, index size, total terms/documents

### Slow Query Log

```sql
-- Configure slow query threshold
ALTER SYSTEM SET slow_query_threshold = '100ms';

-- View slow queries (ring buffer)
SELECT * FROM vais_slow_queries()
ORDER BY duration_ms DESC LIMIT 20;
```

Slow query entries include:
- SQL text, duration, rows scanned, rows produced
- Timestamp, plan time vs execution time
- Peak memory usage

### Query Profiling

```sql
-- Profile a specific query
EXPLAIN ANALYZE SELECT * FROM documents WHERE id = 1;
```

Output includes:
- Per-node execution time (plan time + exec time)
- Rows scanned vs rows produced at each node
- Buffer pool hits/misses

---

## Maintenance

### VACUUM

```sql
-- Standard vacuum (reclaim dead tuples, update visibility map)
VACUUM documents;

-- Full vacuum (rewrite table, compact pages)
VACUUM FULL documents;

-- Vacuum with statistics refresh
VACUUM ANALYZE documents;
```

VACUUM operations:
1. Scan for dead tuples (txn expired, not visible to any active snapshot)
2. Reclaim undo log space
3. Update freelist bitmap
4. Compact pages (FULL mode only)

### ANALYZE

```sql
-- Refresh table statistics (for query optimizer)
ANALYZE documents;

-- Analyze all tables
ANALYZE;
```

Statistics collected:
- Row count, page count
- Per-column: distinct values, null fraction, min/max, histogram
- Reservoir sampling for representative value distribution

### REINDEX

```sql
-- Rebuild a specific index
REINDEX INDEX idx_embedding;

-- Rebuild all indexes on a table
REINDEX TABLE documents;

-- Rebuild all indexes in database
REINDEX DATABASE;
```

### Log Rotation

Automatic log rotation based on:
- **Size**: Rotate when log file exceeds configured size
- **Time**: Rotate at configured interval (hourly, daily)
- Compressed archival of rotated files

```sql
ALTER SYSTEM SET log_rotation_size = '100MB';
ALTER SYSTEM SET log_rotation_age = '1d';
```

---

## Configuration Reference

### Connection Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| `port` | 5433 | TCP listen port |
| `bind_address` | 0.0.0.0 | Bind address |
| `max_connections` | 100 | Maximum concurrent connections |
| `idle_timeout` | 300s | Idle connection timeout |

### Memory Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| `shared_buffers` | 128MB | Buffer pool size |
| `work_mem` | 4MB | Per-operation memory limit |
| `maintenance_work_mem` | 64MB | Memory for VACUUM, REINDEX |

### WAL Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| `wal_segment_size` | 16MB | WAL segment file size |
| `checkpoint_interval` | 5min | Time between checkpoints |
| `fsync` | on | Fsync WAL writes to disk |

### Query Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| `statement_timeout` | 0 (off) | Maximum statement execution time |
| `lock_timeout` | 0 (off) | Maximum lock wait time |
| `deadlock_timeout` | 1s | Deadlock detection interval |
| `max_concurrent_queries` | 0 (unlimited) | Per-connection query limit |

### Changing Settings

```sql
-- Session-level (current session only)
SET work_mem = '64MB';
SET statement_timeout = '30s';

-- System-level (persistent, requires RELOAD or restart)
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';

-- Reload configuration without restart
SELECT pg_reload_conf();
-- Or send SIGHUP to the server process
```

### Configuration Hierarchy

1. **Default** (compiled-in defaults)
2. **System** (`ALTER SYSTEM`, stored in meta.vdb)
3. **Session** (`SET`, per-connection override)

Higher levels override lower levels.
