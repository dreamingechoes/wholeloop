# 0179 — Research dispatch boundary between the runner and the research host

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

P6-10 still listed "research-report production and complete unattended research route composition", while P6-33 owns the complete unattended research host: angles, sources, refuters, synthesis, budgets and report outcomes. The fixed dispatcher refused every research stage, although the fixed worker adapter already produces unit research claims as `researcher` workers without a workspace. Plan validation also requires every work unit to belong to a milestone, while integration assembles only code-bearing work. An implementation plan with a research unit could therefore never integrate, and nothing said so before execution.

## Decision

Draw the boundary at the stage. The dispatcher sends a unit's `research:<unit>` stage to the fixed worker adapter, exactly like implementation work. The report-level `research` stage of a research-report route stays unregistered until the research host exists, so registration coverage never claims it.

Static preflight states the two research limits explicitly before any dispatch. A research-report route reports `dispatcher-research-host-required`. A route whose milestone contains research work reports `dispatcher-research-milestone-unsupported`, because research claims are not yet milestone evidence and integration cannot assemble them. Both end blocked in none mode and paused otherwise, through the engine's existing fallbacks.

Move the remaining research composition to P6-33: the report-level research host and how unit research claims count toward milestone integration and acceptance. P6-10 keeps no research item of its own.

## Alternatives rejected

Running report-level research through the worker adapter would skip angle planning, independent refutation and synthesis, producing an unchallenged report. Dropping research units from integration scope would silently discard their criteria. Letting such routes start would spend budget before integration refuses.

## Verification

A dispatcher case runs a unit research claim through the fixed worker adapter with synthetic native processes, then shows that preflight refuses the route because its milestone holds research work and that coverage never includes report-level research. Existing dispatcher, worker and route cases continue to pass. Evidence is in the journal.
