# 0119 — Runner-owned Git stage bindings

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The runner and Git effect journal each preserve their own invocation identity. Connecting them requires a durable relationship before native input; a stage name or a clean worktree cannot establish which operation ran. The first integration also exposes a state mismatch: issuing an original Git effect enters waiting-external, while the runner's dispatch fence accepts only queued/running. Reusing that dispatch fence for an already issued operation incorrectly cancels the runner's own work.

## Decision

Add fixed workspace/commit stage handlers with private versioned request/plan/unit/stage/invocation/resource bindings. Derive workspaces, complete committed code-predecessor vectors and candidate messages in the controller. Require the original unit's reviewed and committed stage before incorporating its topic; pin its exact commit receipt so a later unrelated repair cannot silently replace the reviewed predecessor. Preserve original grants, accepted derived plans, named bases, branch prefixes and effect budgets.

Publish each binding before domain execution. Register the actual original Git wrapper in the root stage before native input. Narrow its existing deadline to the controller's deadline, combine both cancellation signals and recheck the current owner before input and throughout execution. Separate the live issued-operation fence from future dispatch: waiting-external can keep an original operation live, while another stage still requires queued/running. Pause, stop, revoked authority and changed ownership invalidate live execution. Complete Git inputs remain checked at domain admission and acceptance; the hot live poll does not repeatedly spawn Git.

Reconciliation observes only the original bound resource. Require actual applied/closed domain effects and current committed-head evidence, without promoting upstream fixture semantics. Preserve unknown outcomes and a missing/corrupt binding; absence is not proof that nothing started. A known closed workspace can recover its root result while paused without resuming or another checkout. Fresh cancellation writes only the original private operation marker, including after revocation; it never signals a remembered PID or follows an unrelated resource.

These handlers connect actual Git stages, not all semantic stages. Fixed native model admission, implementation/QA/review/acceptance hosts and public full-route run/reconcile/endpoint wiring remain P6-10 technical work. Actual Git success establishes no human approval, application QA or endpoint completion.

## Alternatives rejected

Changing the dispatch fence to accept waiting-external would admit new stages while effects remain unresolved. Treating a root runtime label or worker JSON as Git proof would bypass the original native receipt. Creating a replacement workspace per controller generation would break continuation and lose its committed predecessor pin. Replaying a bound resource after a lost result would duplicate an issued action. Extending test deadlines would hide integration overhead; keep the complete two-unit engine scenario in the standalone evaluation and focused watchdog/predecessor coverage in the ordinary suite.

## Verification

Exercise actual workspace creation, candidate staging/commit, reviewed predecessor incorporation and fresh-controller reconciliation. Verify actual registration before input, narrowed native deadlines, pre-issue cancellation/expiry/fencing, private resource corruption, missing-binding uncertainty and original-marker cancellation after revocation. Retain initial schema/key/fixture/sandbox failures, the waiting-external repro and the full-route test timeout; do not skip required cases or increase deadlines. The standalone two-unit evaluation retains fixture-only semantics and cannot establish an endpoint. Complete checks pass 3060 tests in 146 files on macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0. Nine model-free controls and inert schema parity also pass on Linux Node 20.0.0/Git 2.39.5. Preserve the failed metadata-contaminated Linux archive; the final archive excludes AppleDouble entries while retaining identical source bytes/modes/types. Actual models/accounts and complete-route acceptance remain separate.
