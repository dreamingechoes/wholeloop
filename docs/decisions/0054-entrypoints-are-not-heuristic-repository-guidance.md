# 0054 — Entrypoints are not heuristic repository guidance

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Native wholeloop skills and roles are entrypoints into the harness. Their names and descriptions also match slot rules such as frame.template. Coinstalling several clients therefore made standalone framing ask the user to choose among copies of the harness itself, even with no repository-specific guidance present. Excluding nested distribution output alone did not address native overlays.

## Decision

- Append a versioned routing marker to packaged native skill/agent files. Use a Markdown comment for Markdown and a TOML comment for Codex agents, preserving each native parser's format. Mark source-native Claude overlays as well as plugin/portable outputs. Do not change canonical authoring resources or shared client settings. Keep native role budgets by rendering Gemini tool lists compactly.
- Inventory marked assets with an optional entrypoint flag, but exclude them from automatic name/description slot matching. Report heuristic exclusions and their reason instead of hiding the assets from discovery entirely.
- Preserve explicit metadata.wholeloop.slot tags and configured bindings, including a deliberate choice of a marked entrypoint. Keep ordinary repository/user guide ranking and ambiguity questions. The marker is a routing hint, not identity, ownership, executable provenance or permission attestation.
- Recognize only an unquoted terminal marker. Ignore Markdown fenced/indented examples and require valid TOML with a terminal comment outside strings. Keep marker application idempotent and bind emitted bytes in the owned manifest.
- Bump the discovery fingerprint parser revision so an older core's cached inventory of the same bytes cannot omit the new classification. The optional flag/exclusion metadata is additive within the existing versioned payloads.

## Consequences

Installing several clients no longer turns their harness entrypoints into competing framing templates. Real team guidance still wins; genuine conflicting guides still ask. Reinstall unchanged owned older output to receive the marker, preserving upgrades/backups. An explicit previously remembered binding remains a user choice and is not silently rewritten. Actual native model execution and permission checks remain separate from the real core framing regression tests.

## Rejected alternatives

- Selecting one installed copy by path order: that hides an incorrect binding.
- Ignoring all prefixed names or native directories: a team may intentionally author such guidance, and explicit mappings must remain available.
- Erasing the assets from inventory: users need to inspect why they were excluded.
- Reusing the old cache fingerprint: the parser changed even if file bytes did not.
