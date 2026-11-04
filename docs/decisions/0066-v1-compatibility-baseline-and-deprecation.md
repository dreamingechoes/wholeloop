# 0066 — V1 compatibility baseline and deprecation

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Registration gives every public schema an identity, but cannot detect changing an existing declaration under the same identity. The first stable release also needs an explicit deprecation boundary. Native acceptance and public delivery remain unfinished, so a local candidate must not be described as an actual 1.0 release.

## Decision

- Record a v1 candidate fixture for thirty-eight source JSON Schemas, 135 output variants, thirteen step definitions, 144 command signatures and five exit codes. Give every declaration its own compatibility case and require baseline coverage.
- Canonicalize object keys for fingerprints while conservatively retaining array order and declared fields. Separate the output envelope from individual variants and namespace input/output roles, permitting new identities without changing unrelated existing ones. Keep positional/output contracts and old command flags; permit additive new commands and optional flags.
- Add explicit public adapter/distribution manifest schemas and validate generated manifests before emitting their ownership file. Preserve their existing format, publication-not-performed and unverified conformance boundaries. Reuse the existing schema vocabulary rather than adding a dependency.
- Preserve legitimate inputs and output meanings throughout 1.x. Changed formats get a new identity and retain the old reader in the current major line. Removal or an incompatible default requires the next CLI major, deprecation in an earlier release/reference and a replacement/migration guide. No current surface is deprecated. Unknown future formats fail rather than being guessed or relabelled.
- Keep journals and ownership evidence external and unchanged by ordinary upgrade. Future migrations are explicit with backup/rollback; current code performs none. Correcting acceptance of malformed input may be a bug fix when the documented invariant, rationale and regression evidence are retained.
- Fingerprints conservatively flag declaration changes, not semantic proof. An equivalent or annotation-only edit needs a recorded reason and domain regression evidence before its fixture changes. Do not refresh fixtures to conceal altered constraints or meanings. Retain parser/replay/workflow/native tests for behavior.
- Leave package version/privacy, release activation, tag and announcement unchanged. The baseline is a v1 candidate until release acceptance is complete. Future deprecation/removal publication still needs release automation/review; this local checker cannot authenticate an earlier release or run native acceptance.

## Alternatives rejected

Automatic version bumps from commit labels would confuse intent with compatibility. A single aggregate output fingerprint would make every additive command invalidate all old outputs. Byte hashes would reject harmless formatting. A semantic JSON Schema implication engine would introduce a large new dependency and still miss runtime meanings; conservative declaration checks plus domain tests are clearer. Promoting the candidate to a release would bypass unfinished distribution/native acceptance and the maintainer's publication decision.

## Verification

Check every frozen declaration and inventory coverage, unchanged command/exit contracts, canonical object ordering, changed constraints/required fields, removed outputs, command removal/signature/schema/flag changes and additive extensions. Validate all seven actual adapter manifests and the full distribution index; reject damaged integrity fields/modes and invented publication claims. Existing feature tests retain replay and actual compiled delivery/installation checks.

[◀ Decisions index](./README.md)
