# 0016 — Documentation is part of the product

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

A harness is a way of working, written down. If the documentation is thin, stale or hard to navigate, nobody can learn the way of working, evaluate it or change it — and the harness becomes an opaque tool people either trust blindly or avoid. Documentation that describes planned behaviour as if it existed is worse than none.

## Decision

1. **Docs ship with the change.** A pull request that changes behaviour updates the affected pages, status banners and generated references in the same change. A behaviour change without docs is not done.
2. **Honest status.** Every page carries one banner — `📐 design`, `🚧 partial` or `✅ implemented` — updated with the behaviour.
3. **Fixed templates** for step pages, concept pages and ADRs ([docs style](../contributing/docs-style.md)).
4. **Generated navigation.** Page order lives in `docs/nav.yml`; `wl docs nav` writes every footer; `wl docs check` fails CI on drift.
5. **Diagrams are first-class.** Mermaid with a shared palette that reads in light and dark themes; every diagram is parse-checked in CI.
6. **Links are checked** in CI; relative only; no absolute local paths.
7. **Generated references** for anything that mirrors code: configuration keys (from the JSON Schema), `wl` commands (from the CLI definitions), the compatibility matrix (from conformance results), the provider catalogue (from manifests).
8. **English, concise, warm.** TL;DR on every long page; reasons linked to ADRs.

## Consequences

### Positive

- A newcomer can learn and run any step from the docs alone.
- References cannot drift from the code they describe.
- Broken links and diagrams never reach `main`.

### Negative

- Every change carries a documentation cost — accepted on purpose.
- Docs tooling is real code to maintain ([P0-04](../../roadmap/phase-0-foundations.md#p0-04--documentation-tooling)).

## Alternatives considered

| Option | Why not |
|---|---|
| Docs written after the code stabilises | They never catch up |
| A hosted docs site as the primary surface | Extra infrastructure; GitHub already renders everything we need |
| Hand-maintained navigation | Drifts with every new page |

## Links

- [Documentation style](../contributing/docs-style.md)
- [ADR-0001 — Record architecture decisions](./0001-record-architecture-decisions.md)

[◀ Decisions index](./README.md)
