# VAIS Lang Monorepo — Roadmap

> **현재 상태**: 서브패키지 ROADMAP (vaisdb, vais-server)은 각자 관리. lang/ 루트 ROADMAP은 **모노레포 공통 + 크로스패키지** 작업만 다룸.
> **최종 업데이트**: 2026-04-17
>
> mode: pending
> iteration: 0
> max_iterations: 10

---

## 스코프 경계 (중요)

| 영역 | 소관 ROADMAP |
|------|--------------|
| vaisdb 내부 작업 | `packages/vaisdb/ROADMAP.md` |
| vais-server 내부 작업 | `packages/vais-server/ROADMAP.md` |
| vais-web 내부 작업 | (ROADMAP 파일 없음 — working tree / 이 ROADMAP) |
| vaisc 컴파일러 변경 | `/Users/sswoo/study/projects/vais/compiler/ROADMAP.md` |
| **vais-apps/monitor, signature 자체 수정** | **이 ROADMAP 소관 아님** — 생태계 ROADMAP (`/Users/sswoo/study/projects/vais/ROADMAP.md`)에서 관리 |

**경계 위반 사례 (2026-04-17 학습)**: 직전 커밋 `8fc79af`가 이 파일에 monitor FFI 10-task plan을 작성했으나, (1) 작업 대상이 `vais-apps/monitor/` 하위라 lang/ scope 밖이었고, (2) 전제("29 undefined symbols 링크 실패")가 outdated였음. 해당 plan은 전면 폐기됨. → 신규 작업 추가 시 위 표로 scope 먼저 확인.

---

## 배경 (2026-04-17 실측)

### monitor 실측 결함 — lang/ 밖 이슈로 재귀속됨

vais-apps/monitor/server/monitor-server 바이너리 실측 (2026-04-17):
- ✅ 링크 성공, TCP:8080 바인딩 OK
- 🔴 **HTTP 응답 0바이트** (모든 엔드포인트 3초 timeout) — 기존 claim과 동일, **여전히 고장**
- 🔴 **WebSocket 의도적 no-op stub** (`monitor_runtime.c:1596-1660` 주석 명시 "fake-success so binary boots")
- 🔴 **SIGTERM 무시 + busy-loop** (신규 발견, ROADMAP 미기록)
- 🟡 sqlite FTS/VECTOR DDL 실패 (boot 시 stderr, 검색 라우트 전체 이 인덱스 의존)
- 🟡 테스트 커버리지 0 (integration/rag/worker test가 순수 로직만 다룸, HTTP/WS/FTS 미검증)

→ 이 결함은 생태계 ROADMAP Phase 3 (2026-04-11 cancelled) 범위이며, 현재 방향은 Phase 4 "C 의존 제거 + self-hosted vais"로 대체됨. 본 lang/ROADMAP에서 재계획하지 않음. 실측 사실은 `/Users/sswoo/study/projects/vais/ROADMAP.md`의 Phase 3 섹션에 한 줄로 귀속.

---

## 현재 작업 (빈 상태)

lang/ 루트 ROADMAP이 다뤄야 할 **크로스패키지 작업**은 현재 없음. 아래 working tree 변경은 단일 패키지(vais-web) 내부 작업이므로, 커밋 후 vais-web 리팩터 이력으로 정리 예정.

### vais-web working tree 변경 요약 (참고, 작업 대상 아님)
- `packages/language-server/`: type-only import 정리 (`CompletionItem`/`CompletionList`/`Diagnostic`), `@types/node ^20` 추가
- `packages/testing/`: VaisX ComponentFactory 시그니처 리팩터 (`(target) => instance` 직접 마운트). 테스트 파일 76줄 변경.
- `packages/vscode-extension/`: `tsup --external vscode` 추가

이 변경들은 **단일 패키지 내부**라서 lang/ 루트 ROADMAP 소관이 아님. 완료 시 개별 커밋.

---

## 크로스패키지 작업 후보 (필요 시 promoted)

실제로 lang/ 루트에 올라와야 할 작업의 예시 (현재 예약 상태):
- vais-web SSR ↔ vais-server API 계약 회귀 테스트 (현재 `9cc2b7a`에 첫 connection)
- vaisdb ↔ vais-server 소스-레벨 통합 (현재는 wire protocol stub만, native import 미완)
- VaisX testing API 변경이 vais-server SSR endpoint 스펙에 영향을 주는 경우 동기화

→ 필요해질 때 `/harness`로 새로 plan.

---

## 의사결정 로그

### 2026-04-17: monitor FFI plan 폐기
- 배경: `8fc79af`가 monitor FFI 10-task를 이 파일에 작성.
- 조사: (1) 바이너리는 2026-04-11 iter 15에 이미 빌드됨, (2) 결함은 링크 아닌 앱 로직 층, (3) 사용자 지시로 생태계 Phase 3 cancelled.
- 실측: HTTP 응답 완전 고장 (0바이트) + WS 의도적 no-op stub + SIGTERM 무시 확인.
- 결론: 이 작업은 `vais-apps/monitor/` 소관 + 생태계 Phase 4 방향과 재정합 필요. lang/ROADMAP에서 제거.
- 조치:
  - 이 ROADMAP 전면 재작성 (lang/ scope 경계 명시)
  - `vais/ROADMAP.md` Phase 3 섹션에 2026-04-17 실측 결과 부록 추가
