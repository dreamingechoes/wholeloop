# 0253 — Asynchronous escalation without stopping the factory

- **Status:** Proposed
- **Date:** 2026-11-08

## Context

When a fact only a person knows is missing, or a prerequisite cannot be met, a run ends blocked with its question; that is the right outcome for one run and the wrong one for a factory, because nothing else proceeds until someone looks. wholeloop never sends a message to a user, and supervised routes already record human decisions on the exact subject a stage published ([0178](./0178-recorded-human-decisions-for-supervised-routes.md)).

## Decision (proposed)

- A run that needs a person **parks**: it keeps its journal, budget and workspace, releases its controller, and records one question with the exact subject and evidence. The supervisor (proposal 0249) continues with other work.
- Parked questions appear in `wl overview` and the change feed ([0210](./0210-operator-overview-and-change-feed.md)), so any notifier the operator already uses can follow them. Optionally, under an explicit grant, the supervisor opens one issue per question on the operator's own code host through `gh` or `glab`.
- The person answers with `wl delivery human-decide` on the exact subject; the supervisor resumes the run from where it parked. An answer to a stale subject refuses.
- Today a run with intervention `none` refuses any recorded person decision. A parked question becomes the one exception: the answer is attributed to the person, bound to that exact subject, and grants nothing beyond it. Every other stage of the run stays without intervention.
- A parked run counts against its deadline; when the deadline passes it ends as it does today.

## Alternatives rejected

- **Sending chat or email notifications from the core.** It contradicts the rule that wholeloop sends no messages and would need service credentials.
- **Guessing a default to keep going.** Missing facts stay questions.

## Consequences

A question costs one run's progress, not the whole factory's. The operator needs only a way to read the feed or the code host.

## Verification

A rehearsal that parks one run on a seeded question while a second run completes, then resumes the first after a recorded answer; a stale-answer refusal test.

[◀ Decisions index](./README.md)
