# 0184 — Unattended research host

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

**Amended 2026-11-22 (P9-23).** After its examinations, the research stage now makes one bounded conclusion call, with the same two repair attempts as every job, through a read-only planner purpose without web access. The author receives only the question, the evidence aggregate, its digest basis and the core-derived certainty; it queries no source, runs no command and gains no authority beyond `source.read` and `report.write`. Its result is stored as a `conclusion` entry and counts only when its basis equals the digest of the stored evidence, so a conclusion for changed evidence is refused rather than repaired. The brief then opens with Answer, Recommendation, confidence and unchecked work, retaining every claim, refutation, open question and source limit below it. A failed, refused or missing conclusion is an unknown, never an inferred answer: the brief says it was not authored, and the outcome becomes `completed-with-unknowns` under that policy and `blocked` otherwise. No conclusion is requested when no source produced evidence. New runs bind version 2; version 1 bindings replay their original briefs byte for byte. The runner has no separate cost preview for research; the brief's method section and the reviewed plan's bounds state the added call.

A `research-report` route is `plan → research → handoff`. The fixed dispatcher ran unit research claims through the worker adapter but refused the report-level research stage, because nothing could choose and query source angles, challenge load-bearing claims, synthesize a brief and end with an honest outcome without a person ([ADR-0179](./0179-research-dispatch-boundary.md)). The research contracts, the active-refutation aggregation and the brief already existed in `src/research`.

## Decision

Add one fixed adapter, `RunnerResearchStages`, for the report-level `research` stage and the research route's local `handoff`, and register it with the dispatcher.

- **Plan and binding.** Installed controller code supplies a validated research plan for the original question. The adapter pins it once with the stage invocation, the original plan revision and a wall deadline of at most 30 minutes, then registers its own in-process work. A plan with more than eight angles is refused, never trimmed.
- **Jobs.** Each available angle is queried once, with at most two repair attempts. Every load-bearing claim is examined by each planned verifier separately; a verifier sees only the claim and its evidence. Only a host-observed, schema-valid result is an observation. A crash, a fixture result, an invalid result or a cancelled call is stored as a failed attempt and never as evidence. An unavailable provider is never queried.
- **Budgets.** At most 40 distinct source references, 64 claims and 1 MiB per result. A result that would exceed a budget makes that angle unavailable or leaves that examination missing; nothing is trimmed to fit.
- **Synthesis.** The brief is a pure function of the stored entries: the existing report keeps refuted claims with their counterevidence, marks missing examinations as low-confidence open questions, and records unavailable angles as unknowns. The runner adds method, sources with identical excerpts marked as one source, the observation date and a receipt that says nothing was published and no human approval was recorded. The brief is captured as a budgeted local artifact.
- **Outcome.** No observed source makes the report `blocked`. Open questions complete the report as `completed-with-unknowns` only under the `complete-with-unknowns` uncertainty policy and block it under every other policy. Otherwise the route may reach `research-report-complete`.
- **Decision.** A non-blocked brief needs the delegated `research-sources` decision over its exact bytes. The decision's native calls may follow only the exact owned source calls recorded with the synthesis.
- **Recovery.** Inspection recomputes the outcome from stored entries without calling a worker. An interrupted invocation is never continued: once the controller is confirmed stopped, its stage ends `blocked` with every stored source identity and the original question retained.
- **Authority.** The stage needs `source.read` and `report.write`, runs no Git, workspace, merge or publication operation and never treats source text as an instruction. Remote sharing stays a separate grant.

`NativeResearchWorkers` composes the workers over the existing read-only native transport: an angle is a read-only planner purpose and an examination a challenger purpose, each with one distinct key per attempt, run inside the stage's owned process scope.

Two narrower choices keep the safety guarantees:

- Supervised report research is refused before dispatch, because no recorded-human source decision exists.
- Research claims inside an implementation milestone stay refused; integration still assembles only code-bearing work.

The public host still composes no adapter, so a public research run stops in preflight until P6-27 provides trusted runtime observers.

## Alternatives rejected

Trimming angles, sources or claims to fit a budget would drop findings silently. Treating a crashed or fixture verifier as a confirmation would let silence support a claim. Resuming an interrupted invocation would repeat or reorder source calls under a new deadline. Letting a supervised person approve sources through a prompt would reintroduce an interactive wait.

## Verification

Engine-driven cases on the synthetic transport cover:

- a complete route with zero prompts, and the same route with every source, refuter and decision as an owned synthetic native process;
- contradictions, mirrors and open questions under three uncertainty policies;
- crashed, fixture and evidence-free sources, a crashed refuter and a paywalled source;
- the source budget, cancellation and reconcile with stored sources and question retained;
- hostile source text with no file, merge or publication effect;
- a rejected decision, a host without the adapter and a supervised route.

This is synthetic evidence. It does not certify a native client, a real source provider or a model.
