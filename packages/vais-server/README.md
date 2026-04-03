# vais-server

Express/Axum-style backend API framework written in pure Vais.

## Overview

`vais-server` is the backend layer of the Vais full-stack ecosystem:

```
vais-web  (frontend + SSR)
    ↕  HTTP / WebSocket
vais-server  (backend API framework)
    ↕  native query API
vaisdb  (vector + graph + relational + full-text database)
```

### Design Goals

- **Minimal core**: App + Router + Middleware pipeline as first-class primitives
- **Native vaisdb integration**: direct query execution without a separate ORM layer
- **Multi-protocol**: REST, GraphQL, gRPC, and WebSocket from one server instance
- **Built-in auth**: JWT, OAuth2, and session-based authentication included
- **Pure Vais**: no FFI required for the framework itself; system I/O delegated to `std/async_http` and `std/http_server`

## Project Structure

```
src/
├── core/          # App, Config, Error, Context — framework primitives
├── http/          # Request, Response, Headers, Body
├── router/        # Tree-based router, route groups, parameter extraction
├── middleware/    # Pipeline, Logger, Cors, RateLimit, Compress
├── auth/          # JWT, OAuth2, Guard, Session
├── ws/            # WebSocket server, connections, broadcast
├── db/            # vaisdb native client integration
├── api/           # REST helpers, GraphQL engine, gRPC stubs
├── util/          # JSON codec, UUID, hashing, validation
└── main.vais      # Entry point — demo server

tests/             # Integration and unit tests
examples/          # Runnable example servers
docs/
└── architecture/  # Design documents
```

## Minimum Server Example

```vais
U core/app
U core/config
U core/context

F main() -> i64 {
    config := ServerConfig {
        port: 8080,
        host: "0.0.0.0",
        env: "dev",
        max_connections: 1000,
        read_timeout_ms: 5000,
        write_timeout_ms: 5000,
        log_level: "info",
    }

    app := App.new(config)

    app.get("/", F(ctx: Context) -> Response {
        ctx.text(200, "Hello from vais-server!")
    })

    app.get("/health", F(ctx: Context) -> Response {
        ctx.json(200, "{\"status\":\"ok\"}")
    })

    M app.listen("0.0.0.0:8080") {
        Ok(_) => { 0 },
        Err(e) => {
            println("Server error: {e.message}")
            1
        },
    }
}
```

## Route Groups

```vais
api := app.group("/api/v1")
api.get("/users",        handle_list_users)
api.post("/users",       handle_create_user)
api.get("/users/:id",    handle_get_user)
api.put("/users/:id",    handle_update_user)
api.delete("/users/:id", handle_delete_user)
```

## Middleware

```vais
U middleware/logger
U middleware/cors

app.use(logger_middleware)
app.use(cors_middleware)
```

## WebSocket

```vais
app.ws("/ws/chat", F(ctx: Context) -> Response {
    # Upgrade to WebSocket and handle messages
    ctx.text(101, "Switching Protocols")
})
```

## vaisdb Integration

```vais
U db/client

conn := VaisDbClient.connect("localhost:5433")
rows := conn.query("SELECT * FROM users WHERE active = true")
```

## Version

0.1.0 — initial framework skeleton
