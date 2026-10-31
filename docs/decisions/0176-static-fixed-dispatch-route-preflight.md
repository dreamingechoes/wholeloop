# 0176 — Static fixed-dispatch route preflight

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

The foreground engine drives a fixed `DeliveryRunnerHost` and asks it, before any dispatch, whether the selected route is available, whether interactive tools are disabled and whether a person is required. The fixed stage dispatcher has every other host operation but no preflight, so composed runs still go through a test-only host that answers available unconditionally. [ADR-0168](./0168-fixed-original-domain-stage-dispatch.md) states that registration coverage is not runtime availability; the preflight must not blur that line, and the engine cannot pass an integration product selection.

## Decision

Make the dispatcher a `DeliveryRunnerHost` with a static, effect-free preflight. Refuse a cancelled signal. Report unavailable when the route cannot be derived, the host identity differs, the plan is not the request's current basis, or the supplied stages differ from the derived route. Report unavailable when any integration milestone has no fixed product configuration, then when any stage lacks a registered same-store adapter. For a supervised or on-exception plan with full coverage, report a person required: fixed adapters compose only explicitly delegated judgments. Only a fully covered none-policy route reports available with interactive tools disabled.

Preflight reads only the request basis and configuration; it invokes no adapter, model, Git or Docker operation and writes nothing. Native runtime proof, Docker availability and every other runtime failure remain observed per stage, never assumed by preflight. The engine's existing decision preflight and terminal fallbacks are unchanged: none-policy routes end blocked and others pause.

## Alternatives rejected

Probing native clients or Docker during preflight would run unowned reads before any invocation and still could not promise availability at execution time. Claiming interactive tools disabled for supervised routes would let the engine reach adapters that refuse non-delegated policies. Returning available whenever coverage is complete would hide missing product configuration until the integration stage.

## Verification

Table cases cover a supported definition route, missing adapters, a changed stage list, a foreign host identity and cancellation without native calls or journal change; integration milestones without products, without a configured milestone and with partial coverage. An engine case pauses an unsupported supervised route before any stage is dispatched. Evidence is in the journal.
