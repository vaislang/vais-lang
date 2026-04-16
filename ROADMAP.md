# VAIS Lang Monorepo — Roadmap

> **현재 상태**: 패키지 구조 완성, 런타임 FFI 바인딩 미연결
> **목표**: vais-apps/monitor 서버가 컴파일 + 링크 + 실행되는 end-to-end 파이프라인 완성
> **최종 업데이트**: 2026-04-17

---

## 배경

vais-apps/monitor 서버는 42개 .vais 파일로 구성된 AI 모니터링 플랫폼.
vaisc 컴파일러로 IR 변환은 성공하지만, 링크 단계에서 29개 미정의 심볼로 실패.
이 심볼들은 vais-server/vaisdb 패키지에 구조적으로 존재하나,
**FFI 런타임 바인딩** 또는 **패키지 간 링크 파이프라인**이 없어서 연결되지 않음.

### 미정의 심볼 분류 (29개)

| 카테고리 | 심볼 | 소스 패키지 | 구현 상태 |
|---------|------|-----------|----------|
| **HTTP 서버** | `server_listen`, `serve_static` | vais-server | ❌ 스텁만 |
| **Async 런타임** | `sleep_ms`, `sleep_ms__poll` | vais-server | ❌ 스텁만 |
| **WebSocket** | `ws_register_client`, `ws_unregister_client`, `ws_add_subscription`, `ws_remove_subscription`, `ws_broadcast`, `ws_upgrade_response` | vais-server | ⚠️ 프레이밍만, 등록/브로드캐스트 훅 미연결 |
| **DB 클라이언트** | `db_connect`, `db_close`, `db_query`, `db_execute`, `db_execute_prepared`, `db_prepare`, `db_begin_transaction`, `db_commit`, `db_rollback` | vaisdb | ⚠️ 서버사이드만, 클라이언트 API 미노출 |
| **인증** | `jwt_encode`, `jwt_decode`, `hash_password`, `verify_password` | vais-server | ⚠️ decode/hash/verify 있음, encode 없음 |
| **JSON** | `json_get`, `json_set` | vais-server | ⚠️ get 있음, set 없음 |
| **시스템 유틸** | `generate_uuid`, `env_get`, `read_file`, `__clock_gettime_ms`, `__strlen` | vaisdb/vais-server | ⚠️ 일부 있음, FFI extern 선언만 |

---

## Phase 1: 빌드 파이프라인 + FFI 런타임 기반

> vaisc가 여러 .vais 패키지를 하나의 바이너리로 묶을 수 있는 최소 인프라.

- [ ] 1. vaisc 멀티모듈 링크 지원 조사 (Opus direct)
  [목표]: vaisc가 여러 .vais 파일/패키지의 .ll을 합쳐서 링크할 수 있는지 확인.
    현재 `vaisc main.vais`는 import된 모듈을 자동으로 .ll로 컴파일하고 합치지만,
    외부 패키지(.vais 파일이 다른 디렉토리에 있는 경우)를 resolve하는 메커니즘 확인 필요.
  [대상]: vaisc build 명령, module resolution 경로, vais.toml 설정.
  [완료 기준]: monitor가 vais-server/vaisdb 패키지를 import하여 빌드할 수 있는 방법 문서화.

- [ ] 2. C FFI 런타임 라이브러리 설계 (Opus direct) [blockedBy: 1]
  [목표]: `X F` (extern) 선언된 시스템 호출을 제공하는 C 라이브러리 설계.
  [대상 심볼]:
    - `__clock_gettime_ms`: clock_gettime wrapper
    - `__strlen`: strlen wrapper
    - `env_get`: getenv wrapper
    - `sleep_ms` + `sleep_ms__poll`: usleep/nanosleep wrapper + async poll adapter
  [설계 결정]: 단일 `libvais_runtime.a` vs 패키지별 분리.
  [완료 기준]: C 헤더 + 빌드 스크립트 초안.

- [ ] 3. libvais_runtime 구현 — 시스템 유틸 (impl-sonnet) [blockedBy: 2]
  [목표]: Phase 1 대상 시스템 유틸 심볼의 C 구현체.
  [심볼]: `__clock_gettime_ms`, `__strlen`, `env_get`, `read_file`, `generate_uuid`, `sleep_ms`.
  [완료 기준]: `clang -c runtime.c -o runtime.o` 성공 + 심볼 export 확인.

## Phase 2: HTTP/WebSocket 서버 런타임

> monitor가 HTTP 요청을 받고 WebSocket을 처리할 수 있는 최소 런타임.

