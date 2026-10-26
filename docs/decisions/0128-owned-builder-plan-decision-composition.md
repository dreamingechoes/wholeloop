# 0128 — Owned builder-plan decision composition

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Artifact production and delegated decisions deliberately have separate authority. Their original root components also refused all preceding native calls, so composing a legitimate producer and an independent approval in the same stage was impossible. Removing that refusal would let unrelated closed work masquerade as the producer or let a later phase acquire another deadline.

## Decision

Add an internal RunnerBuilderPlanningStages component for explicitly delegated zero-intervention build plans. Produce the exact proposal through the existing read-only artifact host, then require its independent approve-build-plan judgment and challenge. Preserve implementation, QA, review and whole-feature acceptance as later stages. Supervised or undelegated use returns a limitation before launching a producer; no human agreement is fabricated.

New private artifact descriptors use version two and retain only the original managed call identities observed by that producer's own native frame. The managed invoker supplies those identities, not model output or the list of all closed stage calls. Preserve the original root deadline, captured artifact digest and proposal digest. Old version-one production descriptors remain readable but cannot qualify a new composed decision without this ownership evidence.

New composed decision descriptors use private version two and bind that exact producer prefix, original deadline and proposal. Decision-first stages retain their original version-one descriptor. Require every build-plan decision request to cite the captured proposal. A foreign, incomplete, missing or reordered prefix refuses before another native call. A later phase may narrow the producer deadline but cannot extend it. Consume the original decision invocation before dispatch; losing its descriptor never buys another judgment key.

The builder component uses the fixed native decision host with the actual root process callback and the same store. Both independent decision workers must add closed native calls after the producer. Existing delegated policy, rubric, source and receipt validation remain authoritative. A passing production claim alone, fixture-only output or missing decision cannot authorize implementation. Paused inspection uses only original descriptors and published receipts; it constructs no producer, context selector or judgment host. Cancellation still targets the original private channels after revocation.

These private descriptors do not change closed public delivery schemas or native-purpose version-one leases. The root controller and fixed host remain trusted code; workers cannot write the controller store. Full definition/plan decisions, mechanical contract verification, repair, integration, acceptance and public route composition remain separate P6-10 implementation work.

## Alternatives rejected

Accepting any closed native prefix confuses unrelated calls with production. Reusing the artifact's aggregate evidence digest fails after legitimate decision workers enlarge the root scope; bind its immutable artifact, proposal and original invokers instead. Trusting a model-supplied approval skips the independent decision policy. Resetting the deadline grants extra runtime. Reinterpreting historical version-one descriptors silently creates authority they never recorded. Moving the old consumed-descriptor refusal behind a new guard loses its established uncertainty classification.

## Verification

Retain existing artifact, native-purpose, decision and frozen-contract regressions. Exercise cancelled or undelegated admission, fixture-only production, mismatched decision artifacts, missing producer descriptors, old descriptors without ownership, an unrelated closed native call, attempted deadline extension and cancellation after revocation. The separate bounded model-free runner evaluation executes a producer and independent native fixture planner/challenger, then observes the same result while paused without another call. Normalized host observations test controller composition and establish neither actual model authentication nor native containment, QA or complete-route acceptance. Record observed results and failures in the journal.

The five-file directed regression passes 462 cases, followed by all nine final admission controls. Preserve the initial consumed-descriptor refusal-category failure and the malformed synthetic judgment missing its required schema; both are corrected without changing production validators or limits. Sixteen complete model-free controls pass on macOS Node 24 and Linux Node 20.0.0, including the exact three-call composition and identical paused recovery. Minimum-runtime schema comparison is exact, and all 1348 candidate files retain their archived bytes. Full repository-suite results remain those of the preceding criterion-verification increment; this change records its directed regressions and control evaluation separately.

Staged review catches a distinct serialization defect: persisting the initial version-one JSON after upgrading the in-memory binding loses the producer proof. Serialize only the final validated binding and assert its persisted version, original deadline and producer calls before host construction and in the complete control. The corrected three-file regression passes 441 cases, including ten builder admission controls; all sixteen complete controls pass again on macOS Node 24 and Linux Node 20.0.0. Earlier green reports remain pre-fix evidence, not proof of the corrected persistence path.
