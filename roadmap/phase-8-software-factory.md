# Phase 8 — Software factory after 1.0.0

> **Outcome** — Autonomous delivery works unattended around the clock: an authorized run survives its own repairable failures, a supervisor keeps work moving without anyone starting runs, failures are explained with evidence and questions park one run instead of stopping the rest, and the capability graduates from experimental to stable.

> [!NOTE]
> **Status: ⬜ planned · added on 2026-11-08, after 1.0.0.** Every task waits for its decision record to be accepted. [ADR-0247](../docs/decisions/0247-software-factory-phasing-after-1-0-0.md) (the phasing) and [ADR-0248](../docs/decisions/0248-ci-correction-continuation-under-the-envelope-grant.md) (P8-01) were accepted on 2026-11-16; the rest are proposals 0249–0254 in `docs/decisions/`, plus the accepted [ADR-0198](../docs/decisions/0198-envelope-grant-continuation.md) and [ADR-0209](../docs/decisions/0209-controller-owned-native-credentials.md), whose tasks P6-41 and P6-35 belong to 1.1.0. None of this blocks 1.0.0, where autonomous delivery ships experimental.

## Releases

Proposal 0247 phases the work by dependency, one coherent capability per minor release. On 2026-11-18 1.2.0 went to the user experience ([Phase 9](./phase-9-user-experience.md)) and the factory phases below moved one minor version later, keeping their order. Autonomous delivery stays experimental until 1.5.0, so each phase is additive under the compatibility policy and none needs a major version; fixes ship as patches.

| Release | Capability | Tasks |
| --- | --- | --- |
| 1.1.0 | A run survives its own failures | P6-35, P6-41, P8-01 |
| 1.2.0 | User experience (Phase 9, not part of the factory) | P9-01–P9-21 |
| 1.3.0 | The factory runs without anyone starting runs | P8-02, P8-03, P8-04 |
| 1.4.0 | It explains and asks without stopping | P8-05, P8-06, P8-07 |
| 1.5.0 | Graduation: stable contracts for the rest of 1.x | P8-08 |

The order follows the dependencies: a supervisor that admits work automatically is pointless while every run stops at its first repairable failure, and parking a question only helps when a supervisor keeps the other work moving. In every phase the factory never widens its own authority, never changes acceptance criteria to pass, never invents a missing fact, never declares a test flaky without repeated evidence and never retries an effect whose outcome is unknown.

## P8-01 · CI correction continuation

**Status:** ✅ · **Size:** M · **Depends on:** P6-41 · **Release:** 1.1.0 · **Decision:** [ADR-0248](../docs/decisions/0248-ci-correction-continuation-under-the-envelope-grant.md)

**Goal** — Let a run with no intervention repair a failed required check and continue under its envelope grant, within its push budget.

**Acceptance criteria:**

