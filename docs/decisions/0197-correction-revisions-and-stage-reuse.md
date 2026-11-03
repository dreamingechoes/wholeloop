# 0197 — Correction revisions and stage reuse

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

[ADR-0193](./0193-cross-invocation-correction-protocol.md) accepted the protocol for continuing after a failed integration, acceptance or CI check. It left three questions to the implementation:

- How does a new runner request continue a run whose state is terminal? `failed` and `blocked` have no outgoing transitions.
- How is "reuse a stage only when its complete inputs are unchanged" made deterministic rather than judged?
- Which grant may start the continuation? ADR-0193 allowed a `none` run to continue under a grant that already carried the repair effects.

## Decision

- **A continuation is a correction revision.** `wl delivery continue` previews, and with `--accept`, an operator and a reason records, the next plan revision. That revision is the current plan plus one `corrections` entry: the owning unit, the origin (`integration` or `acceptance`), the predecessor runner request, the failed stage and its exact evidence digest. The owning unit is named by the operator, never guessed from failure text. Earlier corrections are kept in order, and a plan never holds more than its `integrationRepairs` budget.
- **The journal reopens only a retained failure.** Registering a revision that adds a correction carries `continues` with the request, stage and failure. The reducer accepts it only on a `failed` or `blocked` run when all of these hold:
  - that request holds that exact failed or blocked integration or acceptance observation on the current basis;
  - its controller is released and no stage, attempt or effect is unresolved;
  - integration repair counters plus earlier continuations stay below the pinned `integrationRepairs` limit.

  `completed` and `exhausted` runs never continue. The predecessor's terminal control event and its runner record remain unchanged history; `continuations` in the runner facet and the operator report name the chain.
- **Always a new exact-plan grant.** The first grant recorded on a correction revision must be bound to that revision's exact plan digest and must never have been seen on the run before. The failed run's grant and any envelope grant are refused, under every intervention policy. This is the conservative choice AGENTS.md requires when authority could widen. Letting a still-active envelope grant start a `none` continuation without an operator is left to the owner as a separate draft, `docs/decisions/0198-envelope-grant-continuation.md` (status Proposed).
- **The route re-enters the owning unit.** Each correction adds a `correction-N:<unit>` stage between `commit:<unit>` and `verification:<unit>`. Verification, review, re-verification, integration, acceptance, publication and handoff therefore have new inputs. Nothing upstream changes.
- **Reuse is computed, then confirmed.** At the start of the continuation, the controller computes the [revision impact](./0192-revision-impact-and-explicit-adoption.md) between the two revisions and walks the route in order. A stage is reused only when all of these hold:
  - the impact keeps it;
  - it needs no delegated decision, so a judgment of the old plan is never carried forward;
  - every non-plan predecessor was itself reused;
  - the host re-inspects the original invocation and returns the same passed evidence.

  A reused stage is journalled as a `reused` runner event that names its originating request and basis. It counts only for the new basis, and every other stage runs again under a fresh invocation.
- **Producer not yet registered.** The fixed dispatcher has no correction producer yet. It reports a continuation route unsupported at static preflight instead of running part of it. A CI-origin continuation also needs the CI stage that P6-24 adds.

The plan, registration event, runner event, runner facet, runner status and report contracts gain optional fields and one stage kind. They are additive changes to the unreleased v1 candidate ([ADR-0066](./0066-v1-compatibility-baseline-and-deprecation.md)), and their fingerprints are updated in the same change.

## Producer design

> [ADR-0208](./0208-seeded-correction-producer.md) replaces the seeded-candidate part of this design: under a `none` policy every unit is seeded and its chain runs again, because a build plan decision is never carried into a new revision.

Owned workspaces and commit receipts are valid evidence only under the run's current grant and basis. `validateOwnedWorkspaceCommit` enforces this even when it audits history. Since every continuation has a new grant, nothing owned under the old grant can count as current evidence for it. The producer therefore follows these rules:

- **Seeded workspace.** The corrected unit gets a new owned workspace under the new grant, seeded at the head that failed. That head is checked as a Git object against the old receipt's hash and must descend from the declared base. The repair builder works there from the failure evidence alone and commits through owned effects.
- **Seeded candidates.** Every other code unit feeding a stage that runs again gets a candidate under the new grant, fixed at its existing head. Its quality checks run again on that candidate.
- **History only.** Original stages count only as history, never as current candidate evidence. The commit-receipt invariant stays unchanged.

This requires a seeded-candidate notion in the workspace contract and in every consumer that today expects a commit receipt: verification, review, native gates, readiness, integration and repairs. Relaxing the receipt invariant for an older grant of the same run was rejected as a weaker evidence rule. The owner chose to build the producer together with P6-27, when native reference clients can exercise it with real evidence.

## Alternatives rejected

- Adding a `failed → queued` edge would let any controller resume a finished run, which ADR-0193 rejects.
- Starting an unlinked run would reset budgets and hide which failure is being repaired.
- Letting the impact decide reuse alone would trust a record whose external state may have changed. Re-inspection catches a stale original.
- Reusing decision stages would apply a judgment of revision N to revision N+1.

## Verification

Engine cases on a synthetic controller host cover the flow from a failed integration to a completed continuation:

- the preview with per-stage decisions and an unchanged journal;
- refusal of the failed run's grant and of a fresh envelope grant;
- reopening under a new exact-plan grant, with the chain recorded;
- reuse of exactly workspace, build plan, implementation, commit and acceptance definition, while every downstream stage runs again;
- a stale original that forces its dependents to run again;
- refusal while an effect awaits reconciliation and when the repair budget is spent;
- compiled CLI preview and acceptance.

Mutation checks confirm that removing the new-grant rule or the evidence re-inspection fails these cases. A decision case shows that a delegated decision becomes stale once a later revision is adopted, while keeping its record.
