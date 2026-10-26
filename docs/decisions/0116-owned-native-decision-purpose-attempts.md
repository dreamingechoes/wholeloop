# 0116 — Owned native decision purpose attempts

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The durable runner requires actual independent planner/challenger calls before delegated machine decisions can govern a route. A scheduler work unit cannot represent those calls: they have no implementation unit and an original planning envelope may not have a plan revision yet. The existing attempt journal already supports these roles without a unit; duplicating process/credential/output handling would create two different execution boundaries.

## Decision

Extract the existing native assignment transport behind a fixed controller ownership interface. Keep NativeDeliveryHost as its queue adapter, preserving existing file recipes, context admission, runtime registration, current checks, settlement and receipts. Add NativePurposeAttempts for planner/challenger only, using the existing journal and original persistent budget reservations. Neither a public result-file option nor a worker can supply this controller interface.

Require original active private authority, an explicitly delegated named decision, report-write scope, current exact plan/envelope and repository bases. Bind purpose, decision key, role and complete assignment before its journaled claim becomes visible. Reuse the original deadline and evaluator limits; unsupported hard native metering refuses before reservation. Unknown non-queue evaluator reservations conservatively hold later evaluators. A repeated decision key cannot launch another attempt or reset its allowance.

Consume a private invocation marker before any native launch. A pre-launch controller failure after consumption stays unresolved; a missing result is not permission to retry. Register the actual runtime before stdin and keep an unknown process owner's attempt reserved. Do not signal stored PIDs or infer closure from elapsed time. Explicit native proof remains mandatory and unavailable by default.

Implement NativeDelegatedDecisionHost over two independent purpose attempts. Give each worker only selected pinned inputs and a bounded inline report contract. The judgment/challenge report schemas supply claims and exact basis/judgment digests, never identity or execution metadata. The controller derives those from the actual completed private attempts and receipts, verifies captured report bytes and passes them through the existing delegated-decision validation. Outer findings/unknowns cannot silently disappear: they make this response invalid; owned uncertainties belong in the explicit decision body.

Keep evidence observation and non-delegable prerequisite checks in their trusted domain host, independently of native text. Preserve rejection, allowed outcomes, original private rubrics, uncertain facts and fixture provenance. Completed identities become stale after authority/base/input/report/receipt changes. A fixture remains fixture-only and creates no actual acceptance, effect or human approval.

## Alternatives rejected

Assigning a fake research/implementation unit would misstate scope and scheduler ownership. A new process runner would duplicate the existing containment, cancellation and bounded-output boundary. Letting worker JSON supply a runtime identity or acceptance would erase the trust distinction. Automatic retry after controller loss would risk a duplicate invocation and renewed budget. A broad privileged artifact writer is unnecessary because the explicit inline transport already carries the claim bytes.

This is an internal controller increment. Full fixed domain-host routing, public foreground run/reconcile and actual endpoint evidence remain P6-10 work; live client/model acceptance remains separate. No service API, cloud platform or new dependency is introduced.

## Verification

Exercise actual synthetic Claude/Codex planner/challenger processes, revision-zero envelope planning, independent identities, current byte bindings, repeated/consumed invocations, unknown closure, evaluator holds, hard-metering refusal, revocation and malformed/stale/forged claims. Retain the initial mismatched fixture-clock failures and require exact rejection reasons. Complete checks pass 2999 tests in 142 files on macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0. Six model-free controls, including the independent synthetic native pair, pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5; inert schemas match. The nine-agent catalog passes actual disposable installation/renderer/distribution tests. No live model/account acceptance follows from these fixtures.
