# 0247 — Software factory phasing after 1.0.0

- **Status:** Proposed
- **Date:** 2026-11-08

## Context

Autonomous delivery ships experimental in 1.0.0 ([0066](./0066-v1-compatibility-baseline-and-deprecation.md)). With intervention `none` and a grant covering its effects, a run that meets no failure goes from an authorized source to a ready pull request without a person; failures inside a unit are already repaired within their budget. A person is still needed when integration, acceptance or CI fails, when a worker credential expires or a usage window runs out, when a fact only a person knows is missing, when a budget is spent, and to start every run. Running unattended around the clock needs more than one feature, and the pieces depend on each other: a supervisor that starts runs is pointless while every run stops at its first repairable failure, and an escalation that does not stop the factory needs a supervisor that keeps working.

## Decision (proposed)

- **Phase by dependency, one coherent capability per minor release.** Autonomous delivery stays experimental through these releases, so each phase is additive and ships as a minor version under [0066](./0066-v1-compatibility-baseline-and-deprecation.md); fixes ship as patches. None needs a major version, because no frozen surface changes.

  | Release | Capability | Decisions |
  | --- | --- | --- |
  | 1.1.0 | **A run survives its own failures**: repairable integration, acceptance and CI failures continue under the original authority, and expired credentials or exhausted usage windows pause instead of failing | [0198](./0198-envelope-grant-continuation.md), [0209](./0209-controller-owned-native-credentials.md), proposal 0248 |
  | 1.2.0 | **The factory runs without anyone starting runs**: a supervisor takes queued work, resumes after restarts and window resets, draws on a budget per period and admits new work from the code host within a standing envelope | proposal 0249, proposal 0250, proposal 0251 |
  | 1.3.0 | **It explains and asks without stopping**: failures are classified with evidence, questions park one run while the others continue, and review comments on its own pull requests become bounded repairs | proposal 0252, proposal 0253, proposal 0254 |
  | 1.4.0 | **Graduation**: autonomous delivery stops being experimental and its contracts are frozen for the rest of 1.x | this record |

- **Graduation criteria.** The P6-27 campaign passes on both reference clients, and each 1.1.0–1.3.0 capability passes its own live scenario on at least one of them: a seeded repairable failure that continues to the endpoint, a supervisor restart mid-run, a window reset that resumes, a park-and-answer round trip and a review-comment repair. Graduation only adds guarantees, so it is a minor release.
- **What never heals itself, in any phase.** The factory never widens its own authority (repositories, effects, merge), never changes acceptance criteria to make a failure pass, never invents a missing fact, never declares a test flaky without repeated evidence and never retries an external effect whose outcome is unknown. These stay decisions for a person, and every phase above keeps them.

## Alternatives rejected

- **Everything in 1.0.0.** It delays the release for capabilities no real client has exercised, and would freeze contracts before the first live run completes.
- **One large 2.0.0.** A major version signals broken compatibility, which none of this needs, and one large release hides which capability caused a regression.
- **Ordering by convenience (intake or notifications first).** Without 1.1.0 every run admitted automatically would stop at its first repairable failure.

## Consequences

The roadmap groups this work after 1.0.0 with a release per phase. Each decision listed above is accepted or amended before its implementation starts; until then the 1.0.0 behaviour stays as documented.

## Verification

Each phase lists its live scenario in its tasks. Fixture and model-free rehearsals verify the controller paths first; the live scenarios need the reference clients and their quota.

[◀ Decisions index](./README.md)