- [ ] 4. HTTP 서버 바인딩 — server_listen + serve_static (Opus direct) [blockedBy: 3]
  [목표]: `server_listen(host, port)`가 실제 TCP 소켓을 열고 요청을 받는 C 바인딩.
  [설계 옵션]:
    A. libuv 기반 이벤트 루프
    B. 직접 POSIX socket (단순하지만 단일 스레드)
    C. libmicrohttpd (경량 HTTP 서버 라이브러리)
  [심볼]: `server_listen`, `serve_static`.
  [완료 기준]: `curl http://localhost:8080/` 응답.

- [ ] 5. WebSocket 서버 바인딩 (impl-sonnet) [blockedBy: 4]
  [목표]: `ws_register_client`, `ws_broadcast` 등 6개 WS 심볼의 C 바인딩.
  [심볼]: `ws_register_client`, `ws_unregister_client`, `ws_add_subscription`,
    `ws_remove_subscription`, `ws_broadcast`, `ws_upgrade_response`.
  [완료 기준]: WebSocket 에코 테스트 통과.

## Phase 3: 데이터베이스 클라이언트 런타임

> monitor가 vaisdb에 SQL 쿼리를 보낼 수 있는 클라이언트 바인딩.

- [ ] 6. vaisdb 클라이언트 API 설계 (Opus direct) [blockedBy: 3]
  [목표]: monitor가 사용하는 9개 DB 심볼의 인터페이스 확정.
  [설계 옵션]:
    A. vaisdb를 임베디드 라이브러리로 직접 링크 (SQLite 스타일)
    B. vaisdb 서버 프로세스 + TCP 클라이언트 (PostgreSQL 스타일)
    C. vaisdb .vais 소스를 monitor와 함께 컴파일 (가장 단순)
  [심볼]: `db_connect`, `db_close`, `db_query`, `db_execute`, `db_execute_prepared`,
    `db_prepare`, `db_begin_transaction`, `db_commit`, `db_rollback`.
  [완료 기준]: 설계 문서 + 인터페이스 확정.

- [ ] 7. vaisdb 클라이언트 바인딩 구현 (impl-sonnet) [blockedBy: 6]
  [목표]: 6에서 확정한 설계로 9개 DB 심볼 구현.
  [완료 기준]: `db_connect → db_query("SELECT 1") → 결과 반환` 동작.

## Phase 4: 인증/JSON 런타임

> JWT, 해싱, JSON 처리를 위한 런타임 바인딩.

- [ ] 8. JWT + JSON 런타임 바인딩 (impl-sonnet) [blockedBy: 3]
  [목표]: 인증/JSON 관련 누락 심볼 구현.
  [심볼]:
    - `jwt_encode`: HMAC-SHA256 서명 생성 (C에서 OpenSSL/mbedtls 활용)
    - `jwt_decode`: Base64 디코딩 + JSON 파싱 (vais-server에 부분 구현 있음 — 연결)
    - `json_set`: JSON 문자열에 키-값 삽입
    - `verify_password`: hash_password와 비교 (vais-server에 구현 있음 — 연결)
  [완료 기준]: JWT 라운드트립 (encode → decode → verify) 동작.

## Phase 5: 통합 빌드 + Monitor 엔드투엔드

> 모든 런타임을 합쳐서 monitor 서버 바이너리를 빌드하고 실행.

- [ ] 9. Monitor 서버 통합 빌드 (Opus direct) [blockedBy: 4, 5, 7, 8]
  [목표]: `vaisc build monitor/server/src/main.vais` + 런타임 링크 → 바이너리 생성.
  [완료 기준]: 바이너리 실행 + `curl http://localhost:8080/api/health` 200 OK.

- [ ] 10. Monitor 서버 테스트 실행 (impl-sonnet) [blockedBy: 9]
  [목표]: server/src/tests/ 의 통합 테스트 실행.
  [완료 기준]: 테스트 pass.

---

## 패키지 현재 상태 참조

| 패키지 | .vais 파일 | ROADMAP 상태 | 비고 |
|--------|-----------|-------------|------|
| vaisdb | 261 | Phase 14 완료 (13/13 TC) | 서버사이드 완성, 클라이언트 API 미노출 |
| vais-server | 52 | Phase 1 완료 (10/10) | 프레임워크 구조 완성, FFI 런타임 미연결 |
| vais-web | — | Rust/TS 하이브리드, 220+ 계약 테스트 | 프론트엔드 전용, 백엔드 무관 |

## 의존성 그래프

```
Phase 1 (FFI 기반)
  ├── Phase 2 (HTTP/WS)
  ├── Phase 3 (DB 클라이언트)
  └── Phase 4 (JWT/JSON)
        │
        ▼
Phase 5 (통합 빌드 + E2E)
```
