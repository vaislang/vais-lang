# CLAUDE.md - vais-server AI Assistant Guide

## Project Overview

`vais-server` is an Express/Axum-style backend API framework written in **pure Vais**. It is the backend layer of the Vais full-stack ecosystem:

```
vais-web  (frontend + SSR)
    ↕  HTTP / WebSocket
vais-server  (backend API framework)      ← this project
    ↕  native query API
vaisdb  (vector + graph + relational + full-text database)
```

Key characteristics:
- **Minimal core**: App + Router + Middleware pipeline as first-class primitives
- **Native vaisdb integration**: direct query execution, no ORM
- **Multi-protocol**: REST, GraphQL, gRPC, WebSocket from one server instance
- **Built-in auth**: JWT, OAuth2, session-based authentication
- **Pure Vais**: no FFI; system I/O via `std/async_http`, `std/http_server`, `std/websocket`

---

## Language

All source files are written in **pure Vais** (`.vais` extension).

Build command:

```sh
vaisc build src/main.vais -o vais-server
```

Run:

```sh
./vais-server
```

### Vais keyword reference

| Keyword | Meaning |
|---------|---------|
| `S` | struct definition |
| `X` | extension (impl block) |
| `F` | function definition |
| `E` | enum definition |
| `C` | constant |
| `U` | use/import |
| `I` | if |
| `E` (after `I`) | else |
| `M` | match |
| `R` | return |
| `mut` | mutable binding |
| `X F` | external function declaration (FFI stub) |

### Result type pattern

```vais
M some_fn() {
    Ok(value) => { /* use value */ },
    Err(e)    => { /* handle e.message */ },
}
```

---

## Project Structure

```
vais-server/
├── src/
│   ├── main.vais              # Entry point — demo server
│   ├── core/
│   │   ├── app.vais           # App struct, route/middleware registration, listen()
│   │   ├── config.vais        # ServerConfig with validation
│   │   ├── context.vais       # Context — per-request state, helper methods
│   │   └── error.vais         # VaisServerError — unified error type
│   ├── http/
│   │   ├── method.vais        # HttpMethod enum
│   │   ├── status.vais        # HttpStatus — 13 standard codes
│   │   ├── header.vais        # Header, HeaderMap
│   │   ├── cookie.vais        # Cookie, CookieJar
│   │   ├── request.vais       # HttpRequest
│   │   └── response.vais      # Response + builder chain
│   ├── router/
│   │   ├── tree.vais          # RadixTree — O(log n) URL matching
│   │   ├── params.vais        # PathParams — :param extraction
│   │   ├── route.vais         # Route descriptor
│   │   ├── router.vais        # Router — dispatch method + path
│   │   └── group.vais         # RouteGroup — prefix-scoped sub-router
│   ├── middleware/
│   │   ├── pipeline.vais      # Pipeline, BeforeResult, PipelineBeforeOutput
│   │   ├── cors.vais          # CorsMiddleware, CorsConfig
│   │   ├── logger.vais        # LoggerMiddleware, LoggerConfig
│   │   ├── rate_limit.vais    # RateLimitMiddleware, RateLimitConfig
│   │   ├── compress.vais      # CompressMiddleware, CompressConfig
│   │   └── recovery.vais      # RecoveryMiddleware, RecoveryConfig
│   ├── auth/
│   │   ├── jwt.vais           # TokenPair, HS256 signing, claim validation
│   │   ├── oauth.vais         # OAuth 2.0 flow, CSRF state
│   │   ├── session.vais       # Server-side session store with TTL
│   │   ├── guard.vais         # Route guards — enforce JWT or session
│   │   └── password.vais      # bcrypt-style hash and verify
│   ├── ws/
│   │   ├── message.vais       # WsMessage — text/binary/ping/pong/close frames
│   │   ├── handler.vais       # WsHandler — per-connection lifecycle
│   │   ├── room.vais          # Room — named broadcast groups
│   │   └── server.vais        # WsServer — upgrade handshake, heartbeat
│   ├── db/
│   │   ├── connection.vais    # DbConnection, DbConfig (TCP + Embedded), QueryResult
│   │   ├── pool.vais          # ConnectionPool, PoolConfig, PoolStats
│   │   ├── query.vais         # QueryBuilder — SQL/Vector/Graph/FTS
│   │   ├── migrate.vais       # Migrator, Migration — versioned up/down
│   │   └── model.vais         # ModelDef, Field, VectorField, GraphEdge + DDL
│   ├── api/
│   │   ├── rest.vais          # Pagination, RestRouter helpers
│   │   ├── graphql.vais       # Schema introspection, resolver dispatch
│   │   ├── grpc.vais          # gRPC service descriptors, framing
│   │   └── openapi.vais       # OpenAPI 3.0 document generation
│   └── util/
│       ├── json.vais          # json_encode / json_decode
│       ├── validation.vais    # Field validators
│       └── env.vais           # Environment variable reading
├── tests/
│   ├── core/
│   │   ├── test_error.vais
│   │   └── test_config.vais
│   ├── http/
│   │   ├── test_method.vais
│   │   ├── test_status.vais
│   │   └── test_response.vais
│   ├── router/
│   │   ├── test_router.vais
│   │   └── test_tree.vais
│   ├── middleware/
│   │   └── test_pipeline.vais
│   ├── auth/
│   │   ├── test_jwt.vais
│   │   └── test_password.vais
│   ├── db/
│   │   └── test_query.vais
│   └── integration/
│       └── test_full_flow.vais
├── examples/
│   ├── hello.vais             # Minimal Hello World server
│   ├── rest_api.vais          # CRUD REST API
│   ├── chat.vais              # WebSocket chat
│   └── fullstack.vais         # Full vais-web + vais-server + vaisdb demo
├── docs/
│   ├── architecture/
│   │   └── overview.md        # Module diagram + request flow
│   └── guide/
│       ├── quickstart.md      # Zero to running server
│       ├── middleware.md      # Before/after pipeline + built-in middleware
│       └── database.md        # SQL/Vector/Graph/FTS + migrations + Model
├── README.md
├── ROADMAP.md
└── CLAUDE.md                  # This file
```

