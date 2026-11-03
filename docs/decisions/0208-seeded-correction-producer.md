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
