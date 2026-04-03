# VAIS Ecosystem Map

> 이 파일은 VAIS 생태계의 크로스-프로젝트 의존성과 공유 컴포넌트를 추적합니다.
> 각 패키지의 CLAUDE.md에서 이 파일을 참조합니다.
> 새 패키지 추가 시 반드시 이 파일과 해당 패키지 CLAUDE.md를 함께 업데이트하세요.

---

## Repository Structure

```
vaislang/vais       ← 컴파일러 (별도 repo)
vaislang/vais-lang  ← 에코시스템 모노레포 (이 repo)
  └── packages/
      ├── vaisdb/
      ├── vais-web/
      └── vais-server/
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│            vais (compiler) — 별도 repo           │
│         Rust · LLVM 17 · 31 crates              │
│    AST · Parser · Type Checker · Codegen        │
│    std/ (80 .vais files) · codegen-js · WASM    │
└──────────┬──────────┬──────────┬────────────────┘
           │          │          │
┌──────────┼──────────┼──────────┼────── vais-lang ──┐
│    ┌─────▼──┐  ┌────▼───┐  ┌──▼──────────┐        │
│    │ vaisdb │  │vais-web│  │ vais-server  │        │
│    │  Pure  │  │ Hybrid │  │  Pure Vais   │        │
│    │  Vais  │  │ TS+Rust│  │  HTTP/WS/DB  │        │
│    └────────┘  └────────┘  └──────┬───────┘        │
│                                   │                │
│                             ┌─────▼──────┐         │
│                             │   vaisdb   │         │
│                             │ (native)   │         │
│                             └────────────┘         │
└────────────────────────────────────────────────────┘
```

## Dependency Graph

| Package | Depends On | Interface Used |
|---------|-----------|----------------|
| **vaisdb** | vais compiler, vais std | `vaisc build`, std/{file,net,sync,hashmap}.vais |
| **vais-web** | vais compiler (codegen-js, parser, ast, WASM) | vais-codegen-js, vais-parser, vais-ast crates |
| **vais-server** | vais compiler, vais std | `vaisc build`, std/{async_http,http_server,websocket}.vais |
| **vais-server** | vaisdb | native query API (TCP/embedded) |

## Shared Components — 중복 개발 금지

아래 컴포넌트는 이미 존재합니다. 이 모노레포 내에서 동일 기능을 재구현하지 마세요.

### vais/std/ (표준 라이브러리 — 별도 repo vaislang/vais)
| 모듈 | 경로 | 사용처 |
|------|------|--------|
| File I/O | `std/file.vais` (fsync, mmap, flock) | vaisdb |
| Networking | `std/net.vais` (TCP) | vaisdb |
| HTTP | `std/async_http.vais`, `std/http_server.vais` | vais-server |
| WebSocket | `std/websocket.vais` | vais-server |
| Sync | `std/sync.vais` (Mutex, RwLock) | vaisdb, vais-server |
| Collections | `std/hashmap.vais`, `std/vec.vais` | all |
| String | `std/string.vais` | all |
| Option/Result | `std/option.vais` | all |

### vais compiler crates (코어 인프라 — 별도 repo vaislang/vais)
| 모듈 | 경로 | 사용처 |
|------|------|--------|
| JS Codegen | `crates/vais-codegen-js/` | vais-web |
| WASM Codegen | `crates/vais-codegen/` (wasm target) | vais-web |
| Parser | `crates/vais-parser/` | vais-web (계약 테스트) |
| AST | `crates/vais-ast/` | vais-web (계약 테스트) |

### 패키지 간 공유 (이 모노레포 내)
| 기능 | 제공 패키지 | 경로 | 소비 패키지 |
|------|-----------|------|-----------|
| DB wire protocol | vaisdb | `packages/vaisdb/src/server/` | vais-server |
| Query API | vaisdb | `packages/vaisdb/src/client/` | vais-server |

## Interface Contracts — 변경 시 영향 범위

| 변경 대상 | 영향 패키지 | 필수 조치 |
|----------|-------------|----------|
| vais AST 구조 변경 | vais-web | vais-web 계약 테스트 220개 재실행 |
| vais std/ API 변경 | vaisdb, vais-server | 해당 패키지 빌드 + 테스트 |
| vais codegen-js 변경 | vais-web | vais-web JS codegen 테스트 재실행 |
| vais Type System 변경 | vaisdb, vais-server | 컴파일 호환성 확인 (특히 Phase 158 strict coercion) |
| vaisdb wire protocol 변경 | vais-server | vais-server db/ 모듈 업데이트 |
| vaisdb query API 변경 | vais-server | vais-server QueryBuilder 업데이트 |

## Active Cross-Project Concerns

> 프로젝트 간 진행 중인 이슈를 추적합니다. 해결되면 체크하세요.

- [x] vais compiler Phase 158 strict type coercion → vaisdb TC 에러 대응 중
- [ ] vais-server의 vaisdb 네이티브 연동 — vaisdb wire protocol 안정화 후 실제 통합 테스트 필요
- [x] vais-web SSR → vais-server 연동 인터페이스: HTTP API bridge (POST /ssr/render, port 3001)

## Cross-Project Verification Checklist

새 기능이나 변경 작업 시 아래를 확인하세요:

1. **컴파일러 변경 시** (vaislang/vais): 이 모노레포의 모든 패키지 빌드가 깨지지 않는지 확인
2. **std 라이브러리 변경 시**: 해당 모듈을 사용하는 모든 패키지에서 테스트 실행
3. **새 유틸리티 구현 전**: 이 파일의 "Shared Components" 섹션에 이미 있는지 확인
4. **DB 관련 작업 시**: vaisdb에 이미 구현된 기능인지 확인, vais-server db/ 모듈과 중복 여부 체크
5. **프론트엔드 빌드 변경 시**: vais-web 계약 테스트가 통과하는지 확인
