# 0241 — Index current plan relations

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Plan validation repeated work per element: it split the source body once per mapped criterion (17538900/280755600 requested UTF-16 units at 100/400 mappings), checked references by linear membership (55450/670900 positions at 100/400 criteria), copied the active dependency branch for every edge (5050/80200 set additions for 100/400-node chains), expanded milestone closures already proven complete (300/4950 entries at 25/100 units) and searched all work for the producer of every consumed contract (300/4851 visits at 25/99 units).

## Decision

All indexes belong to one validation call and never cross it:

- **Source criteria.** Split source lines once, only when criterion mappings exist; a single mapping keeps the short search; several extend a criterion index only through the declaration prefix each mapping needs.
- **References and coverage.** Declaration vectors longer than one get membership sets. Duplicate references are refused before membership checks. Covered outcomes, criterion owners and milestone coverage accumulate during the validation that already visits them; ownership refusals are deferred until the original work checks finish.
- **Dependency traversal.** One private active branch: a node joins before its dependencies are visited and leaves before it is marked checked, keeping depth-first order and exact cycle errors.
- **Milestones.** After both cycle checks, skip ancestor closures when unique known work already covers all units; the milestone graph passed to cycle validation is reused for ancestry. Cardinality proves coverage only because uniqueness and known references were proven first.
- **Contract producers.** Zero or one consumed reference keeps the original search; several extend a private producer prefix index only until the requested contract is found.

Mapping order, exact ranges and text, refusal precedence, graph contracts and every schema, source and authority check are unchanged.

## Alternatives rejected

Widening plan budgets for performance fixtures, removing recursion or skipping graph checks were unnecessary. Indexing complete tails or persisting indexes adds work or crosses the call's ownership.

## Verification

`test/unit/delivery/source-mapping-performance.test.ts`, `plan-reference-performance.test.ts`, `plan-ancestor-performance.test.ts`, `plan-producer-performance.test.ts` and `test/unit/slices/dependency-performance.test.ts` hold each count above at linear or zero work. Original/current comparisons over seeded plans preserve every accepted output and every refusal, for example 10000 producer variants (2686 accepted, 7314 refused).

[◀ Decisions index](./README.md)
