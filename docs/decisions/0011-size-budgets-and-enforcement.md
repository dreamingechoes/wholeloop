# 0011 — Size budgets, and an enforcer for every hard rule

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Harness prompts tend to grow. Every incident adds a paragraph, every edge case a warning, until a skill is thousands of lines long. Long prompts cost context on every run, contradict each other, and still fail: an agent can read a rule, reason its way around it, and comply with the letter while missing the point. A rule that exists only as prose is a suggestion.

## Decision

### Budgets

| File | Budget |
| --- | --- |
| `SKILL.md` body | ≤ 120 lines |
| Skill `description` | ≤ 400 characters |
| Agent definition | ≤ 60 lines |
| Protocol (shared rule file) | ≤ 80 lines |
| Workflow definition | ≤ 150 lines |
| Provider guidance file | ≤ 30 lines |
| Lens prompt | ≤ 40 lines |

A budget lint runs in CI and fails on any file over budget. Raising a budget needs an ADR.

### Enforcement

1. Every **hard rule** is listed in `enforcement.yml` with its **enforcer**: the core code, test or lint that makes it true.
2. The enforcement lint fails when:
   - a hard rule has **no enforcer**;
   - the enforcer is only a **restatement** in prose, not something that executes;
   - a skill or agent **contradicts** a rule;
   - the map is **stale** (a rule was reworded or removed).
3. Rules that are deliberately documentation-only are listed as such, **with a reason**.

### Where reasoning goes

The *why* behind a rule — the incident, the trade-off, the rejected options — goes into an ADR. Skills and agents link to it instead of repeating it.

## Consequences

### Positive

- Skills stay readable and cheap to load.
- Rules hold because code holds them, not because a prompt asks politely.
- Contradictions between skills are caught before they ship.

### Negative

- Writing a rule now means writing its enforcer, which is slower than adding a paragraph.
- Some nuance does not fit a budget and must move to on-demand references or ADRs.

## Alternatives considered

| Option | Why not |
| --- | --- |
| No budgets, review by taste | Growth is gradual and nobody notices until it hurts |
| Token budgets instead of lines | Harder to reason about in review; lines are a good proxy for Markdown |
| Rules in prose, checked by evals only | Evals are slow and stochastic; they measure, they do not enforce |

## Links

- [Determinism and testing — enforcement](../architecture/determinism-and-testing.md#enforcement--every-hard-rule-executes-somewhere)
- [Authoring skills and agents](../contributing/authoring.md)
- [P0-05 — budget and enforcement lints](../../roadmap/phase-0-foundations.md#p0-05--size-budgets-and-enforcement-lint)

[◀ Decisions index](./README.md)
