# 0121 — Owned worker stage bindings and recovery

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The runner and queue each retain durable ownership, but they must refer to the same original native invocation. A lost response cannot authorize another model call, a later receipt file cannot replace the journal-selected result and a successful worker report cannot become QA or an accepted endpoint.

## Decision

Connect unit implementation/research stages to their original queue slot, native assignment and registered process scope. A trusted controller selects the host, context and boundary observer; there is no user-supplied executable host or result-file authority. Prepare the root intent before claim and the one-shot native assignment/directory binding before any boundary control or model input. Use the same registered native process runner for boundary controls and the model. Narrow each call to the original stage deadline and retain that deadline for recovery.

Allow internal queue admission to select one exact run/entry while retaining all cross-run capacity and reservation checks. The default remains global selection. A targeted claim neither claims unrelated work nor changes its deferral metadata. An explicitly observed refusal records not-started; a missing claim reply or private binding stays unknown. Original failures require separate fenced retry admission rather than another directory or allowance for the same claim.

Keep root file-lock sections separate from queue transactions. Store instances have independent lock ownership even when their roots agree. Nesting their transactions deadlocks instead of providing stronger atomicity. Publish immutable intent first; an interrupted transition preserves uncertainty and grants no duplicate invocation.

Recover only the exact private receipt digest selected by the original attempt and queue settlement. Recheck original assignment/runtime/provenance, result binding, selected and copied context and actual captured artifact bytes. Require positive native group closure and current original authority/bases/candidate before passing the production stage. A fresh controller may inspect while paused without resuming; cancellation uses only original private nonce channels, including after revocation. Never signal a recorded PID.

A passed production stage means that an owned worker produced the current candidate or research claim. Review, behavioral verification, integration, delegated acceptance and endpoint evidence remain distinct later stages. Fixture provenance stays fixture provenance. The public full-route factory, semantic hosts and foreground run/reconcile endpoint wiring remain technical P6-10 work.

## Alternatives rejected

An admission callback that filters the global queue still writes unrelated deferrals and can select another entry. Choosing the newest receipt loses the original journal binding, especially when settlement has also retained a stale failure. Reconstructing a successful claim from a closed PID or worker JSON would invent missing semantics. Treating a complete builder report as verification would bypass the independent gates. Nesting locks from separate stores was tested and rejected after the actual lock timeout.

## Verification

Run actual synthetic native processes and Git worktrees for original-stage registration, paused recovery, refusal without launch, lost boundary observations, exact owned cancellation after revocation and altered context/copied-input/artifact/candidate/receipt refusal. Keep targeted queue capacity and malformed/missing selection regressions. Preserve the initial syntax/type, sandbox and cross-store lock failures without extending test deadlines. Extend the standalone model-free runner controls for the minimum published runtime; actual client accounts/models and complete-route acceptance remain separate and unverified here. Complete checks pass 3097 tests in 148 files on macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0. Ten model-free runner controls and inert schema parity pass on Linux Node 20.0.0/Git 2.39.5; the same ten controls pass on macOS Node 24. No skips or test deadline increases occur.
