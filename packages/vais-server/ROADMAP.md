# vais-server - Backend API Framework for Vais
## Project Roadmap

> **Version**: 0.1.0 (Initial Implementation)
> **Goal**: Express/Axum-style backend framework written in Vais, with native vaisdb integration
> **Language**: Pure Vais
> **Last Updated**: 2026-05-02

> **Reactivation Status**: minimal runtime, VaisDB embedded integration, request/router static runtime, path params/query parsing, wildcard routing, bounded request body parsing, middleware pipeline dispatch, SSR API response contracts, and compiled SSR forwarding have been promoted. `compiler/tests/vais-server/smoke/minimal_runtime_smoke.vais`, `compiler/tests/vais-server/smoke/vaisdb_embedded_integration_smoke.vais`, `compiler/tests/vais-server/smoke/request_router_runtime_smoke.vais`, `compiler/tests/vais-server/smoke/path_query_runtime_smoke.vais`, `compiler/tests/vais-server/smoke/wildcard_runtime_smoke.vais`, `compiler/tests/vais-server/smoke/body_parser_runtime_smoke.vais`, `compiler/tests/vais-server/smoke/middleware_pipeline_runtime_smoke.vais`, `compiler/tests/vais-server/smoke/ssr_api_runtime_smoke.vais`, generated `e2e_vais_server_08_ssr_forwarding_runtime_smoke`, generated `e2e_vais_server_09_ssr_forwarding_error_mapping_runtime_smoke`, generated `e2e_vais_server_10_ssr_forwarding_timeout_runtime_smoke`, and generated `e2e_vais_server_11_ssr_forwarding_retry_runtime_smoke` are now the current conformance evidence. The promoted parser paths use certified `substring` ownership and `str.char_at` APIs; raw `str` pointer arithmetic remains outside the promoted surface. `SERVER RUNTIME` is 12/12. Body parsing and SSR API parsing are certified only for bounded flat inputs. Compiled SSR forwarding is certified for the success path where `forward_ssr_render()` sends a plain HTTP loopback POST to an upstream SSR service and preserves status/content-type/body, plus upstream non-2xx preservation, transport failure to 502 mapping, explicit timeout to 504 mapping, and bounded retry after transport failure. Full JSON validation, nested objects/arrays, broad escape semantics, backoff/jitter policy, HTTPS/TLS, arbitrary middleware instance dispatch, and response body string-concat middleware transforms still require separate gates. Do not promote broader claims from package code alone. The completed tasks below remain historical implementation notes until each broader surface is promoted by its own runtime gate.

---

## Overview

vais-server completes the Vais full-stack ecosystem:
```
vais-web (frontend+SSR) → vais-server (backend API) → vaisdb (database)
```

### Design Decisions
- Architecture: Express/Axum-style middleware pipeline + tree-based router
- HTTP: Built on vais std/async_http, std/http_server, std/websocket
- DB: vaisdb native integration (no separate ORM needed — direct Vector/Graph/SQL/FTS queries)
- API: REST + GraphQL + gRPC multi-protocol support
- Auth: JWT + OAuth2 + session-based authentication built-in
- Pattern: vaisdb project structure (src/ domain folders, tests/ mirroring)

---

## Current Tasks (2026-04-03)
mode: auto
- [x] 1. 프로젝트 초기화 + core 모듈 (impl-sonnet) ✅ 2026-04-03
  changes: README.md, src/main.vais, src/core/{app,config,context,error}.vais + 디렉토리 구조
- [x] 2. HTTP 요청/응답 모듈 (impl-sonnet) ✅ 2026-04-03
  changes: src/http/{method,status,header,cookie,request,response}.vais (빌더 체이닝, 13 상태코드)
- [x] 3. 라우터 + 라우트 그룹 (impl-sonnet) ✅ 2026-04-03
  changes: src/router/{tree,params,route,router,group}.vais (RadixTree, 405 구분, 중첩 그룹)
- [x] 4. 미들웨어 파이프라인 + 내장 미들웨어 (impl-sonnet) ✅ 2026-04-03
  changes: src/middleware/{pipeline,cors,logger,rate_limit,compress,recovery}.vais (before/after 체인, 429 rate limit)
