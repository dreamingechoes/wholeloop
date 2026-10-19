# 0052 — Generated reference checks in the core

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

The command and configuration reference scripts contained their own renderers,
while docs check only checked navigation and links. A missing marker made string
replacement do nothing, so a broken reference could appear current. Provider
manifest declarations also had no generated documentation table.

## Decision

- Put pure command, configuration and declared-provider renderers in the core.
  Generate from COMMANDS, configKeys/CONFIG_SCHEMA and BUILTINS. Use the exact same
  sections in docs check and explicit docs reference regeneration; existing npm
  scripts delegate to the bundled command instead of maintaining another renderer.
- Check all three required pages and exactly one ordered marker pair per section.
  Missing, duplicate and reversed markers fail even if replacement would otherwise
  be a no-op. Drift diagnostics identify the page/kind and regeneration command.
- Keep default operation read-only and return exit 4 on drift. Require --write for
  regeneration, with optional --kind selection. Preflight every selected page and
  marker before writing, preserve surrounding prose and skip unchanged pages.
- Render escaped Markdown cells and deterministic registry ordering. The provider
  table describes declared capabilities, operations and access routes; it does not
  imply authentication, native transport or a remote operation was verified.
- Compare with the running built core, not dynamically loaded user configuration
  or live service discovery. Rebuild after source changes. Keep semantic provider
  JSON catalog drift checking separate. Do not generate an actual client matrix
  from simulated conformance results; P5-04 remains independent work.

## Consequences

A single docs check now detects stale reference content as well as broken links
and navigation. Regeneration has an explicit project-document mutation boundary.
Preflight prevents malformed later pages from causing earlier partial updates,
but filesystem failures can still interrupt a write batch; it is not a crash-atomic
multi-file transaction. Preserve and inspect incomplete pages before rerunning.

## Rejected alternatives

- Keeping scripts as the only check: local docs check could still report success
  with stale tables, and duplicated formatting logic could disagree.
- Automatically rewriting on check: CI and review need an observable failure,
  while a read command should preserve authored files.
- Treating absent markers as current: this hides missing generated documentation.
- Generating a capability matrix from declarations: metadata is not native
  execution evidence and would silently close unverified platform entries.