- [x] A seeded `repair` failure on a required check reaches a green pull request with no human step. Narrowed: shown by the model-free rehearsal with real Git and Docker; the live scenario stays in [manual verification](./manual-verification.md#ci-correction-continuation-p8-01).
- [x] A `blocked` classification or an exhausted push budget still ends the run with its request.

**Tests** — Reducer tests for each condition, a model-free rehearsal with a failing check and one live scenario.

**Evidence** — On 2026-11-17:

- **Tests:** `test/unit/runner/ci-envelope-continuation.test.ts` covers the continuation under the envelope grant, an operator proposal refused under it (mutation-checked), and no continuation for a supervised run, a `blocked` classification or an exhausted push budget. `test/unit/runner/continuation.test.ts` checks that the failed request's environments are released before anything is recorded, and that nothing continues when they are not.
- **Rehearsal:** `npm run eval:ci-continuation -- --unattended` runs the installed to-merge route with real Git and Docker and a synthetic client and code host. The original required check fails; the controller continues under the same envelope grant; the correction, a fresh check and the update of the original pull request pass; merge stays blocked as ungranted. The rehearsal also checks that the correction's build plan saw the CI facts.
- **Live (open):** seven attempts with Codex 0.166.0 and `gpt-6.1-sol` against `dreamingechoes/wholeloop-trials` (`npm run eval:live-ci-correction`). They observed a real required-check failure on GitHub, the unattended continuation under the same grant, an approved correction plan and a builder producing the right repair. Three of them found core gaps, all fixed with tests: the correction's planner and builders lacked the CI facts and the published candidate, and the run's budgets are shared with the original attempt. No attempt reached a green check, for a reason in the scenario rather than the core; [manual verification](./manual-verification.md#ci-correction-continuation-p8-01) records each attempt and what the next scenario needs.

## P8-02 · Delivery supervisor

**Status:** ⬜ · **Size:** L · **Depends on:** P6-35, P6-41, P8-01 · **Release:** 1.3.0 · **Decision:** proposal 0249

**Goal** — Take queued work, resume runs after restarts and usage-window resets, with one supervisor per store under the operating system's service manager.

**Acceptance criteria:**

- [ ] A second supervisor on the same store refuses to start.
- [ ] Killing the supervisor mid-run and starting it again resumes the run without replaying an issued effect.
- [ ] The supervisor never issues a grant, extends a budget or merges.

**Tests** — Process tests for the single-instance lock, a kill-and-restart rehearsal and one live overnight scenario.

## P8-03 · Periodic budgets

**Status:** ⬜ · **Size:** M · **Depends on:** P8-02 · **Release:** 1.3.0 · **Decision:** proposal 0250

**Goal** — Bound what all runs together may consume per day or week.

**Acceptance criteria:**

- [ ] The supervisor admits no run whose own budget does not fit the period's remainder, and resumes admission when the next period starts.
- [ ] Running work finishes under its own budget when the period is spent.

**Tests** — Admission at the boundary and a rehearsal across a period change.

## P8-04 · Continuous intake

**Status:** ⬜ · **Size:** M · **Depends on:** P8-02 · **Release:** 1.3.0 · **Decision:** proposal 0251

**Goal** — Admit labelled issues from the operator's code host through `gh` or `glab`, only within an active standing envelope.

**Acceptance criteria:**

- [ ] A labelled issue inside the envelope becomes a queued run; one outside it waits as a question.
- [ ] Issue text reaches workers only as bounded, quoted data.

**Tests** — Fixture tests with a synthetic `gh` and a rehearsal against the private trial repository.

## P8-05 · Failure diagnosis

**Status:** ⬜ · **Size:** M · **Depends on:** P8-02 · **Release:** 1.4.0 · **Decision:** proposal 0252

**Goal** — Classify a failed integration, acceptance or CI observation with evidence and route each class to one action.

**Acceptance criteria:**

- [ ] Each class (product defect, intermittent test, environment, specification conflict, unknown) is produced from fixture evidence and routes as specified.
- [ ] An intermittent test is claimed only from repeated runs of the same commit, and no class turns a failed check into a pass.

**Tests** — Fixture failures per class and a seeded intermittent test in a rehearsal.

## P8-06 · Asynchronous escalation

**Status:** ⬜ · **Size:** M · **Depends on:** P8-02 · **Release:** 1.4.0 · **Decision:** proposal 0253

**Goal** — Park a run on a question, keep the rest of the factory working and resume the run when a person answers.

**Acceptance criteria:**

- [ ] One run parks on a seeded question while another completes, and the parked run resumes after a recorded answer.
- [ ] An answer to a stale subject refuses, and a parked run still ends at its deadline.

**Tests** — A two-run rehearsal and stale-answer refusal tests.

## P8-07 · Review feedback

**Status:** ⬜ · **Size:** M · **Depends on:** P8-01 · **Release:** 1.4.0 · **Decision:** proposal 0254

**Goal** — Turn comments from accounts with write access on the run's own pull request into bounded repairs.

**Acceptance criteria:**

- [ ] An authorized comment leads to a repaired head that passes verification, review and acceptance again.
- [ ] Comments from other accounts stay retained and blocked; out-of-scope requests escalate.

**Tests** — Fixture comments from authorized and unauthorized accounts and a rehearsal of one repair.

## P8-08 · Graduation of autonomous delivery

**Status:** ⬜ · **Size:** M · **Depends on:** P6-27, P8-01–P8-07 · **Release:** 1.5.0 · **Decision:** proposal 0247

**Goal** — Remove the experimental label once the capability is certified, and freeze its contracts for the rest of 1.x.

**Acceptance criteria:**

- [ ] The P6-27 campaign passes on both reference clients.
- [ ] Each 1.1.0, 1.3.0 and 1.4.0 capability passes its live scenario on at least one reference client.
- [ ] The compatibility policy, README and architecture pages describe autonomous delivery as stable.

**Tests** — The live scenarios above and the compatibility baseline.

---

[◀ P7](./phase-7-release-readiness.md) · [Roadmap](./README.md) · [Journal](./journal.md) · [P9 ▶](./phase-9-user-experience.md)