- [x] 5. WebSocket 서버 (impl-sonnet) ✅ 2026-04-03
  changes: src/ws/{message,handler,room,server}.vais (RFC6455 프레이밍, Room 브로드캐스트, heartbeat)
- [x] 6. 인증/인가 - JWT, OAuth, Guard (impl-sonnet) ✅ 2026-04-03
  changes: src/auth/{jwt,oauth,session,guard,password}.vais (TokenPair, OAuth flow, CSRF state, bcrypt-style hash)
- [x] 7. vaisdb 네이티브 통합 (impl-sonnet) ✅ 2026-04-03
  changes: src/db/{connection,pool,query,migrate,model}.vais (TCP/임베디드, 하이브리드 쿼리빌더, 마이그레이션)
- [x] 8. API 프로토콜 - REST/GraphQL/gRPC (impl-sonnet) ✅ 2026-04-03
  changes: src/api/{rest,graphql,grpc,openapi}.vais (Pagination, Introspection, gRPC 디스패치, OpenAPI 3.0)
- [x] 9. 유틸리티 + 예제 + 테스트 (impl-sonnet) ✅ 2026-04-03
  changes: src/util/{json,validation,env}.vais, examples/4개, tests/12개 테스트 파일
- [x] 10. 문서 + ROADMAP 정비 (impl-sonnet) ✅ 2026-04-03
  changes: docs/architecture/overview.md, docs/guide/quickstart.md, docs/guide/middleware.md, docs/guide/database.md, CLAUDE.md
progress: 10/10 (100%)

