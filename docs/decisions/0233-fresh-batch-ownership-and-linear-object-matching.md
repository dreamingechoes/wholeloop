# 0233 — Validate ownership once per fresh backend batch

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Docker inspection already groups at most sixteen IDs per object kind. The remaining amplification is local: matching each response object checks its labels by reconstructing the complete environment history, then ownership validation repeats that same match. An executed 21-resource fixture needs four backend queries but 43 full history reads, 129 history-file opens and 2107 exists calls. Four resources need three queries, nine history reads and eighteen history-file opens. Container mount dependencies are also deduplicated twice through nested searches.

## Decision

Index each bounded backend response by its exact kind-specific ID, rejecting incorrect counts, duplicate IDs and malformed identities. For each requested object, still validate its exact name, complete labels, creation stamp and container/volume/network policy. Read the complete local environment history afresh after each awaited backend response, then share that validated owner's immutable identity only within the following synchronous batch checks. The next backend call, action or inspection takes another fresh read. Public labels and other creation/recovery boundaries retain their existing fresh reads; no externally supplied owner bypass or process cache is added.

Partition retained resources and index owned mount volumes in one pass, preserving original kind/query/result order and duplicate-resource refusal. Deduplicate mount IDs once with a first-occurrence Set, preserving order and refusing unobserved IDs through the original checks. Keep all existing transport output limits, sixteen-ID batches, current-control checks around snapshot queries and final mount dependency validation. No incomplete response is repaired by per-ID retry or guessed ordering.

## Rejected alternatives

- Increasing batch sizes does not remove the repeated local history reconstruction and risks unbounded transport requests.
- A last-action owner cache misses changed or corrupt history while a backend query is in flight.
- Matching only IDs omits labels, creation stamps and containment policies.
- Suppressing the second full match with a caller-supplied trusted flag invites an identity-validation bypass.
- Keeping filter/findIndex searches preserves unnecessary per-object scans and duplicate mount passes.

## Verification

The calibrated physical counter independently matches three lstat calls and one each of open, fstat, read and exists. Controlled before/after fixtures exclude setup and use actual owned filesystem histories with reordered synthetic Docker responses; they establish no native Docker/model acceptance. Four resources retain three backend queries while history reads fall 9 → 4, history opens 18 → 8 and exists calls 441 → 196. Twenty-one retain four queries while reads fall 43 → 5, history opens 129 → 15 and exists calls 2107 → 245.

The original-source regression run has two expected count failures and eighteen passes. The corrected reader passes all 65 focused snapshot/Docker controls and strict types, including history corruption after each of three backend responses, corruption before a subsequent inspection, missing/extra/duplicate objects, foreign labels/mounts and changed policies. All 153 final focused actual macOS process/containment controls in seven files and strict types pass. Increment gates and complete-route overhead remain separate obligations.

[◀ Decisions index](./README.md)
