# Middleware Guide

## Concept

Middleware in vais-server is a pair of hooks that wrap every request:

- **`before(ctx: Context) -> BeforeResult`** — runs before the route handler
- **`after(ctx: Context, response: Response) -> Response`** — runs after the route handler

Middleware is registered globally with `app.use("name")` and applies to every request the server receives.

---

## Before / After Flow

```
Request arrives
      │
      ▼
middleware[0].before(ctx)   ─── Respond? ──► short-circuit ──► middleware[0].after()
      │ Next                                                          ▲
      ▼                                                              │
middleware[1].before(ctx)   ─── Respond? ──────────────────────────►│
      │ Next                                                          │
      ▼                                                              │
middleware[N].before(ctx)                                            │
      │                                                              │
      ▼                                                              │
  [handler]  F(ctx: Context) -> Response                            │
      │                                                              │
      ▼                                                              │
middleware[N].after(ctx, response)                                   │
      │                                                              │
      ▼                                                              │
middleware[1].after(ctx, response)                                   │
      │                                                              │
      ▼                                                              │
middleware[0].after(ctx, response) ──────────────────────────────────┘
      │
      ▼
Response sent to client
```

### Key rules

1. `before` hooks execute in **registration order** (index 0 … N).
2. `after` hooks execute in **reverse registration order** (index N … 0).
3. A `before` hook returning `BeforeResult.Respond` **short-circuits** the chain: the handler and all remaining `before` hooks are skipped, but `after` hooks for already-executed middleware still run in reverse.
4. Middleware accumulates context changes via `ctx.set_header()` and `ctx.set_state()`. These return new `Context` values; the pipeline threads the latest context through each step.

---

## Registration Order Example

```vais
app.use("recovery")    # index 0
app.use("logger")      # index 1
app.use("cors")        # index 2
app.use("rate_limit")  # index 3
```

Request execution:

```
before:  recovery(0) → logger(1) → cors(2) → rate_limit(3) → [handler]
after:   rate_limit(3) → cors(2) → logger(1) → recovery(0)
```

Recovery is registered first so its `after` hook runs last — it can therefore catch panics raised by every other middleware and the handler.

---

## Built-in Middleware

### CORS (`cors`)

Adds `Access-Control-*` headers and handles OPTIONS preflight.

**Default behaviour** (allow all origins):

```vais
app.use("cors")
```

**Configuration struct** (`CorsConfig`):

| Field | Default | Description |
|-------|---------|-------------|
| `allowed_origins` | `["*"]` | Origins to allow; `"*"` means all |
| `allowed_methods` | `GET, POST, PUT, DELETE, PATCH, OPTIONS` | Methods to advertise |
| `allowed_headers` | `Content-Type, Authorization, Accept` | Headers to advertise |
| `allow_credentials` | `false` | Sets `Access-Control-Allow-Credentials` |
| `max_age` | `86400` | Preflight cache duration in seconds |

**before hook actions:**

- Sets `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`
- If `allow_credentials` is true, sets `Access-Control-Allow-Credentials: true`
- For `OPTIONS` requests: responds immediately with `204 No Content` + `Access-Control-Max-Age` (short-circuit)

**after hook:** no-op (headers are already set on the context in `before`).

---

### Logger (`logger`)

Logs request start and completion with elapsed time.

**Default behaviour:**

```vais
app.use("logger")
```

**Log format:**

```
[INFO] [GET] /api/v1/users - request started
[INFO] [GET] /api/v1/users -> 200 (12ms)
```

**LoggerConfig options:**

| Level | Factory |
|-------|---------|
| Info (default) | `LoggerConfig.default()` |
| Debug | `LoggerConfig.debug()` |

**before hook:** logs `[LEVEL] [METHOD] /path - request started`; stores start timestamp in `ctx.state`.

**after hook:** reads start timestamp from `ctx.state`, computes elapsed time, logs `[LEVEL] [METHOD] /path -> STATUS (Xms)`.

---

### RateLimit (`rate_limit`)

Enforces a per-IP sliding-window request limit. Returns `429 Too Many Requests` when the limit is exceeded.

**Default behaviour** (100 requests per 60 seconds):

```vais
app.use("rate_limit")
```

**RateLimitConfig options:**

| Field | Default | Description |
|-------|---------|-------------|
| `max_requests` | `100` | Maximum requests per window |
| `window_ms` | `60000` | Window size in milliseconds |

**Custom config example:**

```vais
# 30 requests per 10 seconds
config := RateLimitConfig.new(30, 10000)
```

**before hook:** extracts client IP from `ctx.state`; increments per-IP counter; returns `429` with `Retry-After` and `X-RateLimit-Limit` headers when exceeded; attaches `X-RateLimit-Remaining` on allowed requests.

