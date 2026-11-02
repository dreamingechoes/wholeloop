# 0196 — Maintenance commands and recurring delivery intake

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

[ADR-0195](./0195-maintenance-proposals-and-recurring-admission.md) added inspections, proposals, dismissals and recurring admission as components. An operator still had no command for them, and an admitted proposal produced only a run identity with nothing behind it. Two questions were open. Where does a finding come from when the input arrives as a file? And how far does admission go towards a run?

## Decision

- **Commands.** `wl maintenance inspect`, `propose`, `proposals`, `dismiss` and `admit` expose the components, each with its own versioned output. Every input file has a closed, bounded shape, and a refusal names the field family, never the rejected value.
- **Findings come from a fresh run.** `propose` takes the pinned inspection and the proposal half separately. It runs the inspection itself, so a finding is never read from a supplied file. `inspect` opens no store.
- **Currency at admission.** `admit` takes the operator's envelope and the operator's pinned inspections. It re-runs the matching inspection for every open proposal and admits only current ones. A proposal whose inspection is not pinned, whose evidence changed, that was dismissed or that was already admitted is reported with that reason. An envelope naming `to-merge` is refused as invalid input.
- **Admission is intake, not execution.** Each admitted proposal is captured as its own inline delivery source. Its criteria are mapped to source lines and the finding is kept as context. The `wholeloop/maintenance-admission@1` record binds the proposal key, run identity, source, envelope fingerprint, operator, endpoint and time. A key is admitted at most once. Admission creates no plan, journal entry, queue entry or grant. Planning that run and issuing its exact-plan grant remain the operator's separate actions, and the output lists those commands.
- **Concurrency.** Run identities and the aggregate count derive from the admissions read first. The records are written under the store lock only if that set is unchanged. Otherwise nothing is written and the command asks for a rerun. A captured but unused source is content-addressed and grants nothing.

This is a narrower reading of "starts its own run" than enqueuing work. It is the conservative refinement: authority to execute still comes only from a separately issued grant.

## Alternatives rejected

- Accepting a finding inside the proposal file would let a caller assert evidence that no inspection produced.
- Storing inspection commands beside proposals and re-running them at admission would let whoever proposed choose what admission executes; the operator pins them instead.
- Creating the plan or queue entry at admission would turn a proposal into execution without the grant evaluation every run needs.

## Verification

Compiled-CLI cases cover:

- an actual `git grep` inspection;
- one recorded proposal, then a duplicate and a retained dismissal;
- a fresh run with no finding;
- refusals of invalid inspections that do not echo the input;
- one admission per key with its criteria mapped and no plan or journal written;
- refusals for stale evidence, an unpinned inspection and a merge envelope.

A competing admission recorded while inspections run makes the command write nothing.
