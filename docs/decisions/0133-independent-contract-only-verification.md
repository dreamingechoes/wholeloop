# 0133 — Independent contract-only verification

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Committed contract identity alone cannot pass QA. Contract-only units deliberately have no product criteria, while the existing verification gate requires them. Inventing criteria would change source ownership; skipping verification would lose actual suite facts and independent scrutiny. The original criterion policy must remain mandatory for implementation units.

## Decision

Extend the internal verification gate with an explicit contract-only input containing the stored delivery run/revision, work unit and exact artifact paths. Reopen the immutable plan and mechanically observe its actual committed contracts. Create distinct fail-safe contract requirements with the declared identities, original metadata and observed file identities; retain the mandatory suite, independent verifier/refuter policy and ordinary lenses. Record no agreed product criteria or human approval. Restrict this mode to standalone machine review subjects. Existing ordinary verification still refuses missing criteria.

Persist each original contract locator inside its existing version-one gate requirement. Fresh planning recovers only those locators and re-observes the stored plan and actual candidate. Compare complete original requirements, including declared revisions, paths, checksums, metadata and prompts; even a different matching file cannot replace the selected input midway through a gate. Require the mechanical observation's snapshot to match the final gate snapshot. Public gate schemas remain unchanged because they already carry typed generic requirement units.

Join this mode to RunnerVerificationStages through an explicit fixed-controller contract selector. Audit the selected artifacts before consuming a new round. Retained inspection derives its inputs from the original gate rather than calling that selector again. Bind the actual stage unit, stored plan revision and complete original contract requirements before recovering any suite or judgment. Existing suite execution, independent native ownership, original budgets, current-candidate checks and verdict policy remain authoritative.

A contract verification pass supplies only that unit's mechanical and independent QA result. Code review, downstream implementations, integration and whole-feature acceptance remain mandatory. Fixture-only suites, uncertain invokers and missing evidence cannot pass. No public result import, new CLI flag, human agreement, runtime allowance or publication authority is introduced.

## Alternatives rejected

Fabricated product criteria corrupt the approved ownership model. Treating checksums as all QA bypasses compatibility and failure-case inspection. Removing the missing-criteria guard weakens ordinary implementation verification. Reusing whichever path now matches permits changed inputs after a failed judgment. Trusting supplied gate units as observations skips actual artifact reads. Reselecting paths during recovery can change the subject under review. Skipping the suite loses execution facts even when native reviewers agree.

## Verification

Retain ordinary missing-criteria and existing gate/review/suite/frozen-contract regressions. Exercise explicit contract requirements, original locator recovery, product-criteria mixing refusal, changed paths/revisions/bytes, malformed locators, missing controller selection, pre-round checksum refusal and unavailable fixture suites. Extend the finite actual Docker/synthetic-native evaluation with contract-only verification and lost-verdict paused recovery, alongside its original pass, nonzero-exit and fixture-refusal cases. Preserve the original deadlines and require exact retirement of successful disposable environments. Record observed results and failures in the journal; normalized native evidence establishes neither real model containment nor complete-route acceptance.

The final nine-file regression passes 535 cases. All four actual Docker/synthetic-native scenarios pass and their exact environments are observed retired. All seven model-free definition controls and exact CLI schema parity pass on Linux Node 20.0.0 and macOS Node 24. Lint, types, build, docs, harness, Markdown, Mermaid, smoke and offline package checks pass. Full repository-suite results remain those of the preceding criterion-verification increment.

Staged review adds an early consumed-marker refusal before contract selection, retaining the locked race recheck. The final 436-case regression verifies zero selector/native/gate dispatch for a lost binding; a fresh actual Docker contract-only recovery then passes with exact retirement. The four-scenario aggregate remains earlier evidence, with the final guard separately verified.
