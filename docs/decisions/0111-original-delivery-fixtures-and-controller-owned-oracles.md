# 0111 — Original delivery fixtures and controller-owned oracles

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

A green fixture suite cannot measure an implementation if that implementation can rewrite its expected results. Inline sample applications also lack a stable complete identity when their code, requirements or oracle changes. Model-free control success must remain separate from actual autonomous agent success.

## Decision

1. Keep small original MIT-licensed CLI/API/browser, two-component and hostile-feedback fixtures as literal source files. A closed versioned catalog pins requirements, baseline/reference code, repository targets, oracle bytes, surfaces and finite deadlines. Freeze every literal and metadata file in a reviewed byte baseline; update standards explicitly rather than regenerating them during checks. Include positive normal controls as well as relevant failures and negative inputs.
2. Load bounded regular UTF-8 inputs through the existing contained file reader. Refuse changed bytes, duplicate identities, path escapes, ambiguous oracle kinds and unknown sensitivity cases. Hash the complete catalog and selected file identities. Public catalog inspection returns identities, not expected values or known-good source bodies.
3. Before creating application repositories, snapshot the catalog and pin requirements/oracles in the external controller store. Seed only new disposable Git repositories under separate owned workspace paths, with private empty Git configuration, disabled hooks/signing and fixed commits. Reuse P6-19's existing Git invocation helpers; P6-26 consequently has an implementation dependency on P6-19. Seeding executes no application/model code and grants no delivery authority.
4. Bind completion metadata, original seed files and protected expected bytes to the accepted catalog/request digests. Repeated setup preserves worker edits; incomplete existing workspaces remain unknown rather than being overwritten. Inspection hashes selected files directly and never executes helpers from builder-owned Git configuration. Its head is the historical seed commit, not current candidate eligibility.
5. Run only reviewed original controls on the controller with a fresh credential-free environment, finite process/output limits and loopback HTTP. Refuse changed control code; evaluate implementations through the existing isolated hosts. Observe known baseline failure with unchanged controls, reference success, actual process restart and broker denial. Broker fixtures are deterministic protocol observations, not native prompt-injection certification.
6. Separately exercise the durable browser fixture through the existing pinned private-stdio Chromium/MCP host, actual owned restart, fresh context and backend state. Retain failed/passed reports and exact owned retirement. Neither control results nor source fixtures establish native coding-client, independent Linux Docker-host or hosted publication acceptance.

## Alternatives rejected

Keeping expected results inside the application checkout permits self-evaluation tampering. Re-reading mutable source expectations after implementation silently changes the standard. Resetting an existing fixture workspace discards actual work. A reference implementation is a control, not evidence of a model repair. Running arbitrary changed candidate code in the controller self-check would erase the isolation boundary.

## Verification

Freeze literal bytes, validate complete public contracts and test changed source/private pins, forged worker oracles, invalid cases, partial setup, preserved edits and broken worker Git configuration. Execute all baseline/reference controls and the actual browser fixture separately. Run complete macOS/Linux checks and the Node 20 controller floor; keep their exact evidence levels and initial failures visible.

[◀ Decisions index](./README.md)
