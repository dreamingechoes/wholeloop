# 0086 — Exact final framing review and owner decisions

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

An actual framing retained the owner's reopening condition in core state but added stricter unapproved rules in its narrative. A third draft changed after the last challenger review and passed only structural checks. Neither a heading check nor an earlier semantic review establishes approval of the final published bytes.

## Decision

Add versioned frame decision/review inputs and frame schema/draft/finalize commands. Drafting replaces exactly one Stop conditions section with data rendered from the explicit owner decision. Render multiline values as JSON strings, not Markdown instructions. Unknowns remain explicit; suggestions need separate owner acceptance.

Finalization requires the current initiative/run/owner, exact final owner-approved digest, identical challenger digest, all four semantic coverage areas and no unresolved findings. Revalidate inside the completion transaction. Journal the client-reported review/approval in a durable note alongside the existing artifact and decision in one atomic batch; journal replay retains it without a new event format or a separate unjournaled authority. Preserve the exact reopen condition.

The canonical skill uses this path. Legacy step completion remains compatible and unreviewed: do not report its old receipts as semantically verified or rewrite historical artifacts. Existing v1 declarations remain unchanged; these are additive commands/contracts. Retrofitting mandatory new inputs into legacy completion was rejected because it breaks valid existing callers and fixture workflows.

## Limits and alternatives

A digest proves byte identity, not truth, causal evidence or independent reviewer isolation. A supplied name is an attestation, not authenticated human identity. Actual native clients still need acceptance. Semantic review must inspect other sections for contradictory prose; a keyword blacklist cannot prove their meaning. Automatically treating proposed rules as owner policy or accepting an earlier review after editing would reproduce the observed defects.

## Verification

Regression tests reject stale bytes, changed outcomes, extra stop rules, incorrect identity, duplicate/missing coverage and unresolved findings without journal changes. Exercise persisted receipts and compiled draft/finalize, including refusal of an empty review template. Keep legacy framing and compatibility tests.

[◀ Decisions index](./README.md)
