# 0224 — Refuse recovery reads completed past their elapsed deadline

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

A model-free full-route diagnostic exposes costly nested current-proof reads. An independent control then confirms that a five-millisecond bounded read accepts success after synchronous work blocks the event loop for forty milliseconds. A timer race alone cannot enforce its deadline when synchronous work or a microtask chain delays the timer callback. A late rejection also loses its deadline classification and leaves the observation signal unaborted.

## Decision

Measure each bounded recovery call with Node's monotonic performance clock. Retain the original finite budget and timer cap, timeout race, cancellation signal and single invocation. After settlement, refuse a result completed at or beyond that elapsed budget as deadline and abort the same signal. Preserve on-time values and unavailable-read failures. Deadline remains unresolved evidence and never authorizes another invocation or retry.

This is an acceptance bound, not preemption: synchronous work cannot be interrupted by an in-process timer. It can still delay the return, but its late result cannot become available evidence. Slow current-proof readers must be improved independently while retaining their ownership, freshness and authority checks.

## Alternatives rejected

- Increasing deadlines would conceal the observed bound violation and increase product latency.
- Trusting the winning promise would retain the event-loop starvation defect.
- Using the wall clock would make this interval vulnerable to clock adjustment.
- Retrying a timed-out observation would change the existing read/recovery policy.

## Verification

Both actual blocked-event-loop controls fail before the change: late success is accepted and late failure is misclassified. They pass with the original signal aborted and exactly one invocation after the change. On-time success/failure, unresponsive cancellation and existing finite retry/refusal controls remain covered. Full-route performance and native/hosted acceptance remain separate pending evidence.

[◀ Decisions index](./README.md)
