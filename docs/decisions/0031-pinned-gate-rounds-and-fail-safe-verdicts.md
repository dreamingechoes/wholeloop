# 0031 — Pinned gate rounds and fail-safe verdicts

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

A reviewer response is evidence, not permission to pass a build. Missing workers, late submissions, changing code and exhausted budgets must remain visible across process restarts. Manifests may add team coverage without silently removing the mandatory lenses. ADR-0014 fixes the budget and active-refutation principles.

## Decision

1. Journal each gate plan, unit result, numbered examination, budget extension and sealed verdict. Pin repository, named base/SHA, lens policy digest, prompts, quorum and agreed criteria. Count rounds from this history. Repeated planning resumes an unsealed round; failed runs cannot reset their budget. A new run after PASS requires an explicit request.
2. Default to verify four/review three rounds; accept project settings and explicit run overrides in 1–10. Extend a running budget only with a larger explicit value and reason. EXHAUSTED preserves the actual open findings; it never means PASS.
3. Plan six mandatory review lenses and configured manifest additions. Report not-applicable or explicitly disabled lenses with reasons. Match path globs using only `*`, `**`, `?`; require every supplied applicability dimension to match at least one value. Languages use a small documented extension mapping; slots use resolved repository/user/config bindings. Empty dimensions do not match. Built-in applicability cannot be narrowed by an override, and overrides cannot weaken correctness/security fail-safe defaults.
4. Require a result with observed evidence for every planned unit. Verify plans include the suite and each agreed criterion verbatim. Missing or unavailable units block approval; the host executes their work, not the planner.
5. Count a strict majority of active, evidenced refutations to drop an ordinary finding. For fail-safe lenses, require every planned verifier to refute: any silence, uncertainty or confirmation preserves the blocker. Slots are unique per finding; stale, duplicate and out-of-quorum submissions are rejected.
6. Hash HEAD, branch, semantic index entries, tracked/untracked non-ignored file bytes, executable modes and symlink targets. Check before submissions and at sealing. Changed code fails the round without repairing or discarding it. Keep a historical PASS, but expose STALE if those inputs subsequently change.
7. Replay rejects impossible transitions and forged aggregation. Store round projections externally and send a compact durable result pointer to the builder.

## Alternatives considered

- Letting a model decide the verdict loses deterministic coverage and turns a crashed worker into apparent consent.
- Re-reading changed configuration each round without pinning policy can weaken a gate while it is red. A policy change requires restoring the run policy or finishing it before an explicitly fresh run.
- Counting confirmations deletes findings on silence. Active refutations preserve uncertainty and record why a finding was dropped.
- Restoring changed files would destroy work and obscure a read-only violation. The core reports the violation and leaves recovery to the owner.

## Consequences

The host must supply honest observations and genuinely independent verifier sessions; numbered slots cannot prove process identity. Snapshot checks observe boundaries, not continuous execution: a write restored between checks is invisible. Ignored files, external symlink destinations and external services are outside this snapshot. Submodules currently require explicit inspection rather than a PASS.

This implements the gate decision layer. Running the suite, incremental review inputs, live client isolation and builder repair orchestration are separate tasks. MacOS fixture tests do not establish Linux or authenticated client conformance.

[◀ Decisions index](./README.md)
