# 0222 — Classify private proposal failures without retaining rejected data

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The seventh actual implementation attempt reaches the builder after four successful native receipts. It exits zero but fails invalid-or-unsafe-proposal, with no workspace edit or publication. The original diagnostic identifies the proposal decoder but not its encoding, safe-text, JSON or shape sub-boundary. No raw rejected response is retained, so this historical category cannot be narrowed retrospectively.

## Decision

Preserve the original decoder, error problem, public receipts and failed verdict. Attach a closed sub-boundary only to errors created by that fixed decoder, using a private weak map rather than arbitrary exception properties. For shape failures, retain the first path derived exclusively from the trusted proposal schema. Replace array offsets with empty brackets and unknown property names with a literal wildcard. Retain no rejected value, unknown key, response, exception text, stack or credential.

The private diagnostic may include this copied metadata only for its original proposal error. Failure to classify a field cannot replace the original refusal. Never synthesize metadata for an earlier response, accept an invalid output, replay an attempt, renew a grant or infer acceptance from a diagnostic. The map holds no response data and weak keys do not retain completed errors indefinitely.

## Alternatives rejected

- Persisting validator messages would retain rejected values and untrusted property names.
- Copying a detail property from arbitrary errors would let thrown data enter the private record.
- Relaxing shape checks or guessing the cause from generated schemas would hide failure or invent evidence.
- Repeating paid trials with only the broad category would spend quota without distinguishing the failing boundary.

## Verification

Ten differential controls first fail against the original diagnostic. Encoding, text, JSON, root/type, missing fields, empty fields, nested references, evidence arrays and unknown keys retain only static categories and schema-derived paths. Forged exception properties remain absent. Actual synthetic processes bind the field diagnostic to their original assignment and stdout digest, retain invalid-output and capture no artifacts. Fresh native evidence remains required.

[◀ Decisions index](./README.md)
