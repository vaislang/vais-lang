# CLAUDE.md - VAIS Ecosystem (vais-lang monorepo)

## Overview

이 모노레포는 Vais 언어로 구축된 프로젝트들의 통합 저장소입니다.
Vais 컴파일러 자체는 별도 repo(`vaislang/vais`)에 있습니다.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| vaisdb | `packages/vaisdb/` | RAG-native hybrid database (Vector + Graph + SQL + Full-text) |
| vais-web | `packages/vais-web/` | VaisX — compile-time reactive frontend framework |
| vais-server | `packages/vais-server/` | Express/Axum-style backend API framework |

## Ecosystem Dependencies

```
vaislang/vais (compiler + std) ← 별도 repo, 핵심 업스트림
    ↓
vaislang/vais-lang (이 repo)
├── vaisdb      ← compiler + std 의존
├── vais-web    ← compiler crates 의존 (codegen-js, parser, ast)
└── vais-server ← compiler + std 의존, vaisdb query API 의존
```

상세 의존성 맵: [VAIS-ECOSYSTEM.md](./VAIS-ECOSYSTEM.md)

## Cross-Package Work Guidelines

이 모노레포에서 작업할 때:

1. **harness 사용 시**: 각 패키지 디렉토리에서 실행하되, `../../VAIS-ECOSYSTEM.md`를 참조하여 중복 개발 방지
2. **패키지 간 변경**: 같은 모노레포이므로 한 커밋에서 여러 패키지를 동시에 수정 가능
3. **새 유틸리티 구현 전**: `VAIS-ECOSYSTEM.md`의 "Shared Components" 확인
4. **컴파일러 이슈**: vaislang/vais repo의 ROADMAP.md 참조
