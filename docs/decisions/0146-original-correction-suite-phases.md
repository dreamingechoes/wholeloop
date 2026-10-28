# 0146 — Original correction suite phases

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Later verification needs actual execution on the corrected HEAD. The original suite and application scope already contain durable evidence. Replacing either locator would destroy history; merely pointing a new round at the old environment would execute the wrong bytes. A new gate or broader command selection would silently change the original verification contract.

## Decision

Add an internal suite phase keyed by the digest of the already planned next verify round. Keep ordinary version-one paths unchanged. Namespaced suites use exact version-two private bindings and the corresponding separate environment scope. Candidate selection may use only the fixed original correction checkpoint; ordinary current-candidate validation remains unchanged.

Before any new suite intent or Docker call, reopen the original suite binding, actual original scope closure and authoritative gate history. Require the immediate next round of the same subject/run with unchanged allowance, a sealed nonpassing/nonexhausted predecessor, the current direct correction, a deadline no later than either the original suite or the narrower correction producer, and a different exact environment. Reopen that fixed producer and require its failure to name the same original gate/run/round. Preserve the same acceptance plan, command references, timeout and command-to-case mapping. Existing validation still joins current committed bytes, the new environment's captured candidate and original pinned cases.

The phase does not plan a round or authorize another correction. Existing consumed markers and suite journals prevent replay. Paused inspection reconstructs only actual original Docker observations for this phase, retaining earlier metadata. A known repeated nonzero exit stays failed; neither correction nor fresh execution becomes positive product acceptance or root-stage completion. Root cancellation retains all original environment phases.

## Alternatives rejected

Overwriting the first suite loses evidence. Reusing an earlier environment tests another HEAD. A free-form phase would allow duplicate execution of one round; require its exact plan digest. Renewed deadlines, broader command mappings, a fresh gate run or a repaired commit alone cannot replace independent QA. Full verification continuation remains a separate controller composition over this executor and independent judgments.

## Verification

Run suite/environment/frozen regressions, including wrong phase digest and first-round refusal before dispatch. Run a finite actual Docker composition with original production, failed suite, one owned correction/commit, the next unchanged gate round, a distinct exact environment and the same known failing command. Preserve old metadata, recover the new failure while paused without replay and explicitly retire both observed environments. Add pre-dispatch rejection controls for expanded deadlines, environment reuse and changed mappings. Record actual outcomes in the journal; this does not certify an independent Linux application host or authenticated models.

The final three-file regression passes 442 cases. All four final actual Docker controls pass on macOS Node 24, including refusal to regain a one-second broader original window, unchanged original metadata and exact retirement of both environments. Static/docs/package checks pass. No independent Linux application-host or complete-route acceptance is inferred.