---

## Key Design Decisions

### Express / Axum-style API
Route registration mirrors Express.js: `app.get("/path", "handler_id")`. Route groups (`app.group("/prefix")`) mirror Axum's `Router::nest`. Handlers are pure functions `F(ctx: Context) -> Response` — no global state or dependency injection containers.

### Middleware pipeline (before/after symmetry)
Every middleware implements two hooks: `before` (pre-handler) and `after` (post-handler). The pipeline runs `before` in registration order and `after` in reverse. A `before` returning `BeforeResult.Respond` short-circuits all remaining `before` hooks and the handler — but already-executed `after` hooks still run. This mirrors the onion model used by Koa.js and Axum layers.

### vaisdb native integration
`QueryBuilder` targets all four vaisdb engines (SQL, VECTOR_SEARCH, GRAPH_TRAVERSE, FULLTEXT_MATCH) from one fluent API. There is no ORM translation layer; `DbConnection.execute(sql)` submits the query string directly to the vaisdb wire protocol. `ConnectionPool` wraps connections with acquire/release semantics and health-check recycling.

### Symbolic handler dispatch
Route handlers are registered by name string (`"handle_users"`) rather than function pointer because Vais does not have first-class function pointers in the version targeted by this framework. The runtime resolves the name to the actual function at dispatch time. Similarly, middleware is registered by name (`app.use("cors")`) and resolved via `dispatch_before` / `dispatch_after` in `middleware/pipeline.vais`.

### Pure Vais — no FFI
The framework itself makes no FFI calls. External runtime functions (`current_time_ms`, `str_len`, `str_char_at`, `str_slice`) are declared with `X F` and resolved by the `vaisc` linker. This keeps the core framework portable across any Vais runtime target.

---

## Dependencies

All dependencies are from the **Vais standard library** (`std/`). No third-party packages.

| Import | Used by |
|--------|---------|
| `std/string` | string manipulation across all modules |
| `std/vec` | `Vec<T>` — growable arrays |
| `std/option` | `Option<T>` — nullable values |
| `std/async_http` | HTTP/1.1 parsing (via runtime) |
| `std/http_server` | TCP accept loop (via runtime) |
| `std/websocket` | RFC 6455 framing (via runtime) |

---

## Coding Conventions

### Module imports
Use short module paths relative to `src/`:

```vais
U core/app
U core/context
U middleware/pipeline
U db/query
```

### Struct + Extension pattern
All types follow the `S` (struct) + `X` (extension) pattern:

