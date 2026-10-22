# 0062 — Owned seven-client distribution previews

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Every native adapter has its own self-contained tree, while release delivery is still unimplemented. A reviewable delivery snapshot can be built locally before the owner chooses public hosting, npm configuration or publication. Merging the seven formats into one plugin root would confuse incompatible manifests and hash-bound native guard roots.

## Decision

- Export seven existing adapter trees under their target IDs from one exact canonical source, built core and version. Preserve each native manifest, launcher, resources, guard bindings and child integrity manifest unchanged.
- Add a root Claude marketplace pointing relatively to the claude subtree. Keep entry/manifest names aligned and include descriptive metadata for strict native validation. The owner display name identifies the project maintainers; it is not tool attribution. Remote hosting remains a separate explicit decision.
- Include a versioned root distribution manifest with every file hash/mode, source/core binding, target counts/paths and local capability declarations. Record publication not performed by the exporter and unverified native conformance. A development version remains a preview; it is not a release.
- Share owned output I/O with single-adapter builds. Require matching ownership schema/target, safe bounded prior paths, existing hashes/modes and a complete known tree before idempotency or replacement. Refuse extra files, empty directories and symlinks. Existing output validation previously ignored unknown entries and could report already-correct despite a changed tree; correct that behavior for adapter builds as well as distribution exports.
- Dry runs use the same read-only ownership preflight and generate identical planned content without staging files. Actual writes retain previous unchanged owned output in an explicit backup. Temporary trees and partial filesystem interruptions are inspectable, not a claimed crash-atomic transaction or proof against concurrent same-user edits.
- Expose release artifacts with explicit output and optional dry-run/JSON. Perform no installation, marketplace registration, model call, service write, Git configuration/ref operation, visibility change, version bump, tag or publication. npm archives, conventional changelog/provenance automation and optional binaries remain work.

## Alternatives rejected

Checking generated cores into the source tree would mix delivery with ordinary source maintenance. Publishing a marketplace file whose relative sources are absent would validate metadata without delivering a usable plugin. Reimplementing ownership per channel would preserve inconsistent handling of unknown entries. Treating the output as released would bypass the owner's visibility/publication decision and the actual native/fresh-machine acceptance checks.

## Verification

Exercise deterministic seven-target bindings and hashes, real compiled export, dry-run no-write behavior, owned upgrades/backups, complete unknown-entry refusal, unsafe prior paths and the existing adapter writer regressions. Move a complete export and execute every copied core plus a portable skill launcher. Keep package privacy unchanged. Native Claude 2.1.299 strict marketplace validation passed in an isolated home without credentials, registration or models; the initial probe identified a missing optional description, which strict mode correctly rejects.

Native marketplace format and relative source semantics follow the [official marketplace documentation](https://code.claude.com/docs/en/plugin-marketplaces). Validation is narrower evidence than installation or actual native execution.

[◀ Decisions index](./README.md)
