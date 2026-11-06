# 0235 — Bound schema and text validation allocations

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Shared schema validation runs during every event, projection and source validation. It formatted enum diagnostics for valid values, compiled a new expression for every pattern check, created and flattened a diagnostics array at every recursive node, allocated an empty property map per key and built an intermediate vector for uniqueness. Delivery, source, native and attribution text checks encoded every string into a buffer and back to detect malformed Unicode, and expanded strings into code-point arrays to search for control characters.

## Decision

- **Diagnostics only on failure.** Format expected-value diagnostics only on the failure path, with their exact strings and order. One independent diagnostics array per public validation call; a private recursive helper appends to it. Check required fields in one ordered pass and use one private frozen empty-property sentinel.
- **Bounded pattern cache.** Retain at most 128 private compiled expressions, keyed by the complete current pattern string, without flags, schemas, values or outcomes. A changed pattern is compiled immediately; patterns longer than 4096 UTF-16 code units are not retained; invalid expressions still throw and are never cached.
- **Native text predicates.** Check well-formedness with `String.prototype.isWellFormed`, available since Node 20, and match control characters with precompiled non-global expressions equal to each previous set: delivery text permits tab, newlines and DEL; source metadata and native paths refuse C0 and DEL; attribution rationale permits tab and newlines but refuses DEL; client identity refuses all C0 and DEL. `tsconfig.json` adds only the `ES2024.String` declarations; the ES2022 emit target and Node 20 floor stay. Strings are validated, never repaired.
- **Exact behaviour kept.** Arrays keep their captured length, skip holes, include inherited slots and read getters; object entries are snapshotted before recursion; uniqueness serializes every position before comparing, so a later JSON exception still wins over an earlier duplicate; byte quotas precede text validity.

## Alternatives rejected

An unbounded pattern or schema cache would keep stale or attacker-sized entries. `toWellFormed` would silently repair invalid input. Streaming object keys instead of snapshotting them changes sibling selection when a getter mutates another field.

## Verification

At 100/400 valid values: enum diagnostic maps 100/400 → 0; expression constructions for one pattern 100/400 → 1; diagnostic filter/map/flatMap calls 301/1201 → 0; character-array expansions 204800/819200 → 0; `Buffer.from` requests 402/1602 → 0. Original/current comparisons preserve every output and error: all 65536 UTF-16 code units plus 5000 seeded schema and text cases (418344 and 488913 observations) and 20008 recursive schema cases. `test/unit/config/validation-performance.test.ts`, `utf8-validation-performance.test.ts` and `diagnostic-accumulation-performance.test.ts` hold the counts. Actual Node 20 execution remains unverified.

[◀ Decisions index](./README.md)
