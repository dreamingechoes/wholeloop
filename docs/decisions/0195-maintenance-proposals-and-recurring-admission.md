# 0195 — Maintenance proposals and recurring admission

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

Recurring evidence such as stale documentation, failing regressions, repeated errors, dependency risk or policy drift should become reviewable follow-up work. It must not become an endless, self-authorized backlog. A finding must not change code or a tracker by itself. An agent must not edit the policies, guidance, budgets or evaluation standards that judge it. Any recurring automatic delivery needs explicit operator limits.

## Decision

- **Inspection.** `inspectRepository` runs one operator-pinned local command, without a shell and with a timeout, at the repository's current base. It returns the finding lines, the base and an evidence digest that binds the rule and command.
- **Proposal.** `maintenanceProposal` creates a `wholeloop/maintenance-proposal@1` with the finding, behavior, scope, testable criteria, validation and risks. It lists any scope path that is protected: policy, agent instructions, harness guidance, CI configuration, rubrics, budgets, evaluation suites and compatibility fixtures. A proposal changes no code and writes no tracker. Its deduplication key binds the inspection, repository and finding lines rather than the base, so a recurring finding maps to one proposal.
- **Records.** `MaintenanceProposals` stores immutable proposals in the external store. A repeat is reported as a duplicate. A dismissal needs an operator and a reason, is retained, and stops the proposal from returning. A proposal is current only while a fresh inspection still yields its exact evidence.
- **Recurring admission.** `recurringAdmission` admits current proposals only under an operator-named envelope. The envelope sets categories, repositories, extra protected paths, per-run scope and criteria limits, an aggregate run limit within a window, and a `local-handoff` or `to-pr` endpoint. Merge is never admitted here. Any protected path refuses a proposal, so a proposal can never authorize changes to its own controls. Each admission receives its own run identity and still needs a separate exact-plan grant.

Composing these with CLI commands and runner admission remains open.

## Alternatives rejected

Writing findings straight to a tracker would publish without a destination grant. Letting proposals touch harness or policy files would let the system rewrite its own standards. An envelope without an aggregate limit would allow an unbounded backlog.

## Verification

Unit cases cover:

- an actual `git grep` inspection becoming one proposal, then a duplicate, then a retained dismissal;
- expiry when the evidence changes, and no finding for a clean repository;
- an untestable proposal refused;
- protected policy, guidance, rubric, evaluation and operator paths refused;
- category, repository, per-run and aggregate limits, with independent run identities.
