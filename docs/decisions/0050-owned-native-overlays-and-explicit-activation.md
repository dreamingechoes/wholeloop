# 0050 — Owned native overlays and explicit activation

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A generated package is not an installation. Client formats differ, existing settings may contain private data, and project-scoped files must work after a checkout moves. Uninstall must identify exactly which bytes belong to wholeloop while preserving edits, unrelated roles and the person's external execution history.

## Decision

- Install native wl-prefixed skills/agents at explicit user or project scope. Reuse canonical renderers, permissions and model mappings. Claude loose skills use the checked portable launcher context and scoped skill/agent guard frontmatter; plugin generation remains available separately. OpenCode uses its native plugin directory, Copilot a dedicated hook JSON file, and Codex its Git fallback.
- Keep one self-contained artifact per target. User artifacts live in the external store; project artifacts are intentional distribution output under .wholeloop/distribution/target. Never put execution journals, ownership receipts, writer locks or recovery backups into a repository. No shared client settings, MCP configuration, credential stores or marketplace registries are rewritten.
- Resolve user directories at runtime, including documented absolute client overrides. Ignore relative XDG_CONFIG_HOME according to the existing XDG policy; reject ambiguous relative native-directory overrides. Native file names are namespaced to avoid replacing unrelated components. Refuse colliding targets and observed unsafe symlink/escaping paths rather than following an unexpected alias.
- Give every installed skill a relative ESM launcher to its packaged core. Encode relative module URL segments; filesystem paths containing spaces, quotes, hash, percent, question marks or shell substitutions must remain literal. Project Claude hooks use CLAUDE_PROJECT_DIR, Copilot uses repository-relative argv/cwd, and OpenCode imports the helper relative to its installed plugin file. Retain native permission checks through the shared guard's empty-success/explicit-deny contract.
- Store one bounded versioned ownership receipt per scope identity outside Git. Record exact file paths, hashes and modes plus created directories. Compare semantic metadata instead of JSON property order. Preflight every selected target before writes, refuse unowned/edited output and unknown private-tree entries, skip unchanged files and retain changed/removed owned bytes in external backups. Explicit uninstall accepts missing owned files, removes only matching known bytes and cleans newly created empty parents across successive target installations.
- Record pending intent before output mutations. Pending does not prove that its writer stopped; inspect the lock owner before recovery. An interrupted install cannot be blindly retried; uninstall must include every pending target and accepts only recorded old/new versions. Changed recovery backups or unknown staging/output require inspection. Serialise writers with a store lock; do not steal it or promise a transaction across native watchers/filesystems. Physical interruption and concurrent human edits remain operational verification, not simulated proof.
- Let doctor read receipts and check native/artifact files without writer locks. Distinguish current, stale, changed, pending, invalid and absent ownership. Offer upgrades only for unchanged owned output; unknown/edited state needs preservation and inspection. An absent receipt does not prove native absence.
- Installation reports files installed, not client activation or authentication. Restart/trust and actual skill/agent/permission checks remain explicit. Git hooks affect individual repositories and stay separately activated/removed through the concrete guard commands returned by install/uninstall; a user-wide install cannot silently configure every repository or take ownership of independently added hooks. Retain a hash-bound executable core outside the removed native tree for the removal handoff; a source install must not require an unrelated wl on PATH.

## Alternatives rejected

Overwriting or merging general client settings would couple unrelated preferences and risk copying private values. Native-owned overlays need no credential/config round trip. Shell wrappers and unescaped URL paths break otherwise valid checkout locations; relative ESM bindings keep the path calculation deterministic.

Deleting a directory because it has a familiar name loses edits and foreign files. Trust exact ownership observations and preserve ambiguity. A force flag would erase that boundary, so no force/adoption option is provided. Cloned project distribution can execute without a local receipt; managing it from another scope/store requires ownership review, not automatic adoption.

## Verification

Exercise complete four-target user/project round trips, exact temporary HOME restoration, partial target removal, owned upgrades/backups, drift/refusal, mixed old/new pending recovery, URL/shell-special paths, relocation, compiled launchers, native transport fixtures and managed doctor status. Ownership edge cases use a small authored catalog; full catalogs and compiled CLI integration remain separate. Real clients, native trust/precedence, physical recovery, Linux and other supported Node versions remain owner checks. No real model or personal installation is used.

## Primary references

- [Claude skill locations and substitutions](https://code.claude.com/docs/en/skills) and [scoped hooks](https://code.claude.com/docs/en/hooks).
- [OpenCode skills](https://opencode.ai/docs/skills/) and [plugins](https://opencode.ai/docs/plugins/).
- [Copilot native skill roots](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) and [hook configuration](https://docs.github.com/en/copilot/reference/hooks-reference).
- [Codex skills](https://developers.openai.com/codex/skills/).

[◀ Decisions index](./README.md)
