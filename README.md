# vais-lang

VAIS 생태계 모노레포 — Vais 언어로 구축된 프로젝트들의 통합 저장소.

## Current Status

현재 공개 기준은 `vaislang/vais`의 최신 소스 빌드와 root coordination
roadmap에 묶인 gate입니다. 이 저장소의 패키지는 제품 완성 또는 v1.0
릴리스로 주장하지 않고, 아래 검증된 범위만 현재 baseline으로 봅니다.

- `vaisdb`: package codegen `261/261`, runtime smoke `34/34`
- `vais-server`: runtime smoke `15/15`
- `vais-web`: runtime smoke `61/77` with credential/network-gated cases skipped,
  unit `390/390`, ecosystem package tests `3272/3272`, full-build `24/24`
- package full-build aggregate: `2/2`

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [vaisdb](./packages/vaisdb/) | RAG-native hybrid database workbench (Vector + Graph + SQL + Full-text) | Promoted bounded gates |
| [vais-web](./packages/vais-web/) | VaisX — compile-time reactive frontend framework workbench | Promoted bounded gates |
| [vais-server](./packages/vais-server/) | Express/Axum-style backend API framework workbench | Promoted bounded gates |

## Architecture

```
vais (compiler + std)          ← vaislang/vais (separate repo)
    ↓
┌─────────────────────────────── vais-lang (this repo) ──┐
│                                                         │
│  vaisdb          vais-web         vais-server           │
│  (database)      (frontend)       (backend API)         │
│                                       ↕                 │
│                                    vaisdb               │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- [Vais Compiler](https://github.com/vaislang/vais) built from the current
  certified source baseline
- Node.js 20+ and pnpm 9+ (for vais-web)

## Related

- [vaislang/vais](https://github.com/vaislang/vais) — Vais compiler, standard library, and toolchain

## License

MIT
