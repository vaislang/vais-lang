# Database Guide

vais-server integrates with **vaisdb** natively — no separate ORM layer is required. The `db/` module provides direct access to all four vaisdb query engines: SQL, Vector, Graph, and Full-Text Search.

---

## Connecting to vaisdb

### TCP mode (remote server)

Connect to a running vaisdb instance over TCP:

```vais
U db/connection

cfg  := DbConfig.tcp("localhost", 5433)

M DbConnection.connect(cfg) {
    Ok(conn) => {
        println("Connected: {conn.to_string()}")
        # use conn …
    },
    Err(e) => {
        println("Connection failed: {e.to_string()}")
    },
}
```

### Embedded mode (in-process file)

Open a local vaisdb database file directly inside the process:

```vais
U db/connection

cfg  := DbConfig.embedded("./data/app.vdb")

M DbConnection.connect(cfg) {
    Ok(conn) => {
        println("Embedded DB open: {conn.to_string()}")
    },
    Err(e) => {
        println("Failed to open: {e.to_string()}")
    },
}
```

### DbConfig fields

| Field | TCP default | Embedded default |
|-------|------------|-----------------|
| `host` | required | `""` |
| `port` | required | `0` |
| `db_path` | `""` | required |
| `timeout_ms` | `5000` | `5000` |

---

## Connection Pool

For production servers, use `ConnectionPool` instead of a bare `DbConnection`. The pool manages a bounded set of connections, pre-opens `min_connections` on startup, and recycles dead connections.

### Setup

```vais
U db/connection
U db/pool

db_cfg   := DbConfig.tcp("localhost", 5433)
pool_cfg := PoolConfig.new(
    2,      # min_connections — pre-opened at startup
    10,     # max_connections — hard cap
    30000   # idle_timeout_ms — health-check recycle window
)

M ConnectionPool.new(db_cfg, pool_cfg) {
    Ok(pool) => {
        # pool is ready
    },
    Err(e) => {
        println("Pool init failed: {e.to_string()}")
    },
}
```

`PoolConfig.default()` gives `min=2`, `max=10`, `idle_timeout_ms=30000`.

### Acquire and release

```vais
M pool.acquire() {
    Ok(conn) => {
        M conn.execute("SELECT 1") {
            Ok(_) => { println("ping ok") },
            Err(e) => { println(e.message) },
        }
        pool.release(conn)
    },
    Err(e) => {
        println("Pool exhausted: {e.message}")
    },
}
```

Always call `pool.release(conn)` after use — the pool marks the slot as idle and makes it available to the next caller. If all connections are in use and `max_connections` has been reached, `acquire` returns `Err` with code `3003`.

### Pool diagnostics

```vais
stats := pool.stats()
println(stats.to_string())
# PoolStats { active=3, idle=7, total=10 }
```

### Health check

Call `pool.health_check()` periodically to detect and recycle stale connections:

```vais
pool.health_check()   # pings idle connections with "SELECT 1"; replaces dead ones
```

### Shutdown

```vais
pool.close_all()      # closes every connection and empties the pool
```

---

## QueryBuilder

`QueryBuilder` is a fluent builder that produces query strings for all four vaisdb engines. All methods return `QueryBuilder` to support chaining. Call `.build()` at the end to get the final query string, then pass it to `conn.execute(sql)`.

### SQL Queries

#### SELECT

```vais
U db/query

sql := QueryBuilder.new()
    .select("users")
    .column("id")
    .column("name")
    .column("email")
    .where_clause("active = true")
    .where_clause("age > 18")           # ANDed with previous WHERE
    .order_by("name", SortDirection.Asc)
    .limit(50)
    .build()

# SELECT id, name, email FROM users WHERE active = true AND age > 18 ORDER BY name ASC LIMIT 50
```

SELECT with JOIN:

```vais
sql := QueryBuilder.new()
    .select("orders")
    .column("orders.id")
    .column("users.name")
    .column("orders.total")
    .join("users", "users.id = orders.user_id")
    .where_clause("orders.status = 'paid'")
    .order_by("orders.created_at", SortDirection.Desc)
    .limit(20)
    .build()

# SELECT orders.id, users.name, orders.total
#   FROM orders JOIN users ON users.id = orders.user_id
#   WHERE orders.status = 'paid'
#   ORDER BY orders.created_at DESC LIMIT 20
```

SELECT all columns (no `.column()` calls):

```vais
sql := QueryBuilder.new()
    .select("products")
    .where_clause("in_stock = true")
    .build()

# SELECT * FROM products WHERE in_stock = true
```

#### INSERT

```vais
fields := Vec.new()
fields.push("name")
fields.push("email")

sql := QueryBuilder.new()
    .insert("users", fields)
    .build()

# INSERT INTO users (name, email) VALUES (?, ?)
```

Bind values are passed positionally at execution time by the vaisdb runtime.

#### UPDATE

