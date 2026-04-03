# vais-server - Backend API Framework for Vais
## Project Roadmap

> **Version**: 0.1.0 (Initial Implementation)
> **Goal**: Express/Axum-style backend framework written in Vais, with native vaisdb integration
> **Language**: Pure Vais
> **Last Updated**: 2026-04-03

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
  strategy: 3 independent tasks (#1,#2,#3) no file overlap → independent-parallel
  strategy: 4 independent tasks (#4,#5,#7,#8) no file overlap → independent-parallel
