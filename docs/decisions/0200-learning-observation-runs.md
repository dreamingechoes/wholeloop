# 0200 — Learning observation runs

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

[ADR-0194](./0194-scheduled-observations-and-learning-recommendations.md) schedules due checkpoint observations once and settles them by policy, but the reads and the delegated `learning-outcome` decision ran outside the recoverable delivery runner. Delegated decisions are bound to a delivery run, plan and grant, so a recommendation recorded outside a run had no grant behind it. The owner chose to execute each scheduled observation as its own delivery run instead of composing it outside the runner.

## Decision

- **Endpoint.** A new `learning-observation` endpoint has the route `plan → observation → handoff`. A completed run ends `learning-recorded`, or `completed-with-unknowns` when its contract allows it.
- **One scheduled observation per plan.** `plan.observation` names the scheduled key, subject and checkpoint. It is required for this endpoint and refused for every other. The plan must be defined up front and carries only research-role, repository-free, non-producing work, like a research report. Preparing the plan admits only an observation that `wl measure tick` actually scheduled and that is not yet settled, with the same subject and checkpoint. An identity is never invented at planning time.
- **Read-only authority.** The endpoint's effect ceiling is `source.read` and `report.write`. A grant naming workspace, code, Git, PR or merge effects is refused. Reads still go through the grant's declared provider read rules.
- **Decision.** An unattended observation stage requires a current delegated `learning-outcome` decision. A requirement may now omit its outcome, meaning any outcome the decision allows, so keep, iterate, kill and unflag all satisfy it. Existing requirements keep their exact outcomes.
- **Host not yet registered.** The fixed dispatcher has no observation host yet, so these routes, including their handoff, are unsupported at static preflight and never handed to the local code handoff.

The observation host comes next, in the same task. It reads through an installed MCP-first read host, settles the scheduled observation once ([ADR-0194](./0194-scheduled-observations-and-learning-recommendations.md)), and records the delegated decision through the fixed decision stages. Its handoff writes the effect-free recommendation, and a local scheduler replay exercises the path.

The plan, envelope, grant, registration, state, control, native-purpose, worker-assignment and runner-status contracts gain the endpoint, outcome, stage kind and optional link. These are additive changes to the unreleased v1 candidate ([ADR-0066](./0066-v1-compatibility-baseline-and-deprecation.md)).

## Alternatives rejected

- A command outside the runner would leave the delegated decision without a grant and the reads without recovery.
- Sharing one run among several observations would let one missing source block unrelated checkpoints.
- Allowing code effects "for follow-up" would turn a recommendation into implementation, which stays a separately authorized proposal.

## Verification

Route cases cover:

- the three-stage route and the unattended decision requirement that accepts any outcome;
- refusal of a missing or misplaced link, code-bearing work and an undefined plan;
- admission refused for an unscheduled, mismatched or settled observation;
- the read-only grant ceiling;
- static unsupported coverage.

[ADR-0201](./0201-learning-observation-host.md) registers the observation host.