**after hook:** no-op.

---

### Compress (`compress`)

Sets `Content-Encoding: gzip` on responses when the client advertises gzip support and the response body meets a minimum length threshold. Actual byte compression is performed by the runtime layer.

**Default behaviour** (min body 1 024 bytes, encoding gzip):

```vais
app.use("compress")
```

**CompressConfig options:**

| Field | Default | Description |
|-------|---------|-------------|
| `min_length` | `1024` | Minimum response body length in bytes to compress |
| `encoding` | `"gzip"` | Compression scheme to advertise |

**before hook:** checks `Accept-Encoding` header via `ctx.state`; stores `"compress=gzip"` in state if client accepts gzip.

**after hook:** if state is `"compress=gzip"` and body length meets `min_length`, appends `Content-Encoding: gzip` to response headers.

---

### Recovery (`recovery`)

Catches handler panics and runtime errors; returns a clean `500 Internal Server Error` instead of crashing the server.

**Default behaviour** (no error details in response body):

```vais
app.use("recovery")    # register first so after() wraps everything
```

**RecoveryConfig options:**

| Field | Default | Description |
|-------|---------|-------------|
| `log_errors` | `true` | Log error details to stdout |
| `include_message` | `false` | Include error message in response body (use only in dev) |

**Dev config:**

```vais
# Returns {"error":"Internal Server Error","detail":"..."} in dev
config := RecoveryConfig.dev()
```

**before hook:** sets `ctx.state = "recovery=active"` as a marker.

**after hook:** detects panic signals — either `response.status == 0` or `response.body` prefixed with `"PANIC:"` — logs the error, and replaces the response with a well-formed 500 JSON response.

---

## Middleware Execution Order Summary

| Scenario | Before result | After runs? |
|----------|--------------|-------------|
| Normal request | All `before` → handler → all `after` (reversed) | Yes, all |
| CORS OPTIONS preflight | cors `before` short-circuits with 204 | Only middleware before cors |
| Rate limit exceeded | rate_limit `before` short-circuits with 429 | Only middleware before rate_limit |
| Handler panic | After chain catches via recovery `after` | Yes, all `after` |

---

## Writing Custom Middleware

A custom middleware is a struct with `before` and `after` methods that match the pipeline interface.

### Example: Request ID injector

```vais
U core/context
U middleware/pipeline

S RequestIdMiddleware {
    prefix: str,
}

X RequestIdMiddleware {
    F new(prefix: str) -> RequestIdMiddleware {
        RequestIdMiddleware { prefix: prefix }
    }

    # before — generate a request ID and store it in context state
    F before(self, ctx: Context) -> BeforeResult {
        # In production, use a UUID generator from util/
        req_id := self.prefix + "-" + ctx.path
        updated := ctx.set_header("X-Request-Id", req_id)
        BeforeResult.next()
    }

    # after — echo the request ID back in the response headers
    F after(self, ctx: Context, response: Response) -> Response {
        # Read the ID that before() stored
        req_id := ctx.get_header("X-Request-Id")
        # Add to response (ResponseBuilder or direct struct construction)
        response
    }
}
```

### Rules for custom middleware

1. `before` must return either `BeforeResult.next()` (continue) or `BeforeResult.respond(response)` (short-circuit).
2. `after` must return a `Response` — either the original or a modified copy.
3. Do not mutate global state; pass context through `ctx.set_header()` / `ctx.set_state()`.
4. Register by name with `app.use("request_id")` — the runtime resolves the name to your struct via `dispatch_before` / `dispatch_after` in `middleware/pipeline.vais`.

### Registering the middleware

```vais
app.use("recovery")
app.use("logger")
app.use("request_id")   # your custom middleware
app.use("cors")
```

The pipeline calls `dispatch_before("request_id", ctx)` and `dispatch_after("request_id", ctx, response)`. Wire these to your struct methods in `middleware/pipeline.vais`:

```vais
F dispatch_before(name: str, ctx: Context) -> BeforeResult {
    M name {
        "request_id" => { RequestIdMiddleware.new("req").before(ctx) },
        _            => { BeforeResult.next() },
    }
}

F dispatch_after(name: str, ctx: Context, response: Response) -> Response {
    M name {
        "request_id" => { RequestIdMiddleware.new("req").after(ctx, response) },
        _            => { response },
    }
}
```

---

## Reference: BeforeResult Constructors

| Constructor | Effect |
|------------|--------|
| `BeforeResult.next()` | Continue to the next middleware / handler |
| `BeforeResult.respond(res)` | Short-circuit; return `res` as the response |
| `result.is_next()` | `true` if `Next`, `false` if `Respond` |
