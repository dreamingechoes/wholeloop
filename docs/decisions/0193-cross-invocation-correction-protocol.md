# 0193 — Cross-invocation correction protocol

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

A failed integration, acceptance or required CI check ends its runner invocation honestly. Fixing it means producing a corrected candidate and re-running every affected stage. [ADR-0154](./0154-recorded-correction-checkpoint-reconstruction.md) reconstructs correction checkpoints within one invocation, but it records that producing a correction across invocations still needs its own protocol. The owner assigned that protocol to P6-29. Re-entering stages inside the original invocation would reorder or repeat issued effects. Starting an unrelated run would lose the link to the failure it repairs.

## Decision

A correction continues a run through a new, explicit runner request. It never resumes a finished invocation.

1. **Origin.** A continuation names exactly one predecessor request whose run ended with a retained failure:
   - an integration or acceptance stage that failed or was blocked;
   - a `repair` CI request ([ADR-0187](./0187-bounded-ci-repair-requests.md)).

   It also names the failure evidence digest. Without a retained, current failure there is nothing to continue.
2. **Authority.** The continuation needs a current grant that covers its plan and allows the repair. Under `none` intervention, that grant must already carry the repair effects and budgets. Otherwise an operator starts it explicitly. A continuation never widens repositories, effects or scope; that is a revision ([ADR-0192](./0192-revision-impact-and-explicit-adoption.md)).
3. **Budgets.** Integration repairs, CI pushes and attempt restarts are counted from the run's journal across every invocation. A continuation beyond them ends `exhausted` and never resets them.
4. **Correction.** The repair builder works from the failure evidence alone, on the owned topic, and produces a new head through owned commit effects. Its failure input is untrusted data, as in the existing correction workers.
5. **Evidence.** The new route's stages follow the revision-impact rule. A stage is reused only when its complete inputs are unchanged and its original record still inspects as current. Every stage that consumes the changed head, including verification, review, re-verification, integration, acceptance, publication and CI, runs again with fresh invocations. Prior records stay historical and never count for the new head.
6. **Effects.** Pending or unknown effects of the predecessor are reconciled by reading before the continuation starts. Published resources are updated only through the continuation's own effects, such as a non-force push of the new head to the same owned topic.
7. **Outcome.** The predecessor's terminal receipt is unchanged. The continuation's receipt names its predecessor and failure, so the operator report shows the chain.

The protocol is accepted as the design. Its implementation is P6-29 work in progress, and P6-22's second criterion depends on it. Until it lands, a failed integration, acceptance or required check ends the run with its retained evidence and request.

## Alternatives rejected

Resuming the predecessor invocation would repeat issued effects under a new deadline. An unlinked new run would hide which failure a change repairs and could reset budgets. Letting a model decide which evidence survives would make reuse a guess.