```vais
fields := Vec.new()
fields.push("name")
fields.push("email")

sql := QueryBuilder.new()
    .update("users", fields)
    .where_clause("id = 42")
    .build()

# UPDATE users SET name = ?, email = ? WHERE id = 42
```

#### DELETE

```vais
sql := QueryBuilder.new()
    .delete("users")
    .where_clause("id = 42")
    .build()

# DELETE FROM users WHERE id = 42
```

---

### Vector Search

vaisdb supports approximate nearest-neighbour (ANN) search via HNSW indexing. Use `vector_search` to find the top-K most similar rows.

```vais
U db/query

# Find the 5 most similar document embeddings to a query vector
query_vec := "[0.12, 0.87, 0.34, 0.56]"

sql := QueryBuilder.new()
    .select("documents")
    .column("id")
    .column("title")
    .vector_search("embedding", query_vec, 5)
    .build()

# SELECT id, title FROM documents
#   WHERE VECTOR_SEARCH(embedding, [0.12, 0.87, 0.34, 0.56], 5)
```

Parameters for `vector_search(column, vector, top_k)`:

| Parameter | Type | Description |
|-----------|------|-------------|
| `column` | `str` | Column name of type `VECTOR(N)` |
| `vector` | `str` | Query vector literal, e.g. `"[0.1, 0.2, …]"` |
| `top_k` | `i64` | Number of nearest neighbours to return |

Add additional WHERE conditions or LIMIT after the vector clause:

```vais
sql := QueryBuilder.new()
    .select("products")
    .column("id")
    .column("name")
    .vector_search("feature_vec", "[0.5, 0.3]", 10)
    .where_clause("category = 'electronics'")
    .limit(5)
    .build()
```

---

### Graph Traversal

Query relationships stored as `GRAPH_EDGE` columns using `graph_traverse`.

```vais
U db/query

# Traverse outbound edges from node "user:42" up to depth 2
sql := QueryBuilder.new()
    .select("social_graph")
    .column("id")
    .column("name")
    .graph_traverse("user:42", 2, "outbound")
    .build()

# SELECT id, name
#   FROM GRAPH_TRAVERSE('user:42', 2, 'outbound')
```

Parameters for `graph_traverse(start, depth, direction)`:

| Parameter | Type | Values | Description |
|-----------|------|--------|-------------|
| `start` | `str` | node identifier | Starting node, e.g. `"user:42"` |
| `depth` | `i64` | 1 or greater | Maximum hop depth |
| `direction` | `str` | `"outbound"`, `"inbound"`, `"any"` | Edge direction |

With filtering:

```vais
sql := QueryBuilder.new()
    .select("knowledge_graph")
    .column("id")
    .column("label")
    .column("type")
    .graph_traverse("concept:ml", 3, "any")
    .where_clause("type = 'topic'")
    .order_by("label", SortDirection.Asc)
    .limit(50)
    .build()
```

---

### Full-Text Search

vaisdb indexes text columns for full-text search. Use `fulltext_match` to perform natural-language queries.

```vais
U db/query

sql := QueryBuilder.new()
    .select("articles")
    .column("id")
    .column("title")
    .column("snippet")
    .fulltext_match("body", "vais server framework tutorial")
    .order_by("relevance", SortDirection.Desc)
    .limit(10)
    .build()

# SELECT id, title, snippet FROM articles
#   WHERE FULLTEXT_MATCH(body, 'vais server framework tutorial')
#   ORDER BY relevance DESC LIMIT 10
```

Parameters for `fulltext_match(column, query)`:

| Parameter | Type | Description |
|-----------|------|-------------|
| `column` | `str` | Column name indexed for FTS |
| `query` | `str` | Natural-language search query |

With additional filter:

```vais
sql := QueryBuilder.new()
    .select("posts")
    .column("id")
    .column("title")
    .fulltext_match("content", "rust async performance")
    .where_clause("published = true")
    .limit(20)
    .build()
```

---

## Executing Queries

All query strings produced by `QueryBuilder.build()` are executed through `DbConnection.execute(sql)`:

```vais
M conn.execute(sql) {
    Ok(result) => {
        println("Rows: {result.row_count()}")
        I i = 0; i < result.row_count(); i = i + 1 {
            row := result.rows.get(i)
            println(row.get())    # "id=1,name=Alice,email=alice@example.com"
        }
    },
    Err(e) => {
        println("Query error [{e.code}]: {e.message}")
    },
}
```

`QueryResult` fields:

| Field | Type | Description |
|-------|------|-------------|
| `rows` | `Vec<Row>` | Result rows; each `Row.get()` returns a `key=value` string |
| `affected_rows` | `i64` | Rows changed for INSERT/UPDATE/DELETE |
| `columns` | `Vec<str>` | Column names in result order |
| `row_count()` | `i64` | Number of rows returned |

---

## Migrations

`Migrator` manages versioned schema changes. Migrations are tracked in the `__vaisdb_migrations` table (created automatically on first use).

