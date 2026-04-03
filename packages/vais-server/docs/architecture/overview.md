# vais-server Architecture Overview

## Full-Stack Ecosystem Position

vais-server is the backend API layer in the Vais full-stack ecosystem:

```
┌─────────────────────────────────────┐
│         vais-web                    │
│   (frontend + SSR)                  │
└──────────────┬──────────────────────┘
               │  HTTP / WebSocket
┌──────────────▼──────────────────────┐
│         vais-server                 │
│   (backend API framework)           │
└──────────────┬──────────────────────┘
               │  native query API
┌──────────────▼──────────────────────┐
│         vaisdb                      │
│  (vector + graph + SQL + FTS)       │
└─────────────────────────────────────┘
```

---

## Module Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         core                                │
│   App · ServerConfig · Context · VaisServerError            │
│   (framework primitives — everything depends on this)       │
└──────┬───────────┬──────────────────┬───────────────────────┘
       │           │                  │
┌──────▼──────┐ ┌──▼──────────┐ ┌────▼────────────────────┐
│    http     │ │   router    │ │      middleware          │
│  Request    │ │  RadixTree  │ │  Pipeline · CORS         │
│  Response   │ │  RouteGroup │ │  Logger · RateLimit      │
│  Header     │ │  Params     │ │  Compress · Recovery     │
│  Cookie     │ │             │ │                          │
└──────┬──────┘ └──┬──────────┘ └────┬─────────────────────┘
       │           │                  │
       └───────────┴──────────────────┘
                   │
       ┌───────────┴───────────────────────┐
       │           │           │           │
┌──────▼──┐  ┌────▼───┐  ┌────▼──┐  ┌────▼────┐
│  auth   │  │   ws   │  │  db   │  │   api   │
│  JWT    │  │ Server │  │ Pool  │  │  REST   │
│  OAuth  │  │ Room   │  │ Query │  │ GraphQL │
│  Guard  │  │ Msg    │  │Migrate│  │  gRPC   │
│ Session │  │        │  │ Model │  │ OpenAPI │
└─────────┘  └────────┘  └───────┘  └─────────┘
                                 │
                         ┌───────▼────────┐
                         │     util       │
                         │  JSON · Env    │
                         │  Validation    │
                         └───────────────┘
```

---

## Request Processing Flow

```
Client
  │
  │  TCP connection + raw HTTP bytes
  ▼
std/async_http  (Vais stdlib — HTTP/1.1 parsing)
  │
  │  Parsed method, path, headers, body
  ▼
Router (RadixTree match)
  │  ├─ No match → 404 Not Found
  │  └─ Method mismatch → 405 Method Not Allowed
  │
  │  Matched route + extracted path params
  ▼
Pipeline.run_before()  ← middleware[0].before()
                       ← middleware[1].before()
                       ← middleware[N].before()
  │
  │  BeforeResult.Respond?
  │  ├─ Yes → short-circuit → skip handler → run_after() → Response
  │  └─ No  → continue
  │
  ▼
Handler  F(ctx: Context) -> Response
  │
  │  handler Response
  ▼
Pipeline.run_after()   ← middleware[N].after()  (reverse order)
                       ← middleware[1].after()
                       ← middleware[0].after()
  │
  │  Final Response (headers, status, body)
  ▼
std/http_server  (write bytes back to client)
  │
  ▼
