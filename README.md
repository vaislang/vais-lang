# vais-lang

VAIS 생태계 모노레포 — Vais 언어로 구축된 프로젝트들의 통합 저장소.

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [vaisdb](./packages/vaisdb/) | RAG-native hybrid database (Vector + Graph + SQL + Full-text) | Active |
| [vais-web](./packages/vais-web/) | VaisX — compile-time reactive frontend framework | Active |
| [vais-server](./packages/vais-server/) | Express/Axum-style backend API framework | Active |

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

- [Vais Compiler](https://github.com/vaislang/vais) v1.0.0+
- Node.js 20+ and pnpm 9+ (for vais-web)

## Related

- [vaislang/vais](https://github.com/vaislang/vais) — Vais compiler, standard library, and toolchain

## License

MIT
