# Quickstart Guide

Get from zero to a running vais-server in minutes.

---

## Prerequisites

- **vais compiler** (`vaisc`) installed and on your `PATH`
- Familiarity with basic Vais syntax (structs `S`, extensions `X`, functions `F`, match `M`)

Verify your installation:

```sh
vaisc --version
```

---

## Step 1: Hello World Server

Create `hello.vais`:

```vais
U core/app
U core/config
U core/context

C PORT: u16 = 8080

F handle_hello(ctx: Context) -> Response {
    ctx.text(200, "Hello, World!")
}

F main() -> i64 {
    config := ServerConfig.default()
    app    := mut App.new(config)

    app.get("/", "handle_hello")

    addr := ":{PORT}"
    println("Listening on {addr}")

    M app.listen(addr) {
        Ok(_) => { 0 },
        Err(e) => {
            println("Server error: {e.message}")
            1
        },
    }
}
```

Build and run:

```sh
vaisc build hello.vais -o hello
./hello
# Listening on :8080
```

Test it:

```sh
curl http://localhost:8080/
# Hello, World!
```

### What is happening

| Line | Explanation |
|------|-------------|
| `U core/app` | Import the `App` type |
| `ServerConfig.default()` | Port 8080, host 0.0.0.0, env dev, 1000 max connections |
| `app.get("/", "handle_hello")` | Register a GET route; the second argument is the handler name string |
| `app.listen(addr)` | Validate config, print banner, block on accept loop |

---

## Step 2: Custom Configuration

Instead of `ServerConfig.default()` you can set every field manually:

```vais
U core/app
U core/config
U core/context

F handle_health(ctx: Context) -> Response {
    ctx.json(200, "{\"status\":\"ok\"}")
}

F main() -> i64 {
    config := ServerConfig {
        port:             3000,
        host:             "127.0.0.1",
        env:              "prod",
        max_connections:  500,
        read_timeout_ms:  3000,
        write_timeout_ms: 3000,
        log_level:        "warn",
    }

    app := mut App.new(config)
    app.get("/health", "handle_health")

    M app.listen("127.0.0.1:3000") {
        Ok(_) => { 0 },
        Err(e) => { println(e.message); 1 },
    }
}
```

Valid values:

| Field | Accepted values |
|-------|----------------|
| `env` | `"dev"` or `"prod"` |
| `log_level` | `"debug"`, `"info"`, `"warn"`, `"error"` |
| `port` | 1–65535 |

---

## Step 3: REST API Server (CRUD)

A full users CRUD under `/api/v1/users`:

```vais
U core/app
U core/config
U core/context
U util/json

# GET /api/v1/users
F handle_list_users(ctx: Context) -> Response {
    pairs := Vec.new()
    pairs.push("id");   pairs.push("1")
    pairs.push("name"); pairs.push("Alice")
    body := "[" + json_encode(pairs) + "]"
    ctx.json(200, body)
}

# GET /api/v1/users/:id
F handle_get_user(ctx: Context) -> Response {
    id := ctx.path_params      # e.g. "id=42"
    pairs := Vec.new()
    pairs.push("id");    pairs.push(id)
    pairs.push("name");  pairs.push("Alice")
    ctx.json(200, json_encode(pairs))
}

# POST /api/v1/users
F handle_create_user(ctx: Context) -> Response {
    # ctx.body contains the raw request body
    pairs := Vec.new()
    pairs.push("id");     pairs.push("3")
    pairs.push("status"); pairs.push("created")
    ctx.json(201, json_encode(pairs))
}

# PUT /api/v1/users/:id
F handle_update_user(ctx: Context) -> Response {
    id := ctx.path_params
    pairs := Vec.new()
    pairs.push("id");     pairs.push(id)
    pairs.push("status"); pairs.push("updated")
    ctx.json(200, json_encode(pairs))
}

# DELETE /api/v1/users/:id
F handle_delete_user(ctx: Context) -> Response {
    ctx.status(204)
}

F main() -> i64 {
    config := ServerConfig.default()
    app    := mut App.new(config)

    # Route group: all routes inherit the /api/v1 prefix
    v1 := mut app.group("/api/v1")

    v1.get("/users",        "handle_list_users")
    v1.get("/users/:id",    "handle_get_user")
    v1.post("/users",       "handle_create_user")
    v1.put("/users/:id",    "handle_update_user")
    v1.delete("/users/:id", "handle_delete_user")

    # Merge group routes back into the main app
    I i = 0; i < v1.route_count(); i = i + 1 {
        r := v1.routes.get(i)
        app._add_route(r.method, r.path, r.handler_id)
    }

    M app.listen(":8080") {
        Ok(_) => { 0 },
        Err(e) => { println(e.message); 1 },
    }
}
```

