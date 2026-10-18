# 0021 — Journal research plans and count active refutations

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Research workers can finish in any order, lose source access or stop responding.
Recomputing source selection from current configuration during aggregation would
change the question under those workers. Keeping only the final Markdown would
also lose the evidence needed to explain a dropped claim after a session ends.

## Decision

1. Pin the question, owner, source angles and verifier quorum in a
   `research.planned` event for one started brief run. Repeated planning returns
   that plan; configuration changes apply to the next run.
2. Journal one structured source result per angle and one examination per claim
   and verifier slot. Validate all inputs before the transaction commits.
3. `research.verifiers` accepts 3, 5, 7 or 9, default 3. A load-bearing claim drops
   only on a strict majority of active, evidence-backed refutations. Uncertainty
   and missing responses keep it, lower confidence and expose open questions.
4. Render the brief deterministically from those events. Generic step completion
   rejects replacement content; rebuilding restores the same recorded artifact.
5. Native and sequential engines transport the same assignments. The host must
   give verifier slots independent sessions; numeric slot uniqueness is enforced
   by the core, while actual session independence requires client conformance.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep plans and results only in the host session | Compaction and client changes lose the basis for conclusions |
| Re-read source selection before completion | A configuration edit silently changes required coverage mid-run |
| Count confirmations to retain a claim | A silent verifier would remove a real finding |
| Accept an arbitrary final brief | The recorded conclusion could bypass the refutation arithmetic |

## Consequences

The journal is larger because it retains structured evidence and examinations.
Failed providers remain explicit unknowns. Tests with stubbed workers can verify
coverage, scheduling and arithmetic; live source access, read-only behavior and
independent host sessions still need manual conformance.

## Links

- [Research](../flow/define/research.md)
- [Orchestration tiers](./0006-orchestration-tiers.md)
- [Configurable gate budgets](./0014-configurable-gate-round-budgets.md)

[◀ Decisions index](./README.md)
