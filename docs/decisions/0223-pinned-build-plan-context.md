# 0223 — Share selected source and pinned acceptance with plan reviewers

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The eighth implementation attempt correctly blocks at independent plan approval. The produced plan leaves file-only endpoint feasibility and completed acceptance definitions unresolved. The public producer receives guidance, while its judges receive only the produced plan; neither receives the selected application source or the already-passed definition stage. Ignoring those uncertainties would weaken the original rubric.

## Decision

Pin one private context artifact for each original public build-plan invocation. Supply it to that producer as source context and to its independent judges as the same hash-bound artifact and observed evidence. Bind it to the request, plan, unit, stage, invocation and exact owned workspace snapshot. Read only the current bytes of that unit repository's explicitly selected recipe files, using bounded safe readers and before/after snapshot checks. Retain their original selection hashes separately from their current hashes; perform no discovery or new command/model dispatch. Limit selected source to 128 KiB and the whole context artifact to 256 KiB; larger selections remain unavailable.

Include the current pinned acceptance digest, case IDs/criterion coverage/ownership/applicability and the original passed host-observed definition-stage locator/evidence. Omit runner inputs, fixtures, assertions, expected values and private evaluator contents. These facts establish planning prerequisites, never test execution, product acceptance, delegated approval, human testing or authority. Require the existing active source-read grant and original current stage. Refuse changed or missing context rather than rewriting an already selected artifact.

The trial additionally captures status.txt as an explicit initial source observation, with its original commit, exact bytes and digest on a context-mapped second line. The first-line task, hosted tree, suite, protected files, rubric, grant and acceptance oracle stay unchanged. Runtime recipe files remain unchanged: making the mutable target a recipe input would forbid the intended implementation during QA.

## Alternatives rejected

- Waiving unresolved feasibility or prerequisite uncertainty would bypass the rubric.
- Giving planners a workspace or enabling more native tools would widen their existing boundary.
- Reading arbitrary repository files would replace explicit selection with discovery.
- Forwarding complete acceptance plans would expose private case inputs or expected values.
- Pinning the mutable target in the runtime recipe would make a correct implementation fail immutable-input verification.
- Reconstructing earlier decisions with new inputs would fabricate historical evidence.

## Verification

The actual synthetic public plan-to-commit control first fails for its missing context. It then verifies identical producer/judge inputs, original acceptance coverage, selected source, unchanged launch count and no extra events/calls from refused reads. Foreign stages, changed context/source, oversized files and symlinks refuse. The live fixture retains its failing baseline and exact success/newline refusal while keeping mutable source outside the recipe. Native acceptance remains pending; earlier failed attempts retain their original outcomes.

A full actual Docker/Git rehearsal with synthetic native/GitHub transports reaches passing publication to a local bare repository but blocks at its final handoff. Retain that failure and its scoped readback; this context increment does not claim to resolve it or certify a complete native route.

[◀ Decisions index](./README.md)
