# 0040 — Pinned impact observations and report layouts

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

An impact report can invent confidence by replacing an unavailable datapoint with zero, rerunning a different query, mixing units or letting a narrative rewrite the result. Checkpoints also need an actual launch anchor; a prepared kit does not establish exposure. Digests must not quietly send messages or overwrite documents.

## Decision

- Reuse owned scope measurements through their exact spec/scope revision. A standalone prepared launch may supply its pinned plan; otherwise ask for an explicit agreed measurement contract. Do not fabricate Define/shipping history.
- Pin the actual launch anchor, checkpoint, observation end and report guidance. Use launch/d7/d30 by default and learn.checkpoints for custom names; an unknown name requires an explicit offset. Refuse early measurement before state writes. A completed ramp's final confirmation can supply the launch anchor. Repeated checkpoints retain separate immutable histories and update the latest projection.
- Execute the stored source queries with their original units/timezones and exact rolling windows. Require complete normalized finite scalars. Missing providers, unsupported operations, incompatible units and unreadable outputs stay unknown. A genuine observed zero remains valid. Store references and raw-content hashes, not private service diagnostics or raw logs.
- Compute target comparisons and baseline deltas in core. Partial progress means closer to an unmet target than a known baseline; regression from an already met baseline is missed. Unknown baselines do not invent partial-progress claims.
- Quote bounded sanitized qualitative observations separately with their exact source/query/window. A quote is evidence of what the source returned, not proof of a numeric assertion within that quote or proof of causality.
- Give one read-only analyst each source. Load actual learn.report instructions and let the host choose headings/order through an ID-only complete layout. Core constructs every numeric row, preserves coverage and invalidates layouts after new observations. Mandatory provenance cannot be formatted away.
- Produce stable cross-scope digest drafts and per-scope comment blocks from completed reports. Explicit conductor dispatch may use comms.draft or append a marker-bound note via docs.update with a fresh same-operation read/revision. Preserve unrelated content, journal intent, cache receipts and retain ambiguity. The drafting/analysis host receives no publication interface.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Start checkpoint clocks when drafts are prepared | Confuses readiness with actual audience exposure |
| Let the analyst write arbitrary numeric report prose | Makes grounding and reproducible comparisons unenforceable |
| Estimate absent metrics or convert units silently | Hides missing evidence and changes the measurement contract |
| Call any movement partial success | Can label regression from a met baseline as progress |
| Replace an entire document from a cached report | Can erase unrelated current content |
| Retry an uncertain digest write | Can duplicate drafts or comments |

## Consequences

Report customization controls layout, not arbitrary computed fields or unrestricted narrative. Document comments are appended marker-bound notes, not native threaded comments. Live query/cohort semantics, causal interpretation, model grounding, real client isolation and authenticated publication remain owner checks. Local SDK/CLI fixtures prove contracts and deterministic arithmetic only.

[◀ Decisions index](./README.md)
