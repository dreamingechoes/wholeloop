# 0201 — Learning observation host

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

[ADR-0200](./0200-learning-observation-runs.md) routes each scheduled observation as its own `learning-observation` run, `plan → observation → handoff`, but registered no host, so the dispatcher refused these routes. The host had to answer five questions:

- Which transport reads a provider when nobody is watching?
- Which grant rule admits a read?
- How is the observation settled exactly once, by this run?
- Who chooses the learning outcome, and what does the handoff write?
- How is the external scheduler exercised for real?

## Decision

- **One fixed adapter.** `RunnerObservationStages` runs the observation stage and this route's handoff. The dispatcher registers it like every other domain adapter, and its endpoint observation reports the run's outcome.
- **What the stage observes.** The plan's link must resolve to a scheduled record whose key still recomputes from its identity. The subject's latest impact run must have the same launch anchor and measurement source. The checkpoint's offset must reproduce the scheduled due time. Every window ends at that due time, so a replay reads the same windows. The binding is pinned once per invocation, with a wall deadline of at most ten minutes.
- **MCP-first reads, no HTTP.** Installed controller code supplies the provider registry and the native client's own MCP connection, plus optionally its native operations. Each read goes through `clientProviderHost` with MCP as the selected transport. An unattended observation never selects an HTTP bridge, and a failed call never switches transport ([ADR-0085](./0085-client-owned-mcp-first-provider-transport.md)). Only `source.*.query` operations are read, at most 64 per invocation. A tool the client does not expose, a failed call or a refused read becomes an unknown datapoint through the existing impact collector. Every call is recorded with its fingerprint, the selected transport and its result.
- **Read scope.** A read needs a grant read rule naming the provider and operation, and its scope must be the observed subject. That is the narrowest scope the measurement plan identifies. A read outside it is refused before any transport is called.
- **Settlement once.** The stored readings are written first. Then `ObservationSchedule.settle` records the outcome under the store lock, naming the run and invocation in a new optional `by` field. Inspection accepts only its own settlement over its own readings, so another run's identical result is never claimed. A settlement that ends `blocked` stops the stage with no decision. An interrupted read writes no readings and settles nothing, so the observation stays open and a new run may observe it. An interrupted invocation is never continued.
- **Decision.** A non-blocked observation captures a brief: the windows, each metric with its target, baseline and verdict, the qualitative signals, the read transports, and a receipt stating that no flag, deployment, message, code or closure happened. The delegated `learning-outcome` decision judges those exact bytes through the fixed decision stages and the native judge and challenger, as research does ([ADR-0184](./0184-unattended-research-host.md)). The decision request receives every unknown reading, so the rubric's unknown policy applies. No owned call precedes the decision, so its owned prefix is empty.
- **Handoff.** The handoff writes the effect-free `learningRecommendation` as a run artifact. Its inputs are the recorded judgment's outcome and rationale, the challenger's rationale as the counterargument, the decision's policy digest, and every unknown reading named as an uncertainty. `iterate`, `kill` and `unflag` carry a proposal that needs a separately authorized run. A machine recommendation's proposal field is `authority`, not `authorization`: the run's credential scan correctly refuses `authorization: <token>`-shaped text, and the earlier name made every such recommendation unstorable.
- **Outcome.** `learning-recorded` when every datapoint was observed. `completed-with-unknowns` when the uncertainty policy is `complete-with-unknowns` and something was observed. `blocked` otherwise.
- **Unattended only.** A supervised or on-exception observation route is refused at static preflight. No recorded-human composition for a learning outcome exists in the runner; people keep using `wl measure` and `decide-next`. This is the conservative refinement, as for report research.

The public `wl delivery run` host still composes no adapter, so a public observation run stops in preflight until P6-27 provides trusted runtime observers.

## Alternatives rejected

- Letting the controller choose HTTP when MCP is missing would switch credentials and authority behind the operator's back.
- Scoping reads by provider alone would let one grant read any project that provider reaches.
- Settling before storing the readings, or settling without naming the run, would let a crash or a parallel run produce a settlement no run can prove is its own.
- Writing the recommendation into the learning workflow's state would turn a machine recommendation into the scope's decision; it stays a run artifact.

## Verification

Engine-driven cases with a synthetic client MCP host and synthetic native judge processes cover:

- the complete none-policy route with no prompt, two MCP reads, one settlement by this run and an effect-free `keep`;
- a missing client tool kept unknown, completing with unknowns only when allowed;
- a missing tool and a read outside the grant ending blocked without a decision;
- a `kill` recommendation carrying a separately authorized proposal;
- an interrupted read that leaves the observation unsettled;
- the supervised preflight refusal;
- a scheduler replay in which the built CLI runs `wl measure tick` twice as separate processes, as a crontab entry would, schedules once, and the run completes.

No cron or launchd daemon was installed, no real MCP server or provider was read, and the judges certify no model.