Client
```

### Before / After Symmetry

Middleware runs in **index order** on the way in and **reverse index order** on the way out. This means:

```
Registered order:  recovery → logger → cors → rate_limit
Before (in):       recovery → logger → cors → rate_limit → [handler]
After  (out):     [handler] → rate_limit → cors → logger → recovery
```

---

## Module Descriptions

### core
Framework primitives. Every other module depends on `core`.

| File | Responsibility |
|------|---------------|
| `app.vais` | `App` struct — route registration (`get`, `post`, `put`, `delete`, `patch`, `ws`), middleware registration (`use`), route groups (`group`), server startup (`listen`) |
| `config.vais` | `ServerConfig` — port, host, env, max_connections, timeouts, log_level with validation |
| `context.vais` | `Context` — per-request object carrying method, path, body, path_params, headers, state, response_headers; helper methods `text`, `json`, `status`, `set_header`, `set_state` |
| `error.vais` | `VaisServerError` — unified error type with status codes and messages |

### http
Raw HTTP primitives. Consumed by `core/context` and the runtime layer.

| File | Responsibility |
|------|---------------|
| `method.vais` | `HttpMethod` enum (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD) |
| `status.vais` | `HttpStatus` — 13 standard status codes with text mappings |
| `header.vais` | `Header` and `HeaderMap` — case-insensitive header storage |
| `cookie.vais` | `Cookie`, `CookieJar` — cookie parsing and serialisation |
| `request.vais` | `HttpRequest` — parsed request representation |
| `response.vais` | `Response` + builder chain — status, body, content_type, headers, redirect_url |

### router
Tree-based URL routing. Supports parameterised segments (`:id`) and nested groups.

| File | Responsibility |
|------|---------------|
| `tree.vais` | `RadixTree` — O(log n) route matching |
| `params.vais` | `PathParams` — extracts and stores `:param` values from matched paths |
| `route.vais` | `Route` — method + path + handler_id descriptor |
| `router.vais` | `Router` — wraps the tree; dispatches method and path |
| `group.vais` | `RouteGroup` — prefix-scoped sub-router |

### middleware
Pipeline-based middleware system. Every middleware implements `before(ctx) -> BeforeResult` and `after(ctx, response) -> Response`.

| Middleware | Behaviour |
|------------|-----------|
| `pipeline.vais` | `Pipeline` struct; `run_before` (forward pass) + `run_after` (reverse pass); `BeforeResult.Next` / `BeforeResult.Respond` short-circuit |
| `cors.vais` | Sets `Access-Control-*` headers; short-circuits OPTIONS preflight with 204 |
| `logger.vais` | Logs `[METHOD] /path` on before; logs `-> STATUS (Xms)` on after |
| `rate_limit.vais` | Per-IP sliding window; returns 429 with `Retry-After` when exceeded |
| `compress.vais` | Sets `Content-Encoding: gzip` on after when client accepts it and body meets minimum length |
| `recovery.vais` | Catches handler panics (body prefix `PANIC:` or status 0); returns 500 |

### auth
Built-in authentication and authorisation. No external crate required.

| File | Responsibility |
|------|---------------|
| `jwt.vais` | `TokenPair` (access + refresh), HS256 signing, claim validation |
| `oauth.vais` | OAuth 2.0 flow — CSRF state generation, code exchange |
| `session.vais` | Server-side session store with TTL |
| `guard.vais` | Route guards — enforce JWT or session before handler runs |
| `password.vais` | bcrypt-style hashing and verification |

### ws
WebSocket server conforming to RFC 6455.

| File | Responsibility |
|------|---------------|
| `message.vais` | `WsMessage` — text/binary/ping/pong/close frames |
| `handler.vais` | `WsHandler` — per-connection handler lifecycle |
| `room.vais` | `Room` — named broadcast groups |
| `server.vais` | `WsServer` — upgrade handshake, connection management, heartbeat |

### db
Native vaisdb client integration. No separate ORM layer needed.

| File | Responsibility |
|------|---------------|
| `connection.vais` | `DbConnection` — TCP (`host:port`) and Embedded (`db_path`) modes; `execute(sql)` |
| `pool.vais` | `ConnectionPool` — bounded pool with `acquire`, `release`, `health_check`, `stats` |
| `query.vais` | `QueryBuilder` — fluent builder for SQL, VECTOR_SEARCH, GRAPH_TRAVERSE, FULLTEXT_MATCH |
| `migrate.vais` | `Migrator` + `Migration` — versioned up/down migrations with history table |
| `model.vais` | `ModelDef`, `Field`, `VectorField`, `GraphEdge` — schema definition + DDL generation |

### api
Multi-protocol API layer.

| File | Responsibility |
|------|---------------|
| `rest.vais` | Pagination helpers, `RestRouter` convenience wrappers |
| `graphql.vais` | Schema introspection, query parsing, resolver dispatch |
| `grpc.vais` | gRPC service descriptors, request/response framing |
| `openapi.vais` | OpenAPI 3.0 document generation from registered routes |

### util
Shared utilities with no framework-level dependencies.

| File | Responsibility |
|------|---------------|
| `json.vais` | `json_encode` / `json_decode` for flat key-value structures |
| `validation.vais` | Field validators: required, min/max length, email, range |
| `env.vais` | Environment variable reading with type coercion |

---

## Design Principles

### Express / Axum Style
Route registration via `app.get("/path", "handler_id")` mirrors Express.js ergonomics. The `group()` sub-router pattern reflects Axum's `Router::nest`. Handlers are pure functions `F(ctx: Context) -> Response` — no global state.

### Middleware Pipeline
Middleware is the primary extension point. `Pipeline.run_before` executes middleware in registration order; `run_after` executes in reverse. Any middleware can short-circuit the chain by returning `BeforeResult.Respond` — subsequent `before` hooks and the handler are skipped, but `after` hooks for already-executed middleware still run.

### vaisdb Native Integration
`QueryBuilder` produces query strings for all four vaisdb engines (SQL, Vector, Graph, FTS) from one fluent API. There is no ORM layer; `DbConnection.execute(sql)` submits queries directly to the vaisdb wire protocol. `ConnectionPool` manages TCP or embedded connections with health-check recycling.

### Pure Vais
The framework itself uses no FFI. System I/O (`std/async_http`, `std/http_server`, `std/websocket`) is delegated to the Vais standard library. External runtime functions (`current_time_ms`, `str_len`, etc.) are declared with `X F` and resolved by `vaisc` at link time.
