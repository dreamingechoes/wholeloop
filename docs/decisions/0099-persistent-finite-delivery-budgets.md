# 0099 — Keep delivery budgets finite across recovery

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Unattended work must terminate predictably. A fresh controller, plan revision, lost response or missing usage report cannot imply a new allowance. Existing gate rounds already persist independently; delivery accounting must preserve them and retain observed failures instead of treating repeated narration as progress.

## Decision

1. Add independent closed budget event, projection and optional operator-constraint contracts. Preserve all earlier versioned declarations. Start one run clock at the first admission or artifact capture; read-only inspection does not start it. Legacy runs with prior work conservatively anchor to their original registration. Pin the original start and UTC deadline, retain monotonic elapsed observations, and refuse detected backwards clocks or changed host epochs. Portable clocks cannot prove every unobserved reboot or physical clock change; do not advertise that guarantee.
2. Effective limits are the minimum of current private grant, current immutable plan/envelope and persisted run limits. A stricter plan revision persists its reduction even before the next admission; a later larger plan/grant cannot undo it. Attempt deadlines also respect grant expiry, remaining run time and the attempt limit. Fencing and terminal ownership remain independent: expiration does not release an unobserved worker.
3. Reserve finite attempt/effect resources atomically with their claims/issued invocations. Count builder/researcher restarts, issued Git pushes, integration repairs and artifact bytes over the run lifetime. Queue transactions reserve room for four admission events, reducing the maximum persisted deferrals per transaction to 996. Existing gate events and exhausted gate budgets are never recreated or reset.
4. Bind optional token/currency constraints before execution starts. Hard constraints require a trusted host's explicit enforceable per-invocation maximum in the exact currency; unsupported metering refuses admission. Charge pessimistic maximum reservations for the entire run, including failed calls. Do not refund from lower worker claims or after a crash. This sacrifices utilization to preserve the hard bound without relying on missing final receipts. Advisory constraints report observations without pretending to enforce an unavailable native cap.
5. Record stable-key delta or cumulative usage streams with meter, invocation, provenance, evidence and finality. Reject duplicate-key changes, backwards cumulative values, mixed stream modes/currencies and fixture promotion. Missing observations remain unknown, never zero; partial usage remains partial. Keep actual overrun evidence and exhaust the run when a host violates its declared maximum. Do not invent token prices or currency conversions. Historical invocations without reservations retain an explicit unmetered count and keep newer observed totals partial; retroactive hard constraints refuse.
6. Hash repeated failure signatures from role, category, candidate and sorted finding identities. Repeated independent observations consume the finite no-progress allowance. Only a new typed controller-validated artifact, behavior, resolved finding, candidate or reconciled effect resets that streak. Repeated content, heartbeats and narratives do not. Such progress metadata alone grants neither acceptance nor completion authority; later QA hosts must establish semantic truth.
7. Reserve unique artifact bytes in a committed transaction before writing a bounded content-addressed binary file outside repositories. Retain reservations across crashes, then adopt only identical bytes without charging twice. Keep omission metadata when quota or recognized credential patterns refuse capture; write no omitted content. The per-input bound is 8 MiB. This scanner catches recognized credential forms; it is not proof that arbitrary content contains no sensitive information.
8. Exhaustion is terminal and retains findings; detected clock faults pause supervised work or block intervention none. Recovery checks the same effective budget before resume and never resets counters. Expose constraint configuration, read-only reports and bounded artifact capture without adding a native worker or external operation.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Recreate allowances on each controller or plan revision | Turns recovery into an implicit extension |
| Assume missing native usage means zero | Conceals unknown spend and permits unbounded calls |
| Refund hard reservations from partial reports | A late or missing report can exceed the released allowance |
| Use text changes or worker success claims as progress | Repeated failures can continue indefinitely |
| Charge artifacts after writing | Concurrent captures and crashes can exceed the bound |

## Verification and limits

Fake-clock and replay tests exercise deadlines, clock faults, usage streams, no-progress signatures, plan tightening and repair counters. Independent-process tests contend for hard reservations and artifact quota, then kill writers before and after blob replacement. Native model billing, host-specific hard metering and service certification remain separate acceptance work. Fixtures retain their provenance.

## Links

- [Budget tutorial](../tutorials/delivery-budgets.md).
- [Controls contract](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md).
- [Checkpoint recovery](./0098-checkpoint-recovery-and-observed-effect-reconciliation.md).

[◀ Decisions index](./README.md)
