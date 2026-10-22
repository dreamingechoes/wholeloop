# 0061 — Generated local adapter declarations

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Build/install already expose local adapter capabilities, while the platform page contains researched native capabilities and the framing matrix consumes supplied execution reports. These are different evidence classes. Newly implemented headless recipes showed why hand-written local engine descriptions can drift.

## Decision

- Export the existing deterministic adapter registry and use it for both target lookup and the generated local declaration table. Read each adapter's own capabilities rather than maintaining another list of skills, hooks, read-only boundaries or available engines.
- Add platforms as the fourth generated reference kind, with an owned marker pair in the platform page. Existing docs check and explicit reference regeneration use the same renderer, whole-batch marker preflight, prose preservation and unchanged-output behavior. Add docs:platforms for selective regeneration.
- Label rows as local declarations. Native conformance stays unverified in these contracts. Rendered skills, native flags and synthetic worker success cannot become native loading, permissions, MCP or semantic quality claims.
- Retain the researched native matrix and separately imported framing observations. Scheduled live collection and evidence-backed page integration remain P5-04 work. Do not feed a report status into adapter declarations implicitly.

## Alternatives rejected

Generating native support from rendered files would overstate the evidence. Duplicating adapter names and capability fields in a documentation script would retain the drift this table is meant to prevent. Replacing the researched matrix would discard useful format context without producing live evidence. A separate writer would duplicate ownership and preflight logic already enforced by docs.

## Verification

Check all seven local rows, current Cursor headless and Codex hook differences, and unchanged unverified native status when a local engine declaration changes. Detect that declaration drift with the existing generated-section checker. Run compiled read-only/selective/full regeneration over all four pages, including prose preservation, malformed-marker whole-batch refusal and idempotency. No native model, authentication or service execution is part of this renderer.

[◀ Decisions index](./README.md)
