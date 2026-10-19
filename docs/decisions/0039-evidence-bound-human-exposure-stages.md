# 0039 — Evidence-bound human exposure stages

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A generic approval cannot identify which stage or evidence a person saw. An
unreachable source is not a clean error count, and a healthy lookback spanning
an earlier exposure cannot establish the current audience's health. A flag
proposal must also remain distinct from an actual exposure change.

## Decision

- Pin an explicitly confirmed plan and actual ramp.criteria binding/content.
  A prepared launch pins its measurement digest too. Defaults only propose
  off/internal/10/50/100 audiences; standalone entry invents no prior flow history.
- Preserve every read's query/hash, provider, operation, UTC window, timezone and
  unit. Accept only complete normalized finite scalars with matching units;
  missing, malformed or unavailable evidence is unknown. Compute comparisons in
  core; never ask a model to turn missing evidence into a pass.
- Record a named person's reason and exact observation event for every stage.
  Go needs all required checks passed and acknowledgment of every optional open
  check. New observations invalidate decisions. Hold does not advance; rollback
  requires disabled-flag confirmation and restarts from stage zero.
- Separate approval from confirmation. A person changes exposure externally;
  fresh flag state must match the approved audience/percentage. Manual controls
  require an explicit evidence reference. Completion uses a canonical receipt
  only after all stages, rather than a generic one-time ramp approval.
- Block windows preceding the last confirmation. Detect changed/unavailable
  control after a confirmation, hold, and require a new full lookback after the
  confirmed control is restored. This is conservative observation, not proof of
  continuous cohort history between reads.
- Expose read requests/results as an exact fingerprinted CLI contract and a typed
  SDK host. Deduplicate identical reads while preserving individual criteria.
  Read planning calls no remote. Host normalization is a trust boundary.
- Explicit conductor dispatch allows flags.propose-change with apply=false only.
  Journal once per decision before dispatch, require applied=false in the result,
  cache receipts and retain ambiguity. Reject recognized mutation tool/routes and
  static apply=true/proposalOnly=false. Never apply a flag in the core.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Auto-advance healthy stages | Removes the human exposure decision |
| Count an unavailable source as zero | Invents the most reassuring possible observation |
| Use a generic ramp decision | Loses stage/evidence identity and separate confirmation |
| Reuse the previous stage's full lookback | Mixes audiences and can hide newly introduced regressions |
| Retry a lost proposal response | Can duplicate remote requests |
| Claim route checks prove opaque server semantics | Only actual provider/client checks can establish those semantics |

## Consequences

Replay rebuilds the stage cursor and evidence outside repositories. Real source
semantics, safe normalized inputs, continuous flag history, authenticated proposal
behavior, manual control truth and Linux execution remain owner verification.
These checks do not block independent implementation.

[◀ Decisions index](./README.md)
