# 0134 — Original failure feedback before repair

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

A repair worker needs the observed failure of its exact candidate, not a generic negative status or an imported result. Unknown invokers and unavailable QA are different from a known nonzero suite or a retained independent finding. Retry-specific IDs and fresh commits can also make repeated failures look like progress unless their fingerprints follow the observed substance.

## Decision

Add an internal read-only runnerRepairFeedback boundary accepting only the fixed verification/review readers. Require their original host-observed blocked result and closed invokers. Reopen the exact private stage binding, latest committed gate decision and current owned candidate. Require matching gate identity, round, unchanged snapshot and candidate commit. Read the fresh state after inspection because the original reader may recover a lost verdict.

Classify a suite failure only when its original finished-suite record has an unchanged failed result and an observed positive POSIX exit code without a signal. Interrupted, missing or out-of-range exits are unavailable. Independent findings require complete QA units and retained findings under the existing quorum policy. Missing evidence, fixtures, corrupt bindings, wrong scopes, stale candidates and unknown invokers remain unavailable. Preserve EXHAUSTED as exhausted, rather than acquiring another round.

Bind feedback to the original request, plan, stage, invocation, unit, commit, gate, round, deadline and audited observation. Preserve command references, exit/signal facts and diagnostic hashes; return no raw process output. Fingerprint retained finding substance and actual diagnostics deterministically, excluding model-assigned finding IDs, candidate commits and retry/round identities. Normalize finding whitespace and ordering without asserting that semantically different diagnostics are equivalent.

Feedback authorizes no repair dispatch, budget expansion, fresh judgment, candidate adoption or human approval. It remains readable while paused. The later executor must independently enforce current authority, original deadlines, finite worker/gate budgets, durable intent and exact candidate succession before any write. Recording budget failures/progress and launching the correction remain separate P6-10 implementation work.

## Alternatives rejected

Treating every blocked result as repairable turns missing evidence into permission. Trusting worker-supplied reports or counters bypasses original execution and judgment. Including fresh model IDs or commits in fingerprints can disguise the same unresolved failure as progress. Treating every diagnostic change as equivalent hides real changes. Rerunning QA to reconstruct feedback buys additional work. Resetting an exhausted gate circumvents its original allowance. Returning raw logs exposes content unnecessary for deterministic identity.

## Verification

Exercise stable fingerprints across model IDs/order/whitespace and distinct fingerprints for changed findings, commands and diagnostics. Refuse result-shaped objects, absent/corrupt bindings and wrong requests without model dispatch. Extend the actual Docker evaluation with original nonzero-suite feedback, changed-candidate invalidation and exact restoration. Separately observe kept synthetic-native review/verification findings and gate exhaustion while paused, retaining original invokers and deadlines. Record actual results in the journal; fixture-normalized native observations do not certify real models or complete repair execution.

The initial 435-case regression and both focused actual Docker scenarios pass, with exact retirement. Nine model-free controls pass on macOS, including kept review findings and exhausted-gate classification. After the final signal/exit guard, 444 native/review/feedback/frozen-contract cases and all nine final Linux Node 20.0.0 controls pass, with exact current CLI schema parity. Lint, types, build, docs, harness, Markdown, Mermaid and offline package checks pass. These results do not establish actual repair dispatch or complete-route acceptance.

[ADR-0135](0135-original-repair-budget-admission.md) adds separate budget admission. It also corrects the exhaustion coverage claim above: the earlier control compared the observed default budget but did not actually exhaust its three review rounds. The later control explicitly pins one round before execution and verifies exhausted feedback and admission refusal.
