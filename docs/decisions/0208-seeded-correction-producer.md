# 0208 — Seeded correction producer

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

[ADR-0197](./0197-correction-revisions-and-stage-reuse.md) records a failed integration or acceptance as a correction revision, under a new exact-plan grant, with a `correction-N:<unit>` stage in the route. Its producer design had two parts:

- give the corrected unit a workspace seeded at the head that failed;
- give every other unit a candidate fixed at its existing head, with only its quality checks running again.

The fixed dispatcher still has no correction producer, so a continuation route stops at preflight.

Building the producer against the public `to-pr` route ([ADR-0207](./0207-public-implementation-route-composition.md)) showed three facts:

- **No Git stage can be reused across the grants.** Workspace and commit records are bound to the grant that created them, and the Git adapter refuses them under any other grant. A continuation always has a new grant, so a reused workspace or commit stage fails in the first consumer that reads it.
- **Under a `none` policy the build plan runs again.** It needs the delegated `approve-build-plan` decision, and ADR-0197 never carries a decision into a new revision. Implementation and commit follow it, so a unit's whole chain runs again, and a candidate that skips implementation would contradict its own re-judged build plan.
- **The acceptance plan belongs to one revision.** The acceptance store keeps exactly one plan per run revision, and unit suites and product QA select it by the current revision. A continuation therefore needs its own acceptance definition.

## Decision

- **Every unit is seeded; nothing changes in the decision rules.** In a correction continuation, each implementation unit's workspace stage runs again under the new grant and allocates a workspace seeded at that unit's committed head from the predecessor request.

  The normal chain then runs on top of that seed:

  1. the build plan and its delegated decision;
  2. implementation, where the builder sees the existing code;
  3. commit;
  4. for the corrected unit, `correction-N` (the repair builder, working from the recorded failure evidence alone, then an owned commit);
  5. all quality checks.

  Every piece of evidence is fresh under the new grant. No decision and no grant-bound record is carried forward.
- **The seed is checked, not trusted.** A seeded workspace request names the predecessor's commit record. The workspace store accepts it only when all of these hold:
  - the record belongs to the same run and unit and to the previous revision's plan;
  - it holds a commit receipt;
  - its head is a commit object in the repository that descends from the declared base.

  The topic branch starts at that head instead of the base.
- **Only independent units are seeded in this version.** A seeded head already contains the predecessor merges of the earlier revision. A unit with predecessors would therefore carry predecessor code that its own predecessors may have corrected. Such a unit is refused as `workspace-seed-predecessors`, and the continuation stays unsupported.
- **Reuse skips grant- and revision-bound stages.** The engine's reuse rule never reuses a workspace, commit or acceptance-definition stage across a continuation. The existing predecessor rule then runs everything that depends on them again.

## Increments

1. Seeded allocation in the workspace store.
2. Reuse exclusions, and seeded workspace stages in a continuation, including how a builder pass that changes nothing is committed.
3. The `correction` stage adapter: a repair builder working from the failure evidence, then an owned commit, registered in the fixed dispatcher.
4. Public composition and a synthetic continuation run, from a failed integration to a completed continuation.

Until increment 3 lands, the dispatcher keeps reporting a continuation route as unsupported.

## Alternatives rejected

- **ADR-0197's seeded candidates for the other units.** They need the build plan of an untouched unit to pass without a new decision. That would carry a judgment of revision N into revision N+1, which ADR-0197 forbids and which only the owner could relax.
- **Relaxing the commit-receipt grant check for an older grant of the same run.** ADR-0197 already rejected this as a weaker evidence rule.
- **Re-pinning the earlier acceptance plan for the new revision.** A controller copy would present the old plan as a definition of the new revision without a planner producing it.

## Verification

Each increment adds its own cases.

**Increment 1.** Revision 1 commits a unit through owned effects, then revision 2 is registered under a new exact-plan grant. The cases check that:

- a seeded allocation records the old commit record and its observed head, and its topic starts exactly at that head on a new branch;
- an unknown commit record, a seed for a plan that has no previous revision, and a seeded unit with predecessor parts are refused before any effect.

The seed is read as history from the old topic's latest applied, host-observed commit effect, because the original grant is inactive by design. The workspace request, record and status contracts gain the optional `seed`, an additive change with updated fingerprints.

**Increment 2.** The engine's reuse rule now skips workspace, commit and acceptance-definition stages. Every stage depends on them, so an implementation continuation runs its whole route again under the new grant. The ADR-0197 continuation cases now assert exactly that, including when every original still inspects as current.

In a continuation, the Git workspace stage finds the predecessor request's own `commit:<unit>` stage and passes its commit record as the seed. A reused commit stage cannot exist, so the seed always names the predecessor's own commit. A builder pass that changes nothing on top of the seed is committed with `--allow-empty`, for seeded workspaces only, so the unit keeps an owned commit of its own. A normal workspace still fails a commit with nothing in it.

A hybrid run uses real Git stages and synthetic stages for the rest. Its first run edits the unit and fails integration. The continuation, under a new grant, then:

- allocates a new topic seeded at exactly the failed head;
- commits an empty owned commit on top of it, whose parent is that head.

It also found that the creation observer still expected the declared base, so every seeded creation was recorded as `binding-mismatch`. The observer now expects the seed head. Increment 1's case missed this because it checked the topic's HEAD rather than the observed effect, and it now checks the workspace status too. Removing either fix fails the cases.

**Increment 3.** The fixed dispatcher now registers `RunnerCorrectionStages` for `correction-N:<unit>`. The stage works like this:

1. It names the unit's N-th recorded correction and reads the predecessor's retained failure: the failed stage, its evidence digest and its reason. For an integration origin it also reads the failed product cases from the integration proof. A public case gives its pinned actions, assertion descriptions and failure conditions. A private evaluator case gives only its id and status.
2. It fences the unit's builder attempt from this revision, requeues it with a correction task carrying that feedback, and launches it in the seeded workspace through the fixed observer.
3. The controller commits the result through owned effects. The unit's candidate, which every QA stage reads, then resolves to that commit while it stays the workspace head.

Writing the stage exposed a queue rule that blocked every continuation. Any settled, unfenced attempt in a slot refused new claims, and the journal cannot fence an attempt of an earlier basis. The rule now counts only attempts on the current basis. That is safe: a continuation only reopens once no attempt, stage or effect is unresolved (ADR-0197), and an earlier basis can never produce current evidence.

The hybrid case runs a real builder and real Git stages and synthetic stages for the rest:

- the first run builds the unit and fails integration;
- the continuation seeds the workspace, rebuilds without changes (an empty owned commit) and runs `correction-1` with the recorded failure;
- QA then reads the corrected bytes, with the failed head two commits below.

Removing the candidate fallback or the queue change fails the case.

Not covered yet:

- **Hiding private cases in the feedback.** This needs a real integration proof with a private case, so it has no dedicated case yet.
- **Acceptance-origin corrections.** They carry only the stage reason and evidence for now.
- **A verification repair on top of a correction.** It is not supported: its repair chain would root at the correction's commit and lease, so it blocks honestly.
