# 0105 — Pin acceptance definitions and separate observed evidence

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

A worker's claim that a test passed is not an observed execution. A previously passing candidate or a person's historical PR note cannot establish current acceptance for another candidate. Case definitions also become meaningless if a failed requirement can be silently marked inapplicable. Behavioral hosts need an independently validated evidence contract before their execution implementations are added.

## Decision

1. Pin one immutable acceptance definition per delivery run/revision, bound to its exact source and delivery-plan digest. Require complete applicable coverage of every agreed criterion, explicit applicability rationale, inherited human/machine ownership, initial conditions, actions, assertions, failure conditions, runner capability/input, fixture identity and finite timeouts. Refuse the first definition after a builder has been admitted on that delivery basis; unchanged historical reads remain available. A new revision is explicit; a failed case cannot rewrite its own applicability in place.
2. Keep assertion expectations as explicit JSON literals, distinct from absent fields. Preserve literal empty input/argv and zero values. Use closed shape/bound checks rather than applying prose trimming to process arguments. Objective execution and comparison belong to the deterministic behavior hosts; planning alone establishes no acceptance.
3. Only trusted controller host functions can execute a case through this boundary. Expose no JSON result/process import command and no worker method that records human acceptance. Persist a stable case intent before host execution, recheck private authority, bound time/cancellation and bind results to the exact invocation, host, candidate and owned application. Intent persistence consumes the original deadline. If it expires before host dispatch, record a stopped interruption instead of extending execution; its later control receipt remains readable. Unknown invokers prevent blind retries. Host payloads cannot replace controller metadata. Current Docker boundary observations remain separate from fixture boundaries.
4. Require complete assertion results supported by actual bytes captured during that invocation. Verify every artifact again on reads. A zero exit alone is insufficient, and a CLI pass needs observed process facts. Compare current environment/recipe and candidate bytes before accepting results; changed inputs produce stale/unavailable evidence. Order attempts and human notes by private monotonic sequence so equal timestamps cannot select an older success over a later failure.
5. Keep human-only coverage pending until an explicit named operator note bound to the current candidate. Never derive it from machine output, fixture execution or an old standalone PR-testing record. Preserve the original supervised records and behavior. Fixture reports may pass their own contract checks but remain fixture-only and cannot become actual delegated acceptance or publication authority.
6. Store content-addressed artifacts outside repositories. Bound one artifact to twenty MiB and use the existing finite per-run artifact accounting, two hundred MiB by default. Represent larger objects as verified eight-MiB-or-smaller chunks to preserve the frozen budget contract. Scan the complete byte sequence for recognizable credential text before splitting; reject rather than store a known credential. Keep partial budget omissions visible, retain evidence without TTL deletion and authorize no sharing by capture. Binary storage is not a claim of universal visual redaction.
7. Produce typed current coverage reports and optionally seal them as immutable private, budgeted JSON artifacts. Report status, evidence provenance, human ownership and publication remain separate. A report never starts a worker, impersonates a person, grants publication or resets existing suites/gate budgets. Actual CLI/API, browser and private evaluation hosts remain their subsequent increments.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Import a worker JSON object as an observed result | Lets a claim forge process or human evidence |
| Reuse the latest passing test regardless of candidate | Hides repairs, changed environments and newer failures |
| Reclassify failed criteria as inapplicable | Changes the agreed acceptance after seeing the result |
| Infer human testing from machine success or an old PR note | Conflates distinct observers and candidate revisions |
| Raise the frozen budget artifact limit in place | Changes a published contract unnecessarily |
| Scan each chunk independently | Can miss recognizable credential text across a boundary |
| Delete private evidence when its review date arrives | Loses useful failure history without an operator choice |

## Verification and limits

Tests cover definition pinning/recovery, required coverage/ownership, literal values, raw process claims, host metadata replacement, wrong/current candidates, missing assertions, invocation-local capture, equal-time ordering, human notes, unknown invokers, revocation, twenty-MiB chunk verification, finite omissions and actual symlink/byte tampering. Compiled CLI tests exercise inert preparation/inspection and capture while proving that Docker is not invoked. Host responses in this increment are explicitly normalized fixtures; actual application behavior, browser boundaries, hidden evaluation and native-model acceptance remain P6-15–P6-17/P6-27. Controller code, its host registry and private store remain trusted; worker JSON cannot supply those functions or recover private authority.

[◀ Decisions index](./README.md)