```vais
S Foo {
    value: i64,
}

X Foo {
    F new(value: i64) -> Foo {
        Foo { value }
    }

    F double(self) -> i64 {
        self.value * 2
    }
}
```

### Mutation
Use `mut` for mutable bindings. Prefer returning new values over in-place mutation when building up state:

```vais
ctx2 := ctx.set_header("X-Foo", "bar")   # returns new Context
```

### Result handling
Always handle `Result<T, E>` with `M` (match). Never silently discard errors:

```vais
M some_operation() {
    Ok(v)  => { /* use v */ },
    Err(e) => { R Err(e) },   # propagate or handle
}
```

### Constants
Use `C` for module-level constants:

```vais
C MAX_BODY_SIZE: i64 = 1048576   # 1 MB
```

### External functions
Declare external runtime functions at the bottom of the file:

```vais
X F current_time_ms() -> i64
X F str_len(s: str) -> i64
X F str_char_at(s: str, i: i64) -> i64
X F str_slice(s: str, start: i64, end: i64) -> str
```

### No loops that mutate outer structs
Vais does not allow loops that mutate outer struct fields — use recursive helper functions instead. See `pipeline_run_before` / `pipeline_run_after` in `middleware/pipeline.vais` for the standard pattern.

---

## Testing

Tests mirror the `src/` directory structure under `tests/`:

```
tests/
├── core/           # Unit tests for App, Config, Error, Context
├── http/           # Unit tests for Method, Status, Response
├── router/         # Unit tests for RadixTree, Router
├── middleware/     # Unit tests for Pipeline
├── auth/           # Unit tests for JWT, Password
├── db/             # Unit tests for QueryBuilder
└── integration/    # End-to-end flow tests
```

Run all tests:

```sh
vaisc test tests/
```

Run a specific test file:

```sh
vaisc test tests/db/test_query.vais
```

Test file naming convention: `test_<module>.vais`.

Each test file imports the module under test and calls `assert` or validates return values directly. There is no separate test runner binary — `vaisc test` discovers and executes all `.vais` files under the target directory.

---

## Roadmap Reference

Current status and planned work are tracked in [`ROADMAP.md`](ROADMAP.md).

The ROADMAP uses the following format:

```
- [x] N. Task description (executor) ✅ YYYY-MM-DD
  changes: list of files changed
- [ ] N. Task description (executor) [blockedBy: M]
```

Progress is expressed as `X/Y (P%)` at the bottom of the task list.

When adding or completing tasks, update both the task status and the `progress` line. The `strategy` field in the Execution Log records the parallelisation decision (direct / sequential / independent-parallel) for completed batches.

---

## VAIS Ecosystem

> 전체 생태계 맵: [../../VAIS-ECOSYSTEM.md](../../VAIS-ECOSYSTEM.md)
> 이 프로젝트는 `vaislang/vais-lang` 모노레포의 `packages/vais-server/`에 위치합니다.

### Position in Ecosystem
```
vais (compiler + std) ← upstream (별도 repo: vaislang/vais)
    ↓
vais-server ← this package
    ↓  ↑
vaisdb (native query API) ← 같은 모노레포: ../vaisdb/
```

### Upstream Dependencies
| Source | Path | Interface |
|--------|------|-----------|
| vais compiler | (별도 repo) vaislang/vais | `vaisc build`, type system |
| vais std | (별도 repo) vaislang/vais/std/ | async_http.vais, http_server.vais, websocket.vais |
| vaisdb | `../vaisdb/` | wire protocol, query API |

### Downstream Dependencies
| Project | Path | 사용하는 인터페이스 |
|---------|------|-------------------|
| vais-web | `../vais-web/` | SSR 연동 (미정의) |

### 작업 전 체크리스트
- **새 유틸리티 구현 전**: `../../VAIS-ECOSYSTEM.md` "Shared Components" 확인 — std에 이미 있는 기능 재구현 금지
- **HTTP 관련 작업 전**: vaislang/vais의 `std/async_http.vais`, `std/http_server.vais`에 이미 구현된 기능 확인
- **DB 관련 작업 전**: `../vaisdb/ROADMAP.md` 확인 — API 변경사항이나 새 기능 체크
- **컴파일러 이슈 발생 시**: vaislang/vais ROADMAP.md 확인하여 이미 수정 중인지 체크
- **JSON/Validation 등 범용 유틸**: std에 추가 제안을 먼저 검토, 프로젝트 로컬 구현은 최후 수단
