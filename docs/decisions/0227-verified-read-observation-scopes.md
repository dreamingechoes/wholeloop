# 0227 — Share inputs within a verified read-only observation

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

An unmodified model-free implementation rehearsal on 9b7b9a2 takes 435 seconds and blocks at its final endpoint despite all thirteen stages passing. A separate cold-controller observation executes 4371 Git queries, 2011 complete delivery-journal reads and 1932733 filesystem metadata queries. A known three-command control confirms the subprocess counter. Nested acceptance, product, integration, assembly and unit readers multiply the same dependencies; this is a product defect, not an unavoidable cost of determinism.

The maintainer makes performance a 1.0 release blocker. Measure total controller overhead separately from models and the project's actual test execution. Five seconds is an initial ceiling, not a target to consume; unnecessary operations and poor growth remain defects below that ceiling.

## Decision

Fixed read-only product observers share one process-local observation. Capture complete current bytes once for each distinct input, reuse them only within that observation and independently reread every captured input before its result escapes. Changed, absent-to-present, oversized, cancelled or unavailable inputs refuse the result. Keep public copies independent. There is no retained cache between actions. A physical store selection coalesces canonical resolution, containment, external-store checks and existence into one entry. Separate overlapping path entries exhausted the unchanged 1024-input cap on the first full rehearsal; raising that cap would retain unnecessary work.

The initial scope covers delivery/state journals, bounded source files, canonical/external paths, exact read-only Git queries and discovery inputs. Raw file names and bytes bind journal observations, including whitespace changes and appended segments. Git keys bind the working directory, complete arguments, hooks selection and environment identity; mutation and unsupported query shapes refuse before launch. Final synchronous validation bypasses sharing while retaining the write barrier. Late asynchronous continuations remain closed.

Store writes, locks and native dispatch refuse before any mutation, including a caught attempt. This is an invariant of the installed fixed readers, not a sandbox for arbitrary host code. It creates no authority, credential access, public switch, persisted certificate, schema revision or retry.

Queries must not reconcile effects, populate discovery caches or restore missing suite/verdict submissions. Existing explicit recovery paths remain outside the read-only scope. A passed assembly already has applied effects: reconciling it only repeated its inspection. Keep unresolved or damaged originals unavailable. Preserve current cancellation, grants, original-process binding, private evidence and the original elapsed deadlines.

## Rejected alternatives

- Increasing deadlines or excluding these failures would hide the defect.
- A cross-action or metadata-only cache could retain revoked authority or changed inputs.
- Trusting passed stage flags would discard the original evidence checks.
- Caching across execution or publication would allow an effect to use an old observation.
- Reusing public mutable objects could let a consumer change another reader's proof.

## Verification

Actual filesystem and Git controls verify bounded repeated reads, public-copy independence, ref and byte changes across asynchronous gaps, journal append/whitespace refusal, cancellation, distinct action isolation, write denial and closed continuations. Discovery retains its input fingerprint without a cache write. Existing evidence and recovery checks retain their scope.

Initial diagnostic prototypes correctly fail on missing allowed query forms and on previously concealed discovery/suite/verdict writes; those failures do not count as speedups. Current complete gates, a fresh unmodified rehearsal, total-overhead accounting and broader operation-count regressions remain required. The first component correction cannot close the release performance blocker.

[◀ Decisions index](./README.md)