Routes registered:

```
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users
PUT    /api/v1/users/:id
DELETE /api/v1/users/:id
```

---

## Step 4: Adding Middleware

Register global middleware with `app.use()`. Middleware runs on every request:

```vais
U core/app
U core/config
U core/context

F handle_hello(ctx: Context) -> Response {
    ctx.text(200, "Hello!")
}

F main() -> i64 {
    config := ServerConfig.default()
    app    := mut App.new(config)

    # Built-in middleware — register by name
    app.use("recovery")    # Must be first: catches panics from later middleware
    app.use("logger")      # Logs [METHOD] /path -> STATUS (Xms)
    app.use("cors")        # Sets Access-Control-* headers; handles OPTIONS

    app.get("/", "handle_hello")

    M app.listen(":8080") {
        Ok(_) => { 0 },
        Err(e) => { println(e.message); 1 },
    }
}
```

Execution order for `GET /`:

```
recovery.before → logger.before → cors.before → [handler] → cors.after → logger.after → recovery.after
```

See the [Middleware Guide](middleware.md) for the full middleware reference.

---

## Step 5: Connecting to vaisdb

```vais
U core/app
U core/config
U core/context
U db/connection
U db/query

F handle_users(ctx: Context) -> Response {
    cfg  := DbConfig.tcp("localhost", 5433)

    M DbConnection.connect(cfg) {
        Ok(conn) => {
            sql := QueryBuilder.new()
                .select("users")
                .column("id")
                .column("name")
                .where_clause("active = true")
                .order_by("name", SortDirection.Asc)
                .limit(20)
                .build()

            M conn.execute(sql) {
                Ok(result) => {
                    ctx.json(200, "{\"count\":{result.row_count()}}")
                },
                Err(e) => {
                    ctx.json(500, "{\"error\":\"{e.message}\"}")
                },
            }
        },
        Err(e) => {
            ctx.json(503, "{\"error\":\"{e.message}\"}")
        },
    }
}

F main() -> i64 {
    config := ServerConfig.default()
    app    := mut App.new(config)

    app.get("/users", "handle_users")

    M app.listen(":8080") {
        Ok(_) => { 0 },
        Err(e) => { println(e.message); 1 },
    }
}
```

For connection pooling and advanced queries, see the [Database Guide](database.md).

---

## Project Layout Recommendation

```
my-app/
├── src/
│   ├── main.vais          # App setup + app.listen()
│   ├── handlers/
│   │   ├── users.vais     # Route handler functions
│   │   └── auth.vais
│   └── models/
│       └── user.vais      # ModelDef + migrations
├── tests/
│   └── integration/
│       └── test_users.vais
└── vais.toml              # Build manifest (if using vaisc workspace)
```

---

## Next Steps

- [Middleware Guide](middleware.md) — before/after pipeline, built-in and custom middleware
- [Database Guide](database.md) — SQL, Vector, Graph, FTS queries; migrations; Model DDL
- [Architecture Overview](../architecture/overview.md) — module diagram and request flow
