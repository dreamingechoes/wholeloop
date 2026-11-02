# Scheduled learning and reviewable maintenance

> **TL;DR** — Reuse the runner to execute due observations and prepare bounded follow-up work. Separate observed results, causal interpretation and authority to change the product. A maintenance proposal is not an automatically authorized implementation.

> [!NOTE]
> **Status: 🚧 partial.** P6-30 adds at-most-once scheduling of due observations, policy settlement of unknowns and effect-free machine learning recommendations ([ADR-0194](../../../docs/decisions/0194-scheduled-observations-and-learning-recommendations.md)); each scheduled observation now becomes its own read-only `learning-observation` delivery run whose plan names the scheduled key, with an unattended `learning-outcome` decision requirement ([ADR-0200](../../../docs/decisions/0200-learning-observation-runs.md)). Its host reads MCP-first within the grant's subject-scoped read rules, settles once in the run's name and records an effect-free delegated recommendation; a built-CLI scheduler replay exercises the path ([ADR-0201](../../../docs/decisions/0201-learning-observation-host.md)). P6-31 adds pinned local inspections, deduplicated proposals with retained dismissals, protected-path refusal and bounded recurring admission ([ADR-0195](../../../docs/decisions/0195-maintenance-proposals-and-recurring-admission.md)). Its `wl maintenance` commands take every finding from a fresh pinned run and admit each current proposal once as its own delivery source, leaving planning and the exact-plan grant to the operator ([ADR-0196](../../../docs/decisions/0196-maintenance-commands-and-recurring-delivery-intake.md)). Existing measurement plans and human learning outcomes remain unchanged outside an explicitly delegated policy.

## Due observations

The existing impact schedule already identifies due checkpoints. Add a local, explicit scheduler invocation that reads that schedule, admits authorized read-only work and uses the same durable queue. An external cron/CI scheduler may call it; wholeloop installs no always-on cloud service.

Pin launch anchor, checkpoint, metric definitions, expected source/tenant/time window and selected provider contracts. Deduplicate by subject, launch/plan revision, checkpoint and observation policy. Two invocations cannot create competing work for the same due checkpoint.

Use existing MCP-first reads and experimental service boundaries. Zero is a value; unavailable/missing/incomplete observations remain unknown. No accounts with every provider are needed. Missing actual access cannot be certified by fixtures or a planned schedule.

Run-level intervention policy determines the response: supervised/on-exception may request access or a decision, while none returns completed-with-unknowns or blocked according to its acceptance contract. Do not repeatedly prompt or restart inaccessible reads forever.

## Interpretation and decisions

Retain current measurement grounding, evidence provenance and counterargument requirements. Do not infer causality from a correlated metric or replace an absent baseline with an estimate labelled observed.

An explicit delegated learning policy may choose keep/iterate/kill/unflag as a recorded recommendation/decision under named criteria and uncertainty handling. It cannot mutate flags, deploy, send messages or remove code. A decision implying implementation creates a proposal for a separately authorized run.

Keep actual human decisions as human. Machine decisions bind policy/plan/evidence digests and show uncertainty. Changed observations invalidate a prior machine decision's current applicability rather than rewriting its historical record.

## Maintenance proposals

Allow an operator to schedule bounded inspections for stale documentation, failing regression cases, repeated errors, dependency risk or code-policy drift using existing repository tools. Pin inspection commands/rules and inspect their actual results; do not introduce a new dependency-scanning platform.

Proposed `wholeloop/maintenance-proposal@1` names source evidence, repository/base, affected behavior, bounded scope, proposed criteria, expected validation, risks and deduplication key. Proposals live in the external store. Publishing them to a tracker requires a separately selected destination/write grant.

Deduplicate recurring findings, retain dismissals with their actual reasons and expire stale proposals when evidence changes. Agents cannot silently edit standing guidance, skills, security policy, budgets or their own evaluation rules as “learning.”

The default stops at a proposal. A pre-authorized recurring implementation envelope may enqueue a new delivery run only if it explicitly names allowed proposal categories, repositories, protected paths, per-run/aggregate limits and acceptance/merge policy. Each run still receives its own identity and scope/grant evaluation; no unbounded self-generated backlog.

## Acceptance and tests

- [ ] **LEARN-01:** Duplicate due ticks create one checkpoint execution; changed launch/plan identity creates an explicit new observation.
- [ ] **LEARN-02:** Missing/partial provider responses remain unknown and never trigger production effects.
- [ ] **LEARN-03:** A none-policy checkpoint produces a terminal policy-selected result with no human prompt.
- [ ] **LEARN-04:** Learning decisions preserve provenance, counterarguments and uncertainty; no direct flag/message/deploy action occurs.
- [ ] **LEARN-05:** Repeated maintenance findings produce one current proposal and preserve actual dismissal evidence.
- [ ] **LEARN-06:** A proposal cannot authorize its own implementation or weaken controller policy; recurring envelopes enforce aggregate limits.

Use fake-clock checkpoint tests, current grounding fixtures, deterministic proposal replay and a local actual tool inspection. Remote read/write acceptance remains scoped and explicit.

[◀ Controls](./07-controls-and-observability.md) · [Validation ▶](./09-validation-and-acceptance.md)
