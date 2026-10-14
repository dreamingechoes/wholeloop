# 0014 — Configurable gate round budgets

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The verify and review gates loop "until green": a failing round sends findings back to the builder, who fixes them, and the gate runs again. Without a limit, a confused builder and a strict reviewer can loop forever. With a fixed limit, a hard change gets cut short and an easy one wastes nothing — but nobody can say "this one deserves more attempts".

Teams and situations differ: a payments change may warrant extra review rounds; a prototype may need fewer.

## Decision

1. **Separate budgets per gate**, with defaults:

   | Gate | Default rounds | Later rounds look at |
   | --- | --- | --- |
   | verify | 4 | the full suite again, plus criteria still failing |
   | review | 3 | only the diff since the previous round |

2. **Set at any level:**
   - project default — `gates.verify.rounds`, `gates.review.rounds` in `.wholeloop/config.yml`;
   - per run — `--rounds verify=6,review=4`;
   - in words — "give it five rounds of review";
   - at the limit — the harness **offers** more rounds; it never extends on its own.
3. **Valid range 1–10 per gate.** One round minimum: a gate can be shortened, never skipped.
4. **The budget never passes a slice.** Reaching it stops the loop and hands the open findings to a person.
5. **Counted by the core** from the journal and printed in the preflight, so the stated budget is the enforced one.
6. **The verification quorum is configurable too** (`gates.verifiers`, odd numbers, default 3). A finding is dropped only by a majority of **active refutations**; a verifier that fails to answer counts as no refutation.

## Consequences

### Positive

- Teams tune effort to risk without forking.
- Long loops end in a clear hand-off instead of silent spending.
- The number in the preflight is always the number enforced.

### Negative

- More knobs to explain; mitigated by sensible defaults and the preflight line.
- A very low budget can stop slices often; the stop is explicit, never a silent pass.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Fixed caps | Cannot fit both a prototype and a payments change |
| No caps | Unbounded cost and time |
| A single shared budget for both gates | Verify and review fail for different reasons and need different room |
| Quorum counted as confirmations | A silent verifier would delete a real finding |

## Links

- [Orchestration and gates — rounds](../architecture/orchestration-and-gates.md)
- [Verify works](../flow/build/verify-works.md) · [Review code](../flow/build/review-code.md)

[◀ Decisions index](./README.md)
