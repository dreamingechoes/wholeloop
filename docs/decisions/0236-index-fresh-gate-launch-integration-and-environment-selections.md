# 0236 — Index fresh gate, launch, integration and environment selections

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Several pure selections searched complete vectors once per element. Gate reports searched results per unit and filtered all votes per finding (40850/643400 field reads at 100/400 results). Planning each gate round copied and filtered all earlier runs, and suite replay searched the whole gate history per intent (5150/80600 and 21500/326000 reads). Review and verification audits rebuilt every finding per vote (125050/2000200 reads). Launch validation crossed metrics and dashboards (15250/241000 reads) and constructed one timezone formatter per metric. Integration verification scanned every acceptance case per criterion, contract and procedure (20100/320400 applicability reads). Environment-stage recovery searched retained operations twice per binding.

## Decision

Build each index inside the one synchronous selection that read its facts, and discard it before any effect, await or later observation:

- **Gates.** Index first results by unit, track coverage and suite failure once and aggregate vote counts only when a finding needs them. Keep one replay-local latest-run index by subject and gate, updated only when a run is created so continuing an older round cannot move it backwards. Suite linkage may use only plans already seen earlier in the same chronological replay. Audits index first matches lazily; a single native refutation stops at the first exact finding.
- **Launch.** Compare metric and stage coverage with local sets, keeping several artifacts per value, render dashboards through a first-index lookup that keeps original JSON-pointer positions, and validate each exact timezone identifier once per measurement.
- **Integration.** Traverse applicable cases once, indexing ordered matches by criterion and machine fingerprint and collecting procedures in the same pass. Human cases never satisfy machine requirements.
- **Environment bindings.** Select and validate every original operation tuple before opening any claim, then carry the selected objects into claim checks and index observations once.

Empty and single selections build no index. First-match order, duplicate weighting, case order, refusal order and independent returned arrays are unchanged. No index persists on a host, a store or across actions.

## Alternatives rejected

A `Map` constructor over duplicate keys turns first-match into last-match. Deduplicating votes or artifacts changes weighting. Indexing future plans would let an intent borrow a later plan. Caching parsed histories or Intl objects between actions could hide current corruption, revocation or input changes.

## Verification

Count controls in `test/unit/gates/report-performance.test.ts`, `selection-performance.test.ts`, `state-performance.test.ts`, `test/unit/launch/artifact-performance.test.ts`, `test/unit/integration/verification-selection-performance.test.ts` and `test/unit/runner/environment-bindings.test.ts` reduce each quadratic count above to linear work at 100/400 elements while preserving complete original outputs and errors.

[◀ Decisions index](./README.md)