### Defining migrations

```vais
U db/migrate

m1 := Migration.new(
    1,
    "create_users",
    "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL)",
    "DROP TABLE users"
)

m2 := Migration.new(
    2,
    "add_users_active",
    "ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE users DROP COLUMN active"
)
```

### Running migrations

```vais
M Migrator.new(conn) {
    Ok(migrator) => {
        migrator.add_migration(m1)
        migrator.add_migration(m2)

        M migrator.run_up() {
            Ok(count) => { println("Applied {count} migration(s)") },
            Err(e)    => { println("Migration failed: {e.message}") },
        }
    },
    Err(e) => { println("Migrator init failed: {e.message}") },
}
```

### Rolling back

```vais
# Roll back all migrations down to (and including) version 1
M migrator.run_down(1) {
    Ok(count) => { println("Rolled back {count} migration(s)") },
    Err(e)    => { println("Rollback failed: {e.message}") },
}
```

### Migration status

```vais
println(migrator.to_string())
# Migrator { current_version=2, registered=2 }
```

---

## Model Definition and DDL Generation

`ModelDef` defines a table schema in code and generates the corresponding `CREATE TABLE` SQL.

### Standard table

```vais
U db/model

mut model := ModelDef.new("users")
model.add_field(Field.primary_key("id",    "INTEGER"))
model.add_field(Field.not_null("name",     "TEXT"))
model.add_field(Field.not_null("email",    "TEXT"))
model.add_field(Field.with_default("active", "INTEGER", "1"))

println(model.create_table_sql())
```

Output:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  active INTEGER DEFAULT 1
)
```

### Table with vector column (ANN index)

```vais
mut model := ModelDef.new("documents")
model.add_field(Field.primary_key("id",    "INTEGER"))
model.add_field(Field.not_null("title",    "TEXT"))
model.add_vector_field(VectorField.new("embedding", 768))

println(model.create_table_sql())
```

Output:

```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  embedding VECTOR(768) NOT NULL INDEX HNSW
)
```

### Table with graph edge column (adjacency index)

```vais
mut model := ModelDef.new("social_graph")
model.add_field(Field.primary_key("id",   "INTEGER"))
model.add_field(Field.not_null("user_id", "INTEGER"))
model.add_graph_edge(GraphEdge.new("follows", "social_graph"))

println(model.create_table_sql())
```

Output:

```sql
CREATE TABLE social_graph (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  follows GRAPH_EDGE NOT NULL INDEX ADJACENCY
)
```

### Field factory methods

| Factory | Nullable | PK | Default |
|---------|----------|----|---------|
| `Field.new(name, type)` | yes | no | none |
| `Field.primary_key(name, type)` | no | yes | none |
| `Field.not_null(name, type)` | no | no | none |
| `Field.with_default(name, type, default)` | yes | no | provided |
| `Field.vector(name, dimensions)` | no | no | HNSW index |
| `Field.graph_edge(name)` | no | no | ADJACENCY index |

### DDL helpers on ModelDef

| Method | Output |
|--------|--------|
| `create_table_sql()` | `CREATE TABLE …` |
| `create_table_if_not_exists_sql()` | `CREATE TABLE IF NOT EXISTS …` |
| `drop_table_sql()` | `DROP TABLE …` |
| `drop_table_if_exists_sql()` | `DROP TABLE IF EXISTS …` |
| `field_count()` | number of defined fields |

---

## Complete Example: Users API with DB

```vais
U core/app
U core/config
U core/context
U db/connection
U db/pool
U db/query
U db/model
U db/migrate

F setup_schema(conn: DbConnection) {
    mut model := ModelDef.new("users")
    model.add_field(Field.primary_key("id",    "INTEGER"))
    model.add_field(Field.not_null("name",     "TEXT"))
    model.add_field(Field.not_null("email",    "TEXT"))

    ddl := model.create_table_if_not_exists_sql()
    conn.execute(ddl)
}

F handle_users(ctx: Context) -> Response {
    cfg := DbConfig.tcp("localhost", 5433)
    M DbConnection.connect(cfg) {
        Ok(conn) => {
            sql := QueryBuilder.new()
                .select("users")
                .column("id")
                .column("name")
                .order_by("name", SortDirection.Asc)
                .limit(100)
                .build()

            M conn.execute(sql) {
                Ok(result) => {
                    conn.close()
                    ctx.json(200, "{\"count\":{result.row_count()}}")
                },
                Err(e) => {
                    conn.close()
                    ctx.json(500, "{\"error\":\"{e.message}\"}")
                },
            }
        },
        Err(e) => { ctx.json(503, "{\"error\":\"{e.message}\"}") },
    }
}

F main() -> i64 {
    config := ServerConfig.default()
    app    := mut App.new(config)

    app.use("logger")
    app.get("/users", "handle_users")

    M app.listen(":8080") {
        Ok(_) => { 0 },
        Err(e) => { println(e.message); 1 },
    }
}
```
