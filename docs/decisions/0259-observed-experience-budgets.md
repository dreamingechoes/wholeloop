# 0259 — Observed experience budgets

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

Phase 9 needs evidence of time, cost and visible output before and after its fixes. The existing evaluation decisions measure correctness and delivery, rather than the six-step experience a person meets. A parser that counts tool results as visible text, equates a launch with a finished worker or fills missing usage with zero would produce misleading improvements.

## Decision

- Keep transcript normalization, measurements and budget comparison in pure core modules. The evaluation runner owns filesystem and native process effects, creates a fixture application and store outside every repository and records timestamps when it receives complete native events.
- Preserve synthetic and live provenance. Test only original synthetic native-shaped fixtures in the repository. A live baseline needs all six steps on both reference clients, reported tokens, a completed result and completed worker observations; synthetic data cannot calibrate it. Labels alone do not prove a live run.
- Require explicit quota confirmation before any live launch. Offline replay and calibration never start a client. The runner selects a dedicated signed-in home, disables inherited MCP settings and never reads or copies credentials. Existing sandbox and permission policies remain enforced. Codex keeps its parent record in that dedicated home because an ephemeral parent cannot start workers, as the existing conformance notes record.
- Apply the phase's absolute budgets immediately. Derive input/output token, first-question, tool-call and build-gate time ceilings from the live baseline; calibration can only tighten an existing ceiling. Missing calibration remains a failing, explicit pending check.
- Count complete visible text separately from tool output and streaming deltas. Track actual worker terminal states separately from successful launch. Unknown native shapes and missing evidence fail; native usage and permission reporting remain observations, not billing or proof of every nested action. Share the banned vocabulary with the display renderer of [ADR-0256](./0256-person-facing-display-rendered-by-the-core.md).

## Alternatives rejected

- **A synthetic baseline presented as current experience.** It demonstrates parser arithmetic without observing the product.
- **Arbitrary token and build-time ceilings before baseline capture.** They could hide regressions or make current failures appear acceptable; those limits stay pending until measured.
- **Live runs in the repository gate.** They spend quota, require signed-in clients and change with model output; the gate tests recorded fixtures only.
- **Automatic permission grants or inherited personal integrations.** They alter the experience being measured and widen authority.

## Consequences

P9-20 can close its fixture implementation while baseline capture stays explicitly open in manual verification. Later changes must remain comparable to this commit's baseline; the maintainer can run that revision separately. Native versions may add shapes requiring parser fixtures before a result is accepted.

## Verification

`test/unit/experience/experience.test.ts` checks both parsers, concurrency, source leaks, visible JSON, internal terms, budget boundaries, missing observations, calibration provenance, tightening and quota refusal. Live reference-client baselines and all per-client acceptance remain in `roadmap/manual-verification.md`.

[◀ Decisions index](./README.md)
