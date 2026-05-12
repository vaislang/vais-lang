# vais-server Roadmap

Last verified: 2026-05-12

This file is intentionally current-only. Historical runtime promotion logs and
intermediate smoke counts were removed from the active roadmap so future agents
do not treat already-promoted server surfaces as blocked work.

## Current Status

The active source of truth for cross-repository coordination is
`/Users/sswoo/study/projects/vais/ROADMAP.md`.

Current promoted vais-server gate:

| Gate | Current status |
|---|---|
| Runtime smoke | `SERVER RUNTIME smoke=18/18` |
| Aggregate check | `cd compiler && bash scripts/check-integrity.sh` |

## Certified Surface

The promoted runtime gate verifies bounded behavior for:

- minimal `App`/`Context` runtime;
- VaisDB embedded integration;
- request/header/content-type handling;
- static, dynamic path-param, query-string, and wildcard router behavior;
- bounded form and compact flat JSON body parsing;
- nested raw-props object and array preservation for the promoted SSR path;
- JSON string escaping for SSR hydration payloads;
- SSR raw-props JSON value grammar validation before raw embedding;
- symbolic middleware pipeline dispatch;
- SSR render/hydrate API response contracts;
- auth password policy validation and malformed hash rejection;
- auth session create/get/get_session/destroy, data-bag insert/update/missing
  lookup, expired-session rejection, and cleanup retaining live sessions;
- compiled SSR forwarding over local loopback HTTP;
- upstream non-2xx preservation and transport failure to `502`;
- explicit timeout to `504`;
- bounded retry after transport failure;
- retry-budget observability.

These gates prove the promoted surfaces. They do not imply product-complete
HTTP framework coverage.

## Not Certified Yet

These are active non-claims, not current regressions:

- complete JSON validation across every parser path outside the promoted SSR
  raw-props value parser;
- HTTPS/TLS, redirects, keep-alive pooling, and external network reliability;
- arbitrary middleware instance dispatch;
- response body string-concat middleware transforms;
- backoff and jitter policy beyond the promoted retry-budget gate;
- cryptographic password hashing, JWT/OAuth token flows, real clock integration,
  cryptographic session identifiers, and external auth integration;
- deployed Node SSR operation outside the local loopback smoke.

## Next vais-server Work

No vais-server package task is currently open here.

Start a new server task only when the root coordination roadmap promotes one
bounded runtime gate. Keep broader framework claims out of the certified surface
until a dedicated smoke promotes them.

## Validation

Use these commands for vais-server handoff and closeout:

```bash
cd /Users/sswoo/study/projects/vais/compiler
cargo test -p vaisc --test e2e --release phase_vais_server_runtime_smoke -- --nocapture --test-threads=1
bash scripts/check-integrity.sh
git diff --check
git -C ../lang diff --check
```
