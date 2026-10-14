# 0007 — Every step stands alone; the flow is opt-in

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The full flow — Define, Build, Rollout, Learn — is the point of the harness. Most days, though, people need one piece of it: research a question, review a pull request, build a small fix, check last month's numbers. A harness that demands the whole ceremony for a one-line fix gets bypassed, and a bypassed harness protects nothing.

## Decision

1. **Every step is a complete entry point.** It accepts free text, a file, a URL (issue, document, PR) or an ID from the store.
2. **`wl step begin` returns `have` and `missing`.** The step uses whatever already exists (an earlier brief, an approved spec) and asks only for the gap. It never requires earlier steps to have run.
3. **Loose artifacts are first-class.** A standalone brief, ad-hoc slice or review lives in the store and can be attached to an initiative later (`--from brief-7f3a`), or never.
4. **What a step promises, it keeps — alone or in the flow.** `build-slice` always ends with its gates green or a clear stop; `open-pr` always asks you to test first. These belong to the step, not to the flow.
5. **The flow is `next`.** It chains steps in order and stops at every decision point. Using it is a choice, never a precondition.

## Consequences

### Positive

- Low entry cost: the first useful run can be a single step.
- Small changes still get the same quality bar.
- Work started by hand, or by someone else, can be picked up at any step.

### Negative

- Every step must handle the "nothing before me" case, which costs design and tests per step.
- Standalone use can produce artifacts that never join an initiative; `status` lists them so they do not get lost.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Strict flow: a step needs the previous one | Safe but slow; small fixes would skip the harness entirely |
| Standalone steps without their own guarantees | A standalone build without its gates would quietly lower the bar |

## Links

- [Concepts — standalone or flow](../concepts.md#standalone-or-flow--both-are-first-class)
- [Utilities — `next`](../flow/utilities.md)

[◀ Decisions index](./README.md)
