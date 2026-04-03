# CLAUDE.md - VaisX (vais-web) AI Assistant Guide

## Project Overview

VaisX / VaisKit은 컴파일 타임 반응성과 파일 기반 라우팅을 갖춘 토큰 효율적인 풀스택 웹 프레임워크입니다. Vais 코어 컴파일러의 JS/WASM codegen을 활용합니다.

## Build & Test

```bash
pnpm install                  # Install dependencies
pnpm -r build                 # Build all packages
pnpm -r test                  # Run all tests
pnpm -r lint                  # Lint all packages
```

Requires: Node.js 20+, pnpm 9+

## Project Structure

```
crates/                        # Rust crates (Vais compiler integration)
├── vaisx-compiler/            # VaisX compiler bridge
├── vaisx-parser/              # VaisX template parser
└── vaisx-wasm/                # WASM bindings

packages/                      # TypeScript packages (npm)
├── runtime/                   # Core runtime (< 3KB)
├── cli/                       # Project scaffolding CLI
├── kit/                       # Core types & shared interfaces
├── plugin/                    # Vite-compatible plugin system
├── devtools/                  # Reactivity graph & profiler
├── hmr/                       # Hot Module Replacement
├── components/                # Built-in UI components
├── store/                     # State management
├── query/                     # Data fetching
├── forms/                     # Form handling
├── auth/                      # Authentication
├── i18n/                      # Internationalization
├── a11y/                      # Accessibility
├── motion/                    # Animation
├── testing/                   # Test utilities
├── db/                        # Database integration
├── ai/                        # AI features
├── native/                    # Native platform support
├── federation/                # Module federation
├── benchmark/                 # Performance benchmarks
├── language-server/           # LSP implementation
├── typescript/                # TypeScript integration
└── vscode-extension/          # VSCode extension

examples/                      # Example apps (hello, counter, todo, blog)
docs/                          # Documentation
```

## Key Design Decisions

1. **Compile-time reactivity**: `$state`, `$derived`, `$effect` compiled at build time → runtime < 3KB
2. **File-based routing**: `app/` directory = URL structure, per-page SSR/SSG mode
3. **Vite-compatible plugins**: full Vite plugin API compatibility
4. **Hybrid Rust+TS**: Rust crates for compiler integration, TypeScript packages for web runtime

## Core-Web Interface Contracts

VaisX는 Vais 코어 컴파일러와 계약 테스트(220개)로 호환성을 보장합니다:
- Parser compatibility: 26/26 tests
- WASM bindgen: 17/17 tests
- JS codegen: 26/26 tests
- E2E: 40+ tests

대상 코어 버전: Phase 139+

## Roadmap Reference

See [ROADMAP.md](ROADMAP.md) for detailed phase breakdown.

---

## VAIS Ecosystem

> 전체 생태계 맵: [../../VAIS-ECOSYSTEM.md](../../VAIS-ECOSYSTEM.md)
> 이 프로젝트는 `vaislang/vais-lang` 모노레포의 `packages/vais-web/`에 위치합니다.

### Position in Ecosystem
```
vais (compiler) ← upstream (별도 repo: vaislang/vais)
├── vais-codegen-js  → JS codegen
├── vais-parser      → AST parsing
├── vais-ast         → AST definitions
└── WASM codegen     → wasm32 target
    ↓
vais-web ← this package
    ↓ (SSR)
vais-server (backend API) ← 같은 모노레포: ../vais-server/
```

### Upstream Dependencies
| Source | Path | Interface |
|--------|------|-----------|
| vais-codegen-js | (별도 repo) vaislang/vais/crates/vais-codegen-js/ | JS ESM code generation |
| vais-parser | (별도 repo) vaislang/vais/crates/vais-parser/ | Vais source parsing |
| vais-ast | (별도 repo) vaislang/vais/crates/vais-ast/ | AST type definitions |
| WASM codegen | (별도 repo) vaislang/vais/crates/vais-codegen/ | wasm32 compilation target |

### Downstream Dependencies
| Project | Path | 사용하는 인터페이스 |
|---------|------|-------------------|
| vais-server | `../vais-server/` | SSR 연동 (미정의) |

### 작업 전 체크리스트
- **컴파일러 연동 변경 전**: vaislang/vais ROADMAP.md 확인 — AST/Parser/Codegen 변경사항 체크
- **새 유틸리티 구현 전**: `../../VAIS-ECOSYSTEM.md` "Shared Components" 확인 — std나 다른 프로젝트에 이미 있는지 확인
- **계약 테스트 실패 시**: vaislang/vais ROADMAP.md 확인하여 코어 변경이 원인인지 체크
- **SSR 관련 작업 시**: `../vais-server/ROADMAP.md` 확인 — 서버사이드 연동 인터페이스 중복 방지
