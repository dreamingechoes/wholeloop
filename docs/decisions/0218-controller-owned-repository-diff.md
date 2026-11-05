# 0218 — Observe committed repository scope through the original controller

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The third actual implementation pilot accepts the current acceptance identity and installed HTTP format, then honestly returns blocked: the task requires proof that only the declared file changes, but the installed runners cannot observe a committed repository diff. The successful native process is not a valid acceptance definition or campaign pass. Repeating the same missing observation would spend quota without making the criterion testable.

## Decision

Install one fixed repository.diff CLI case in the public implementation controller's integrated verification. Its strict versioned input selects only a repository ID already declared in the plan. The controller selects the exact original base, owned environment candidate path, committed head and snapshot. A repository/base fixture digest pins that selection before the builder runs. Assertions can inspect only the controller's JSON observation: base, head, ancestry, complete sorted changed paths, and each changed object's path, status, mode and object ID. This is a committed-tree observation, not a claim about hosted PR or merge state.

Reuse the original root environment scope's durable read owners. Each fixed Git invocation is registered before dispatch, has sanitized environment/configuration, suppressed hooks/helpers/replacements, bounded output and the smaller original/case deadline, and shares original cancellation, revocation and lease checks. Refuse unsafe repository configuration, dirty or moved candidates, malformed/truncated output, unknown ownership and unsupported inputs. Complete raw tree metadata includes additions, removals and mode/type changes rather than a path allow-list supplied by a worker.

The shared CLI result validator reopens all six actual private read receipts instead of requiring an invented single application process; capability/host names alone cannot pass. Retained integrated proof additionally audits the exact case, source vector, six ordered command intents and original private closed process receipts. Inspection reads existing receipts only and launches nothing. Existing source.read, test.run and report.write authority and finite budgets remain required; no new grant effect, executable input, approval actor, credential transport or publication allowance is introduced. SDK compositions without this installed owner refuse the case.

## Alternatives rejected

- A generic repository.inspect command or worker-selected path/revision/argv would widen the executable surface unnecessarily.
- Dropping scope from acceptance or trusting a worker's changed-file claim would leave the original task unverified.
- Unmanaged controller Git calls would lose cancellation and recoverable original ownership.
- Treating the blocked native attempt as infrastructure, rewriting its output or counting a local fixture as native success would conceal the actual route failure.

## Verification

Real Git controls exercise committed object metadata and original durable read ownership. Negative controls cover extra input authority, unsafe assertions, malformed or duplicate paths, dirty/stale/foreign observations, fencing and borrowed case/process evidence. Public production context declares the actual new schema and fixture, while the synthetic public route includes an independent scope case. Actual Docker route execution, complete platform gates and new authenticated native trials retain separate results in the journal; no previous failed report is rewritten.

[◀ Decisions index](./README.md)