## Execution Log
- 2026-05-01 — minimal runtime gate: removed stale `std/string` dependencies from `src/core/{app,context,shutdown}.vais`, replaced the old `Headers` Vec-backed runtime accessor with fixed-slot storage, and connected `SERVER RUNTIME OK: smoke=1/1` to `compiler/scripts/check-integrity.sh`. Next promoted surface should be `vais-server` + VaisDB integration, not broad network server claims.
- 2026-05-02 — VaisDB embedded integration gate: added `vaisdb_embedded_integration_smoke.vais` to run `App`/`Context` and `EmbeddedDatabase` durable open/flush/close/reopen in one executable. `SERVER RUNTIME` is now 2/2; next promoted surface should be request/router runtime.
- 2026-05-02 — request/router runtime gate: added `request_router_runtime_smoke.vais` to run `Request` header/content-type and static `Router` exact-match/404/405 behavior in one executable. `SERVER RUNTIME` is now 3/3. Path params, wildcard routing, query parsing, and body parsing remain deferred until a separate gate promotes them.
- 2026-05-02 — blocked path/query parser probe: a promoted parser would need to store and compare substring/range values, but the probe reproduced corrupted stored substring values, string helper link instability, and raw `str` byte-access aborts. Keep `SERVER RUNTIME` at 3/3 and fix the compiler string range/substring ownership invariant before retrying this package surface.
- 2026-05-02 — compiler string ownership unblock: `phase_string_runtime` now certifies per-module helper link stability plus `substring` results assigned into struct fields and returned across module boundaries. Next path/query work should retry with `str.char_at`/`substring`; raw `load_byte(str + i)` remains outside the promoted path.
- 2026-05-02 — path/query runtime gate: added `path_query_runtime_smoke.vais` to run `Request.parse_query_string`, `Params.parse_query`, and dynamic `Router` `:param` matching/extraction in one executable. `SERVER RUNTIME` is now 4/4. The compiler fixes behind this gate preserve `str` return context for if-expression PHIs and clear owned masks on aggregate copies from `Vec<T>.get()`. Wildcard routing and request body parsing remain deferred.
- 2026-05-02 — wildcard routing runtime gate: fixed-slot `Router` now ranks static routes before `:param` routes and terminal `*param` wildcard routes, extracts wildcard remainders into named params or the default `wildcard` key, and rejects embedded `a*b` wildcard syntax. `wildcard_runtime_smoke.vais` verifies named/unnamed wildcard extraction, static priority, wildcard 405, empty remainder rejection, and embedded wildcard rejection in one executable. `SERVER RUNTIME` is now 5/5.
- 2026-05-02 — request body parser runtime gate: `parse_form_body` now reuses the certified KV parser and `parse_json_body` extracts compact flat JSON object keys plus quoted/bare scalar values through `str.char_at`/`substring`. `body_parser_runtime_smoke.vais` verifies direct form parsing, compact JSON parsing, content-type routed `parse_body`, Request body/content-type integration, unsupported content-type errors, and non-object JSON errors in one executable. `SERVER RUNTIME` is now 6/6. Full JSON validation, nested objects/arrays, and broad escape semantics remain deferred.
- 2026-05-02 — middleware pipeline runtime gate: `pipeline.vais` now uses the promoted `src/core/context` import path and symbolic dispatcher behavior for bounded runtime verification. `middleware_pipeline_runtime_smoke.vais` verifies registration/name lookup, unknown before pass-through, `deny` short-circuit 401 response, and `after-b` then `after-a` reverse-order response transform in one executable. `SERVER RUNTIME` is now 7/7. Arbitrary middleware instance dispatch and response body string-concat transforms remain deferred.
- 2026-05-02 — SSR API runtime gate: `ssr_api_runtime_smoke.vais` verifies compiled render/hydrate request parsing, render response shape, hydrate response shape, missing-route error response, and health response in one executable. `src/api/ssr.vais` now uses a bounded local JSON response helper instead of importing the broader REST helper surface, and `src/http/cookie.vais` no longer depends on stale external string/concat helpers pulled in through `Response`. `SERVER RUNTIME` is now 8/8. Actual HTTP forwarding into the Node SSR bridge, full JSON escaping, and nested props remain deferred.
- 2026-05-02 — compiled SSR forwarding runtime gate: generated `e2e_vais_server_08_ssr_forwarding_runtime_smoke` verifies `forward_ssr_render()` against a real loopback upstream SSR service. The compiled executable sends `POST /ssr/render` through `std/http_client`, and the gate checks request line, Host, Content-Type, JSON body, upstream `202 Accepted`, content type, and body forwarding. `SERVER RUNTIME` is now 9/9. Timeout/retry/failure policy, HTTPS/TLS, nested props/full JSON escaping, and deployed Node SSR operation remain deferred.
- 2026-05-02 — SSR forwarding error/status runtime gate: generated `e2e_vais_server_09_ssr_forwarding_error_mapping_runtime_smoke` verifies upstream `503 Service Unavailable` status reason/content-type/body preservation and transport failure mapping to `502 Bad Gateway` JSON error. `ssr_json_error()` now maps 502 to `Bad Gateway` instead of using `Bad Request` for every error status. `SERVER RUNTIME` is now 10/10. Timeout/retry policy, HTTPS/TLS, nested props/full JSON escaping, and deployed Node SSR operation remain deferred.
- 2026-05-02 — SSR forwarding timeout runtime gate: generated `e2e_vais_server_10_ssr_forwarding_timeout_runtime_smoke` verifies `forward_ssr_render_with_timeout()` against a loopback upstream that accepts the request but stalls its response. The compiled executable uses a 100ms timeout and maps the stalled response to `504 Gateway Timeout` JSON error. `std/http_client` now surfaces recv timeout as `CLIENT_ERR_TIMEOUT`. `SERVER RUNTIME` is now 11/11. Retry/backoff policy, HTTPS/TLS, nested props/full JSON escaping, and deployed Node SSR operation remain deferred.
- 2026-05-02 — SSR forwarding retry runtime gate: generated `e2e_vais_server_11_ssr_forwarding_retry_runtime_smoke` verifies `forward_ssr_render_with_retry()` against a loopback upstream that drops the first request and returns `200 OK` on the second. The compiled executable retries once after the transport failure and preserves the second response. `SERVER RUNTIME` is now 12/12. Backoff/jitter, retry budget observability, HTTPS/TLS, nested props/full JSON escaping, and deployed Node SSR operation remain deferred.
  strategy: 3 independent tasks (#1,#2,#3) no file overlap → independent-parallel
  strategy: 4 independent tasks (#4,#5,#7,#8) no file overlap → independent-parallel
