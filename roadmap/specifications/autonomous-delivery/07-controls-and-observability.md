# Budgets, progress and operator visibility

> **TL;DR** — A long-running flow has finite work and effect limits, visible progress and inspectable reasons for every pause or terminal result. Usage is observed or unknown. Operators retain control without a mandatory web service.

> [!NOTE]
> **Status: 🚧 partial.** P6-07 persistent budget admission, usage accounting and no-progress controls are implemented and process/fixture-tested. P6-25 adds the read-only report with next permitted actions, allow-listed diagnostics and checksum-verified recovery bundles that import as inert archives ([ADR-0190](../../../docs/decisions/0190-operator-report-diagnostics-and-recovery-bundles.md)); P6-37 adds the deterministic operator overview, and P6-38 implements a locally verified read-only change feed ([ADR-0210](../../../docs/decisions/0210-operator-overview-and-change-feed.md)). Existing gate-round and worker-timeout limits are preserved.

## Implemented budget boundary

The [budget tutorial](../../../docs/tutorials/delivery-budgets.md) configures optional immutable advisory constraints, inspects unknown consumption and captures byte-bounded binary artifacts. Run/attempt deadlines, issued CI pushes, repair counters, hard maximum reservations, artifact bytes and failure signatures survive independent controllers and plan revisions. Tighter current plans and persisted limits constrain initial-envelope grants; later larger revisions cannot restore the allowance. Recovery refuses exhausted runs, without changing old gate events. [ADR-0099](../../../docs/decisions/0099-persistent-finite-delivery-budgets.md) records the conservative accounting and clock limitations.

OPS-01–OPS-04 have local fake-clock, replay, compiled-CLI and actual concurrent-process/crash coverage. These tests prove accounting and refusal boundaries, not native billing, hard-cap support or actual semantic QA. Initial native dispatch, complete runner integration and operational reports remain their later Phase 6 tasks. No old manual failure is waived.

## Budget contract

| Limit | Proposed default | Enforcement |
| --- | --- | --- |
| Run wall time | 4 hours | Controller deadline survives restart |
| Grant expiry | 24 hours | No new assignments/effects after expiry |
| Concurrent builders | 2 globally, 1 per repository | Durable admission reservation |
| Concurrent gate/evaluator workers | 4 globally | Shared scheduler capacity |
| Builder attempt deadline | 30 minutes | Owned process/backend cancellation |
| Builder restarts | 2 after the first attempt | New attempt IDs; never reset gates |
| CI pushes | 2 total | Persisted cycle counter |
| Integration repairs | 3 candidates after the initial candidate | Persisted milestone counter |
| No-progress boundary | 3 repeated identical failure/snapshot signatures | Explain exhausted progress budget |
| Artifact bytes | 200 MiB per run | Preflight capture and record omissions |
| Tokens/currency | No invented default price or guaranteed cap | Operator selects limits only with reliable host metering |

These are review-candidate defaults, not measured optimal settings. All limits are finite, pinned and displayed; operator overrides are explicit. Existing verification/review round defaults and fail-safe quorums do not decrease because a global budget is exhausted.

Admission reserves capacity before dispatch, including expected assignments from refutation fan-out. If an exact token ceiling cannot be enforced by the client, label the limit advisory/unsupported. An operator requiring a hard unavailable cap makes that execution ineligible. Cost absence never means zero.

Report wall time separately from active work, external waits and human waits. A zero-intervention run has zero human waits, including after restart. Backoff/polling consumes the run deadline.

## Progress and failure categories

Progress means a new validated artifact, observed behavior, resolved finding, accepted candidate or reconciled effect. Heartbeats, narrative updates, rereading files and repeated identical outputs are liveness, not progress.

Use bounded structured categories: missing-input, policy, denied-access, unavailable-model, transient-provider, invalid-output, failed-behavior, stale-evidence, conflict, ambiguous-effect, capacity, deadline and no-progress. Preserve original failed attempts and make later repairs new evidence.

Repeated signatures include role, normalized failure category, candidate digest and kept finding IDs. Avoid storing private model output just to detect repetition. A heuristic signal can stop for inspection but cannot invent a successful result or automatically widen a budget.

## Inspection surfaces

`wl delivery status|events|report` provides versioned local reads. `wl overview` orders the complete operator view using the same core rules, and `wl watch [--since <cursor>] [--poll]` streams complete overviews, bounded redacted activity, non-progress liveness and fixed problems. The feed uses verified journal-prefix checkpoints, keeps auxiliary observation changes distinct from journal progress, writes no store state and starts no network listener. Consumers persist only the outer resume checkpoint from complete frames; see the [overview and feed contract](../../../docs/architecture/operator-overview.md).

Show endpoint, intervention, grant status, plan/source revisions, active attempts, ready/blocked work, checkpoints, environment ownership, criterion coverage, gate budgets, CI state, pending effects, deadline, usage provenance and exact next permitted action. Explain why a run did not proceed.

Terminal receipts distinguish research-report-complete, code-ready, draft-PR, ready-PR, merge-queued, merged, partial, blocked, failed, exhausted and stopped. Store all artifacts externally and offer explicit local opening paths. Do not put run state into the source repository.

## Diagnostics and export

An opt-in redacted diagnostic bundle contains schema/core/client/backend versions, event categories, digests, control transitions and sanitized errors. Raw prompts, conversations, environment dumps, source content, provider responses and credentials are excluded by default.

A separate explicit recovery bundle may include private required artifacts and references after inventory/size review. Verify checksums before import, preserve existing stores and require explicit repository-path rebinding. Import restores records, not active authority or running claims; grants must be renewed on a new execution host.

OpenTelemetry export may be a later sink over the same event model. It is not a required dependency, a hosted observability platform or an excuse to send private traces automatically.

## Acceptance and tests

- [ ] **OPS-01:** Concurrent attempts cannot oversubscribe reserved slots or exceed persisted attempt/effect counters.
- [ ] **OPS-02:** Restart preserves deadlines and usage totals without double-counting cumulative native reports.
- [ ] **OPS-03:** Unsupported token/currency metering is unknown/advisory and refuses a requested hard cap.
- [ ] **OPS-04:** Repeated no-progress attempts stop with retained findings and never reset gate budgets.
- [ ] **OPS-05:** Status/report is read-only; control requests are explicit, audited and respected before later effects.
- [ ] **OPS-06:** Diagnostic exports exclude sensitive fixture payloads; recovery imports detect tampering and restore no live authority.
- [ ] **OPS-07:** Supervised, on-exception and none runs report different intervention outcomes accurately.

Use injected clocks/counters for boundaries, real process cancellation for deadlines, fixture secret canaries for export and deterministic event replay for reports.

[◀ Publication](./06-publication-ci-and-merge.md) · [Learning ▶](./08-learning-and-maintenance.md)
