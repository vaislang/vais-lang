## 설계 결정
- stdlib 연동: std/net.vais, std/http_server.vais, std/time.vais, std/crypto.vais 모두 구현 완료 확인 → FUTURE 주석을 실제 import로 교체
- 핸들러 디스패치: Vais 함수 포인터 미지원 → handler_id(i64) 기반 match 디스패치 또는 디스패치 테이블 패턴
- SSR 인터페이스: vais-web(TS) → vais-server(Vais) 크로스 런타임 → HTTP API 기반 인터페이스

## Current Tasks (2026-04-03)
mode: auto
- [x] 1. vaisdb: std/net TCP accept loop 연결 (impl-sonnet) ✅ 2026-04-03
  strategy: 3 independent tasks (#1,#5,#12) no file overlap → independent-parallel
  changes: server/tcp.vais (U std/net, TcpListener.bind, accept loop, handle_stream), main.vais (run_accept_loop 호출)
- [x] 2. vais-server: std/http_server 연동 + app.listen() 구현 (impl-sonnet) [blockedBy: 1] ✅ 2026-04-03
  changes: core/app.vais (U std/net, TcpListener.bind, accept_loop, parse_http_request, match_route)
- [x] 3. vais-server: 핸들러 디스패치 메커니즘 구현 (Opus direct) [blockedBy: 2] ✅ 2026-04-03
  opus_direct: 언어 제약(함수 포인터 없음) 고려한 디스패치 패턴 설계 — X F dispatch_handler 외부 함수 패턴
  changes: core/app.vais (accept_loop에서 dispatch_handler 호출, format_http_response, status_reason, X F dispatch_handler 선언)
- [ ] 4. vais 컴파일러: Vec<f32> 제네릭 타입 소거 버그 수정 (impl-sonnet) — 별도 세션에서 vaislang/vais repo 작업 필요
- [x] 5. vaisdb: std/time, std/crypto import 연결 (impl-sonnet) ✅ 2026-04-03
  changes: planner/statistics.vais (U std/time + time_millis()), fulltext/maintenance/compaction.vais (U std/time + sleep_millis())
- [x] 6. vaisdb: 잔여 TC 에러 19개 해소 (impl-sonnet) ✅ 2026-04-03 (부분: 2/19)
  changes: tests/storage/test_transaction.vais (vec![] → Vec.with_capacity + push)
  verify: 나머지 17개는 컴파일러 수준 이슈(제네릭 타입 소거, 슬라이스) → #4와 동일 범주
- [x] 7. vaisdb: client 모듈 std/net 실제 연결 구현 (impl-sonnet) [blockedBy: 1] ✅ 2026-04-03
  changes: client/mod.vais (U std/net, fd:i64, connect via TcpStream, wire protocol, query/execute TCP 전송, close Terminate)
- [x] 8. vais-server ↔ vaisdb 통합 테스트 (impl-sonnet) [blockedBy: 2, 7] ✅ 2026-04-03
  changes: tests/integration/test_db_integration.vais (6 시나리오: connection, DDL, insert, select, txn rollback, pool)
- [x] 9. vais-web SSR ↔ vais-server 인터페이스 정의 (Opus direct) ✅ 2026-04-03
  opus_direct: 크로스 런타임(Vais↔Node.js) 인터페이스 설계 — HTTP API bridge 패턴
  changes: ssr/server-bridge.ts (createSsrService, SsrRenderRequest/Response), ssr/index.ts (exports), VAIS-ECOSYSTEM.md (미해결 항목 체크)
- [x] 10. vais-server: 요청 바디 파싱 구현 (impl-sonnet) [blockedBy: 3] ✅ 2026-04-03
  changes: http/request.vais (parse_json_body, parse_form_body, parse_body, json recursive helpers)
- [x] 11. vaisdb: 트랜잭션 API 노출 (impl-sonnet) [blockedBy: 7] ✅ 2026-04-03
  changes: db/query.vais (QueryKind에 BeginTransaction/Commit/Rollback, begin_transaction()/commit()/rollback() 메서드, build() 분기)
- [x] 12. vais-web: CSS 스코핑 구현 (impl-sonnet) ✅ 2026-04-03
  changes: style.rs (compute_scope_hash, scope_css_rules, :global 우회), codegen_js.rs ($$attr data-v-hash 삽입), ast.rs (is_scoped, scope_hash 필드)
progress: 11/12 (91%)
