# 0194 — Scheduled observations and learning recommendations

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

Impact checkpoints fall due days after launch, often while nobody is watching. An external scheduler such as cron may call wholeloop repeatedly, so two calls must never create competing work for the same checkpoint. Missing provider access must stay unknown, and an unattended run must end by its contract instead of prompting. A machine may recommend a learning outcome, but it must never change production.

## Decision

- **Identity.** `dueObservations` is pure. For each subject with an impact run, it returns the due checkpoints, each identified by subject, checkpoint, launch anchor, measurement-source digest and observation-policy digest. A changed launch, source or policy is new work.
- **Scheduling.** `ObservationSchedule.tick` creates each identity at most once under a lock in the external store, and reports the rest as deduplicated. It performs no read. `wl measure tick --for <ids> [--at <time>]` exposes it for an external scheduler; wholeloop runs no always-on service.
- **Settlement.** An observation settles once:
  - complete observations are `observed`;
  - supervised and on-exception runs with any unknown report `needs-access` as a record, never as a prompt;
  - none-policy runs end `completed-with-unknowns` only when the contract allows it and something was observed, and `blocked` otherwise.

  Unknown metric ids are retained, and settlement performs no effect.
- **Recommendations.** `learningRecommendation` records a machine `keep`, `iterate`, `kill` or `unflag` recommendation with its policy, evidence digest, rationale, counterarguments and uncertainties. Every unknown metric must be named. It never changes flags, deploys, sends messages, removes code or closes work. Anything implying implementation carries a proposal that needs a separately authorized run.

Executing the reads still goes through the existing MCP-first `measure requests` and `measure observe` path. Composing the scheduled queue with the delivery runner and its delegated `learning-outcome` decision remains open.

## Alternatives rejected

A resident scheduler would add an always-on service. Deduplicating by subject and checkpoint alone would hide a relaunch. Treating unknown as zero, or a recommendation as a decision with effects, would act on evidence that does not exist.

## Verification

Unit cases cover:

- two ticks with one schedule, and a changed launch, source or policy scheduling new work;
- nothing scheduled before a checkpoint is due;
- a settlement table across policies, and a single settlement that keeps unknowns;
- all four recommendations without effects, and the refusals for hidden unknowns or missing counterarguments.
